# P1 — สรุปการตัดสินใจ Schema สุดท้าย (หลัง Inspect Codebase จริง)

> เอกสารนี้เป็น **source of truth** สำหรับ implement P1 — เขียนทับ/เพิ่มเติมจุดที่เอกสาร
> `00-ส่งงาน.md` และ `01-สรุปรวม.md` (ของทีม Co-worker) ยังไม่ได้เห็นโค้ดจริงตอนร่าง
> ไม่ได้แก้ไฟล์ต้นฉบับ 2 ไฟล์นั้น เก็บไว้เป็นหลักฐานการปรึกษาตามเดิม

## 1. แก้จากต้นฉบับ — เหตุผลจาก Inspect Codebase

| เอกสารเดิมพูดว่า | แก้เป็น | เหตุผล |
|---|---|---|
| สร้างตาราง "ตระกูลสินค้า (Product Family)" ใหม่ | **ไม่สร้าง** — reuse `ProductModel` เดิม (schema.prisma:241) เป็นตระกูลสินค้า | `ProductModel` ("เช่น GT-David") คือของสิ่งเดียวกันที่มีอยู่แล้ว สร้างซ้ำจะฝ่าฝืนกฎ "ห้ามทำสำเนา Product Master" |
| ตาราง `orders` / `order_lines` / `order_revisions` | เปลี่ยนชื่อเป็น **`CustomerPO` / `CustomerPOLine` / `CustomerPORevision`** (ไม่ใช้ `Order*` เพราะชนกับ Billing, ไม่ใช้ `PurchaseOrder*` เฉยๆ เพราะชนความหมายกับ Procurement ในอนาคต) | Billing มีโมเดล `Order`/`OrderItem` อยู่แล้ว (schema.prisma:469, เอกสาร "ใบสั่งขาย" คนละความหมาย) — `PurchaseOrder` ในความหมายมาตรฐาน ERP คือฝั่งเราซื้อจาก Supplier ตรงข้ามกับที่นี่ (รับ P.O. จากลูกค้า) |
| ตาราง `events` ใหม่ | **ไม่สร้าง** — ต่อยอด `AuditLog` เดิม (เพิ่ม field nullable) | `AuditLog` มีโครงเหมือนกันทุกประการ (module/recordId/oldValue/newValue/userId) ใช้จริง 30 จุดแล้ว แต่ยังไม่มีหน้า Timeline อ่าน — Production เป็นเจ้าแรกที่จะใช้ประโยชน์จากมัน (ใช้เป็น**ledger การเปลี่ยนแปลง**เท่านั้น ไม่ใช่แหล่งข้อมูล reconstruct เอกสารเต็ม — ดูหัวข้อถัดไป) |
| เลขที่เอกสาร `PROD-6908-0012` (ร่าง 1) หรือ `PROD-202608-0001` (ร่าง 2) | **`PROD-202608-00012`** ตาม `formatDocNumber()` เดิม | ใช้ `DocumentSequence`/`getNextSeq` เดิมตรงๆ (running-number.ts) ไม่ต้องคิด format ใหม่ |
| ProductionOrder ออก Rev = ต้องมีข้อมูลใบเก่าแยกเก็บ | **มีตาราง `ProductionOrderRevision` แยกจริง — ถอนข้อสรุปเดิม** (ดูหัวข้อ 1.1 ด้านล่าง) | Verify แล้วพบว่า pattern ที่เคยอ้าง (Quotation) ไม่พอสำหรับ Production จริงๆ |

### 1.1 ถอนข้อสรุป — ทำไม reuse `Quotation.revisionNo` pattern ตรงๆ ไม่ได้

เคยเสนอว่า "ProductionOrder revise = คงแถวเดิม เพิ่ม `revNo`, ประวัติเก่าเก็บใน `AuditLog.oldValue` พอ" โดยอ้าง `Quotation.revisionNo` เป็น precedent — **ตรวจโค้ดจริงแล้วพบว่าข้อสรุปนี้ผิด**

`editConfirmedQuotation()` ([quotations/actions.ts:404-451](../../src/app/(dashboard)/quotations/actions.ts)) ทำแบบนี้จริง:
```ts
const beforeSnapshot = {
  items: quotation.items.map((i) => ({ productId: i.productId, quantity: ..., netAmount: ... })), // แค่ 3 field
};
await tx.quotationItem.deleteMany({ where: { quotationId } }); // ของเดิมหายจริงจาก DB
await tx.quotationItem.createMany({ data: calc.items.map(...) }); // สร้างใหม่ทับ
```
เก็บลง `AuditLog.oldValue` แค่สรุปย่อ 3 field/บรรทัด (ไม่มี `descriptionOverride`/`skuSnapshot`/`unitPriceSnapshot` ฯลฯ) — **ไม่พอ reconstruct/reprint ใบเก่าแบบเป๊ะ** ระบบยอมรับ tradeoff นี้ได้เพราะ comment บอกตรงๆ ว่า Quotation **"ไม่มี Downstream Document ใดๆ อ้างอิง...เลย"**

**Production ไม่เข้าเงื่อนไขเดียวกัน** — กฎข้อ 6 (พิมพ์แล้วแก้ต้องรู้ว่าใบเก่าคืออะไร) + สเปกผ้า/ชั้นโครงสร้างผูกกับของที่ผลิตจริงจับต้องได้ ถ้าผลิตผิดต้องสอบย้อนได้ครบทุกช่องตามวันที่ออกจริง ไม่ใช่สรุปย่อ

**Schema ที่แก้จริง:**
- `ProductionOrder` = identity คงที่ (เลขที่เอกสาร, สถานะปัจจุบัน, `currentRevNo` ชี้ revision ล่าสุด)
- `ProductionOrderRevision` = **1 แถวใหม่ต่อ 1 Rev เสมอ ไม่เคย update/delete ของเดิม** (immutable ทันทีที่สร้าง)
- `ProductionItem` ผูกกับ `ProductionOrderRevision` โดยตรง (ไม่ใช่ `ProductionOrder` header) — Rev ใหม่ = สร้างแถว item+layer ใหม่ทั้งชุด เปิดพิมพ์ Rev ไหนก็ได้ครบทุกช่องเป๊ะ
- ส่วนที่ยัง reuse จาก Quotation ได้จริง: **แค่การคำนวณ suffix "-N" ตอนแสดงผล/พิมพ์** (เลขที่เอกสารตัวเดียวกัน ไม่ต้องออกเลขใหม่ทุก Rev) — ไม่ใช่วิธีเก็บเนื้อหา
- `AuditLog` ยังใช้เป็น**ledger การเปลี่ยนแปลง** (ใครกด Revise เมื่อไร เหตุผลอะไร) แต่**ไม่ใช่แหล่งเดียวของการ reconstruct เอกสาร** — เนื้อหาเต็มอยู่ใน `ProductionOrderRevision`/`ProductionItem`/`ProductionItemLayer` จริงๆ

## 2. Decision ที่ยืนยันแล้ว (บันทึกไว้กันลืม)

- `orderSeqNo` (สั่งครั้งที่) นับ **per branch** — ใช้ `BranchOrderSequence` (ตาราง 1 แถวต่อ branch, atomic upsert เหมือน `ProductSkuSequence`/`getNextSkuSeq` เป๊ะ)
- Production snapshot (`skuSnapshot`/`nameSnapshot`/`productionLabelSnapshot`) ล็อกตอน **Confirm/Issue** ไม่ใช่ตอนสร้าง draft — กลไกจริง (แก้จากที่เคยเขียนผิดในรอบก่อน): `ProductionOrder`+`ProductionOrderRevision`(revNo=0) แรกสุดถูกสร้างพร้อมกันในทรานแซกชันเดียว**เฉพาะตอนกด Confirm/Issue เท่านั้น** ไม่มี draft state persist ลง DB มาก่อนเลย (`ProductionOrderRevision.confirmedAt` จึงตั้งค่าเสมอ ไม่ nullable) — Revision ใหม่ (ออก Rev หลังพิมพ์) = สร้างแถว `ProductionOrderRevision`+`ProductionItem`+`ProductionItemLayer` ชุดใหม่ทั้งหมด ไม่แตะแถวของ Rev เก่าเลย (ไม่ใช่เขียนทับ + พึ่ง AuditLog แบบที่เคยเสนอผิดไป — ดูหัวข้อ 1.1)
- Concurrent edit P1: **reject + ให้ reload ทั้ง Order** (ไม่ auto-merge) — ผ่าน optimistic lock (`version`/`revCounter` บน `CustomerPO`)
- Resolve `UNRESOLVED` line ไป SKU ที่มีอยู่แล้ว = พนักงานทำเองได้ / สร้าง SKU ใหม่ = ต้องสิทธิ์ `product.edit` (มีแค่ OWNER_ADMIN อยู่แล้วในระบบเดิม ไม่ต้องเพิ่ม permission ใหม่)
- `ProductAlias` XOR (`productModelId`/`productId`) บังคับที่ Application layer เหมือน `resolveAccessHead()` เดิม ไม่ใช้ DB CHECK (ทั้งระบบไม่มี CHECK constraint เลย)
- สูตรผ้า/ชั้นโครงสร้าง: เก็บข้อมูลจริงแบบ structured เต็ม (ใช้คำนวณ `spec_hash`) + field override สำหรับแสดงผล/พิมพ์แยกต่างหาก ไม่กระทบ hash — รูปแบบการพิมพ์จริงยังไม่ lock (ปรับได้ภายหลังโดยไม่ migrate schema ใหม่)
- Mobile-first เฉพาะหน้าจอปฏิบัติงาน (สร้าง/แก้ออเดอร์, ยืนยันรายการ) — ฟอร์มพิมพ์ A4 แยกเทมเพลตต่างหาก ไม่ปนกับ UI จอมือถือ
- **S2 Checkpoint 2**: ลบรายการ (`CustomerPOLine`) ระหว่างแก้ไข P.O. = **Soft-delete (`active: false`) เท่านั้น ห้าม Hard Delete** — ถอนแนวทางแรกที่เคย hard-delete แล้ว (Owner ถามก่อน commit ให้ inspect ซ้ำ): id ของบรรทัดถูกอ้างต่อเนื่องจาก 2 ทาง (1) `CustomerPORevisionChange.orderLineId` ในทุก Revision ที่เคยแตะบรรทัดนั้น — Hard Delete ทำให้ FK (`ON DELETE SET NULL`) ล้าง orderLineId เป็น null พร้อมกันทุกแถวประวัติ ตัดเธรดประวัติของบรรทัดเดียวกันข้ามหลาย Revision ขาดจากกัน (พิสูจน์แล้วด้วย smoke test จริง) (2) `ProductionItem.customerPoLineId` (เตรียมไว้ใน schema แล้วสำหรับ P2) ต้องอ้าง identity บรรทัดต้นทางถาวรข้ามเวลา — ใช้ field `active Boolean @default(true)` ตาม Pattern เดิมที่ใช้ทั้งระบบ (`User`/`Customer`/`Branch`/`ProductType`/ฯลฯ) ไม่ใช่คิดรูปแบบใหม่ — ทุก Query ที่แสดงรายการสดต้อง `where: { active: true }` เสมอ (list/detail/edit page + `_count`)

## 3. ยังไม่ตัดสินใจ (ไม่บล็อก P1 แต่ต้องรู้ก่อน sprint ที่เกี่ยวข้อง)

1. สิทธิ์ผู้ใช้ฝั่งผลิต — ใช้ 3 Role เดิม (OWNER_ADMIN/BILLING_STAFF/VIEWER) ไปก่อนหรือแยกใหม่? **P1 นี้ implement โดย assume ใช้ 3 Role เดิม** ถ้าผิดแก้ทีหลังได้ไม่กระทบ schema
2. ฝ่ายผลิตต้องการแยกใบสั่งผลิตตามอะไร (แผนก/เครื่อง/ชนิดผ้า) — รอโรงงานตอบ
3. ที่เก็บรูปแนบ P.O. ระยะยาว (local + backup เดิม vs object storage) — P1 ใช้ `poImagePaths String[]` shortcut ไปก่อนตามที่ยืนยันแล้ว
