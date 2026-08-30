# 08 — P2 Current Truth (สถาปัตยกรรมตามที่ implement จริง — ปิด CP5 2026-08-30)

**เอกสารนี้คือ source of truth ปัจจุบันของ P2** — เอกสาร 04 (discovery) และ 06 (review) เป็นข้อเสนอระหว่างทางที่ถูก supersede บางจุดแล้ว (มีหมายเหตุหัวไฟล์ชี้มาที่นี่) · เอกสาร 07 คือแผนที่อนุมัติ — จุดที่ implementation จริงต่างจาก 07 ระบุไว้ในหัวข้อ 9 ท้ายไฟล์นี้

## 1. Lifecycle (timestamp facts ล้วน — ไม่มี business guard ผูกกับ status text ที่แอดมินแก้ได้)

```
ออเดอร์ลูกค้า (CustomerPO):   ปกติ → ยกเลิก (cancelledAt — terminal, ไม่มี reopen)
ใบสั่งผลิต (ProductionOrder): รอเริ่มผลิต → กำลังผลิต (productionStartedAt) → (ยกเลิกได้ทุกจังหวะ terminal)
เที่ยวรถ (LoadingTrip):       วางแผน (DRAFT) → ขึ้นของแล้ว (loadedAt) → กระทบยอดแล้ว (reconciledAt)
                              ยกเลิกได้เฉพาะช่วง DRAFT (cancelledAt)
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
- ใบขึ้นของ A4 แนวนอน: @page CSS เฉพาะหน้า — **ไม่เพิ่ม key ใน PRINT_PROFILES** (record นั้นถูก enumerate ใน dropdown ของ Billing)

## 9. จุดที่ implementation จริงต่างจากแผน 07 (challenge ที่บันทึกไว้แล้วตอน CP นั้นๆ)

1. **Ledger เดียว `loading_allocations`** แทน `OutstandingAllocation` ที่ผูกบัตรอย่างเดียว — เพราะแบบเดิมบันทึก FRESH/ADHOC fulfillment ไม่ได้ (ขัด lock "ทุก quantity ต้องอธิบายย้อนหลังได้") — ชื่อตรงเอกสาร P1 ต้นฉบับ (กฎข้อ 2) พอดี
2. **ไม่มีคอลัมน์ status text บน LoadingTrip เลย** — facts ล้วน (07 ก็ระบุแนวนี้ แต่ยืนยันว่าทำจริงทั้งระบบ)
3. เพิ่ม `LoadingLine.plannedOutstandingId` (nullable) — บริบท prefill ตอน reconcile ไม่ผูกมัด
4. รูปหลักฐานเก็บที่ระดับ **จุดส่ง (LoadingDrop.photoPaths)** = รูปใบขีดนับต่อจุด ตามกฎ "หลักฐานมาก่อนตัวเลข"
5. ไม่เก็บ mutable `remainingQty` (07 เปิดช่องไว้) — derive เสมอ ตัด drift โดยโครงสร้าง
