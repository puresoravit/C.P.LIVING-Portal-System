import { Fragment } from "react";
import type { PrintBlockKey } from "@/lib/print-template-settings";

// R6 Phase E — จุดเดียวที่หน้า Print ทั้ง 5 ประเภท + Designer Canvas เรียกใช้ร่วมกันเพื่อ
// Render Header/Title/CustomerInfo ตามลำดับที่ Owner จัดไว้ (blockOrder) — Component นี้
// ไม่มี Layout/Business Logic ของตัวเอง แค่ Map Key → Node ตามลำดับที่ส่งมาเท่านั้น (Item
// Table/Amount Summary/Signature ไม่อยู่ในนี้เพราะตรึงตำแหน่งเสมอ ดู
// print-template-settings.ts สำหรับเหตุผลเต็ม)
export function PrintOrderedBlocks({
  order,
  blocks,
}: {
  order: PrintBlockKey[];
  blocks: Record<PrintBlockKey, React.ReactNode>;
}) {
  return (
    <>
      {order.map((key) => (
        <Fragment key={key}>{blocks[key]}</Fragment>
      ))}
    </>
  );
}
