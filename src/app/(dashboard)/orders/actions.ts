"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { computeOrderPreview } from "@/lib/order-preview";
import { roundMoney, allocateProportionally } from "@/lib/pricing";
import { Decimal } from "@prisma/client/runtime/library";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logError } from "@/lib/logger";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

const createOrderSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  branchId: z.string().min(1, "กรุณาเลือกสาขา"),
  orderDate: z.coerce.date(),
  reference: z.string().optional(),
  note: z.string().optional(),
  placeToDelivery: z.string().optional(),
});

export async function createDraftOrder(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "order.create")) throw new Error("FORBIDDEN");

  const parsed = createOrderSchema.parse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId"),
    orderDate: formData.get("orderDate"),
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
    placeToDelivery: formData.get("placeToDelivery") || undefined,
  });

  const period = currentPeriod(parsed.orderDate);

  // ข้อ 30, 52: Running Number แบบ atomic ภายใน transaction เดียวกับการสร้าง Order
  const order = await db.$transaction(async (tx) => {
    const seq = await getNextSeq("ORDER", period, tx);
    const orderNumber = formatDocNumber("ORDER", period, seq);
    return tx.order.create({
      data: {
        orderNumber,
        customerId: parsed.customerId,
        branchId: parsed.branchId,
        orderDate: parsed.orderDate,
        reference: parsed.reference,
        note: parsed.note,
        placeToDelivery: parsed.placeToDelivery,
        status: "DRAFT",
        createdById: user.id,
      },
    });
  });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "Order", recordId: order.id, newValue: parsed },
  });

  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}

// ข้อ 63: Copy/Duplicate Order เก่า — ดึงเฉพาะรายการสินค้า+จำนวนมา ห้าม Copy
// ราคา/ส่วนลดเก่ามาด้วยเด็ดขาด (ราคา/ส่วนลดจะถูกคำนวณใหม่ตาม Order Date
// ใหม่โดยอัตโนมัติผ่าน Pricing Engine ตอนแสดง Preview อยู่แล้ว เพราะ
// OrderItem ไม่ได้เก็บราคาไว้เลย — จึง "ห้าม Copy ราคาเก่า" โดยธรรมชาติ)
export async function duplicateOrder(sourceOrderId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "order.create")) throw new Error("FORBIDDEN");

  const newOrderDate = String(formData.get("newOrderDate") || "");
  if (!newOrderDate) throw new Error("กรุณาระบุวันที่ Order ใหม่");

  const source = await db.order.findUniqueOrThrow({
    where: { id: sourceOrderId },
    include: { items: true },
  });

  const orderDate = new Date(newOrderDate);
  const period = currentPeriod(orderDate);

  const newOrder = await db.$transaction(async (tx) => {
    const seq = await getNextSeq("ORDER", period, tx);
    const orderNumber = formatDocNumber("ORDER", period, seq);

    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId: source.customerId,
        branchId: source.branchId,
        orderDate,
        reference: source.reference,
        placeToDelivery: source.placeToDelivery,
        status: "DRAFT",
        createdById: user.id,
        items: {
          // คัดลอกแค่ SKU + จำนวน — ไม่แตะราคา/ส่วนลดเลย เพราะ OrderItem
          // ไม่เก็บราคาอยู่แล้ว (คำนวณสดจาก Pricing Engine ทุกครั้งที่ดู Preview)
          create: source.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            descriptionOverride: item.descriptionOverride,
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "Order",
        recordId: created.id,
        newValue: { orderNumber, duplicatedFrom: source.orderNumber },
      },
    });

    return created;
  });

  revalidatePath("/orders");
  redirect(`/orders/${newOrder.id}`);
}
const addItemSchema = z.object({
  productId: z.string().min(1, "กรุณาเลือกสินค้า"),
  quantity: z.coerce.number().positive("จำนวนต้องมากกว่า 0"),
  descriptionOverride: z.string().optional(),
});

export async function addOrderItem(orderId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "order.editDraft")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DRAFT") throw new Error("แก้ไขรายการได้เฉพาะ Order สถานะ Draft เท่านั้น (ข้อ 29)");

  const parsed = addItemSchema.parse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    descriptionOverride: formData.get("descriptionOverride") || undefined,
  });

  await db.orderItem.create({
    data: {
      orderId,
      productId: parsed.productId,
      quantity: parsed.quantity,
      descriptionOverride: parsed.descriptionOverride,
    },
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function removeOrderItem(orderId: string, itemId: string) {
  const user = await requireUser();
  if (!can(user.role, "order.editDraft")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DRAFT") throw new Error("แก้ไขรายการได้เฉพาะ Order สถานะ Draft เท่านั้น");

  await db.orderItem.delete({ where: { id: itemId } });
  revalidatePath(`/orders/${orderId}`);
}

// ข้อ 21: ต้อง Preview แล้วพนักงานตรวจสอบก่อน Confirm — หน้าจอบังคับให้ผ่าน Preview
// ก่อนกดปุ่มนี้อยู่แล้ว (ปุ่ม Confirm อยู่ใต้ Preview panel ในหน้าเดียวกัน)
//
// ข้อ 22-27: Confirm แล้วต้องแตก Invoice ทันทีตาม Product Type อัตโนมัติ
// ข้อ 56: ทั้งหมดต้องเป็น atomic — ถ้าสร้าง Invoice ใบใดใบหนึ่งพลาด ต้อง
//         Rollback หมดรวมถึงสถานะ Order ด้วย (ไม่ปล่อยครึ่งๆ กลางๆ)
//
// หมายเหตุสำคัญ: Invoice ที่สร้างตรงนี้คือ "ใบส่งของชั่วคราว" (ไม่มี VAT)
// ตามที่ยืนยันไว้ในการหารือ — ใบกำกับภาษี (มี VAT, ไม่ผูก 1:1 กับใบนี้เสมอไป)
// เป็นเอกสารแยกต่างหากที่จะทำใน Phase 5
export async function confirmOrder(orderId: string) {
  const user = await requireUser();
  if (!can(user.role, "order.confirm")) throw new Error("FORBIDDEN");
  if (!can(user.role, "invoice.create")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, customer: true, branch: true },
  });
  if (order.status !== "DRAFT") throw new Error("Order นี้ถูก Confirm หรือยกเลิกไปแล้ว");
  if (order.items.length === 0) throw new Error("ต้องมีอย่างน้อย 1 รายการสินค้าก่อน Confirm");

  // คำนวณ Preview ก่อนเข้า transaction (Order ยังเป็น Draft ตอนนี้ แก้ไม่ได้แล้ว
  // เพราะกำลังอยู่ระหว่างขั้นตอน Confirm — race condition อื่นถูกกันซ้ำอีกชั้นด้วย
  // การเช็คสถานะภายใน transaction ด้านล่าง)
  const preview = await computeOrderPreview(orderId);
  const period = currentPeriod(order.orderDate);

  try {
    await db.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (fresh.status !== "DRAFT") throw new Error("Order นี้ถูก Confirm ไปแล้ว (อาจถูกกดซ้ำ)");

    await tx.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CONFIRM",
        module: "Order",
        recordId: orderId,
        oldValue: { status: "DRAFT" },
        newValue: { status: "CONFIRMED" },
      },
    });

    // ข้อ 22: แตก Invoice ตาม Type ที่มีสินค้าจริงเท่านั้น (preview.groups มาจาก
    // รายการที่มีอยู่จริงเสมอ จึงไม่มีทางสร้าง Empty Invoice)
    for (const group of preview.groups) {
      const docType = `INV-${group.productTypeCode}`;
      const seq = await getNextSeq(docType, period, tx);
      const invoiceNumber = formatDocNumber(docType, period, seq, 4);

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          parentOrderId: order.id,
          invoiceDate: order.orderDate,
          customerId: order.customerId,
          branchId: order.branchId,
          productTypeCode: group.productTypeCode,
          // ข้อ 27: Snapshot ข้อมูลลูกค้า/สาขา ณ ตอน Confirm — แก้ Master Data
          // ภายหลังห้ามกระทบ Invoice ใบนี้
          customerNameSnapshot: order.customer.companyName,
          taxIdSnapshot: order.customer.taxId,
          branchNameSnapshot: order.branch.name,
          addressSnapshot: order.branch.address,
          placeToDelivery: order.placeToDelivery,
          grossAmount: group.grossAmount,
          discountPct: group.discountPct,
          discountAmount: group.discountAmount,
          netBeforeVat: group.netAmount,
          vatPct: new Decimal(0),
          vatAmount: new Decimal(0),
          grandTotal: group.netAmount,
          status: "CONFIRMED",
          createdById: user.id,
          items: {
            create: (() => {
              // ข้อ 26: จัดสรร discountAmount ของกลุ่มลงแต่ละ item ตามสัดส่วน
              // gross ของแต่ละบรรทัด แล้วปรับบรรทัดสุดท้ายให้ดูดเศษที่เหลือ
              // รับประกันว่า sum(item.discountAmount) === group.discountAmount
              // เป๊ะเสมอ ไม่มี Rounding Drift ระหว่างยอดรวม Invoice กับ
              // ผลรวมของ Invoice Item (จุดที่ข้อ 26 เตือนไว้โดยเฉพาะ)
              const grossAmounts = group.items.map((item) => item.grossAmount);
              const allocatedDiscounts = allocateProportionally(grossAmounts, group.discountAmount);

              return group.items.map((item, idx) => {
                const lineDiscount = allocatedDiscounts[idx];
                const lineNet = roundMoney(item.grossAmount.sub(lineDiscount));
                return {
                  productId: item.productId,
                  skuSnapshot: item.sku,
                  productNameSnapshot: item.productName,
                  productTypeSnapshot: item.productTypeName,
                  sizeSnapshot: item.size,
                  quantity: item.quantity,
                  unitSnapshot: item.unit,
                  unitPriceSnapshot: item.unitPrice,
                  grossAmount: item.grossAmount,
                  discountAmount: lineDiscount,
                  netAmount: lineNet,
                  vatAmount: new Decimal(0),
                  totalAmount: lineNet,
                };
              });
            })(),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          module: "Invoice",
          recordId: invoice.id,
          newValue: { invoiceNumber, parentOrderId: order.id, productTypeCode: group.productTypeCode },
        },
      });
    }
  });
  } catch (err) {
    logError("confirm-order", err, { orderId });
    throw new Error("ยืนยันออเดอร์ไม่สำเร็จ — ไม่มีการเปลี่ยนแปลงใดๆ เกิดขึ้น (ระบบยกเลิกทุกอย่างที่ทำไปแล้วอัตโนมัติ) กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ");
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/invoices");
}

// Clarification #11: ไม่ Cascade Cancel Invoice อัตโนมัติ — Block ถ้ามี Invoice ที่ยังไม่ Cancel
export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.cancel")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoices: true } });

  // Phase E1 — เพิ่ม guard นี้ให้ตรงกับ cancel action อื่นอีก 4 ประเภท (Invoice/
  // TaxInvoice/BillingNote/RepairReturnNote ทุกตัวเช็ค "ถูกยกเลิกไปแล้ว" อยู่แล้ว
  // มีแค่ cancelOrder ที่ไม่มี) กัน Audit Log ซ้ำซ้อนจากการกดยกเลิกซ้ำ ไม่ได้เปลี่ยน
  // ผลลัพธ์ปลายทาง (ยังเป็น CANCELLED เหมือนเดิม) และ return แทน throw สำหรับ
  // Validation Error ที่คาดไว้แล้วทั้งคู่ (ดู src/lib/action-result.ts)
  if (order.status === "CANCELLED") return { success: false, error: "Order นี้ถูกยกเลิกไปแล้ว" };

  const activeInvoices = order.invoices.filter((inv) => inv.status !== "CANCELLED");
  if (activeInvoices.length > 0) {
    return {
      success: false,
      error: `ยกเลิก Order นี้ไม่ได้ เพราะมี Invoice ที่ยังไม่ถูกยกเลิกอยู่ ${activeInvoices.length} ใบ — กรุณายกเลิก Invoice ที่เกี่ยวข้องให้ครบก่อน แล้วค่อยยกเลิก Order`,
    };
  }

  const beforeStatus = order.status;
  await db.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CANCEL",
      module: "Order",
      recordId: orderId,
      oldValue: { status: beforeStatus },
      newValue: { status: "CANCELLED" },
    },
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { success: true };
}
