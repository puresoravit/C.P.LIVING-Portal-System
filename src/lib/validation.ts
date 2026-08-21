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

export const productTypeSchema = z.object({
  code: z.string().min(1, "กรุณากรอกรหัสประเภทสินค้า"),
  name: z.string().min(1, "กรุณากรอกชื่อประเภทสินค้า"),
  description: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
});

export const productSchema = z.object({
  sku: z.string().min(1, "กรุณากรอก SKU"),
  name: z.string().min(1, "กรุณากรอกชื่อสินค้า"),
  productTypeId: z.string().min(1, "กรุณาเลือกประเภทสินค้า"),
  modelId: z.string().nullable().optional(), // Phase B — ไม่บังคับกรอก, null = ยังไม่ระบุ/ยกเลิกการผูก Model, Product ไม่มี Model ใช้งานได้ปกติ
  size: z.string().optional(),
  unit: z.string().min(1, "กรุณากรอกหน่วยนับ"),
  standardPrice: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  description: z.string().optional(),
});

// Phase B — Master รุ่นสินค้า (ProductModel) ผูกกับ ProductType เดียว
export const productModelSchema = z.object({
  productTypeId: z.string().min(1, "กรุณาเลือกประเภทสินค้า"),
  name: z.string().min(1, "กรุณากรอกชื่อรุ่นสินค้า"),
  sortOrder: z.coerce.number().default(0),
});
