import { Decimal } from "@prisma/client/runtime/library";
import { db } from "@/lib/db";
import { getEffectiveDiscountPct } from "@/lib/pricing";

// ==========================================================================
// Fresh UAT Fix — Discount Group Resolution สำหรับ Manual Tax Invoice แยกออกมาจาก
// Server Action (tax-invoices/actions.ts) เป็น Lib ล้วนๆ เพื่อ Unit Test การ Resolve
// ทั้ง Chain ได้ตรงๆ (Pattern เดียวกับ computeQuotationCalc ที่ทดสอบผ่าน mocked DB ใน
// apply-discount.test.ts) — Reuse getEffectiveDiscountPct เดิมของ Pricing Engine 100%
// (Priority: สาขา+กลุ่มส่วนลด → ลูกค้า+กลุ่มส่วนลด → 0%) ไม่มี Resolution Path ใหม่
//
// Semantic ของ "กลุ่มส่วนลด" ตรงกับ Order/Quotation ทุกประการ: อ่าน productTypeId ของ
// Product แถวนั้นเองตรงๆ (Size Variant ทุกตัวถูกสร้างพร้อม productTypeId ของตัวเอง —
// ไม่มี Fallback ไปหา Parent/Anchor เพราะ computeOrderPreview/computeQuotationCalc ก็ไม่
// Fallback — เพิ่มเองเฉพาะจุดนี้จะทำให้เอกสารต่างชนิดให้ส่วนลดไม่เท่ากัน) — Product ที่
// ไม่ระบุกลุ่ม (productTypeId=null) หรือรายการพิมพ์เอง (productId=null) → 0% โดยไม่
// Query DiscountRule เลย (ข้อเท็จจริงเชิงโครงสร้าง: Rule ผูก productTypeId เสมอ)
// ==========================================================================

export type GroupDiscountItemInput = {
  productId: string | null;
  /** ยอดบรรทัด (qty × unitPrice, VAT-inclusive) ตามที่แสดงในตารางรายการ */
  amount: number;
};

export type GroupDiscountResolution = {
  /** ส่วนลดต่อบรรทัด = round(amount × pct ÷ 100) — สูตร/การปัดเดียวกับ computeQuotationCalc */
  discountAmounts: number[];
  /** % ที่ Resolve ได้จริงต่อบรรทัด (0 = ไม่มี Rule/ไม่ทราบกลุ่ม) — ส่งให้ UI แสดงเหตุผล */
  discountPcts: number[];
};

export async function resolveGroupDiscounts(params: {
  customerId: string;
  branchId: string | null;
  orderDate: Date;
  items: GroupDiscountItemInput[];
}): Promise<GroupDiscountResolution> {
  const discountAmounts: number[] = [];
  const discountPcts: number[] = [];

  for (const item of params.items) {
    let pct = new Decimal(0);
    if (item.productId) {
      const product = await db.product.findUnique({
        where: { id: item.productId },
        select: { productTypeId: true },
      });
      if (product?.productTypeId) {
        pct = (
          await getEffectiveDiscountPct({
            customerId: params.customerId,
            branchId: params.branchId,
            productTypeId: product.productTypeId,
            orderDate: params.orderDate,
          })
        ).discountPct;
      }
    }
    // สูตรส่วนลดต่อบรรทัดเดียวกับ computeQuotationCalc/order-preview เป๊ะ:
    // discount = round(gross × pct ÷ 100), ทศนิยม 2 ตำแหน่ง Round Half Up
    const amount = new Decimal(item.amount).mul(pct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    discountAmounts.push(amount.toNumber());
    discountPcts.push(pct.toNumber());
  }

  return { discountAmounts, discountPcts };
}
