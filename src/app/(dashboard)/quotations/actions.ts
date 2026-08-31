"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { parseDocNumber, tryReleaseSeq } from "@/lib/running-number-reclaim";
import { computeQuotationCalc, type QuotationVatModeValue } from "@/lib/quotation-pricing";
import { getEffectivePrice } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logError } from "@/lib/logger";
import type { ActionResult } from "@/lib/action-result";
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

// Owner UAT Round 3 — ข้อ 3: เหมือน orders/actions.ts ทุกประการ — Read-only Suggestion
// เท่านั้น ไม่ Freeze เป็น unitPriceOverride อัตโนมัติ — Positional Argument เพื่อ .bind()
// บางส่วนล่วงหน้าจาก Server Component ได้ (ดู getSuggestedOrderItemPrice)
export async function getSuggestedQuotationItemPrice(
  // Phase H — Guest Quotation: customerId เป็น null ได้ → ไม่มี PriceRule ให้ Match
  // (Rule ผูก customerId เสมอ) ใช้ Standard Price จาก Product Master ตรงๆ (Tier 3 เดิม)
  customerId: string | null,
  branchId: string | null,
  quotationDate: Date,
  productId: string
): Promise<{ price: number }> {
  await requireUser();
  if (customerId == null) {
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    return { price: Number(product.standardPrice) };
  }
  const { price } = await getEffectivePrice({ productId, customerId, branchId, orderDate: quotationDate });
  return { price: Number(price) };
}

// Phase H — Guest/Manual Customer เฉพาะใบเสนอราคา: discriminatedUnion แยก 2 โหมดชัด
// (MASTER = ลูกค้าใน Customer Master เดิมทุกประการ, GUEST = กรอกข้อมูลเองโดยไม่สร้าง
// Customer Master ใดๆ — ข้อมูลถูก Snapshot ติดใบเสนอราคาตั้งแต่ตอนสร้าง Draft)
const createQuotationSchema = z.discriminatedUnion("customerMode", [
  z.object({
    customerMode: z.literal("MASTER"),
    customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
    // Owner UAT Fix Batch 1 — ข้อ 3: เหมือน Order ทุกประการ
    branchId: z.string().optional(),
    quotationDate: z.coerce.date(),
    reference: z.string().optional(),
    note: z.string().optional(),
    placeToDelivery: z.string().optional(),
    vatMode: z.enum(["NONE", "STANDARD", "ADD_ON"]).default("NONE"),
  }),
  z.object({
    customerMode: z.literal("GUEST"),
    guestName: z.string().trim().min(1, "กรุณากรอกชื่อลูกค้า/บริษัท"),
    guestTaxId: z.string().trim().optional(),
    guestAddress: z.string().trim().optional(),
    guestContact: z.string().trim().optional(),
    guestPhone: z.string().trim().optional(),
    quotationDate: z.coerce.date(),
    reference: z.string().optional(),
    note: z.string().optional(),
    placeToDelivery: z.string().optional(),
    vatMode: z.enum(["NONE", "STANDARD", "ADD_ON"]).default("NONE"),
  }),
]);

export async function createDraftQuotation(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.create")) throw new Error("FORBIDDEN");

  const customerMode = formData.get("customerMode") === "GUEST" ? "GUEST" : "MASTER";
  const rawParse = createQuotationSchema.safeParse({
    customerMode,
    customerId: formData.get("customerId") || undefined,
    branchId: formData.get("branchId") || undefined,
    guestName: formData.get("guestName") || undefined,
    guestTaxId: formData.get("guestTaxId") || undefined,
    guestAddress: formData.get("guestAddress") || undefined,
    guestContact: formData.get("guestContact") || undefined,
    guestPhone: formData.get("guestPhone") || undefined,
    quotationDate: formData.get("quotationDate"),
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
    placeToDelivery: formData.get("placeToDelivery") || undefined,
    vatMode: formData.get("vatMode") || "NONE",
  });
  if (!rawParse.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(rawParse.error) };
  }
  const parsed = rawParse.data;

  const quotation = await db.$transaction(async (tx) => {
    // R10 — "ใบเสนอราคาลูกค้าที่ไม่มีในระบบ": Guest QT ทุกใบสร้าง "ราย" (Prospect) ของ
    // ตัวเองเสมอ (ห้าม Auto-merge จากชื่อโดยไม่ให้ User ยืนยัน — การรวมรายทำที่หน้า
    // /quotations/prospects ด้วยการกดยืนยันเองเท่านั้น)
    const prospect =
      parsed.customerMode === "GUEST"
        ? await tx.quotationProspect.create({
            data: {
              name: parsed.guestName!,
              taxId: parsed.guestTaxId || null,
              address: parsed.guestAddress || null,
              contactPerson: parsed.guestContact || null,
              phone: parsed.guestPhone || null,
            },
          })
        : null;
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
        // Phase H — GUEST: ไม่ผูก Customer/Branch Master เลย + Snapshot ข้อมูลลูกค้าที่
        // กรอกเองทันทีตั้งแต่ Draft (ลูกค้า Master ยัง Snapshot ตอน Confirm ตามเดิม)
        ...(parsed.customerMode === "MASTER"
          ? { customerId: parsed.customerId, branchId: parsed.branchId }
          : {
              customerId: null,
              branchId: null,
              customerNameSnapshot: parsed.guestName,
              customerTaxIdSnapshot: parsed.guestTaxId || null,
              addressSnapshot: parsed.guestAddress || null,
              contactSnapshot: parsed.guestContact || null,
              phoneSnapshot: parsed.guestPhone || null,
              prospectId: prospect!.id,
            }),
        reference: parsed.reference,
        note: parsed.note,
        placeToDelivery: parsed.placeToDelivery,
        vatMode: parsed.vatMode as QuotationVatModeValue,
        // R3 — applyDiscount ตั้งค่าหลังสร้างที่หน้า Detail (ตาม Requirement ที่ไม่ให้
        // ตัดสินใจ VAT/ส่วนลดตั้งแต่หน้า Create) — Owner UAT (2026-08-23): ค่าเริ่มต้นต้อง
        // "ไม่ใช้ส่วนลด" เสมอ (เดิมพึ่ง Default true ของ Schema) — ติ้กเองที่หน้า Detail
        // เมื่อต้องการใช้จริงเท่านั้น (ไม่แก้ Schema Default เพื่อเลี่ยง Migration — เอกสาร
        // เดิมในระบบไม่ถูกกระทบเลย มีผลเฉพาะใบที่สร้างใหม่หลังจากนี้)
        applyDiscount: false,
        status: "DRAFT",
        createdById: user.id,
      },
    });

    await tx.auditLog.create({
      data: { userId: user.id, action: "CREATE", module: "Quotation", recordId: created.id, newValue: { quotationNumber, customerMode: parsed.customerMode } },
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
  sizeOverride: z.string().optional(),
  unitPriceOverride: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ").optional(),
});

export async function addQuotationItem(quotationId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  if (quotation.status !== "DRAFT") {
    return { success: false, error: "แก้ไขรายการได้เฉพาะ Quotation สถานะร่างเท่านั้น" };
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

  // R8 — Product Assignment ตามบริษัทลูกค้า: Defense-in-depth เหมือน addOrderItem —
  // ใบเสนอราคาแบบ Guest (customerId = null ลูกค้ากรอกเอง ไม่อยู่ในฐาน) ไม่มีบริษัทให้
  // เทียบสิทธิ์ จึงไม่กรอง (เห็น/เลือกได้ทุกสินค้า ตามพฤติกรรม Picker ที่ไม่ส่ง customerId)
  if (quotation.customerId) {
    const accessError = await validateProductAllowedForCustomer(parsed.productId, quotation.customerId);
    if (accessError) return { success: false, error: accessError };
  }

  await db.quotationItem.create({
    data: {
      quotationId,
      productId: parsed.productId,
      quantity: parsed.quantity,
      descriptionOverride: parsed.descriptionOverride,
      sizeOverride: parsed.sizeOverride,
      unitPriceOverride: parsed.unitPriceOverride,
    },
  });

  revalidatePath(`/quotations/${quotationId}`);
  return { success: true };
}

export async function removeQuotationItem(quotationId: string, itemId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  if (quotation.status !== "DRAFT") {
    return { success: false, error: "แก้ไขรายการได้เฉพาะ Quotation สถานะร่างเท่านั้น" };
  }

  await db.quotationItem.delete({ where: { id: itemId } });
  revalidatePath(`/quotations/${quotationId}`);
  return { success: true };
}

// R3 — รวม VAT Mode + applyDiscount เป็น Action เดียว/ปุ่มเดียว (แทน updateQuotationVatMode
// เดิมที่มีแค่ VAT) เพื่อให้ UI หน้า Draft สะอาด ไม่ต้องมี 2 แถว 2 ปุ่มแยกกัน — Semantic ของ
// vatMode เดิมไม่เปลี่ยนเลย (NONE/STANDARD, ราคาสินค้า VAT-inclusive เหมือนเดิมทุกประการ)
export async function updateQuotationDraftSettings(quotationId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
  if (quotation.status !== "DRAFT") {
    return { success: false, error: "แก้ไขการตั้งค่าได้เฉพาะ Quotation สถานะร่างเท่านั้น" };
  }

  const vatModeParse = z.enum(["NONE", "STANDARD", "ADD_ON"]).safeParse(formData.get("vatMode"));
  if (!vatModeParse.success) {
    return { success: false, error: "VAT Mode ไม่ถูกต้อง" };
  }
  const applyDiscount = formData.has("applyDiscount");

  await db.quotation.update({
    where: { id: quotationId },
    data: { vatMode: vatModeParse.data, applyDiscount },
  });
  revalidatePath(`/quotations/${quotationId}`);
  return { success: true };
}

// Confirm — Snapshot ทุกฟิลด์ที่จำเป็นตาม computeQuotationCalc (Reuse Pricing/VAT Engine
// เดิมทั้งหมด) revisionNo เริ่มที่ 0 เสมอตอน Confirm ครั้งแรก
export async function confirmQuotation(quotationId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.confirm")) throw new Error("FORBIDDEN");

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { items: true, customer: true, branch: true } });
  if (quotation.status !== "DRAFT") {
    return { success: false, error: "Quotation นี้ถูก Confirm หรือยกเลิกไปแล้ว" };
  }
  if (quotation.items.length === 0) {
    return { success: false, error: "ต้องมีอย่างน้อย 1 รายการสินค้าก่อน Confirm" };
  }

  const calc = await computeQuotationCalc(
    quotation.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      descriptionOverride: i.descriptionOverride,
      sizeOverride: i.sizeOverride,
      unitPriceOverride: i.unitPriceOverride,
    })),
    {
      customerId: quotation.customerId,
      branchId: quotation.branchId,
      quotationDate: quotation.quotationDate,
      vatMode: quotation.vatMode as QuotationVatModeValue,
      applyDiscount: quotation.applyDiscount,
    }
  );

  try {
    await db.$transaction(async (tx) => {
      // Stabilization — Concurrency Hardening (Pattern เดียวกับ confirmOrder): Compare-and-Set
      // ด้วย WHERE status='DRAFT' แทน "อ่านแล้วค่อย update" ที่ Request ซ้อนผ่านเช็คได้ทั้งคู่
      const cas = await tx.quotation.updateMany({
        where: { id: quotationId, status: "DRAFT" },
        data: {
          // Phase H — Guest (customer=null): Snapshot ลูกค้าถูกเขียนไว้ตั้งแต่ตอนสร้าง
          // Draft แล้ว ไม่ต้อง (และไม่มีทาง) Refresh จาก Master — คงค่าเดิมไว้ตรงๆ
          ...(quotation.customer
            ? {
                customerNameSnapshot: quotation.customer.companyName,
                customerTaxIdSnapshot: quotation.customer.taxId,
                // Owner UAT Fix Batch 1 — ข้อ 3: quotation.branch เป็น null ได้แล้ว
                branchNameSnapshot: quotation.branch?.name ?? null,
                addressSnapshot: quotation.branch?.address ?? quotation.customer.address ?? null,
              }
            : {}),
          grossAmount: calc.grossAmount,
          discountAmount: calc.discountAmount,
          // R3 — Snapshot ค่า applyDiscount ที่ใช้จริงตอน Confirm (ตอนนี้เท่ากับ
          // quotation.applyDiscount อยู่แล้ว แต่เขียนซ้ำชัดๆ ให้เห็นว่านี่คือ Snapshot)
          applyDiscount: quotation.applyDiscount,
          vatRateSnapshot: calc.vatRateSnapshot,
          netBeforeVat: calc.netBeforeVat,
          vatAmount: calc.vatAmount,
          grandTotal: calc.grandTotal,
          revisionNo: 0,
          status: "CONFIRMED",
        },
      });
      if (cas.count !== 1) throw new Error("Quotation นี้ถูก Confirm ไปแล้ว (อาจถูกกดซ้ำ)");

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
    return {
      success: false,
      error: "ยืนยัน Quotation ไม่สำเร็จ — ไม่มีการเปลี่ยนแปลงใดๆ เกิดขึ้น กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ",
    };
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
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

// แก้ไข Quotation ที่ CONFIRMED แล้ว — Re-snapshot ใบเดิม (เลขที่เดิม) + revisionNo+=1
// + AuditLog before/after ตามที่อนุมัติ (ไม่ใช่ Cancel-and-Reissue แบบ E3 เพราะไม่มี
// Downstream Document ใดๆ อ้างอิง Quotation เลย)
export async function editConfirmedQuotation(quotationId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const itemsRaw = JSON.parse(String(formData.get("itemsJson") || "[]"));
  const parsedItems = editItemsSchema.parse(itemsRaw);
  const vatMode = z.enum(["NONE", "STANDARD", "ADD_ON"]).parse(formData.get("vatMode"));
  // R3 — QuotationEditModal เป็น Client Component สร้าง FormData เอง ใช้ Convention "1"/"0"
  // เดียวกับ Order E3 (OrderEditModal)
  const applyDiscount = formData.get("applyDiscount") === "1";

  const quotation = await db.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { items: true, customer: true, branch: true } });
  if (quotation.status === "CANCELLED") {
    return { success: false, error: "Quotation นี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้" };
  }
  if (quotation.status !== "CONFIRMED") {
    return { success: false, error: "แก้ไขแบบนี้ได้เฉพาะ Quotation สถานะยืนยันแล้วเท่านั้น" };
  }

  const beforeSnapshot = {
    vatMode: quotation.vatMode,
    applyDiscount: quotation.applyDiscount,
    grossAmount: quotation.grossAmount?.toString(),
    discountAmount: quotation.discountAmount?.toString(),
    vatRateSnapshot: quotation.vatRateSnapshot?.toString(),
    netBeforeVat: quotation.netBeforeVat?.toString(),
    vatAmount: quotation.vatAmount?.toString(),
    grandTotal: quotation.grandTotal?.toString(),
    items: quotation.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toString(), netAmount: i.netAmount?.toString() })),
  };

  const calc = await computeQuotationCalc(
    parsedItems.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      descriptionOverride: i.descriptionOverride,
      sizeOverride: i.sizeOverride,
      unitPriceOverride: i.unitPriceOverride,
    })),
    { customerId: quotation.customerId, branchId: quotation.branchId, quotationDate: quotation.quotationDate, vatMode, applyDiscount }
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
          applyDiscount,
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
            applyDiscount,
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
  const CHANGED = "QUOTATION_STATUS_CHANGED";
  try {
    await db.$transaction(async (tx) => {
      // Final Audit — CAS กัน Concurrent Status Change (Pattern C1/C2 เดิม)
      const cas = await tx.quotation.updateMany({
        where: { id: quotationId, status: beforeStatus },
        data: { status: "CANCELLED" },
      });
      if (cas.count === 0) throw new Error(CHANGED);

      // Owner UAT (2026-08-31) — Quotation ไม่มี PRINTED Checkpoint ของตัวเอง เข้าเงื่อนไข
      // Reclaim ได้เฉพาะตอนยกเลิกจาก DRAFT เท่านั้น (ไม่เคย Confirm — Confirm เองคือ
      // Checkpoint) ไม่มี Downstream Document อื่นอ้างอิง Quotation เลย
      if (beforeStatus === "DRAFT") {
        const parsed = parseDocNumber("QT", quotation.quotationNumber);
        if (parsed) {
          const released = await tryReleaseSeq("QT", parsed.period, parsed.seq, tx);
          if (released) {
            await tx.quotation.updateMany({ where: { id: quotationId }, data: { numberReleased: true } });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CANCEL",
          module: "Quotation",
          recordId: quotationId,
          oldValue: { status: beforeStatus },
          newValue: { status: "CANCELLED" },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === CHANGED) {
      return { success: false, error: "สถานะใบเสนอราคาเปลี่ยนไปแล้วระหว่างดำเนินการ — กรุณารีเฟรชหน้าแล้วลองใหม่" };
    }
    throw err;
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  return { success: true };
}
