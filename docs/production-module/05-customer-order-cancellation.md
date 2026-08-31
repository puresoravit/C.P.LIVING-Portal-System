# 05 — สถาปัตยกรรมการยกเลิกออเดอร์ลูกค้า (Customer Order Cancellation)

**สถานะ: ข้อเสนอเพื่อ Owner review — ยังไม่ implement** (Owner สั่งชัด: สรุป architecture/ผลกระทบให้อ่านก่อน เพราะเป็น business-state change)

เขียนหลังจาก inspect โค้ดจริงทั้งหมดที่เกี่ยว: `CustomerPO`/`ProductionOrder` status model, revision logic (S2/S3), print/start-production state (S4), AuditLog, permission matrix และ pattern `cancelOrder` ของ Billing

---

## 1. สิ่งที่โค้ดปัจจุบันมีอยู่แล้ว (ไม่ต้องสร้างใหม่)

| ของที่มีอยู่ | สถานะ | ใช้ทำอะไรในงานนี้ |
|---|---|---|
| Permission `customerPo.cancel` | มีใน matrix ตั้งแต่ S1 (ทั้ง OWNER_ADMIN และ BILLING_STAFF) **แต่ไม่เคยมีโค้ดเรียกใช้เลย** | gate ปุ่มยกเลิก — ไม่ต้องแก้ matrix |
| `AuditLog.correlationId` | มีใน schema ตั้งแต่ S1, ไม่เคยถูกใช้ — comment ใน schema เขียนไว้เองว่าไว้สำหรับ "action เดียวกระทบหลาย entity" | ผูก audit ของ CustomerPO + ใบสั่งผลิตทุกใบที่โดน cascade ในการกดครั้งเดียว |
| `AuditLog.action = "CANCEL"` | ประกาศไว้ใน comment ของ schema แต่ฝั่ง Production ไม่เคยใช้ | action ของ event ยกเลิก |
| `RevisionChangeType.ORDER_LEVEL` | comment ใน schema เขียนไว้เองว่าเผื่อ "ยกเลิกทั้งใบ" | (ดูข้อ 4 — เสนอเพิ่ม enum เฉพาะแทน เพื่อให้ประวัติอ่านรู้เรื่อง) |
| CAS pattern (`version` / `cancelledAt IS NULL`) | ใช้ทั่วระบบแล้ว (CustomerPO.version, productionStartedAt, printedAt) | concurrency ของการยกเลิก ใช้ pattern เดิมเป๊ะ |
| Billing `cancelOrder` | idempotent (กดซ้ำ = แจ้ง "ยกเลิกไปแล้ว" ไม่ error), guard เอกสารปลายน้ำก่อนยอมให้ยกเลิก | ต้นแบบพฤติกรรม |

## 2. ทำไมไม่ใช้ status text เป็นตัวบอกว่า "ยกเลิกแล้ว"

`CustomerPO.status`/`ProductionOrder.status` เป็น **free string จาก AppSetting ที่แอดมินแก้ข้อความได้ตลอด** — ถ้า logic guard (ห้ามออกใบผลิต/ห้ามพิมพ์/ห้ามขึ้นรถ) ไปเทียบข้อความ status ตรงๆ วันไหนแอดมินแก้คำในหน้าตั้งค่า guard จะพังเงียบๆ ทันที — บทเรียนเดียวกันนี้เคยเจอแล้วตอน S4 (badge เคยอ่าน status ดิบแล้วเจอข้อความเก่าค้างใน DB จึงเปลี่ยนไป derive จาก `productionStartedAt` แทน)

**ข้อเสนอ: เก็บการยกเลิกเป็น "ข้อเท็จจริง + timestamp" ตาม precedent ของ `productionStartedAt`** — เพิ่มคอลัมน์ nullable (additive ล้วน ไม่แตะข้อมูลเดิมแม้แต่แถวเดียว):

```
CustomerPO:       cancelledAt DateTime?  cancelledById String?  cancelReason String?
ProductionOrder:  cancelledAt DateTime?  cancelledById String?  cancelReason String?
```

- `status` string เดิม**ไม่ถูกแตะเลย** — ค่าสุดท้ายก่อนยกเลิกคงอยู่เป็นประวัติ
- การแสดงผล "ยกเลิกแล้ว" (badge แดง/เทา) derive จาก `cancelledAt` ผ่าน `production-status-badges.ts` จุดเดียวตามเดิม — เพิ่ม state ที่ 3 เข้า helper กลาง ทุกหน้าได้พร้อมกัน

**คำตอบข้อ "schema/migration จำเป็นจริงหรือไม่": จำเป็น แต่เล็กที่สุดเท่าที่เป็นไปได้** — 6 คอลัมน์ nullable + 1 ค่า enum (ข้อ 4) · ไม่มี data migration · ไม่มี redesign · ไม่กระทบตาราง Billing ใดๆ

## 3. State transition ที่เสนอ

```
CustomerPO:       ปกติ (cancelledAt = null) ──ยกเลิก──▶ ยกเลิกแล้ว (cancelledAt = เวลา)   [ทางเดียว]
ProductionOrder:  ปกติ ──(cascade จากออเดอร์ / หรือยกเลิกแยกใบ ถ้า Owner อนุมัติข้อ D3)──▶ ยกเลิกแล้ว   [ทางเดียว]
```

- **ทางเดียว ไม่มี un-cancel ใน V1** (เหมือน `productionStartedAt`) — ลูกค้าเปลี่ยนใจกลับมาสั่ง = สร้างออเดอร์ใหม่ ประวัติชัดกว่าและไม่มีเคสก้ำกึ่ง (เป็น Owner decision — ดู D4 ใน decision sheet)
- ยกเลิกได้ทุกจังหวะตามที่ Owner กำหนด รวมถึงหลังเริ่มผลิตแล้ว — ต่างกันแค่ระดับคำเตือน (ข้อ 5)
- **การยกเลิกไม่ย้อนเวลา**: `productionStartedAt`, `printedAt`, ทุก Revision, ทุก ProductionItem อยู่ครบเหมือนเดิมทุก byte — ระบบจำได้ตลอดว่า "เคยสั่งผลิตจริง เริ่มจริง พิมพ์จริง แล้วค่อยถูกยกเลิก"

## 4. Transaction การยกเลิก (ทั้งหมดใน `db.$transaction` เดียว)

```
cancelCustomerPO(id, reason):        [reason บังคับกรอกเสมอ]
1. CAS: updateMany CustomerPO WHERE id AND cancelledAt IS NULL AND version = v
        SET cancelledAt/cancelledById/cancelReason, version+1, revCounter+1
   → count=0 เพราะยกเลิกไปแล้ว   → return "ออเดอร์นี้ถูกยกเลิกไปแล้ว" (idempotent ตาม pattern Billing)
   → count=0 เพราะ version ไม่ตรง → return "มีคนแก้ระหว่างเปิดหน้า กรุณาโหลดใหม่" (pattern updateCustomerPO เดิม)
2. สร้าง CustomerPORevision (revNo ใหม่, reason) + RevisionChange ชนิดใหม่ CANCEL_ORDER
   (enum เพิ่ม 1 ค่า — ใช้ ORDER_LEVEL เดิมก็ได้แต่หน้าประวัติจะโชว์คำว่า "แก้ข้อมูลหัวออเดอร์"
   ซึ่งหลอกคนอ่าน — เพิ่ม enum ให้ประวัติเขียนว่า "ยกเลิกออเดอร์" ตรงๆ คุ้มกว่า)
3. cascade: updateMany ProductionOrder WHERE customerPoId = id AND cancelledAt IS NULL
        SET cancelledAt/cancelledById/cancelReason (เหตุผลเดียวกับออเดอร์)
4. AuditLog: 1 แถว CANCEL ของ CustomerPO + 1 แถวต่อใบสั่งผลิตที่โดน cascade —
   ทุกแถวใช้ correlationId เดียวกัน (การใช้ field นี้ครั้งแรกของระบบ ตรงตามที่ schema ตั้งใจไว้)
```

**Guard เพิ่มใน action เดิม 4 จุด** (เช็คใน transaction ของมันเอง กัน race กับการยกเลิกที่เกิดพร้อมกัน):

| Action | Guard ใหม่ |
|---|---|
| `createProductionOrder` | ปฏิเสธถ้า PO.cancelledAt ≠ null ("ออเดอร์นี้ถูกยกเลิกแล้ว ออกใบสั่งผลิตไม่ได้") |
| `updateCustomerPO` | ปฏิเสธการแก้ออเดอร์ที่ยกเลิกแล้ว (ยกเลิก = terminal — จะแก้ต้องเป็นออเดอร์ใหม่) |
| `reviseProductionOrder` | ปฏิเสธถ้าใบสั่งผลิตถูกยกเลิก |
| `confirmPrintRevision` | เพิ่ม `cancelledAt: null` เข้า WHERE ของ CAS + เช็คชัดเพื่อ error message ที่อ่านรู้เรื่อง |

การ "พิมพ์ซ้ำ" ใบที่เคยพิมพ์แล้วของออเดอร์ที่ยกเลิก ยังกดได้ (เป็น `window.print()` ฝั่ง client ล้วน ไม่แตะ state) — หน้า print จะขึ้น banner แดง "ยกเลิกแล้ว" ให้เห็นชัดว่ากระดาษนี้คือเอกสารอ้างอิงประวัติ ไม่ใช่ใบสั่งงาน

## 5. พฤติกรรมตามจังหวะที่ยกเลิก (ตรง requirement ทีละข้อ)

| สถานการณ์ | พฤติกรรม |
|---|---|
| ยังไม่มีใบสั่งผลิต | modal ยืนยันปกติ + บังคับกรอกเหตุผล |
| มีใบสั่งผลิตแต่ยังไม่เริ่มผลิต | modal ระบุรายการใบสั่งผลิตที่จะถูกยกเลิกด้วย ("PROD-xxx จะเดินงานต่อไม่ได้") + เหตุผล — cascade ทำให้พิมพ์/เริ่มผลิต/แก้ไขไม่ได้อีก |
| พิมพ์แล้ว/เริ่มผลิตแล้ว | **modal คำเตือนแรง (โทนแดง)**: แสดงว่าใบไหนเริ่มผลิตเมื่อไหร่โดยใคร + ข้อความ "การยกเลิกในระบบไม่ได้ทำให้ของที่ผลิตไปแล้วหายไปจริง — แจ้งหน้างานเก็บใบสั่งผลิตชุดที่พิมพ์แล้วคืนด้วย" + บังคับเหตุผล + ปุ่มยืนยันแดง |
| ทุกกรณี | ไม่มี hard delete แม้แต่แถวเดียว · Revision/Print history อยู่ครบ · actor/time/reason ครบทั้งใน field, ใน Revision และใน AuditLog |

## 6. ผลต่อ P2 (Loading/Outstanding)

- Query หา "ของที่ขึ้นรถได้" (FRESH/OUTSTANDING picker ใน P2) กรอง `cancelledAt IS NULL` ทั้งระดับออเดอร์และใบสั่งผลิต — **ยอดที่ยกเลิกไม่ไหลไปเป็นของขึ้นรถ/ของค้างโดยอัตโนมัติเด็ดขาด**
- ของที่**ผลิตไปแล้วจริง**ก่อนโดนยกเลิก ยังขึ้นรถได้ถ้าหน้างานต้องการจริง — ผ่านช่องทาง ADHOC ของ P2 (มนุษย์ตัดสินใจเอง มีบันทึก) ไม่ใช่ระบบเสนอให้เอง
- อนาคต P2: ถ้ายกเลิกออเดอร์ที่มีของค้าง (Outstanding) เปิดอยู่ → ระบบพาไปหน้า "ตัดของค้าง" ตามกฎข้อ 7 (อนุมัติ+เหตุผล) ไม่ปิดเงียบๆ ให้เอง

## 7. UI ที่ต้องแตะ (สรุป)

หน้า detail ออเดอร์ (ปุ่ม "ยกเลิกออเดอร์" + modal 2 ระดับ + banner แดงเมื่อยกเลิกแล้ว + ซ่อนปุ่มแก้ไข/สร้างใบสั่งผลิต) · หน้า detail/print ใบสั่งผลิต (banner + ซ่อน action) · `production-status-badges.ts` (state ที่ 3) · หน้า "ประวัติ" S5 (event ใหม่ "ยกเลิกออเดอร์"/"ยกเลิกใบสั่งผลิต" จุดสีแดง — ต่อยอด `classify()` เดิม)

**ขอบเขต:** ยกเลิก**ทั้งออเดอร์**เท่านั้น — การยกเลิกรายบรรทัดมีอยู่แล้ว (CANCEL_LINE ตอนแก้ออเดอร์) ไม่ทำซ้ำ
