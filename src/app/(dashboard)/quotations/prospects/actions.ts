"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { customerSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";
import { adoptProductHeadsForCustomer } from "@/lib/product-company-access";
import { findAdoptableHeadsForProspect } from "@/lib/prospect-products";

// ==========================================================================
// R10 — "ใบเสนอราคาลูกค้าที่ไม่มีในระบบ" (Quotation Prospects)
// ราย (Prospect) เกิดอัตโนมัติ 1 ราย/1 Guest QT ตอนสร้างใบ (ดู createDraftQuotation) —
// Action ในไฟล์นี้คือส่วนที่ต้องให้ User ยืนยันเองทั้งหมด: รวมราย / เชื่อม-สร้างลูกค้า /
// นำสินค้าเสนอราคาไปใช้กับลูกค้าจริง — QT เดิมไม่ถูกแตะเลยทุกกรณี (customerId ยังเป็น
// null + Snapshot เดิม — Document Snapshot Principle)
// ==========================================================================

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

/** รวมหลายรายเป็นรายเดียว (User กดยืนยันเองเท่านั้น — ระบบไม่ Auto-merge จากชื่อ):
 * ย้าย QT ทุกใบของ mergeIds ไปอยู่ใต้ keepId แล้วลบรายที่ว่างลง — ข้อมูลติดต่อใช้ของ
 * keepId เป็นหลัก (เติมช่องที่ว่างจากรายที่ถูกรวมถ้ามี) */
export async function mergeProspects(keepId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "quotation.edit")) throw new Error("FORBIDDEN");

  const mergeIds = [...new Set(formData.getAll("mergeIds").map(String))].filter((id) => id && id !== keepId);
  if (mergeIds.length === 0) return { success: false, error: "ไม่มีรายที่เลือกให้รวม" };

  const [keep, merging] = await Promise.all([
    db.quotationProspect.findUnique({ where: { id: keepId } }),
    db.quotationProspect.findMany({ where: { id: { in: mergeIds } } }),
  ]);
  if (!keep) return { success: false, error: "ไม่พบรายหลักที่จะเก็บไว้" };
  if (merging.length === 0) return { success: false, error: "ไม่พบรายที่เลือกให้รวม" };

  // เติมช่องว่างของรายหลักจากรายที่ถูกรวม (ไม่ทับค่าที่มีอยู่แล้ว)
  const fill = <K extends "taxId" | "address" | "contactPerson" | "phone">(key: K) =>
    keep[key] ?? merging.find((m) => m[key])?.[key] ?? null;

  await db.$transaction([
    db.quotation.updateMany({ where: { prospectId: { in: merging.map((m) => m.id) } }, data: { prospectId: keepId } }),
    db.quotationProspect.update({
      where: { id: keepId },
      data: { taxId: fill("taxId"), address: fill("address"), contactPerson: fill("contactPerson"), phone: fill("phone") },
    }),
    db.quotationProspect.deleteMany({ where: { id: { in: merging.map((m) => m.id) } } }),
    db.auditLog.create({
      data: {
        userId: user.id,
        action: "MERGE_QUOTATION_PROSPECTS",
        module: "QuotationProspect",
        recordId: keepId,
        newValue: { mergedIds: merging.map((m) => m.id), mergedNames: merging.map((m) => m.name) },
      },
    }),
  ]);

  revalidatePath("/quotations/prospects");
  return { success: true, message: `รวม ${merging.length} รายเข้ากับ "${keep.name}" แล้ว — ประวัติ QT ทุกใบอยู่ใต้รายเดียว` };
}

/** Wrapper สำหรับปุ่มรวมรายชื่อซ้ำบนหน้า List (Bind รายการ id มาจาก Server Component
 * โดยตรง — Logic เดียวกับ mergeProspects ทุกประการ) */
export async function mergeProspectsByIds(keepId: string, mergeIds: string[]): Promise<ActionResult> {
  const formData = new FormData();
  for (const id of mergeIds) formData.append("mergeIds", id);
  return mergeProspects(keepId, formData);
}

/** เชื่อมรายกับลูกค้าที่มีอยู่แล้วใน Customer Master — QT เดิมคง Snapshot เดิมทุกใบ */
export async function linkProspectToCustomer(prospectId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) return { success: false, error: "กรุณาเลือกลูกค้า" };
  const [prospect, customer] = await Promise.all([
    db.quotationProspect.findUnique({ where: { id: prospectId }, select: { id: true, name: true } }),
    db.customer.findUnique({ where: { id: customerId }, select: { id: true, companyName: true } }),
  ]);
  if (!prospect) return { success: false, error: "ไม่พบราย" };
  if (!customer) return { success: false, error: "ไม่พบลูกค้าที่เลือก" };

  await db.$transaction([
    db.quotationProspect.update({ where: { id: prospectId }, data: { linkedCustomerId: customerId } }),
    db.auditLog.create({
      data: {
        userId: user.id,
        action: "LINK_PROSPECT_CUSTOMER",
        module: "QuotationProspect",
        recordId: prospectId,
        newValue: { customerId, companyName: customer.companyName },
      },
    }),
  ]);
  // R10.1 — ลูกค้าใหม่/ที่เพิ่งเชื่อม ต้องโผล่ในช่องเลือกลูกค้าของทุกหน้าสร้างเอกสารทันที
  revalidatePath("/orders/new");
  revalidatePath("/quotations/new");
  revalidatePath("/repair-notes/new");
  revalidatePath("/tax-invoices/new");
  revalidatePath("/billing-notes/new");
  revalidatePath("/products");
  revalidatePath("/quotations/prospects");
  return { success: true, message: `เชื่อม "${prospect.name}" กับลูกค้า "${customer.companyName}" แล้ว` };
}

/** สร้างลูกค้าใหม่จากข้อมูลราย (Pre-fill ให้ User ตรวจ/แก้ก่อน Save เสมอ — Validation
 * ชุดเดียวกับหน้าสร้างลูกค้าปกติทุกประการ) แล้วเชื่อมรายเข้ากับลูกค้าที่สร้าง */
export async function createCustomerFromProspect(prospectId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "customer.edit")) throw new Error("FORBIDDEN");

  const prospect = await db.quotationProspect.findUnique({ where: { id: prospectId }, select: { id: true, linkedCustomerId: true } });
  if (!prospect) return { success: false, error: "ไม่พบราย" };
  if (prospect.linkedCustomerId) return { success: false, error: "รายนี้เชื่อมกับลูกค้าแล้ว" };

  const raw = customerSchema.safeParse({
    code: formData.get("code"),
    companyName: formData.get("companyName"),
    taxId: formData.get("taxId") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    creditTerm: formData.get("creditTerm") || "CASH",
    address: formData.get("address") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!raw.success) {
    return { success: false, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };
  }
  const parsed = raw.data;

  const existing = await db.customer.findUnique({ where: { code: parsed.code } });
  if (existing) {
    const error = `รหัสลูกค้า "${parsed.code}" มีอยู่แล้วในระบบ`;
    return { success: false, error, fieldErrors: { code: error } };
  }

  const customer = await db.$transaction(async (tx) => {
    const created = await tx.customer.create({ data: parsed });
    await tx.quotationProspect.update({ where: { id: prospectId }, data: { linkedCustomerId: created.id } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        module: "Customer",
        recordId: created.id,
        newValue: { ...parsed, createdFromProspectId: prospectId },
      },
    });
    return created;
  });

  // R11 — ข้อ 4 (One-step): ติ๊ก "นำสินค้าที่เคยเสนอทั้งหมดเข้าด้วย" = ย้ายทุก Family Head
  // ที่รายนี้เคยใช้และยังอยู่ใน "สินค้าเสนอราคา" เข้า Shared/Private ของลูกค้าที่เพิ่งสร้าง
  // ทันที (Head เดียวพาทุกไซส์ไปครบตามกลไกเดิม — ไม่ Duplicate ไม่แตะ QT เดิม) — ต้องมี
  // สิทธิ์ product.edit ด้วย ไม่มีก็ข้ามส่วนนี้เฉยๆ (ลูกค้าถูกสร้าง/เชื่อมแล้วตามปกติ)
  let adoptNote = "";
  if (formData.get("adoptAll") === "1" && can(user.role, "product.edit")) {
    const heads = await findAdoptableHeadsForProspect(prospectId);
    if (heads.products.length > 0 || heads.models.length > 0) {
      const target = String(formData.get("adoptTarget") ?? "shared") === "private" ? ("private" as const) : ("shared" as const);
      const result = await adoptProductHeadsForCustomer({
        customerId: customer.id,
        productIds: heads.products.map((h) => h.id),
        modelIds: heads.models.map((h) => h.id),
        target,
        actorUserId: user.id,
      });
      if (result.ok) adoptNote = ` และ${result.summary}`;
    }
  }

  // R10.1 — ลูกค้าใหม่/ที่เพิ่งเชื่อม ต้องโผล่ในช่องเลือกลูกค้าของทุกหน้าสร้างเอกสารทันที
  revalidatePath("/orders/new");
  revalidatePath("/quotations/new");
  revalidatePath("/repair-notes/new");
  revalidatePath("/tax-invoices/new");
  revalidatePath("/billing-notes/new");
  revalidatePath("/products");
  revalidatePath("/quotations/prospects");
  revalidatePath("/customers");
  return { success: true, message: `สร้างลูกค้า "${customer.companyName}" และเชื่อมกับรายนี้แล้ว — เลือกได้ทันทีในทุกหน้าสร้างเอกสาร${adoptNote}` };
}

/** นำสินค้า (Family Head จาก "สินค้าเสนอราคา") ไปใช้กับลูกค้าที่เชื่อมไว้ — ไม่ Duplicate
 * สินค้า (ย้ายสังกัด Head เดิม — เอกสาร/Snapshot เดิมอ้างต่อได้ทุกใบ) */
export async function adoptProspectProducts(prospectId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "product.edit")) throw new Error("FORBIDDEN");

  const prospect = await db.quotationProspect.findUnique({
    where: { id: prospectId },
    select: { linkedCustomerId: true },
  });
  if (!prospect?.linkedCustomerId) return { success: false, error: "ต้องเชื่อมรายนี้กับลูกค้าก่อน จึงนำสินค้าไปใช้ได้" };

  const productIds = [...new Set(formData.getAll("productIds").map(String))];
  const modelIds = [...new Set(formData.getAll("modelIds").map(String))];
  const target = String(formData.get("target") ?? "shared") === "private" ? ("private" as const) : ("shared" as const);
  if (productIds.length === 0 && modelIds.length === 0) return { success: false, error: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ" };

  const result = await adoptProductHeadsForCustomer({
    customerId: prospect.linkedCustomerId,
    productIds,
    modelIds,
    target,
    actorUserId: user.id,
  });
  if (!result.ok) return { success: false, error: result.error };

  revalidatePath("/quotations/prospects");
  revalidatePath("/products");
  return { success: true, message: result.summary };
}
