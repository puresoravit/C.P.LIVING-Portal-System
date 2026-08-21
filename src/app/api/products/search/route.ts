import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { UNSPECIFIED_TYPE_LABEL } from "@/lib/order-preview";

// R4 — Size Architecture Path A: ค้นหา 2 กลุ่มแยกกัน — "รุ่นสินค้า" (Model) ที่ชื่อตรง
// (คืน Size ทั้งหมดที่มี Product Variant จริงรองรับอยู่แล้วมาด้วยในครั้งเดียว ไม่ต้อง
// Round-trip เพิ่มตอนเลือก Size) และ "สินค้า Standalone" (ไม่มี Model ผูกอยู่ เช่น
// หมอน/Accessory) ที่ SKU/ชื่อตรง — ยังค้นหา/เลือกได้ตรงๆ เหมือนเดิมทุกประการ
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ models: [], products: [] }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ models: [], products: [] });

  const [models, standaloneProducts] = await Promise.all([
    db.productModel.findMany({
      where: { active: true, name: { contains: q, mode: "insensitive" } },
      include: {
        productType: true,
        products: { where: { active: true }, select: { id: true, sku: true, size: true, unit: true } },
      },
      take: 10,
    }),
    db.product.findMany({
      where: {
        active: true,
        modelId: null,
        OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
      },
      include: { productType: true },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    models: models
      .filter((m) => m.products.length > 0) // รุ่นที่ยังไม่มี Size เลย ไม่มีประโยชน์ให้เลือก
      .map((m) => ({
        modelId: m.id,
        modelName: m.name,
        productTypeName: m.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
        sizes: m.products.map((p) => ({
          productId: p.id,
          sku: p.sku,
          unit: p.unit,
          size: p.size,
          label: p.size ?? "ไม่มีขนาด",
        })),
      })),
    products: standaloneProducts.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      productTypeName: p.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
    })),
  });
}
