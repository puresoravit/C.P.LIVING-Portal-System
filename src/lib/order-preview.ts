import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectivePrice, getEffectiveDiscountPct, roundMoney } from "@/lib/pricing";

// ==========================================================================
// ORDER PREVIEW ENGINE (ข้อ 19-21)
// แยกเป็น 2 ชั้น:
//  - buildPreviewLineItems / computeOrderPreview: ดึงข้อมูลจริงจาก DB (impure)
//  - groupByTypeAndApplyDiscount: คำนวณล้วนๆ (pure function, test ได้โดยไม่ต้องต่อ DB)
// Preview นี้ไม่รวม VAT เพราะใบส่งของชั่วคราว (Order) ไม่มี VAT ตามที่ยืนยันไว้
// (VAT จะคำนวณตอนออกใบกำกับภาษีแยกต่างหากใน Phase 4-5)
// ==========================================================================

export type PreviewLineItem = {
  orderItemId: string;
  productId: string;
  sku: string;
  productName: string;
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  size: string | null;
  quantity: Decimal;
  unit: string;
  unitPrice: Decimal;
  grossAmount: Decimal;
};

export type PreviewTypeGroup = {
  productTypeId: string;
  productTypeCode: string;
  productTypeName: string;
  items: PreviewLineItem[];
  grossAmount: Decimal;
  discountPct: Decimal;
  discountAmount: Decimal;
  netAmount: Decimal;
};

export type OrderPreview = {
  groups: PreviewTypeGroup[];
  grandGross: Decimal;
  grandDiscount: Decimal;
  grandNet: Decimal;
};

/**
 * ดึงรายการสินค้าในออเดอร์พร้อมราคา ณ ตอนนี้ (เรียก Pricing Engine ทีละรายการ ตาม Order Date)
 * รับ `client` เป็น Prisma Transaction Client ได้ (เหมือน getNextSeq) — จำเป็นสำหรับ
 * E3 Edit Confirmed Order ที่ต้อง insert OrderItem ใหม่แล้วอ่าน preview จากของที่เพิ่ง
 * insert ภายใน transaction เดียวกัน (อ่านผ่าน `db` เฉยๆ จะไม่เห็นข้อมูลที่ยังไม่ commit)
 */
export async function buildPreviewLineItems(
  orderId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<PreviewLineItem[]> {
  const order = await client.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: { include: { productType: true } } } } },
  });

  const lines: PreviewLineItem[] = [];
  for (const item of order.items) {
    const { price } = await getEffectivePrice({
      productId: item.productId,
      customerId: order.customerId,
      branchId: order.branchId,
      orderDate: order.orderDate,
    });
    lines.push({
      orderItemId: item.id,
      productId: item.productId,
      sku: item.product.sku,
      productName: item.descriptionOverride || item.product.name,
      productTypeId: item.product.productTypeId,
      productTypeCode: item.product.productType.code,
      productTypeName: item.product.productType.name,
      size: item.product.size,
      quantity: item.quantity,
      unit: item.product.unit,
      unitPrice: price,
      grossAmount: roundMoney(item.quantity.mul(price)),
    });
  }
  return lines;
}

/**
 * จัดกลุ่มตาม Product Type (ข้อ 19) แล้วคำนวณส่วนลด/สุทธิต่อกลุ่ม (ข้อ 20-21)
 * Pure function — ไม่แตะ DB จึง unit test ได้ตรงๆ (ดู order-preview.test.ts)
 * ไม่มีทางสร้างกลุ่มว่างเปล่า เพราะกลุ่มมาจาก items ที่มีจริงเท่านั้น
 * (สอดคล้องกับข้อ 22 "ห้ามสร้าง Empty Invoice")
 */
export function groupByTypeAndApplyDiscount(
  lines: PreviewLineItem[],
  discountByTypeId: Record<string, Decimal>
): PreviewTypeGroup[] {
  const map = new Map<string, PreviewLineItem[]>();
  for (const line of lines) {
    const arr = map.get(line.productTypeId) ?? [];
    arr.push(line);
    map.set(line.productTypeId, arr);
  }

  const groups: PreviewTypeGroup[] = [];
  for (const [typeId, items] of map) {
    const grossAmount = roundMoney(items.reduce((sum, i) => sum.add(i.grossAmount), new Decimal(0)));
    const discountPct = discountByTypeId[typeId] ?? new Decimal(0);
    const discountAmount = roundMoney(grossAmount.mul(discountPct).div(100));
    const netAmount = roundMoney(grossAmount.sub(discountAmount));
    groups.push({
      productTypeId: typeId,
      productTypeCode: items[0].productTypeCode,
      productTypeName: items[0].productTypeName,
      items,
      grossAmount,
      discountPct,
      discountAmount,
      netAmount,
    });
  }
  return groups.sort((a, b) => a.productTypeCode.localeCompare(b.productTypeCode));
}

/** เรียกรวมทุกอย่าง: ดึงราคา + หา discount ทุก Type ที่เกี่ยวข้อง + จัดกลุ่ม + สรุปยอดรวม */
export async function computeOrderPreview(
  orderId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<OrderPreview> {
  const order = await client.order.findUniqueOrThrow({ where: { id: orderId } });
  const lines = await buildPreviewLineItems(orderId, client);

  const typeIds = [...new Set(lines.map((l) => l.productTypeId))];
  const discountByTypeId: Record<string, Decimal> = {};
  for (const typeId of typeIds) {
    const { discountPct } = await getEffectiveDiscountPct({
      customerId: order.customerId,
      branchId: order.branchId,
      productTypeId: typeId,
      orderDate: order.orderDate,
    });
    discountByTypeId[typeId] = discountPct;
  }

  const groups = groupByTypeAndApplyDiscount(lines, discountByTypeId);

  const grandGross = roundMoney(groups.reduce((s, g) => s.add(g.grossAmount), new Decimal(0)));
  const grandDiscount = roundMoney(groups.reduce((s, g) => s.add(g.discountAmount), new Decimal(0)));
  const grandNet = roundMoney(groups.reduce((s, g) => s.add(g.netAmount), new Decimal(0)));

  return { groups, grandGross, grandDiscount, grandNet };
}
