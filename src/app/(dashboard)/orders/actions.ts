"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { computeOrderPreview } from "@/lib/order-preview";
import { roundMoney, allocateProportionally, getEffectivePrice } from "@/lib/pricing";
import { Decimal } from "@prisma/client/runtime/library";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logError } from "@/lib/logger";
import type { ActionResult } from "@/lib/action-result";
import { fetchOrderEditGuard } from "@/lib/order-edit-guard";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import { validateProductAllowedForCustomer } from "@/lib/product-company-access";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// Owner UAT Round 3 — ข้อ 3: ราคาแนะนำ (Suggested) ให้เห็นทันทีตอนคีย์รายการ ก่อนกด
// เพิ่ม — Read-only Helper เรียก Pricing Engine เดิมตัวเดียวกับที่ computeOrderPreview
// ใช้ (getEffectivePrice) ไม่มี Path คำนวณราคาใหม่เลย และ "ไม่ใช่" ค่าที่ถูก Freeze/Commit
// เป็น unitPriceOverride อัตโนมัติ — รายการ Standard (ไม่ Override) ยังคงคำนวณสดอีกครั้ง
// ที่ computeOrderPreview ตอน Confirm เสมอ (กัน Stale Price ตาม Invariant เดิมของทั้งระบบ)
// ผู้ใช้ต้อง "แก้ไขราคาที่แนะนำเอง" เท่านั้นถึงจะกลายเป็น Override จริง (ทำที่ฝั่ง Client)
// หมายเหตุ: รับ Argument แบบ Positional (ไม่ใช่ Object เดียว) เพราะต้อง .bind() บาง
// Argument ล่วงหน้าจาก Server Component (customerId/branchId/orderDate) แล้วส่ง Reference
// ที่เหลือ (รับแค่ productId) ไปให้ Client Component เรียกเอง — Pattern เดียวกับ
// addOrderItem.bind(null, order.id) ที่ใช้อยู่แล้วทั่วทั้งระบบ (Object Param เดียวจะ Bind
// บางส่วนแบบนี้ไม่ได้)
export async function getSuggestedOrderItemPrice(
  customerId: string,
  branchId: string | null,
  orderDate: Date,
  productId: string
): Promise<{ price: number }> {
  await requireUser();
  const { price } = await getEffectivePrice({ productId, customerId, branchId, orderDate });
  return { price: Number(price) };
}

const createOrderSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  // Owner UAT Fix Batch 1 — ข้อ 3: บริษัทที่ไม่มีสาขาต้องสร้างเอกสารได้ด้วย Customer
  // อย่างเดียว — ไม่บังคับเลือกสาขาอีกต่อไป (ถ้าลูกค้ามีสาขา ยังเลือกได้ตามปกติ)
  branchId: z.string().optional(),
  orderDate: z.coerce.date(),
  reference: z.string().optional(),
  note: z.string().optional(),
  placeToDelivery: z.string().optional(),
});

export async function createDraftOrder(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.create")) throw new Error("FORBIDDEN");

  const rawParse = createOrderSchema.safeParse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId") || undefined,
    orderDate: formData.get("orderDate"),
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
    placeToDelivery: formData.get("placeToDelivery") || undefined,
  });
  if (!rawParse.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(rawParse.error) };
  }
  const parsed = rawParse.data;
  // R3 — Checkbox ธรรมดา (ไม่ใช่ JS-constructed FormData) : unchecked จะไม่ส่ง key
  // นี้มาเลยตาม HTML spec จึงเช็คแค่ formData.has() พอ ไม่ต้องสนใจ value string
  const applyDiscount = formData.has("applyDiscount");

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
        applyDiscount,
        status: "DRAFT",
        createdById: user.id,
      },
    });
  });

  await db.auditLog.create({
    data: { userId: user.id, action: "CREATE", module: "Order", recordId: order.id, newValue: { ...parsed, applyDiscount } },
  });

  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}

// ข้อ 63: Copy/Duplicate Order เก่า — ดึงเฉพาะรายการสินค้า+จำนวนมา ห้าม Copy
// ราคา/ส่วนลดเก่ามาด้วยเด็ดขาด (ราคา/ส่วนลดจะถูกคำนวณใหม่ตาม Order Date
// ใหม่โดยอัตโนมัติผ่าน Pricing Engine ตอนแสดง Preview อยู่แล้ว เพราะ
// OrderItem ไม่ได้เก็บราคาไว้เลย — จึง "ห้าม Copy ราคาเก่า" โดยธรรมชาติ)
export async function duplicateOrder(sourceOrderId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.create")) throw new Error("FORBIDDEN");

  const newOrderDate = String(formData.get("newOrderDate") || "");
  if (!newOrderDate) {
    return { success: false, error: "กรุณาระบุวันที่ Order ใหม่", fieldErrors: { newOrderDate: "กรุณาระบุวันที่ Order ใหม่" } };
  }

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
  // R6 Phase B — "ขนาดพิเศษ/ระบุเอง": ทั้งคู่ต้องมาคู่กันเสมอถ้ามี (validate เพิ่มด้านล่าง)
  sizeOverride: z.string().optional(),
  unitPriceOverride: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ").optional(),
});

export async function addOrderItem(orderId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.editDraft")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DRAFT") {
    return { success: false, error: "แก้ไขรายการได้เฉพาะ Order สถานะ Draft เท่านั้น (ข้อ 29)" };
  }

  const rawParse = addItemSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    descriptionOverride: formData.get("descriptionOverride") || undefined,
    sizeOverride: formData.get("sizeOverride") || undefined,
    unitPriceOverride: formData.get("unitPriceOverride") || undefined,
  });
  if (!rawParse.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(rawParse.error) };
  }
  const parsed = rawParse.data;

  // R8 — Product Assignment ตามบริษัทลูกค้า: Defense-in-depth หลัง UI กรองแล้วชั้นหนึ่ง
  // (Picker เห็นเฉพาะสินค้าที่เปิดให้บริษัทนี้อยู่แล้ว แต่ Server ไม่เชื่อ Client เสมอ)
  const accessError = await validateProductAllowedForCustomer(parsed.productId, order.customerId);
  if (accessError) return { success: false, error: accessError };

  await db.orderItem.create({
    data: {
      orderId,
      productId: parsed.productId,
      quantity: parsed.quantity,
      descriptionOverride: parsed.descriptionOverride,
      sizeOverride: parsed.sizeOverride,
      unitPriceOverride: parsed.unitPriceOverride,
    },
  });

  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.editDraft")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DRAFT") {
    return { success: false, error: "แก้ไขรายการได้เฉพาะ Order สถานะ Draft เท่านั้น" };
  }

  await db.orderItem.delete({ where: { id: itemId } });
  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}

// R3 — เปลี่ยนการใช้ส่วนลด (Calculation Toggle จริง) ได้เฉพาะตอน DRAFT เท่านั้น
// (mirror ของ updateQuotationVatMode) — หลัง Confirm ต้องใช้ E3 Edit แทนเพื่อให้
// Invoice เก่า/ใหม่ยังคงหลักการ Cancel-then-Reissue เดิม
export async function updateOrderApplyDiscount(orderId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.editDraft")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DRAFT") {
    return { success: false, error: "เปลี่ยนการใช้ส่วนลดได้เฉพาะ Order สถานะ Draft เท่านั้น" };
  }

  const applyDiscount = formData.has("applyDiscount");
  await db.order.update({ where: { id: orderId }, data: { applyDiscount } });
  revalidatePath(`/orders/${orderId}`);
  return { success: true };
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
export async function confirmOrder(orderId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.confirm")) throw new Error("FORBIDDEN");
  if (!can(user.role, "invoice.create")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true, customer: true, branch: true },
  });
  if (order.status !== "DRAFT") {
    return { success: false, error: "Order นี้ถูก Confirm หรือยกเลิกไปแล้ว" };
  }
  if (order.items.length === 0) {
    return { success: false, error: "ต้องมีอย่างน้อย 1 รายการสินค้าก่อน Confirm" };
  }

  // คำนวณ Preview ก่อนเข้า transaction (Order ยังเป็น Draft ตอนนี้ แก้ไม่ได้แล้ว
  // เพราะกำลังอยู่ระหว่างขั้นตอน Confirm — race condition อื่นถูกกันซ้ำอีกชั้นด้วย
  // การเช็คสถานะภายใน transaction ด้านล่าง)
  const preview = await computeOrderPreview(orderId);
  // R12 — Snapshot ส่วนลดเชิงสถิติ (หักส่วนลดกลุ่มเสมอ ไม่สน applyDiscount) สำหรับ
  // Dashboard/รายงานยอดขาย — ถ้าใบนี้ใช้ส่วนลดจริงอยู่แล้ว Forced = Actual ไม่ต้องคำนวณซ้ำ
  const forcedPreview = order.applyDiscount ? preview : await computeOrderPreview(orderId, db, { forceApplyDiscount: true });
  const period = currentPeriod(order.orderDate);

  try {
    await db.$transaction(async (tx) => {
    // Stabilization — Concurrency Hardening: เดิม "อ่าน status แล้วค่อย update" ซึ่งที่
    // READ COMMITTED (Default ของ Postgres) ไม่ล็อก Row — Reproduce ได้จริงว่า 2 Request
    // พร้อมกัน (Double-click/Double-submit) ผ่านเช็ค DRAFT ทั้งคู่แล้ว Confirm ซ้ำ → สร้าง
    // Invoice ซ้ำชุด + กินเลขรันซ้ำ — แก้เป็น Compare-and-Set: UPDATE ... WHERE status='DRAFT'
    // เป็น Atomic ระดับ Row ใน Statement เดียว ถ้า count ไม่ใช่ 1 แปลว่ามีคนชิง Confirm
    // ไปก่อนแล้ว Rollback ทั้ง Transaction — พฤติกรรมกรณีปกติ (Request เดียว) เหมือนเดิมเป๊ะ
    const cas = await tx.order.updateMany({ where: { id: orderId, status: "DRAFT" }, data: { status: "CONFIRMED" } });
    if (cas.count !== 1) throw new Error("Order นี้ถูก Confirm ไปแล้ว (อาจถูกกดซ้ำ)");
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
          // Owner UAT Fix Batch 1 — ข้อ 3: Order ไม่มีสาขาได้แล้ว (order.branch เป็น
          // null ได้) — Snapshot เป็น null ไปด้วยตามข้อเท็จจริง ไม่เดา/ไม่ fallback ข้อความ
          branchNameSnapshot: order.branch?.name ?? null,
          addressSnapshot: order.branch?.address ?? order.customer.address ?? null,
          placeToDelivery: order.placeToDelivery,
          grossAmount: group.grossAmount,
          discountPct: group.discountPct,
          discountAmount: group.discountAmount,
          // R3 — Snapshot ค่า applyDiscount ของ Order ณ ตอน Confirm เพื่อแยกความหมาย
          // "ไม่มี Discount Rule จริง" ออกจาก "มี Rule แต่ตั้งใจไม่ใช้" ตอน Audit ย้อนหลัง
          applyDiscount: order.applyDiscount,
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
              // R12 — จัดสรรส่วนลดเชิงสถิติ (Forced) ต่อบรรทัดด้วยกลไกเดียวกันเป๊ะ แล้ว Map
              // กลับด้วย orderItemId (การจัดกลุ่ม/ลำดับของ 2 Preview เหมือนกันแต่ผูกด้วย id
              // ชัดเจนกว่าพึ่ง Index)
              const forcedGroup = forcedPreview.groups.find((g) => g.productTypeId === group.productTypeId);
              const forcedAlloc = forcedGroup
                ? allocateProportionally(forcedGroup.items.map((i) => i.grossAmount), forcedGroup.discountAmount)
                : [];
              const statByOrderItemId = new Map(
                (forcedGroup?.items ?? []).map((it, i) => [it.orderItemId, forcedAlloc[i]])
              );

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
                  statDiscountAmount: statByOrderItemId.get(item.orderItemId) ?? new Decimal(0),
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
    return {
      success: false,
      error:
        "ยืนยันออเดอร์ไม่สำเร็จ — ไม่มีการเปลี่ยนแปลงใดๆ เกิดขึ้น (ระบบยกเลิกทุกอย่างที่ทำไปแล้วอัตโนมัติ) กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ",
    };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/invoices");
  return { success: true };
}

// Smoke Test R13 (2026-08-25) — Owner สั่งเปลี่ยนกติกา Clarification #11 เดิม (เคย Block
// ถ้ามี Invoice ที่ยังไม่ Cancel): งานจริงลูกน้องพิมพ์+ยืนยันไปแล้วก็ยังต้องแก้บิลได้ —
// ยกเลิก Order แล้ว Cascade ยกเลิก Invoice ลูกทุกใบให้อัตโนมัติ (Dashboard/รายงานตัดยอด
// ให้เองเพราะนับเฉพาะ status=PRINTED, หน้าใบวางบิลก็หายจากทั้ง 2 Tab อัตโนมัติด้วยเหตุผล
// เดียวกัน) — ยัง Block 2 กรณีที่ Cascade ต่อไม่ได้เพราะมีเอกสารการเงินอื่นเกาะอยู่:
// Invoice อยู่ในใบวางบิล Active หรือถูกอ้างโดยใบกำกับภาษี Active → ต้องยกเลิกใบพวกนั้น
// ก่อน (แจ้งเลขที่ชัดเจน) กันเอกสารเงินค้างอ้างถึงใบที่ตายแล้ว
export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.cancel")) throw new Error("FORBIDDEN");

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { invoices: { include: { billingNote: true, taxInvoices: true } } },
  });

  // Phase E1 — เพิ่ม guard นี้ให้ตรงกับ cancel action อื่นอีก 4 ประเภท (Invoice/
  // TaxInvoice/BillingNote/RepairReturnNote ทุกตัวเช็ค "ถูกยกเลิกไปแล้ว" อยู่แล้ว
  // มีแค่ cancelOrder ที่ไม่มี) กัน Audit Log ซ้ำซ้อนจากการกดยกเลิกซ้ำ ไม่ได้เปลี่ยน
  // ผลลัพธ์ปลายทาง (ยังเป็น CANCELLED เหมือนเดิม) และ return แทน throw สำหรับ
  // Validation Error ที่คาดไว้แล้วทั้งคู่ (ดู src/lib/action-result.ts)
  if (order.status === "CANCELLED") return { success: false, error: "Order นี้ถูกยกเลิกไปแล้ว" };

  const activeInvoices = order.invoices.filter((inv) => inv.status !== "CANCELLED");

  // R13 — Guard เอกสารการเงินที่เกาะ Invoice อยู่ ก่อน Cascade
  const lockedByBillingNote = activeInvoices.filter((inv) => inv.billingNoteId && inv.billingNote?.status !== "CANCELLED");
  if (lockedByBillingNote.length > 0) {
    const numbers = [...new Set(lockedByBillingNote.map((inv) => inv.billingNote!.billingNoteNumber))].join(", ");
    return {
      success: false,
      error: `ยกเลิก Order นี้ไม่ได้ — Invoice บางใบอยู่ในใบวางบิล ${numbers} — กรุณายกเลิกใบวางบิลนั้นก่อน (Invoice จะถูกปลดออกให้เอง) แล้วค่อยยกเลิก Order`,
    };
  }
  const lockedByTaxInvoice = activeInvoices.filter((inv) => inv.taxInvoices.some((tx) => tx.status !== "CANCELLED"));
  if (lockedByTaxInvoice.length > 0) {
    const numbers = [
      ...new Set(
        lockedByTaxInvoice.flatMap((inv) => inv.taxInvoices.filter((tx) => tx.status !== "CANCELLED").map((tx) => tx.taxInvoiceNumber))
      ),
    ].join(", ");
    return {
      success: false,
      error: `ยกเลิก Order นี้ไม่ได้ — Invoice บางใบถูกอ้างโดยใบกำกับภาษี ${numbers} — กรุณายกเลิกใบกำกับภาษีนั้นก่อน แล้วค่อยยกเลิก Order`,
    };
  }

  const beforeStatus = order.status;
  // Final Audit — CAS กัน Concurrent Status Change (Pattern C1/C2 เดิม): สำคัญเป็น
  // พิเศษที่ Order เพราะ confirmOrder วิ่งคู่กันได้ — ถ้า Confirm สำเร็จแทรกกลาง (DRAFT
  // →CONFIRMED พร้อมสร้าง Invoice) การเขียน CANCELLED ทับตรงๆ จะได้ Order ยกเลิกที่มี
  // Invoice สดค้างอยู่ = Integrity พัง — CAS บนสถานะที่อ่านมาปิดช่องนี้สนิท
  const CHANGED = "ORDER_STATUS_CHANGED";
  try {
    await db.$transaction(async (tx) => {
    const cas = await tx.order.updateMany({
      where: { id: orderId, status: beforeStatus },
      data: { status: "CANCELLED" },
    });
    if (cas.count === 0) throw new Error(CHANGED);

    // R13 — Cascade: ยกเลิก Invoice ลูกที่ยัง Active ทุกใบใน Transaction เดียวกัน
    for (const inv of activeInvoices) {
      await tx.invoice.updateMany({ where: { id: inv.id, status: inv.status }, data: { status: "CANCELLED" } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CANCEL",
          module: "Invoice",
          recordId: inv.id,
          oldValue: { status: inv.status },
          newValue: { status: "CANCELLED", reason: "ยกเลิกตาม Order ต้นทาง (Cascade)" },
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CANCEL",
        module: "Order",
        recordId: orderId,
        oldValue: { status: beforeStatus },
        newValue: { status: "CANCELLED", cancelledInvoices: activeInvoices.map((i) => i.invoiceNumber) },
      },
    });
    });
  } catch (err) {
    if (err instanceof Error && err.message === CHANGED) {
      return { success: false, error: "สถานะ Order เปลี่ยนไปแล้วระหว่างดำเนินการ — กรุณารีเฟรชหน้าแล้วลองใหม่" };
    }
    throw err;
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/invoices");
  return { success: true };
}

const editItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  descriptionOverride: z.string().optional(),
  sizeOverride: z.string().optional(),
  unitPriceOverride: z.coerce.number().min(0).optional(),
});
const editItemsSchema = z.array(editItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการสินค้า");

const LOCKED_REASON_LABEL: Record<"tax-invoice" | "billing-note", string> = {
  "tax-invoice": "ใบกำกับภาษี",
  "billing-note": "ใบวางบิล",
};

// E3 — แก้ไข Order ที่ Confirmed ไปแล้ว (Case A เท่านั้น: ยังไม่มีเอกสารอ้างอิงต่อ)
// ยกเลิก Invoice เดิมทั้งหมดของ Order นี้ (คงไว้เป็น CANCELLED ห้าม delete/reuse เลข)
// แล้วแตก Invoice ใหม่ด้วยรายการที่แก้ไข ในทรานแซคชันเดียวกันทั้งหมด (atomic เหมือน
// confirmOrder) — Order.status คงเป็น CONFIRMED ตลอด ไม่มี Status ใหม่ระหว่างทาง
// (ตามที่อนุมัติ ไม่เพิ่ม EDITING status)
export async function editConfirmedOrder(orderId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "order.confirm")) throw new Error("FORBIDDEN");
  if (!can(user.role, "invoice.cancel")) throw new Error("FORBIDDEN");
  if (!can(user.role, "invoice.create")) throw new Error("FORBIDDEN");

  const itemsRaw = JSON.parse(String(formData.get("itemsJson") || "[]"));
  const parsedItems = editItemsSchema.parse(itemsRaw);
  const acknowledgePrinted = formData.get("acknowledgePrinted") === "1";
  // R3 — OrderEditModal เป็น Client Component ที่สร้าง FormData เองผ่าน JS (ไม่ใช่ Native
  // Checkbox) จึงใช้ Convention เดียวกับ acknowledgePrinted ("1"/"0") ไม่ใช่ formData.has()
  const applyDiscount = formData.get("applyDiscount") === "1";

  const guard = await fetchOrderEditGuard(orderId);
  if (guard.kind === "not-applicable") {
    return { success: false, error: "Order นี้ไม่ใช่สถานะที่แก้ไขได้ (ต้องเป็นสถานะยืนยันแล้วเท่านั้น)" };
  }
  if (guard.kind === "no-active-invoices") {
    return {
      success: false,
      error:
        "Order นี้ไม่มี Invoice ที่ Active เหลืออยู่เลย (สถานะผิดปกติ) ระบบไม่สร้าง Invoice ใหม่ให้เองโดยเดา กรุณาติดต่อผู้ดูแลระบบ/เจ้าของระบบ",
    };
  }
  if (guard.kind === "locked") {
    const reasonText = guard.reasons.map((r) => LOCKED_REASON_LABEL[r]).join("และ");
    return {
      success: false,
      error: `ไม่สามารถแก้ไข Order นี้ได้ เนื่องจากมี${reasonText}อ้างอิงอยู่แล้ว — กรุณาใช้ "คัดลอกออเดอร์นี้เป็นออเดอร์ใหม่" แทน`,
    };
  }
  if (guard.requiresPrintedAck && !acknowledgePrinted) {
    return {
      success: false,
      error: "กรุณายืนยันว่ารับทราบว่าเอกสารที่เคยพิมพ์แล้วจะถูกยกเลิก ก่อนดำเนินการแก้ไขต่อ",
    };
  }

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true, branch: true } });
  const period = currentPeriod(order.orderDate);

  try {
    await db.$transaction(async (tx) => {
      // Race-condition re-check สดๆ ภายใน transaction (เหมือน confirmOrder)
      const freshGuard = await fetchOrderEditGuard(orderId, tx);
      if (freshGuard.kind !== "editable") {
        throw new Error("สถานะ Order เปลี่ยนไประหว่างดำเนินการ (อาจถูกแก้ไข/อ้างอิงโดยผู้อื่นพร้อมกัน) กรุณาลองใหม่");
      }

      const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoices: true } });
      const activeInvoices = freshOrder.invoices.filter((i) => i.status !== "CANCELLED");

      for (const inv of activeInvoices) {
        await tx.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "CANCEL",
            module: "Invoice",
            recordId: inv.id,
            oldValue: { status: inv.status },
            newValue: { status: "CANCELLED", reason: "แก้ไข Order ต้นทาง (E3 Edit Confirmed Order)" },
          },
        });
      }

      const oldItems = await tx.orderItem.findMany({ where: { orderId } });
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.orderItem.createMany({
        data: parsedItems.map((i) => ({
          orderId,
          productId: i.productId,
          quantity: i.quantity,
          descriptionOverride: i.descriptionOverride,
          sizeOverride: i.sizeOverride,
          unitPriceOverride: i.unitPriceOverride,
        })),
      });
      // R3 — ต้อง update Order.applyDiscount ก่อนเรียก computeOrderPreview เสมอ เพราะ
      // ฟังก์ชันนั้น self-fetch order จาก client เดียวกัน (tx) จะเห็นค่าใหม่ทันทีถ้า
      // update ไปก่อนในทรานแซคชันเดียวกันนี้
      await tx.order.update({ where: { id: orderId }, data: { applyDiscount } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          module: "Order",
          recordId: orderId,
          oldValue: {
            items: oldItems.map((i) => ({ productId: i.productId, quantity: i.quantity.toString() })),
            applyDiscount: freshOrder.applyDiscount,
          },
          newValue: { items: parsedItems, applyDiscount },
        },
      });

      // อ่าน Preview จาก tx (ไม่ใช่ db เฉยๆ) เพราะต้องเห็น OrderItem ที่เพิ่ง insert
      // ข้างบนซึ่งยังไม่ commit — ราคาคิดตาม order.orderDate เดิมอัตโนมัติ (ไม่ใช่วันนี้)
      const preview = await computeOrderPreview(orderId, tx);
      // R12 — Snapshot ส่วนลดเชิงสถิติ (เหมือน confirmOrder ทุกประการ) — อ่านจาก tx เดียวกัน
      const forcedPreview = applyDiscount ? preview : await computeOrderPreview(orderId, tx, { forceApplyDiscount: true });

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
            customerNameSnapshot: order.customer.companyName,
            taxIdSnapshot: order.customer.taxId,
            branchNameSnapshot: order.branch?.name ?? null,
            addressSnapshot: order.branch?.address ?? order.customer.address ?? null,
            placeToDelivery: order.placeToDelivery,
            grossAmount: group.grossAmount,
            discountPct: group.discountPct,
            discountAmount: group.discountAmount,
            applyDiscount,
            netBeforeVat: group.netAmount,
            vatPct: new Decimal(0),
            vatAmount: new Decimal(0),
            grandTotal: group.netAmount,
            status: "CONFIRMED",
            createdById: user.id,
            items: {
              create: (() => {
                const grossAmounts = group.items.map((item) => item.grossAmount);
                const allocatedDiscounts = allocateProportionally(grossAmounts, group.discountAmount);
                // R12 — เหมือน confirmOrder ทุกประการ
                const forcedGroup = forcedPreview.groups.find((g) => g.productTypeId === group.productTypeId);
                const forcedAlloc = forcedGroup
                  ? allocateProportionally(forcedGroup.items.map((i) => i.grossAmount), forcedGroup.discountAmount)
                  : [];
                const statByOrderItemId = new Map(
                  (forcedGroup?.items ?? []).map((it, i) => [it.orderItemId, forcedAlloc[i]])
                );

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
                    statDiscountAmount: statByOrderItemId.get(item.orderItemId) ?? new Decimal(0),
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
            newValue: {
              invoiceNumber,
              parentOrderId: order.id,
              productTypeCode: group.productTypeCode,
              note: "สร้างจากการแก้ไข Order ที่ Confirmed แล้ว (E3)",
            },
          },
        });
      }
    });
  } catch (err) {
    logError("edit-confirmed-order", err, { orderId });
    return {
      success: false,
      error:
        "แก้ไข Order ไม่สำเร็จ — ไม่มีการเปลี่ยนแปลงใดๆ เกิดขึ้น (ระบบยกเลิกทุกอย่างที่ทำไปแล้วอัตโนมัติ) กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ",
    };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/invoices");
  return { success: true };
}
