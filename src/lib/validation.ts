import { z } from "zod";

export const customerSchema = z.object({
  code: z.string().min(1, "กรุณากรอกรหัสลูกค้า"),
  companyName: z.string().min(1, "กรุณากรอกชื่อบริษัท"),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  creditTerm: z.enum(["CASH", "NET30", "NET60", "NET90"]),
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
  standardPrice: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  description: z.string().optional(),
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
