"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { getEffectiveVatRate, extractVat, roundMoney, getEffectivePrice } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

// ==========================================================================
// โหมด AUTO: ลูกค้าที่ขอ VAT เต็ม 100% ของยอด — generate จาก Invoice ใบเดียว
// ตรงๆ ได้เลย ไม่ต้องเลือกรายการใหม่ (ยอดเท่ากับ Invoice ทุกบาททุกสตางค์
// แค่แสดง VAT breakdown ที่ถอดออกมาจากยอดเดิม)
// ==========================================================================
export async function createTaxInvoiceFromInvoice(invoiceId: string) {
  const user = await requireUser();
  if (!can(user.role, "taxInvoice.create")) throw new Error("FORBIDDEN");

  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true, customer: true, branch: true },
  });
  if (invoice.status === "CANCELLED") throw new Error("Invoice นี้ถูกยกเลิกแล้ว ออกใบกำกับภาษีไม่ได้");

  const today = new Date();
  const vatPct = await getEffectiveVatRate(today);
  const period = currentPeriod(today);

  const taxInvoice = await db.$transaction(async (tx) => {
    const seq = await getNextSeq("TX", period, tx);
    const taxInvoiceNumber = formatDocNumber("TX", period, seq, 3);

    // ยอดใน Invoice เป็น VAT-inclusive อยู่แล้ว (ราคาสินค้าทุกระดับรวม VAT)
    // ถอด VAT ออกมาแสดงในใบกำกับภาษี โดยยอดสุทธิเท่าเดิมทุกบาท
    const { netBeforeVat, vatAmount } = extractVat(invoice.grandTotal, vatPct);

    const created = await tx.taxInvoice.create({
      data: {
        taxInvoiceNumber,
        taxInvoiceDate: today,
        customerId: invoice.customerId,
        branchId: invoice.branchId,
        referenceInvoiceId: invoice.id,
        customerNameSnapshot: invoice.customerNameSnapshot,
        taxIdSnapshot: invoice.taxIdSnapshot,
        branchNameSnapshot: invoice.branchNameSnapshot,
        addressSnapshot: invoice.addressSnapshot,
        placeToDelivery: invoice.placeToDelivery,
        valueAmount: netBeforeVat,
        vatPct,
        vatAmount,
        netAmount: invoice.grandTotal,
        status: "CONFIRMED",
        createdById: user.id,
        items: {
          create: invoice.items.map((item) => ({
            description: item.productNameSnapshot,
            size: item.sizeSnapshot,
            quantity: item.quantity,
            unit: item.unitSnapshot,
            unitPrice: item.unitPriceSnapshot,
            amount: item.netAmount,
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "TaxInvoice",
        recordId: created.id,
        newValue: { taxInvoiceNumber, referenceInvoiceId: invoice.id, mode: "AUTO" },
      },
    });

    return created;
  });

  revalidatePath("/tax-invoices");
  redirect(`/tax-invoices/${taxInvoice.id}`);
}

// ==========================================================================
// โหมด MANUAL: พนักงานเลือกรายการ/ยอดเอง ตามที่ลูกค้าแจ้งมา — ไม่ผูกกับ
// Invoice ใบไหนโดยตรง (referenceInvoiceId = null)
// ==========================================================================
const manualItemSchema = z.object({
  description: z.string().min(1),
  size: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
});

const manualTaxInvoiceSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  // Owner UAT Fix Batch 1 — ข้อ 3: เหมือน Order ทุกประการ
  branchId: z.string().optional(),
  taxInvoiceDate: z.coerce.date(),
  placeToDelivery: z.string().optional(),
  items: z.array(manualItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
});

export async function createManualTaxInvoice(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "taxInvoice.create")) throw new Error("FORBIDDEN");

  const itemsRaw = JSON.parse(String(formData.get("itemsJson") || "[]"));

  const parsed = manualTaxInvoiceSchema.parse({
    customerId: formData.get("customerId"),
    branchId: formData.get("branchId") || undefined,
    taxInvoiceDate: formData.get("taxInvoiceDate"),
    placeToDelivery: formData.get("placeToDelivery") || undefined,
    items: itemsRaw,
  });

  const [customer, branch] = await Promise.all([
    db.customer.findUniqueOrThrow({ where: { id: parsed.customerId } }),
    // Owner UAT Fix Batch 1 — ข้อ 3: ไม่มีสาขาได้แล้ว — ไม่ query/ไม่บังคับมีสาขาจริง
    parsed.branchId ? db.branch.findUniqueOrThrow({ where: { id: parsed.branchId } }) : Promise.resolve(null),
  ]);

  const vatPct = await getEffectiveVatRate(parsed.taxInvoiceDate);
  const period = currentPeriod(parsed.taxInvoiceDate);

  const itemsWithAmount = parsed.items.map((i) => ({
    ...i,
    amount: roundMoney(new Decimal(i.quantity).mul(i.unitPrice)),
  }));
  const totalAmount = roundMoney(itemsWithAmount.reduce((s, i) => s.add(i.amount), new Decimal(0)));
  const { netBeforeVat, vatAmount } = extractVat(totalAmount, vatPct);

  const taxInvoice = await db.$transaction(async (tx) => {
    const seq = await getNextSeq("TX", period, tx);
    const taxInvoiceNumber = formatDocNumber("TX", period, seq, 3);

    const created = await tx.taxInvoice.create({
      data: {
        taxInvoiceNumber,
        taxInvoiceDate: parsed.taxInvoiceDate,
        customerId: parsed.customerId,
        branchId: parsed.branchId ?? null,
        referenceInvoiceId: null,
        customerNameSnapshot: customer.companyName,
        taxIdSnapshot: customer.taxId,
        branchNameSnapshot: branch?.name ?? null,
        addressSnapshot: branch?.address ?? null,
        placeToDelivery: parsed.placeToDelivery,
        valueAmount: netBeforeVat,
        vatPct,
        vatAmount,
        netAmount: totalAmount,
        status: "CONFIRMED",
        createdById: user.id,
        items: { create: itemsWithAmount },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "TaxInvoice",
        recordId: created.id,
        newValue: { taxInvoiceNumber, mode: "MANUAL" },
      },
    });

    return created;
  });

  revalidatePath("/tax-invoices");
  redirect(`/tax-invoices/${taxInvoice.id}`);
}

// Phase E-UX — Manual Tax Invoice Item Entry: ช่วย Autofill รายการ/ขนาด/หน่วย/ราคา
// จาก Product Master + Pricing Engine เดิม (getEffectivePrice ตัวเดียวกับ Order/
// Quotation ทุกประการ ไม่มี Pricing Path ใหม่) — Field ที่ Autofill ยังแก้ไขต่อได้
// เสมอ (TaxInvoiceItem ไม่มี productId ผูกอยู่จริงตามที่ตรวจ Schema แล้ว — ยังคงเป็น
// Free-text Snapshot ล้วนๆ เหมือนเดิมทุกประการ ไม่มี Schema/Migration เปลี่ยนแปลง
// ใดๆ — Action นี้เป็นแค่ Read-only Helper ให้ Client เรียกมา "แนะนำ" ค่าเริ่มต้นเท่านั้น)
export async function getSuggestedTaxInvoiceItem(params: {
  productId: string;
  customerId?: string;
  branchId?: string;
  taxInvoiceDate?: string;
}): Promise<{ description: string; size: string; unit: string; unitPrice: number }> {
  const user = await requireUser();
  if (!can(user.role, "taxInvoice.create")) throw new Error("FORBIDDEN");

  const product = await db.product.findUniqueOrThrow({ where: { id: params.productId }, include: { model: true } });

  let unitPrice = Number(product.standardPrice);
  // Owner UAT Fix Batch 1 — ข้อ 3: ไม่มีสาขาก็ยัง Fallback ไปที่ Customer-level
  // PriceRule ได้ผ่าน getEffectivePrice เดิม (branchId: null ข้าม Tier 1 อัตโนมัติ)
  if (params.customerId) {
    const orderDate = params.taxInvoiceDate ? new Date(params.taxInvoiceDate) : new Date();
    const { price } = await getEffectivePrice({
      productId: params.productId,
      customerId: params.customerId,
      branchId: params.branchId ?? null,
      orderDate,
    });
    unitPrice = Number(price);
  }

  // Owner UAT Round 3 — ข้อ 3/4: สินค้าที่เป็น Standard Size Variant ของ Model บางตัวมี
  // product.name ไม่สมบูรณ์ในข้อมูลเก่า (เช่น เหลือแค่ "4 ฟุต" ไม่มีชื่อรุ่นนำหน้า — Data
  // เก่าจาก Sync ก่อนหน้า) — ถ้าผูก Model อยู่ ให้ประกอบชื่อจาก Model.name + Size เอง
  // เหมือนที่ ProductSearchPicker ทำอยู่แล้ว (sizeOptionToPicked) กันไม่ให้ "รายการ"
  // แนะนำผิดเพี้ยนไปตาม Data เก่าที่ตั้งชื่อไม่ครบ ไม่ใช่ Pricing Logic เปลี่ยนแปลงใดๆ
  const description = product.model ? (product.size ? `${product.model.name} ${product.size}` : product.model.name) : product.name;

  return {
    description,
    size: product.size ?? "",
    unit: product.unit,
    unitPrice,
  };
}

export async function cancelTaxInvoice(taxInvoiceId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "taxInvoice.cancel")) throw new Error("FORBIDDEN");

  const taxInvoice = await db.taxInvoice.findUniqueOrThrow({ where: { id: taxInvoiceId } });
  // Phase E1 — return แทน throw สำหรับ Validation Error ที่คาดไว้แล้ว (ดู
  // src/lib/action-result.ts สำหรับ root cause)
  if (taxInvoice.status === "CANCELLED") return { success: false, error: "ใบกำกับภาษีนี้ถูกยกเลิกไปแล้ว" };

  const beforeStatus = taxInvoice.status;
  await db.taxInvoice.update({ where: { id: taxInvoiceId }, data: { status: "CANCELLED" } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CANCEL",
      module: "TaxInvoice",
      recordId: taxInvoiceId,
      oldValue: { status: beforeStatus },
      newValue: { status: "CANCELLED" },
    },
  });

  revalidatePath(`/tax-invoices/${taxInvoiceId}`);
  revalidatePath("/tax-invoices");
  return { success: true };
}
