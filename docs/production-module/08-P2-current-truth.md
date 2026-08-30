# 08 — P2 Current Truth (สถาปัตยกรรมตามที่ implement จริง — ปิด CP6 2026-08-30)

**เอกสารนี้คือ source of truth ปัจจุบันของ P2** — เอกสาร 04 (discovery) และ 06 (review) เป็นข้อเสนอระหว่างทางที่ถูก supersede บางจุดแล้ว (มีหมายเหตุหัวไฟล์ชี้มาที่นี่) · เอกสาร 07 คือแผนที่อนุมัติ — จุดที่ implementation จริงต่างจาก 07 ระบุไว้ในหัวข้อ 9 · **CP6 (2026-08-30) เปลี่ยน UX entry point จาก trip-first เป็น queue-first — ดูหัวข้อ 10 — ไม่กระทบ backend/invariants ในหัวข้อ 1-9 เลย ยกเว้นจุดที่ระบุชัดในหัวข้อ 10 (confirm+reconcile รวมเป็น finalize เดียว)**

## 1. Lifecycle (timestamp facts ล้วน — ไม่มี business guard ผูกกับ status text ที่แอดมินแก้ได้)

```
ออเดอร์ลูกค้า (CustomerPO):   ปกติ → ยกเลิก (cancelledAt — terminal, ไม่มี reopen)
ใบสั่งผลิต (ProductionOrder): รอเริ่มผลิต → กำลังผลิต (productionStartedAt) → (ยกเลิกได้ทุกจังหวะ terminal)
เที่ยวรถ (LoadingTrip):       วางแผน/กำลังขึ้นของ (DRAFT) → [พิมพ์ใบขึ้นของ sheetPrintedAt — ไม่บังคับ]
                              → ส่งออกแล้ว (loadedAt+reconciledAt ตั้งพร้อมกัน — CP6 finalize เดียว)
                              ยกเลิกได้เฉพาะช่วง DRAFT (cancelledAt)
ใบสั่งผลิต (CP6 เพิ่ม):        productionCompletedAt — ฝ่ายขึ้นของรับรองตอนกด "ยืนยันขึ้นวันนี้" (คนละ fact กับ loading)
บัตรค้าง (OutstandingDelivery): เปิด → ปิด (closedAt) — ปิดเพราะส่งครบ หรือมีตัดยอด (แยกจาก ledger)
```

- DRAFT: แก้หัวเที่ยว/จุดส่ง/รายการได้อิสระ (ทุก mutation = version CAS + audit)
- `loadedAt` = **เหตุการณ์ทางกายภาพเดียว**: มนุษย์นับยอดขึ้นรถจริงครบทุกรายการ (qtyLoaded, 0 ได้) + รูปใบขีดนับครบทุกจุดส่งที่มีรายการ (enforce ฝั่ง server) — **การพิมพ์ใบขึ้นของไม่เกี่ยวข้องใดๆ** (window.print ล้วน กระดาษกันตกรุ่นด้วย "แผนแก้ไขครั้งที่ N + เวลาพิมพ์" บนหัวใบ)
- ช่วง loadedAt→reconciledAt: คีย์ ADHOC หน้างานได้ / แก้ qtyLoaded ที่คีย์ผิดได้ (เหตุผลบังคับ + audit before/after) — แผน/จุดส่ง/source แก้ไม่ได้แล้ว
- `reconciledAt` = digital manifest สมบูรณ์: ทุกชิ้นที่ขึ้นจริงถูกชี้ที่มา + บัตรค้างเปิด/ปิด — หลังจากนั้นทุกอย่าง immutable (แก้ = compensating event เท่านั้น)

## 2. Quantity source of truth (เลข 5 ตัว ห้ามปนกัน)

| เลข | ที่อยู่ | ความหมาย |
|---|---|---|
| ลูกค้าต้องได้ | `CustomerPOLine.qtyCurrent` | **source of truth เดียวของ demand** — ของค้างคิดจากตัวนี้เสมอ |
| ฝ่ายผลิตถูกสั่ง | `ProductionItem.qty` (Rev ปัจจุบัน) | context เปรียบเทียบ/เตือนเท่านั้น — **ห้ามใช้สร้างของค้าง** |
| แผนจะขึ้น | `LoadingLine.qtyPlanned` | แผน ไม่ผูกมัด |
| ขึ้นจริง | `LoadingLine.qtyLoaded` | มนุษย์ยืนยัน (V1 ไม่ OCR) |
| เหลือค้าง | derive: `qtyOriginal − Σ ledger` | ไม่มี mutable remaining — ไม่มี drift โดยโครงสร้าง |

สูตรกลาง (`src/lib/loading-reconcile.ts` — จุดเดียวใช้ทั้ง tx และหน้าจอ):
`freshCapacity = qtyCurrent − (FRESH ที่ส่งแล้ว + OUTSTANDING/CUT ของบัตรที่ผูกบรรทัดนี้) − ยอดคงเหลือบัตรเปิด` (clamp 0, ออเดอร์ยกเลิก = 0)

## 3. Fresh / Outstanding / ADHOC + Final Allocation

- **planned source ≠ final allocation** — picker ตอนจัดเที่ยว (FRESH กรองออเดอร์ยกเลิก + default ตรงสาขาจุดส่ง มี toggle ข้ามสาขาพร้อม warning / OUTSTANDING โชว์ อายุ-เหลือ-ต้นทาง) เป็นแผน+บริบทเท่านั้น
- ตอนกระทบยอด **คนเลือกเองทุกชิ้น** ว่าตัดจาก ออเดอร์ใหม่ / บัตรค้างเดิม (หลายใบได้) / ของหน้างาน — **ไม่มี FIFO อัตโนมัติที่ไหนเลย** — Σ ต่อรายการต้องเท่ายอดขึ้นจริงเป๊ะ เกิน capacity ต้อง resolve เป็น ADHOC เอง (block ไม่ over-allocate เงียบ)
- ทุกการตัดสิน = แถวใน **ledger `loading_allocations`** (append-only, immutable, มี actorId): kind FRESH / OUTSTANDING / ADHOC / CUT
- ADHOC: คีย์ช่วงรอกระทบยอด ไม่มี source order จริงก็บันทึกตรงๆ (**ห้ามสร้าง fake order เพื่อให้ FK ครบ**) ผูก Product จริงได้ถ้า resolve ได้

## 4. บัตรค้างส่ง (OutstandingDelivery) — ตาม D1/D2

- **1 แถวคงที่ตลอดชีวิต**: `qtyOriginal`/`openedAt` ห้ามแก้ทุกกรณี — partial ข้ามกี่เที่ยวก็บัตรเดิม อายุไม่ reset
- **อายุเริ่มนับ** = reconcile ครั้งแรกที่ demand กลายเป็นของค้างจริง (D2) — คนละความหมายกับอายุออเดอร์
- ตอบย้อนหลังครบจาก ledger: มาจากออเดอร์/บรรทัดไหน · เริ่มเมื่อไร เท่าไร · เที่ยวไหนเอาไปเท่าไร ใครเลือก · ตัด/ยกเลิกเท่าไรเพราะอะไร · เหลือเท่าไร
- **ตัดยอด (CUT)**: permission `outstanding.cancel` (OWNER_ADMIN เท่านั้น — กฎ P1 ข้อ 7) · บางส่วน/ทั้งหมด · เหตุผลบังคับ · ห้ามเกินยอดเหลือ · แถว CUT ใน ledger เดียวกัน (loadingLineId=null — typed ชัด ไม่ใช่เหตุการณ์ขึ้นรถ)
- **เหตุที่ปิด** derive จาก ledger: ไม่มีแถว CUT = "ปิดแล้ว (ส่งครบ)" / มี = "ปิดแล้ว (มีตัดยอด N)" — ไม่มีคอลัมน์ให้เขียนทับประวัติ

## 5. Cancellation semantics (ตาม D3/D4/D5 + CP4 lock)

- ออเดอร์/ใบสั่งผลิต/เที่ยว: ยกเลิก = terminal timestamp fact + เหตุผล + audit — history (Revision/print/started) ไม่ถูกลบ/ย้อนเสมอ
- Cascade **ทางเดียว**: ยกเลิกออเดอร์ → ใบสั่งผลิต active ทุกใบ (tx เดียว) / ยกเลิกใบสั่งผลิตแยกใบ → ออเดอร์ยัง active ออกใบใหม่ได้
- ใบเริ่มผลิตแล้ว: ต้องมี `production.cancelStarted` (ADMIN) — เช็คซ้ำใน tx กัน race
- **ออเดอร์ที่มีบัตรค้างเปิด**: STAFF ถูก block ทั้ง tx (ห้ามใช้เป็นทางลัดตัดของค้าง) / ADMIN cascade-cut บัตรพร้อมกันใน tx เดียว (CUT + เหตุผล + audit + correlation)
- **การแก้/ลดยอดออเดอร์ไม่แตะบัตรค้างเด็ดขาด** (โครงสร้างกันไว้: บัตรเป็นแถวอิสระ + capacity clamp 0) — บัตรที่เกินยอดออเดอร์ปัจจุบันขึ้นป้ายแดง "เกินยอดออเดอร์ — รอตัด" รอแอดมินจัดการ

## 6. Permission boundaries (ทั้งหมด enforce ผ่าน `can()` ฝั่ง server — ไม่มีชื่อ role ใน business logic)

| Permission | ADMIN | STAFF | ใช้กับ |
|---|---|---|---|
| customerPo.* / productionOrder.create/confirm/revise/print | ✓ | ✓ | flow เอกสารปกติ |
| customerPo.cancel / productionOrder.cancel | ✓ | ✓ | ยกเลิกก่อนเริ่มผลิต |
| `production.cancelStarted` | ✓ | ✗ | ยกเลิกที่กระทบใบเริ่มผลิตแล้ว |
| `loadingTrip.manage` | ✓ | ✓ | จัดเที่ยว/ยืนยันขึ้นของ/กระทบยอด |
| `outstanding.cancel` | ✓ | ✗ | ตัดยอดค้าง + ยกเลิกออเดอร์ที่มีบัตรเปิด |

## 7. Concurrency / Audit

- ทุก mutation: transaction เดียว + CAS (version / timestamp IS NULL) — fail = rollback ทั้งก้อน ไม่มี partial state/audit (พิสูจน์ใน regression ทุก CP)
- ธุรกรรมที่แตะบัตรค้าง (reconcile/ตัด/ยกเลิกออเดอร์ที่มีบัตร) ใช้ **Serializable isolation** — race validate-then-insert ชนกัน = P2034 → "ลองอีกครั้ง"
- AuditLog: module CustomerPO/ProductionOrder/LoadingTrip/Outstanding + `newValue.event` + customerId/branchId/customerPoId ตามกฎ + `correlationId` เมื่อ action เดียวแตะหลาย entity — หน้า "ประวัติ" อ่าน timeline จากตรงนี้ (event ย่อยของเที่ยว เช่น ADD_DROP ไม่ขึ้น timeline รวมแต่ครบใน log)

## 8. อื่นๆ

- **รูปหลักฐาน**: อัปโหลดผ่าน route handler (เกิน limit server action) เก็บ `uploads/` **นอก public/** เสิร์ฟผ่าน GET ที่เช็ค session + กัน path traversal — ลบได้เฉพาะ DRAFT — ⚠ **PRODUCTION-READINESS: deploy จริงต้องมี persistent storage + รวม `uploads/` เข้า backup strategy** (ยังไม่ redesign — บันทึกไว้เป็นเงื่อนไขก่อน deploy)
- **Dashboard**: เปิด query จริงเฉพาะการ์ด "ของค้างส่ง" (จำนวนบัตรเปิด + ชิ้นคงเหลือ กดเข้า `/production/outstanding`) — การ์ดอื่นเป็น placeholder ตาม scope
- **P6 Billing ยังไม่เชื่อม**: ไม่มี FK ไปตาราง Billing ใดๆ — เผื่ออนาคตผ่าน `customerPoLineId` + snapshots บน LoadingLine เท่านั้น
- ใบขึ้นของ A4 แนวตั้ง (เปลี่ยนจากแนวนอนตอน CP7 round 2 — Owner: ประหยัดกระดาษกว่า+สูงพอใส่รายการเยอะกว่า สเปกตั้งต้นใน 01-สรุปรวม.md เขียนไว้ว่าแนวนอนแต่ถูก override ด้วยการตัดสินใจนี้): @page CSS เฉพาะหน้า — **ไม่เพิ่ม key ใน PRINT_PROFILES** (record นั้นถูก enumerate ใน dropdown ของ Billing)

## 9. จุดที่ implementation จริงต่างจากแผน 07 (challenge ที่บันทึกไว้แล้วตอน CP นั้นๆ)

1. **Ledger เดียว `loading_allocations`** แทน `OutstandingAllocation` ที่ผูกบัตรอย่างเดียว — เพราะแบบเดิมบันทึก FRESH/ADHOC fulfillment ไม่ได้ (ขัด lock "ทุก quantity ต้องอธิบายย้อนหลังได้") — ชื่อตรงเอกสาร P1 ต้นฉบับ (กฎข้อ 2) พอดี
2. **ไม่มีคอลัมน์ status text บน LoadingTrip เลย** — facts ล้วน (07 ก็ระบุแนวนี้ แต่ยืนยันว่าทำจริงทั้งระบบ)
3. เพิ่ม `LoadingLine.plannedOutstandingId` (nullable) — บริบท prefill ตอน reconcile ไม่ผูกมัด
4. รูปหลักฐานเก็บที่ระดับ **จุดส่ง (LoadingDrop.photoPaths)** = รูปใบขีดนับต่อจุด ตามกฎ "หลักฐานมาก่อนตัวเลข"
5. ไม่เก็บ mutable `remainingQty` (07 เปิดช่องไว้) — derive เสมอ ตัด drift โดยโครงสร้าง


## 10. CP6 — Queue-first UX (2026-08-30, ไม่กระทบ invariants หัวข้อ 1-9)

Final UAT พบว่า backend ถูกแล้วแต่จุดเริ่มงานผิดกับ workflow จริง (หน้างานคิดจาก "ใบผลิตไหนต้องออกวันนี้" ไม่ใช่ "เที่ยวรถไหน") — refactor เฉพาะ UX entry point เท่านั้น ตาราง/ledger/สูตร demand/no-FIFO/cancellation/cut ในหัวข้อ 1-9 **ไม่เปลี่ยน**

**หน้าใหม่**: `/production/loading` = คิวใบสั่งผลิต active เรียงตามวันที่ต้องส่ง (ไม่ใช่ trip list อีกต่อไป — ย้ายไป `/production/loading/trips` เป็น advanced/secondary view) แต่ละแถวคือใบสั่งผลิต 1 ใบ derive สถานะจาก `LoadingDrop.productionOrderId` (ถ้ามี drop ในรอบ active) + `sheetPrintedAt`/`reconciledAt` ของรอบนั้น

**Fact ใหม่ 2 ชุด (additive, migration `20260830081619_cp6_queue_first_facts`)**:
- `ProductionOrder.productionCompletedAt/By` — ตั้งครั้งเดียว (CAS `updateMany` where `productionCompletedAt: null`) ตอนกดยืนยัน "จะขึ้นออเดอร์นี้วันนี้ใช่ไหม?" ที่หน้า `/production/loading/start/[productionOrderId]` — **นี่คือฝ่ายขึ้นของรับรองว่าผลิตเสร็จ ไม่ใช่ขั้นแยกของหัวหน้าผลิต** (Owner ยืนยันไม่เพิ่มขั้น) คนละ fact กับ loading โดยสิ้นเชิง ห้าม overwrite กัน
- `LoadingDrop.productionOrderId` (nullable) — โยง drop กลับใบสั่งผลิตต้นทาง ใช้คำนวณสถานะคิว · null = งานสต็อก/ไม่มีใบผลิต (ห้ามสร้าง fake order ให้ FK ครบ — `startStockJob` เปิด drop เปล่าตรงๆ)
- `LoadingTrip.sheetPrintedAt/By/Version` — fact "พิมพ์ใบขึ้นของแล้ว" แยกจาก loaded/reconciled โดยสิ้นเชิง (พิมพ์ ≠ ขึ้นของ/ส่งออก ไม่แตะ quantity ใดๆ) ตั้งผ่าน `confirmSheetPrinted` หลัง print-dialog กลับมา (pattern เดียวกับใบสั่งผลิต S4: เปิด dialog ก่อนเสมอ แล้วถามยืนยัน — ไม่ใช้ `afterprint` ตัดสินเอง) `sheetPrintedVersion` ใช้เตือนถ้าแผนถูกแก้หลังพิมพ์ครั้งล่าสุด (พิมพ์ใหม่ได้ ไม่บังคับ)

**Flow ที่มองเห็น**: กำลังผลิต → กำลังขึ้นของ (DRAFT) → [พิมพ์ใบขึ้นของแล้ว · รอบันทึกผล — ถ้าพิมพ์] → สินค้าถูกส่งออกแล้ว

**การรวม confirm+reconcile เป็น `finalizeLoadingTrip` เดียว** — เดิม CP2/CP3 แยก 2 หน้า/2 tx (ยืนยันขึ้นของจริง → กระทบยอด) CP6 รวมเป็น tx Serializable เดียวที่หน้า `/production/loading/[id]/finalize` (ปุ่ม "ยืนยันส่งออก"): ตรวจ photo ครบ + Σ allocation = qtyLoaded เป๊ะทุกรายการ + FRESH ≤ capacity + OUTSTANDING ≤ remaining → เขียนยอดจริง + ledger + ปิด/เปิดบัตรค้าง + ตั้ง `loadedAt`/`reconciledAt` **พร้อมกันในทีเดียว** (เข้มกว่าเดิมที่แยก 2 ขั้น — status "ส่งออกแล้ว" เกิดเฉพาะเมื่อทั้งก้อนสำเร็จจริง) ฟอร์มฝั่ง client เติมแถวการตัดให้อัตโนมัติจากบริบทแผนแต่คนแก้ได้ทุกอย่าง (ไม่ใช่ FIFO — เป็นแค่ค่าเริ่มต้นให้ตรงกับที่วางแผนไว้แล้ว) — action `confirmLoadingTrip`/`reconcileLoadingTrip`/`correctLoadingLineQty`/`addAdhocLine`/`removeAdhocLine` เดิมถูกลบทิ้ง แทนที่ด้วย `finalizeLoadingTrip`/`addAdhocPlannedLine` (ADHOC ย้ายมาคีย์ได้ตั้งแต่ช่วงเตรียม DRAFT ด้วย ไม่ต้องรอถึง reconcile)

**หน้าที่เพิ่ม**: `/production/loading/start/[productionOrderId]` (ทวนรายการจาก Rev ปัจจุบัน + ยืนยัน + เลือกรอบใหม่/รอบเดิม) · `/production/loading/start-stock` (งานไม่มีใบผลิต) · `/production/loading/[id]/finalize` (บันทึกผลขึ้นของ)

**Regression**: 20 assertions ครอบคลุม idempotent start / print CAS+stale-version / finalize validation gates ทั้งหมด (photo/sum/capacity/remaining) / partial fulfillment เปิดบัตรค้าง / stock job / cancelled-source block / ปิดบัตรพอดี — รันกับ dev DB จริงแล้วลบข้อมูลทดสอบเองครบ
