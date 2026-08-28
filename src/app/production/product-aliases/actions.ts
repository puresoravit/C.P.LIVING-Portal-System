"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { productAliasSchema } from "@/lib/validation";
import { normalizeAliasText, resolveAliasFamilyHead, validateAliasScope } from "@/lib/product-alias";
import { revalidatePath } from "next/cache";
import { zodFieldErrors } from "@/lib/zod-field-errors";
import type { ActionResult } from "@/lib/action-result";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("UNAUTHORIZED");
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as any,
  };
}

/** "" จาก <select> ที่ไม่ได้เลือก -> undefined (ไม่ใช่ FK ว่างเปล่าที่ผูกกับ DB ได้) */
function emptyToUndefined(v: string | undefined): string | undefined {
  return v && v.length > 0 ? v : undefined;
}

function readAliasForm(formData: FormData) {
  const raw = productAliasSchema.safeParse({
    aliasText: formData.get("aliasText"),
    lang: formData.get("lang") || undefined,
    scope: formData.get("scope") || "GLOBAL",
    productModelId: formData.get("productModelId") || undefined,
    productId: formData.get("productId") || undefined,
    customerId: formData.get("customerId") || undefined,
    branchId: formData.get("branchId") || undefined,
  });
  if (!raw.success) return { ok: false as const, error: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: zodFieldErrors(raw.error) };

  const data = {
    ...raw.data,
    productModelId: emptyToUndefined(raw.data.productModelId),
    productId: emptyToUndefined(raw.data.productId),
    customerId: emptyToUndefined(raw.data.customerId),
    branchId: emptyToUndefined(raw.data.branchId),
  };

  const head = resolveAliasFamilyHead(data);
  if (!head) {
    const error = "เลือกให้ตรงกับ 1 อย่างเท่านั้น — รุ่นสินค้า (ProductModel) หรือ สินค้าเดี่ยว (Product)";
    return { ok: false as const, error, fieldErrors: { productModelId: error, productId: error } };
  }

  const scopeError = validateAliasScope(data);
  if (scopeError) {
    return { ok: false as const, error: scopeError, fieldErrors: { scope: scopeError } };
  }

  return { ok: true as const, data, head };
}

/** scope=BRANCH ต้องเลือกสาขาที่เป็นของลูกค้ารายนั้นจริง ไม่ใช่แค่กรอกครบสองช่อง */
async function checkBranchBelongsToCustomer(customerId?: string, branchId?: string): Promise<string | null> {
  if (!branchId || !customerId) return null;
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { customerId: true } });
  if (!branch || branch.customerId !== customerId) {
    return "สาขาที่เลือกไม่ใช่สาขาของลูกค้ารายที่เลือก";
  }
  return null;
}

// Production Module (P1) — CRUD ตระกูลสินค้า/ชื่อเรียก ใช้ permission productAlias.manage
// (มีอยู่แล้วใน permissions.ts ให้ OWNER_ADMIN เท่านั้น ตรงกับ convention ของ Master Data
// อื่นในระบบเช่น productType.edit/product.edit ที่ BILLING_STAFF ไม่มีสิทธิ์เช่นกัน)
export async function createProductAlias(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productAlias.manage")) throw new Error("FORBIDDEN");

  const parsed = readAliasForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };

  const branchError = await checkBranchBelongsToCustomer(parsed.data.customerId, parsed.data.branchId);
  if (branchError) return { success: false, error: branchError, fieldErrors: { branchId: branchError } };

  const aliasNormalized = normalizeAliasText(parsed.data.aliasText);

  const duplicate = await db.productAlias.findFirst({
    where: {
      aliasNormalized,
      scope: parsed.data.scope,
      customerId: parsed.data.customerId ?? null,
      branchId: parsed.data.branchId ?? null,
    },
  });
  if (duplicate) {
    const error = `ชื่อเรียก "${parsed.data.aliasText}" มีอยู่แล้วในขอบเขตเดียวกัน`;
    return { success: false, error, fieldErrors: { aliasText: error } };
  }

  const alias = await db.productAlias.create({
    data: {
      aliasText: parsed.data.aliasText,
      aliasNormalized,
      lang: parsed.data.lang || null,
      scope: parsed.data.scope,
      productModelId: parsed.data.productModelId ?? null,
      productId: parsed.data.productId ?? null,
      customerId: parsed.data.customerId ?? null,
      branchId: parsed.data.branchId ?? null,
      source: "manual",
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      module: "ProductAlias",
      recordId: alias.id,
      newValue: parsed.data,
    },
  });

  revalidatePath("/production/product-aliases");
  return { success: true };
}

export async function updateProductAlias(id: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productAlias.manage")) throw new Error("FORBIDDEN");

  const parsed = readAliasForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };

  const branchError = await checkBranchBelongsToCustomer(parsed.data.customerId, parsed.data.branchId);
  if (branchError) return { success: false, error: branchError, fieldErrors: { branchId: branchError } };

  const aliasNormalized = normalizeAliasText(parsed.data.aliasText);

  const duplicate = await db.productAlias.findFirst({
    where: {
      aliasNormalized,
      scope: parsed.data.scope,
      customerId: parsed.data.customerId ?? null,
      branchId: parsed.data.branchId ?? null,
      NOT: { id },
    },
  });
  if (duplicate) {
    const error = `ชื่อเรียก "${parsed.data.aliasText}" มีอยู่แล้วในขอบเขตเดียวกัน`;
    return { success: false, error, fieldErrors: { aliasText: error } };
  }

  const before = await db.productAlias.findUnique({ where: { id } });
  const alias = await db.productAlias.update({
    where: { id },
    data: {
      aliasText: parsed.data.aliasText,
      aliasNormalized,
      lang: parsed.data.lang || null,
      scope: parsed.data.scope,
      productModelId: parsed.data.productModelId ?? null,
      productId: parsed.data.productId ?? null,
      customerId: parsed.data.customerId ?? null,
      branchId: parsed.data.branchId ?? null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      module: "ProductAlias",
      recordId: alias.id,
      oldValue: before ?? undefined,
      newValue: parsed.data,
    },
  });

  revalidatePath("/production/product-aliases");
  return { success: true };
}

export async function toggleProductAliasActive(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "productAlias.manage")) throw new Error("FORBIDDEN");

  const existing = await db.productAlias.findUniqueOrThrow({ where: { id } });
  const updated = await db.productAlias.update({ where: { id }, data: { active: !existing.active } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: updated.active ? "ACTIVATE" : "DEACTIVATE",
      module: "ProductAlias",
      recordId: id,
      oldValue: { active: existing.active },
      newValue: { active: updated.active },
    },
  });

  revalidatePath("/production/product-aliases");
  return { success: true };
}
