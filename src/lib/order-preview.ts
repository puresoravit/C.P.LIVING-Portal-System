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

// R4 — Sentinel สำหรับสินค้าที่ productTypeId=null (Internal Code ตามที่อนุมัติ) — ใช้
// เป็น Grouping Key ภายในเท่านั้น ไม่เคยถูกเขียนเป็น FK ที่ไหนเลย (Invoice.productTypeCode
// เป็น plain String อยู่แล้ว ไม่ผูก ProductType) จึงปลอดภัยที่จะ normalize ตรงนี้จุดเดียว
// แล้วให้โค้ดส่วนอื่น (groupByTypeAndApplyDiscount ฯลฯ) ไม่ต้องรู้เรื่อง null เลย
export const UNSPECIFIED_TYPE_CODE = "GEN";
export const UNSPECIFIED_TYPE_LABEL = "ไม่ระบุกลุ่มส่วนลด";

// R4 — ทุกจุดที่แสดง Invoice.productTypeCode/InvoiceItem.productTypeSnapshot (String
// ล้วนๆ ไม่ใช่ FK) ให้ User เห็น ต้องผ่านฟังก์ชันนี้เสมอ — ห้ามโชว์ "GEN" ดิบๆ ที่ไหนเลย
// ตามที่อนุมัติไว้ชัดเจน (ต่างจาก Type ปกติที่ตั้งใจโชว์ Code ตัวเดียวแบบย่อ เช่น A/B/C)
export function displayProductTypeCode(code: string): string {
  return code === UNSPECIFIED_TYPE_CODE ? UNSPECIFIED_TYPE_LABEL : code;
}

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
      // R4 — productTypeId=null (ไม่ระบุประเภท) → normalize เป็น Sentinel ตรงนี้จุดเดียว
      productTypeId: item.product.productTypeId ?? UNSPECIFIED_TYPE_CODE,
      productTypeCode: item.product.productType?.code ?? UNSPECIFIED_TYPE_CODE,
      productTypeName: item.product.productType?.name ?? UNSPECIFIED_TYPE_LABEL,
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

/**
 * เรียกรวมทุกอย่าง: ดึงราคา + หา discount ทุก Type ที่เกี่ยวข้อง + จัดกลุ่ม + สรุปยอดรวม
 *
 * R3 — applyDiscount อ่านจาก order.applyDiscount ที่เพิ่ง findUniqueOrThrow มาเอง (ไม่ต้อง
 * เพิ่ม Parameter ใหม่ให้ Caller ทั้ง 4 จุดต้องแก้) — ถ้า false จะ "ข้าม" การ Query
 * DiscountRule ไปเลยทั้งหมด (ไม่ใช่แค่ Override ผลลัพธ์เป็น 0 ทีหลัง) แล้วปล่อยให้
 * groupByTypeAndApplyDiscount ใช้ fallback เดิมของมันเอง (`discountByTypeId[typeId] ?? 0`)
 * ทำให้ discountPct/discountAmount ทุกกลุ่มเป็น 0 จริงที่ต้นทาง — สำหรับ E3 ที่ต้องการ
 * เปลี่ยนค่า applyDiscount ระหว่างแก้ไข ให้ tx.order.update({ applyDiscount }) ก่อนเรียก
 * ฟังก์ชันนี้ภายใน Transaction เดียวกัน จะเห็นค่าใหม่ทันทีเพราะ self-fetch จาก client เดียวกัน
 */
export async function computeOrderPreview(
  orderId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<OrderPreview> {
  const order = await client.order.findUniqueOrThrow({ where: { id: orderId } });
  const lines = await buildPreviewLineItems(orderId, client);

  const typeIds = [...new Set(lines.map((l) => l.productTypeId))];
  const discountByTypeId: Record<string, Decimal> = {};
  if (order.applyDiscount) {
    for (const typeId of typeIds) {
      // R4 — สินค้า "ไม่ระบุประเภท" ไม่มี DiscountRule ที่ Match ได้จริง (DiscountRule.
      // productTypeId ยัง required เสมอ) เป็นข้อเท็จจริงเชิงโครงสร้าง ไม่ใช่ Policy ที่ต้อง
      // เลือก — ข้าม Query ไปเลยเหมือน applyDiscount=false เพื่อไม่ต้อง Query ที่รู้ผลอยู่แล้ว
      if (typeId === UNSPECIFIED_TYPE_CODE) continue;
      const { discountPct } = await getEffectiveDiscountPct({
        customerId: order.customerId,
        branchId: order.branchId,
        productTypeId: typeId,
        orderDate: order.orderDate,
      });
      discountByTypeId[typeId] = discountPct;
    }
  }

  const groups = groupByTypeAndApplyDiscount(lines, discountByTypeId);

  const grandGross = roundMoney(groups.reduce((s, g) => s.add(g.grossAmount), new Decimal(0)));
  const grandDiscount = roundMoney(groups.reduce((s, g) => s.add(g.discountAmount), new Decimal(0)));
  const grandNet = roundMoney(groups.reduce((s, g) => s.add(g.netAmount), new Decimal(0)));

  return { groups, grandGross, grandDiscount, grandNet };
}
