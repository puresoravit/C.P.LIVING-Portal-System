"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getNextSeq, formatDocNumber, currentPeriod } from "@/lib/running-number";
import { getEffectiveVatRate, extractVat, roundMoney } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { z } from "zod";

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
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
});

const manualTaxInvoiceSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  branchId: z.string().min(1, "กรุณาเลือกสาขา"),
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
    branchId: formData.get("branchId"),
    taxInvoiceDate: formData.get("taxInvoiceDate"),
    placeToDelivery: formData.get("placeToDelivery") || undefined,
    items: itemsRaw,
  });

  const [customer, branch] = await Promise.all([
    db.customer.findUniqueOrThrow({ where: { id: parsed.customerId } }),
    db.branch.findUniqueOrThrow({ where: { id: parsed.branchId } }),
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
        branchId: parsed.branchId,
        referenceInvoiceId: null,
        customerNameSnapshot: customer.companyName,
        taxIdSnapshot: customer.taxId,
        branchNameSnapshot: branch.name,
        addressSnapshot: branch.address,
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

export async function cancelTaxInvoice(taxInvoiceId: string) {
  const user = await requireUser();
  if (!can(user.role, "taxInvoice.cancel")) throw new Error("FORBIDDEN");

  const taxInvoice = await db.taxInvoice.findUniqueOrThrow({ where: { id: taxInvoiceId } });
  if (taxInvoice.status === "CANCELLED") throw new Error("ใบกำกับภาษีนี้ถูกยกเลิกไปแล้ว");

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
}
