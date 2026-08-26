import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { UNSPECIFIED_TYPE_LABEL } from "@/lib/order-preview";
import { mergeSizeOptions } from "@/lib/product-variant-size";
import { companyAccessWhere } from "@/lib/product-company-access";

// R4 — Size Architecture Path A: ค้นหา 2 กลุ่มแยกกัน — "รุ่นสินค้า" (Model) ที่ชื่อตรง
// (คืน Size ทั้งหมดที่มี Product Variant จริงรองรับอยู่แล้วมาด้วยในครั้งเดียว ไม่ต้อง
// Round-trip เพิ่มตอนเลือก Size) และ "สินค้า Standalone" (ไม่มี Model ผูกอยู่ เช่น
// หมอน/Accessory) ที่ SKU/ชื่อตรง — ยังค้นหา/เลือกได้ตรงๆ เหมือนเดิมทุกประการ
//
// R6 Phase B — Size ที่คืนกลับตอนนี้ผ่าน mergeSizeOptions: รวม Standard Size (3/3.5/4/5/6
// ฟุต) เข้ากับ Variant จริงที่มีอยู่แล้วเสมอเมื่อ Category.usesSize=true (เกือบทุกกรณี
// resolved:true เพราะ Standard Variant ถูก Auto-create ไว้แล้วตอนตั้ง pricePerFoot) และ
// เพิ่ม "ขนาดพิเศษ/ระบุเอง" ท้ายรายการเสมอ — Model ที่ยังไม่ได้จัด Category/usesSize=false
// พฤติกรรมเหมือนเดิมทุกประการ (ไม่มี Standard List/ขนาดพิเศษ)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ models: [], products: [] }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ models: [], products: [] });

  // R8 — Product Assignment ตามบริษัทลูกค้า: เอกสารที่รู้บริษัทลูกค้าแล้ว (Order/Quotation/
  // Repair Note) ส่ง customerId มากรองให้เห็นเฉพาะสินค้าที่เปิดให้บริษัทนั้น (Allowlist
  // ระดับ Family Head — ดู product-company-access.ts) — ไม่ส่งมา = พฤติกรรมเดิมทุกประการ
  // (เห็นทุกสินค้า เช่นหน้า Master/Tax Invoice ที่ยังไม่ผูกบริษัท) — การกรองนี้เป็น UX ชั้น
  // แรกเท่านั้น Server Action ที่เพิ่มรายการจริง Validate ซ้ำอีกชั้นเสมอ (Defense-in-depth)
  const customerId = req.nextUrl.searchParams.get("customerId")?.trim() || null;
  const accessFilter = customerId ? companyAccessWhere(customerId) : null;

  // Owner UAT — ข้อ 1: Product ที่ตั้ง pricePerFoot ไว้เอง (Anchor ของตัวเอง ไม่ต้องพึ่ง
  // ProductModel) ต้องค้นหาเจอแล้วแสดง Size ให้เลือกได้เหมือน ProductModel ทุกประการ —
  // Query แยกต่างหาก แล้วรวมเข้ากับผลลัพธ์ "models" ชุดเดียวกัน (Shape เดียวกันเป๊ะ ให้
  // Consumer เดิมทั้งหมดใช้ต่อได้โดยไม่ต้องแก้) — Standalone Products (ไม่มี Size จริง)
  // ต้อง Exclude Anchor พวกนี้ออก ไม่งั้นจะขึ้นซ้ำ 2 ที่
  const [models, productAnchors, standaloneProducts] = await Promise.all([
    db.productModel.findMany({
      where: { active: true, name: { contains: q, mode: "insensitive" }, ...(accessFilter ?? {}) },
      include: {
        productType: true,
        category: true,
        products: { where: { active: true }, select: { id: true, sku: true, size: true, unit: true } },
      },
      take: 10,
    }),
    db.product.findMany({
      where: {
        active: true,
        pricePerFoot: { not: null },
        // AND ครอบเงื่อนไขค้นหา + Access Filter แยกกัน (ทั้งคู่มี OR ของตัวเอง ผสมใน
        // Object เดียวไม่ได้ — OR ซ้ำ Key จะทับกัน)
        AND: [
          { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
          ...(accessFilter ? [accessFilter] : []),
        ],
      },
      include: {
        productType: true,
        category: true,
        sizeVariants: { where: { active: true }, select: { id: true, sku: true, size: true, unit: true } },
      },
      take: 10,
    }),
    db.product.findMany({
      where: {
        active: true,
        modelId: null,
        pricePerFoot: null,
        // Owner UAT — ข้อ 1: Size Variant ของ Product Anchor (parentProductId ไม่ว่าง)
        // ต้องไม่โผล่ซ้ำเป็นสินค้า Standalone แยกต่างหาก — เหมือนที่ modelId ไม่ว่างกันไม่ให้
        // Variant ของ ProductModel โผล่ซ้ำอยู่แล้วทุกประการ
        parentProductId: null,
        AND: [
          { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
          ...(accessFilter ? [accessFilter] : []),
        ],
      },
      include: { productType: true },
      take: 10,
    }),
  ]);

  const modelResults = models
    .filter((m) => m.products.length > 0 || m.category?.usesSize) // รุ่นที่ยังไม่มี Size เลยและไม่ใช้ Size ไม่มีประโยชน์ให้เลือก
    .map((m) => {
      const usesSize = m.category?.usesSize ?? false;
      return {
        modelId: m.id,
        modelName: m.name,
        productTypeName: m.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
        usesSize,
        manageHref: `/product-models/${m.id}`,
        // ProductModel เองไม่ใช่ Product แถวจริง ใช้ FK ผูก OrderItem/QuotationItem ไม่ได้
        // ต้องมี Variant จริงอย่างน้อย 1 ตัวก่อนถึงจะมี Anchor ให้ผูก (เหมือนเดิมทุกประการ)
        anchorProductId: m.products[0]?.id ?? null,
        sizes: mergeSizeOptions(
          usesSize,
          m.products.map((p) => ({ productId: p.id, sku: p.sku, unit: p.unit, size: p.size }))
        ),
      };
    });

  const anchorResults = productAnchors.map((p) => {
    const usesSize = p.category?.usesSize ?? true;
    return {
      modelId: p.id,
      modelName: p.name,
      productTypeName: p.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
      usesSize,
      manageHref: `/products/${p.id}`,
      // Product Anchor เป็น Product แถวจริงอยู่แล้วในตัวเอง — ใช้เป็น Anchor ผูก FK ได้เสมอ
      // แม้ยังไม่มี Size Variant ถูก Sync เลยสักตัว (ต่างจาก ProductModel ที่ไม่มี Product
      // แถวของตัวเอง)
      anchorProductId: p.id,
      sizes: mergeSizeOptions(
        usesSize,
        p.sizeVariants.map((v) => ({ productId: v.id, sku: v.sku, unit: v.unit, size: v.size }))
      ),
    };
  });

  return NextResponse.json({
    models: [...modelResults, ...anchorResults],
    products: standaloneProducts.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      productTypeName: p.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
    })),
  });
}
