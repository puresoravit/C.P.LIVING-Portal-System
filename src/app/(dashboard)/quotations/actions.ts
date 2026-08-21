"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { computeQuotationCalc, type QuotationVatModeValue } from "@/lib/quotation-pricing";
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

const createQuotationSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  branchId: z.string().min(1, "กรุณาเลือกสาขา"),
  quotationDate: z.coerce.date(),
  reference: z.string().optional(),
  note: z.string().optional(),
  placeToDelivery: z.string().optional(),
  vatMode: z.enum(["NONE", "STANDARD"]).default("NONE"),
});

export async function createDraftQuotation(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "quotation.create")) throw new Error("FORBIDDEN");

  const parsed = createQuotationSchema.parse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId"),
    quotationDate: formData.get("quotationDate"),
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
    placeToDelivery: formData.get("placeToDelivery") || undefined,
    vatMode: formData.get("vatMode") || "NONE",
  });

  const quotation = await db.$transaction(async (tx) => {
    // Quotation เป็นเอกสารแยกเด็ดขาดจาก Order/Invoice — ไม่ผูก Relation ใดๆ กัน,
    // ไม่แตกตาม ProductType, ไม่นับใน Dashboard/Report/Sales SOT/Billing Note/
    // Tax Invoice — Running Number จองตอน Draft สร้าง (ก่อน Confirm) เพราะ Quotation
    // ไม่มีน้ำหนักทางบัญชี (ต่างจาก Order ที่รอถึง Confirm ค่อยจอง Invoice Number)
    const period = currentPeriod(parsed.quotationDate);
    const seq = await getNextSeq("QT", period, tx);
    const quotationNumber = formatDocNumber("QT", period, seq);

    const created = await tx.quotation.create({
      data: {
        quotationNumber,
        quotationDate: parsed.quotationDate,
        customerId: parsed.customerId,
        branchId: parsed.branchId,
        reference: parsed.reference,
        note: parsed.note,
        placeToDelivery: parsed.placeToDelivery,
        vatMode: parsed.vatMode as QuotationVatModeValue,
        status: "DRAFT",
        createdById: user.id,
      },
    });

    await tx.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Quotation", recordId: created.id, newValue: { quotationNumber } },
    });

    return created;
  });

  revalidatePath("/quotations");
  redirect(`/quotations/${quotation.id}`);
}

const addItemSchema = z.object({
  productId: z.string().min(1, "กรุณาเลือกสินค้า"),
  quantity: z.coerce.number().positive("จำนวนต้องมากกว่า 0"),
  descriptionOverride: z.string().optional(),
});

export async function addQuotationItem(quotationId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  if (quotation.status !== "DRAFT") throw new Error("แก้ไขรายการได้เฉพาะ Quotation สถานะร่างเท่านั้น");

  const parsed = addItemSchema.parse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    descriptionOverride: formData.get("descriptionOverride") || undefined,
  });

  await db.quotationItem.create({
    data: { quotationId, productId: parsed.productId, quantity: parsed.quantity, descriptionOverride: parsed.descriptionOverride },
  });

  revalidatePath(`/quotations/${quotationId}`);
}

export async function removeQuotationItem(quotationId: string, itemId: string) {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  if (quotation.status !== "DRAFT") throw new Error("แก้ไขรายการได้เฉพาะ Quotation สถานะร่างเท่านั้น");

  await db.quotationItem.delete({ where: { id: itemId } });
  revalidatePath(`/quotations/${quotationId}`);
}

export async function updateQuotationVatMode(quotationId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  if (quotation.status !== "DRAFT") throw new Error("แก้ไข VAT Mode ได้เฉพาะ Quotation สถานะร่างเท่านั้น");

  const vatMode = z.enum(["NONE", "STANDARD"]).parse(formData.get("vatMode"));
  await db.quotation.update({ where: { id: quotationId }, data: { vatMode } });
  revalidatePath(`/quotations/${quotationId}`);
}

// Confirm — Snapshot ทุกฟิลด์ที่จำเป็นตาม computeQuotationCalc (Reuse Pricing/VAT Engine
// เดิมทั้งหมด) revisionNo เริ่มที่ 0 เสมอตอน Confirm ครั้งแรก
export async function confirmQuotation(quotationId: string) {
  const user = await requireUser();
  if (!can(user.role, "quotation.confirm")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { items: true, customer: true, branch: true } });
  if (quotation.status !== "DRAFT") throw new Error("Quotation นี้ถูก Confirm หรือยกเลิกไปแล้ว");
  if (quotation.items.length === 0) throw new Error("ต้องมีอย่างน้อย 1 รายการสินค้าก่อน Confirm");

  const calc = await computeQuotationCalc(
    quotation.items.map((i) => ({ productId: i.productId, quantity: i.quantity, descriptionOverride: i.descriptionOverride })),
    { customerId: quotation.customerId, branchId: quotation.branchId, quotationDate: quotation.quotationDate, vatMode: quotation.vatMode as QuotationVatModeValue }
  );

  try {
    await db.$transaction(async (tx) => {
      const fresh = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
      if (fresh.status !== "DRAFT") throw new Error("Quotation นี้ถูก Confirm ไปแล้ว (อาจถูกกดซ้ำ)");

      await tx.quotation.update({
        where: { id: quotationId },
        data: {
          customerNameSnapshot: quotation.customer.companyName,
          customerTaxIdSnapshot: quotation.customer.taxId,
          branchNameSnapshot: quotation.branch.name,
          addressSnapshot: quotation.branch.address,
          grossAmount: calc.grossAmount,
          discountAmount: calc.discountAmount,
          vatRateSnapshot: calc.vatRateSnapshot,
          netBeforeVat: calc.netBeforeVat,
          vatAmount: calc.vatAmount,
          grandTotal: calc.grandTotal,
          revisionNo: 0,
          status: "CONFIRMED",
        },
      });

      // calc.items มาจาก quotation.items ตามลำดับเดิมเป๊ะ (ส่งเข้า computeQuotationCalc
      // ตรงๆ ไม่ผ่านการ Sort/Filter ใดๆ) จับคู่ด้วย Index จึงถูกต้องเสมอ แม้มี Product+
      // Quantity ซ้ำกันหลายบรรทัด (ต่างจากการ find() ด้วย productId+quantity ที่จะจับคู่
      // ผิดตัวได้ถ้ามีบรรทัดซ้ำ)
      for (let idx = 0; idx < quotation.items.length; idx++) {
        const item = quotation.items[idx];
        const found = calc.items[idx];
        await tx.quotationItem.update({
          where: { id: item.id },
          data: {
            skuSnapshot: found.skuSnapshot,
            productNameSnapshot: found.productNameSnapshot,
            productTypeSnapshot: found.productTypeSnapshot,
            sizeSnapshot: found.sizeSnapshot,
            unitSnapshot: found.unitSnapshot,
            unitPriceSnapshot: found.unitPriceSnapshot,
            grossAmount: found.grossAmount,
            discountAmount: found.discountAmount,
            netAmount: found.netAmount,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CONFIRM",
          module: "Quotation",
          recordId: quotationId,
          oldValue: { status: "DRAFT" },
          newValue: { status: "CONFIRMED", grandTotal: calc.grandTotal.toString(), vatMode: quotation.vatMode },
        },
      });
    });
  } catch (err) {
    logError("confirm-quotation", err, { quotationId });
    throw new Error("ยืนยัน Quotation ไม่สำเร็จ — ไม่มีการเปลี่ยนแปลงใดๆ เกิดขึ้น กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ");
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
}

const editItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  descriptionOverride: z.string().optional(),
});
const editItemsSchema = z.array(editItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการสินค้า");

// แก้ไข Quotation ที่ CONFIRMED แล้ว — Re-snapshot ใบเดิม (เลขที่เดิม) + revisionNo+=1
// + AuditLog before/after ตามที่อนุมัติ (ไม่ใช่ Cancel-and-Reissue แบบ E3 เพราะไม่มี
// Downstream Document ใดๆ อ้างอิง Quotation เลย)
export async function editConfirmedQuotation(quotationId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const itemsRaw = JSON.parse(String(formData.get("itemsJson") || "[]"));
  const parsedItems = editItemsSchema.parse(itemsRaw);
  const vatMode = z.enum(["NONE", "STANDARD"]).parse(formData.get("vatMode"));

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { items: true, customer: true, branch: true } });
  if (quotation.status === "CANCELLED") {
    return { success: false, error: "Quotation นี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้" };
  }
  if (quotation.status !== "CONFIRMED") {
    return { success: false, error: "แก้ไขแบบนี้ได้เฉพาะ Quotation สถานะยืนยันแล้วเท่านั้น" };
  }

  const beforeSnapshot = {
    vatMode: quotation.vatMode,
    grossAmount: quotation.grossAmount?.toString(),
    discountAmount: quotation.discountAmount?.toString(),
    vatRateSnapshot: quotation.vatRateSnapshot?.toString(),
    netBeforeVat: quotation.netBeforeVat?.toString(),
    vatAmount: quotation.vatAmount?.toString(),
    grandTotal: quotation.grandTotal?.toString(),
    items: quotation.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString(), netAmount: i.netAmount?.toString() })),
  };

  const calc = await computeQuotationCalc(
    parsedItems.map((i) => ({ productId: i.productId, quantity: i.quantity, descriptionOverride: i.descriptionOverride })),
    { customerId: quotation.customerId, branchId: quotation.branchId, quotationDate: quotation.quotationDate, vatMode }
  );

  try {
    await db.$transaction(async (tx) => {
      const fresh = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } });
      if (fresh.status !== "CONFIRMED") {
        throw new Error("สถานะ Quotation เปลี่ยนไประหว่างดำเนินการ กรุณาลองใหม่");
      }

      await tx.quotationItem.deleteMany({ where: { quotationId } });
      await tx.quotationItem.createMany({
        data: calc.items.map((item) => ({
          quotationId,
          productId: item.productId,
          quantity: item.quantity,
          descriptionOverride: item.descriptionOverride,
          skuSnapshot: item.skuSnapshot,
          productNameSnapshot: item.productNameSnapshot,
          productTypeSnapshot: item.productTypeSnapshot,
          sizeSnapshot: item.sizeSnapshot,
          unitSnapshot: item.unitSnapshot,
          unitPriceSnapshot: item.unitPriceSnapshot,
          grossAmount: item.grossAmount,
          discountAmount: item.discountAmount,
          netAmount: item.netAmount,
        })),
      });

      const updated = await tx.quotation.update({
        where: { id: quotationId },
        data: {
          vatMode,
          grossAmount: calc.grossAmount,
          discountAmount: calc.discountAmount,
          vatRateSnapshot: calc.vatRateSnapshot,
          netBeforeVat: calc.netBeforeVat,
          vatAmount: calc.vatAmount,
          grandTotal: calc.grandTotal,
          revisionNo: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          module: "Quotation",
          recordId: quotationId,
          oldValue: beforeSnapshot,
          newValue: {
            vatMode,
            grossAmount: calc.grossAmount.toString(),
            discountAmount: calc.discountAmount.toString(),
            vatRateSnapshot: calc.vatRateSnapshot.toString(),
            netBeforeVat: calc.netBeforeVat.toString(),
            vatAmount: calc.vatAmount.toString(),
            grandTotal: calc.grandTotal.toString(),
            revisionNo: updated.revisionNo,
            items: calc.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString(), netAmount: i.netAmount.toString() })),
          },
        },
      });
    });
  } catch (err) {
    logError("edit-confirmed-quotation", err, { quotationId });
    return {
      success: false,
      error: "แก้ไข Quotation ไม่สำเร็จ — ไม่มีการเปลี่ยนแปลงใดๆ เกิดขึ้น กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ",
    };
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  return { success: true };
}

export async function cancelQuotation(quotationId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.cancel")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  if (quotation.status === "CANCELLED") {
    return { success: false, error: "Quotation นี้ถูกยกเลิกไปแล้ว" };
  }

  const beforeStatus = quotation.status;
  await db.quotation.update({ where: { id: quotationId }, data: { status: "CANCELLED" } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CANCEL",
      module: "Quotation",
      recordId: quotationId,
      oldValue: { status: beforeStatus },
      newValue: { status: "CANCELLED" },
    },
  });

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  return { success: true };
}
