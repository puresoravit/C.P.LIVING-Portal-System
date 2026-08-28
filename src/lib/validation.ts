import { z } from "zod";

export const customerSchema = z.object({
  code: z.string().min(1, "กรุณากรอกรหัสลูกค้า"),
  companyName: z.string().min(1, "กรุณากรอกชื่อบริษัท"),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  creditTerm: z.enum(["CASH", "NET30", "NET60", "NET90"]),
  // Owner UAT (2026-08-23) — สถานที่ส่งสินค้าของลูกค้าเอง (Fallback เมื่อไม่เลือกสาขา)
  address: z.string().optional(),
  note: z.string().optional(),
});

export const branchSchema = z.object({
  customerId: z.string().min(1),
  code: z.string().min(1, "กรุณากรอกรหัสสาขา"),
  name: z.string().min(1, "กรุณากรอกชื่อสาขา"),
  taxBranchCode: z.string().optional(),
  address: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  contactPerson: z.string().optional(),
  note: z.string().optional(),
});

// R6 — ป้ายผู้ใช้เปลี่ยนเป็น "กลุ่มส่วนลด" แล้ว (ตัวแปร/field ยังชื่อ productType เดิม
// ทุกที่ เพราะ Schema/Relation จริงยังผูกกับ DiscountRule/Auto-Split Invoice เหมือนเดิม)
export const productTypeSchema = z.object({
  code: z.string().min(1, "กรุณากรอกรหัสกลุ่มส่วนลด"),
  name: z.string().min(1, "กรุณากรอกชื่อกลุ่มส่วนลด"),
  description: z.string().optional(),
  // Smoke Test (2026-08-25) — % ส่วนลดตั้งต้นของกลุ่ม: เว้นว่าง = ไม่มีส่วนลดตั้งต้น (null)
  // ต่างจาก 0 ที่แปลว่า "ตั้งใจให้ 0%" — ทั้งคู่ให้ผลลัพธ์ราคาเท่ากันแต่เก็บเจตนาต่างกัน
  defaultDiscountPct: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce
      .number()
      .min(0, "ส่วนลดต้องอยู่ระหว่าง 0-100%")
      .max(100, "ส่วนลดต้องอยู่ระหว่าง 0-100%")
      .nullable()
  ),
  sortOrder: z.coerce.number().default(0),
});

// R6 — Product Category เชิงคุณลักษณะ (ฟูกที่นอน/หมอน/อื่นๆ) — คนละ Concept จาก
// ProductType (กลุ่มส่วนลด) โดยสิ้นเชิง usesSize ใช้ที่ Document Entry (Phase B)
export const productCategorySchema = z.object({
  code: z.string().min(1, "กรุณากรอกรหัสประเภทสินค้า"),
  name: z.string().min(1, "กรุณากรอกชื่อประเภทสินค้า"),
  usesSize: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().default(0),
});

// Production Module (P1) — ตระกูลสินค้า/ชื่อเรียก (ProductAlias) ผูกกับ ProductModel
// หรือ Product เดี่ยว (XOR — resolveAliasFamilyHead ใน product-alias.ts เป็นผู้ตรวจจริง
// เพราะ zod .refine() บอก field ที่ผิดชัดเจนน้อยกว่า) validateAliasScope ตรวจ
// scope/customerId/branchId ให้สอดคล้องกันแยกอีกชั้นในตัว action
// Production Module (P1/S2) — CustomerPO (รับ P.O. ลูกค้า) — คนละตารางจาก Order/OrderItem
// ของ Billing โดยสิ้นเชิง (ดู docs/production-module/02-P1-schema-decisions.md)
export const customerPOSchema = z.object({
  customerId: z.string().min(1, "กรุณาเลือกลูกค้า"),
  branchId: z.string().optional(),
  dateMode: z.enum(["UNSET", "ESTIMATE", "EXACT"]).default("UNSET"),
  requestedDate: z.string().optional(),
  urgency: z.coerce.boolean().default(false),
});

// lineKind=UNRESOLVED เมื่อสินค้ายังไม่มีใน Product Master (rawProductText แทน productId) —
// ตรงกับ OrderLineKind enum ใน schema.prisma
export const customerPOLineInputSchema = z
  .object({
    lineKind: z.enum(["CATALOG", "UNRESOLVED"]),
    productId: z.string().optional(),
    rawProductText: z.string().optional(),
    size: z.string().optional(),
    qtyCurrent: z.coerce.number().int().positive("จำนวนต้องมากกว่า 0"),
    urgency: z.coerce.boolean().default(false),
    requiredDate: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((d) => (d.lineKind === "CATALOG" ? !!d.productId : !!d.rawProductText?.trim()), {
    message: "กรุณาเลือกสินค้าจากระบบ หรือกรอกชื่อสินค้าที่ยังไม่มีในระบบ",
  });

// S2 Checkpoint 2 — เหมือน customerPOLineInputSchema ทุกประการ + id (ไม่ว่าง = บรรทัดเดิม
// ที่มีอยู่แล้ว ใช้ตัดสินว่าเป็นการแก้ไข/ลบ ไม่ใช่เพิ่มใหม่ — ว่าง = บรรทัดใหม่ที่เพิ่มระหว่างแก้)
export const customerPOLineUpdateInputSchema = z
  .object({
    id: z.string().optional(),
    lineKind: z.enum(["CATALOG", "UNRESOLVED"]),
    productId: z.string().optional(),
    rawProductText: z.string().optional(),
    size: z.string().optional(),
    qtyCurrent: z.coerce.number().int().positive("จำนวนต้องมากกว่า 0"),
    urgency: z.coerce.boolean().default(false),
    requiredDate: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((d) => (d.lineKind === "CATALOG" ? !!d.productId : !!d.rawProductText?.trim()), {
    message: "กรุณาเลือกสินค้าจากระบบ หรือกรอกชื่อสินค้าที่ยังไม่มีในระบบ",
  });

export const productAliasSchema = z.object({
  aliasText: z.string().min(1, "กรุณากรอกชื่อเรียก"),
  lang: z.string().optional(),
  scope: z.enum(["GLOBAL", "CUSTOMER", "BRANCH"]).default("GLOBAL"),
  productModelId: z.string().optional(),
  productId: z.string().optional(),
  customerId: z.string().optional(),
  branchId: z.string().optional(),
});

// R4 — sku ว่างได้แล้ว (Auto-generate ที่ Server Action ถ้าไม่กรอก) และ productTypeId
// ว่างได้เช่นกัน (null = ไม่ระบุกลุ่มส่วนลด ตามที่อนุมัติ) — ทั้งคู่เปลี่ยนจาก required เดิม
// R6 — เพิ่ม categoryId (ประเภทสินค้าเชิงคุณลักษณะ ใหม่) แยกจาก productTypeId โดยสิ้นเชิง
export const productSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1, "กรุณากรอกชื่อสินค้า"),
  productTypeId: z.string().optional(),
  categoryId: z.string().optional(),
  modelId: z.string().nullable().optional(), // Phase B — ไม่บังคับกรอก, null = ยังไม่ระบุ/ยกเลิกการผูก Model, Product ไม่มี Model ใช้งานได้ปกติ
  size: z.string().optional(),
  unit: z.string().min(1, "กรุณากรอกหน่วยนับ"),
  // Owner UAT Fix Batch 3 — ข้อ 4: standardPrice ไม่บังคับที่ระดับ Schema อีกต่อไป —
  // สินค้าที่ Category usesSize=true และไม่ได้ผูกรุ่นสินค้า (Legacy) ใช้ pricePerFoot
  // เป็น Source เดียวแทน (ไม่ต้องกรอกซ้ำสองช่อง) — Action (createProduct/updateProduct)
  // เป็นคนบังคับว่า "ต้องมีค่าใดค่าหนึ่งเสมอ" ตามเงื่อนไข usesSize/modelId อีกชั้น
  standardPrice: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ").optional(),
  description: z.string().optional(),
  // Owner UAT — ข้อ 1: Product เป็น Size Family Anchor ได้เอง — กรอกมาเมื่อ
  // category.usesSize=true และไม่ได้ผูก modelId (ตรวจใน Action อีกชั้น ไม่ใช่ Schema)
  pricePerFoot: z.coerce.number().min(0, "ราคาต่อฟุตต้องไม่ติดลบ").optional(),
});

// Phase B — Master รุ่นสินค้า (ProductModel) ผูกกับ ProductType (กลุ่มส่วนลด) เดียว
// R6 — เพิ่ม categoryId (ประเภทสินค้า) ไม่บังคับ — ใช้ที่ Document Entry (Phase B)
// ตัดสินว่าต้องเลือก Size ไหม (ผ่าน ProductCategory.usesSize)
// R6 Phase B — pricePerFoot/variantUnit ไม่บังคับที่ระดับ Schema (บังคับกันเองใน Action
// เฉพาะตอน Category usesSize=true และกรอก pricePerFoot มา — ดู product-models/actions.ts)
export const productModelSchema = z.object({
  productTypeId: z.string().min(1, "กรุณาเลือกกลุ่มส่วนลด"),
  categoryId: z.string().optional(),
  name: z.string().min(1, "กรุณากรอกชื่อรุ่นสินค้า"),
  sortOrder: z.coerce.number().default(0),
  pricePerFoot: z.coerce.number().min(0, "ราคาต่อฟุตต้องไม่ติดลบ").optional(),
  variantUnit: z.string().optional(),
});
