# 04 — P2 Discovery: การขึ้นของและจัดส่ง (Loading & Delivery)

> **⚠ SUPERSEDED (2026-08-30):** เอกสารนี้เป็น discovery ระหว่างทาง — สถาปัตยกรรมจริงหลายจุดเปลี่ยนไปแล้ว (เพิ่ม LoadingDrop, ledger เดียว loading_allocations, ไม่มี status text ฯลฯ) **อ่าน `08-P2-current-truth.md` เป็น source of truth แทนเสมอ**


**สถานะ: ข้อเสนอเพื่อ Owner review เท่านั้น — ยังไม่ implement, ไม่มี Prisma schema/migration ใดๆ ในรอบนี้**

เขียนขึ้นหลังปิด S6 (P1 พร้อม final confirm) ตามที่ Owner ขอให้ "inspect + วางแผน P2 ได้ แต่ห้าม implement/schema/migration" — อิงกฎธุรกิจล่าสุดที่ Owner ให้มาตรงๆ ทุกข้อ ไม่เดาเพิ่ม

---

## 1. Domain Entities ที่เสนอ

### `LoadingTrip` (เที่ยวรถ) — global, ไม่ผูกกับออเดอร์เดียว
ตาม "รถหนึ่งเที่ยวส่งหลายจังหวัด/หลายลูกค้าได้" — เที่ยวรถเป็น identity อิสระ มี `tripNo` (running number แบบเดียวกับ `getNextSeq`/`formatDocNumber` เดิม), วันที่, คนขับ/ทะเบียนรถ (ถ้ามี), สถานะ, ผู้สร้าง — คล้าย `ProductionOrder` ตรงที่เป็น "identity คงที่" ส่วนเนื้อหาจริง (รายการที่ขึ้น) แยกอยู่ใน `LoadingLine`

สถานะที่เสนอ: `DRAFT` (กำลังวางแผน/ยังไม่ขึ้นจริง) → `LOADED` (ขึ้นของจริงแล้ว มีรูปหลักฐานครบ) → `RECONCILED` (จัดสรรยอดกับของค้าง/ใบผลิตเสร็จ) — ไม่มี "ย้อนสถานะ" (เหมือน `ProductionOrder.productionStartedAt` ที่เป็น one-way gate)

### `LoadingLine` (รายการที่ขึ้นในเที่ยวนี้)
หน่วยที่เล็กที่สุด — 1 แถวต่อ "ของ 1 ชนิด/ไซส์ ที่ขึ้นไปหาลูกค้า 1 ราย"

- `customerId`/`branchId` — ปลายทางของแถวนี้ (เที่ยวเดียวมีได้หลายปลายทาง)
- `customerPoLineId` — **nullable** (อ้างอิงกลับไป CustomerPO ถ้ามี — เพื่อคำนวณ Production/Outstanding ได้)
- `sourceProductionItemId` — **nullable** อ้างอิง ProductionItem/Revision ที่ผลิตจริง (traceability — เช่นถ้าผลิตผิดสอบย้อนได้ว่าขึ้นจาก Rev ไหน)
- `productLabel`/`sku` snapshot — กันชื่อเปลี่ยนทีหลัง (Pattern เดียวกับ `ProductionItem.productionLabelSnapshot`)
- `qtyLoaded` — จำนวนที่นับได้จริงหน้างาน (ตัวเลขนี้คือ "ขึ้นรถ" ในกฎ "ผลิต ≠ ขึ้นรถ ≠ ค้าง")
- `sourceType`: `FRESH` (ตัดจากผลิตครั้งนี้ตรงๆ) / `OUTSTANDING` (เอาของค้างเก่ามาขึ้น) / `ADHOC` (ของที่ไม่มี ProductionItem รองรับเลย — ตาม "Loading Addition หน้างานต้องรองรับ แม้ไม่มี ProductionItem" คีย์ `customerPoLineId`/`sourceProductionItemId` เป็น null ทั้งคู่ กรอกแค่ชื่อ+จำนวนหน้างาน คล้าย `CustomerPOLine.lineKind = UNRESOLVED` ที่มีอยู่แล้ว)
- `photoPaths` — รูปหลักฐาน (ตาม `poImagePaths` pattern เดิมใน `CustomerPO` — เก็บ path array ไปก่อน ค่อย migrate เป็น Attachment model ทีหลังเหมือนที่ comment ใน schema บอกไว้แล้ว)
- `reconciledAt`/`reconciledById`

### `Outstanding` (ของค้าง)
แถวนี้แทน "ยอดที่ผลิต/สั่งไว้แต่ยังไม่ถึงมือลูกค้า" — เกิดขึ้นตอน **reconcile** เท่านั้น (ไม่ใช่ตอนออกใบผลิต) เพราะถ้าขึ้นครบในเที่ยวเดียวไม่ต้องมีของค้างเลย

- `customerPoLineId` — anchor คือ CustomerPOLine (ไม่ใช่ ProductionItem) เพราะ CustomerPO คือ source of truth ตัวจริงของ "ลูกค้าต้องการเท่าไหร่" ตามกฎ P1 ที่เพิ่งยืนยันรอบ S6 (ProductionItem อาจไม่ตรงกับยอดล่าสุดถ้า Owner แก้ P.O. แล้วไม่ได้ออก Rev ใหม่)
- `qtyOriginal` — จำนวนที่ค้าง ณ ตอนเปิดรายการนี้ **ห้ามแก้เลขนี้อีกเลยตลอดชีวิตแถว** (กฎข้อ 4 "ห้ามแก้ตัวเลขในใบเดิม")
- `openedAt` — วันที่เริ่มค้าง (คำนวณ "อายุของค้าง" จากตรงนี้เสมอ)
- `status`: `OPEN` / `CLOSED` (closed เมื่อ `qtyOriginal - SUM(allocations) = 0`) / `CANCELLED` (ตัดโดยได้รับอนุมัติ)
- `cancelReason`/`cancelledById`/`cancelledAt` — เมื่อ CANCELLED (กฎข้อ 7 "ตัดของค้างต้องอนุมัติ")

### `OutstandingAllocation` (การจัดสรร — junction table)
บันทึกว่า "เที่ยวไหน/แถวไหน เอาไปตัดของค้างรายการไหน จำนวนเท่าไหร่" — append-only ไม่มีการแก้/ลบ

- `outstandingId`, `loadingLineId`, `qtyAllocated`, `allocatedById`, `allocatedAt`

**ทำไมออกแบบแบบนี้แทนที่จะ "ปิดใบเดิม สร้างใบใหม่ด้วยจำนวนที่เหลือ" ตามตัวอักษรกฎข้อ 4**: กฎข้อ 4 เขียนขึ้นในบริบทเอกสารกระดาษทั่วไป (ของ Billing เดิม) ซึ่งพอแปลงเป็น data model แล้ว "ห้ามแก้ตัวเลขในใบเดิม" กับ "อายุไม่รีเซ็ต" ทำได้ตรงไปตรงมากว่าด้วยวิธี **แถวเดียวคงที่ + allocation แยกเป็น log ต่อเนื่อง** (ไม่ต้องมี parent/child chain ให้ซับซ้อน) เพราะ `qtyOriginal`/`openedAt` ไม่ถูกแตะเลยไม่ว่าจะทยอยขึ้นกี่เที่ยวก็ตาม ส่วน "จำนวนที่เหลือ" เป็นค่า derive (`qtyOriginal - SUM(allocations)`) ไม่ใช่ค่าที่เก็บ/แก้ตรงๆ — **นี่คือจุดที่อยากให้ Owner ยืนยันก่อน implement จริง** ว่าตรงเจตนารมณ์กฎข้อ 4 หรือ Owner อยากได้พฤติกรรม "ปิดใบเดิมจริงๆ สร้างแถวใหม่" ตามตัวอักษร (ซึ่งทำได้เหมือนกัน แต่ต้องมี `rootOutstandingId` ไว้สืบอายุย้อนไปถึงต้นทาง)

---

## 2. Workflow หลัก

```
1. สร้างเที่ยวรถ (DRAFT) → เลือกปลายทาง/ลูกค้าที่จะส่งเที่ยวนี้ (หลายรายได้)
2. เพิ่มรายการที่จะขึ้น ต่อปลายทาง:
   a. ค้นจาก ProductionItem ที่ยังไม่เคย/ยังขึ้นไม่ครบ (FRESH)
   b. ค้นจาก Outstanding ที่ยังเปิดอยู่ (OUTSTANDING — ของค้างเก่าขึ้นเที่ยวหลังได้ตามกฎ)
   c. เพิ่มเอง ไม่มี ProductionItem รองรับ (ADHOC)
3. ขึ้นของจริงหน้างาน → ถ่ายรูปหลักฐานแนบทุกแถว (บังคับก่อนไปขั้นต่อไป — กฎข้อ 5)
4. กด "ยืนยันขึ้นของแล้ว" → LoadingTrip: DRAFT → LOADED (กรอกแค่ "จำนวนรวมที่ขึ้นจริง" ต่อแถว
   ไม่ใช่ OCR นับทีละชิ้น ตาม "V1 อ่านจำนวนรวม ไม่ OCR tally")
5. Reconcile: staff เลือกเองว่าแต่ละแถวที่ขึ้น ตัดกับอะไร (ของใหม่ตรงๆ / ของค้างรายการไหน
   จำนวนเท่าไหร่ — ไม่บังคับ FIFO) → สร้าง OutstandingAllocation ตามที่เลือก
   → ถ้ายอดที่ผลิตจริง (อิง CustomerPOLine.qtyCurrent) ยังเหลือมากกว่าที่ขึ้น+allocate ไปแล้ว
     ทั้งหมด (ทุกเที่ยวที่ผ่านมา) → เปิด/คง Outstanding เดิมไว้ (หรือเปิดใหม่ถ้ายังไม่เคยมี)
6. LoadingTrip: LOADED → RECONCILED
7. พิมพ์ใบขึ้นของ (A4 แนวนอน) — ทำได้ทุกขั้นตอนตั้งแต่ DRAFT (preview) ไม่ผูกกับสถานะ
```

---

## 3. จุดที่ต้อง Owner ตัดสินก่อน implement จริง

1. **Outstanding lifecycle**: แถวเดียวคงที่ + allocation แยก (ที่เสนอข้างบน) หรือ "ปิดใบเดิม สร้างใบใหม่" ตามตัวอักษร — มีผลกับ query "ของค้างทั้งหมดของลูกค้า X" ว่านับจากกี่แถว
2. **เลขไหนคือ "ผลิต" ตัวจริงที่ใช้เทียบตอน reconcile**: `CustomerPOLine.qtyCurrent` (ล่าสุดเสมอ) หรือ `ProductionItem.qty` ของ Revision ปัจจุบัน (สิ่งที่บอกฝ่ายผลิตจริง) — ถ้า Owner เคยแก้ P.O. แต่ไม่ได้ออก Rev ใหม่ (กฎที่เพิ่งยืนยัน S6 ว่าไม่บังคับ) สองค่านี้จะไม่ตรงกัน ต้องมี UI เตือนความต่างนี้ตอน reconcile ด้วยหรือไม่
3. **"หัวหน้า" ในกฎข้อ 7 (ตัดของค้างต้องอนุมัติ)** — เป็น Role ใหม่ที่ยังไม่มีในระบบ (CLAUDE.md ยังใช้ 3 Role เดิม) หรือหมายถึง OWNER_ADMIN คนใดคนหนึ่งที่ทำหน้าที่หัวหน้า (ระบบ gate แค่ OWNER_ADMIN พอ ไม่ต้องสร้าง Role ใหม่)? เสนอ default = gate ที่ `OWNER_ADMIN` เท่านั้นไปก่อน (ตรงกับ stop condition คืนนี้ที่ห้ามสร้าง role ใหม่)
4. **"เที่ยวรถ" ต้องมี stop/ปลายทางเป็น entity แยกไหม** (สำหรับพิมพ์ใบขึ้นของแยกตามลำดับจุดส่ง) หรือพอแค่ group by `customerId`/`branchId` บน `LoadingLine` ตรงๆ (เสนอแบบหลังไปก่อน — เพิ่ม entity ทีหลังได้ถ้าจำเป็นจริง ไม่ over-engineer ล่วงหน้า)
5. **Ad-hoc (ADHOC) ต้อง resolve ย้อนกลับเป็นสินค้าจริงทีหลังไหม** (เหมือน `RESOLVE_PRODUCT` ของ CustomerPO) หรือ V1 ปล่อยเป็น free-text ถาวร
6. **แก้ไขหลัง RECONCILED ทำได้ไหม** — ถ้าพนักงานกรอกผิดหลัง reconcile แล้ว จะแก้ยังไงแบบไม่ทำลาย audit trail (เสนอ: ห้ามแก้ตรงๆ ต้องสร้างรายการ "ปรับปรุง" ใหม่ชดเชย เหมือนหลักการ Revision immutable ที่ใช้อยู่ทั้งระบบ)

---

## 4. Audit / Idempotency

- `LoadingTrip` ควรมี `version` field แบบเดียวกับ `CustomerPO.version` (optimistic lock กัน 2 คนแก้พร้อมกัน)
- Reconcile action ต้อง transactional เดียวจบ (สร้าง allocation หลายแถว + อัปเดต Outstanding status พร้อมกัน)
- บังคับมีรูปอย่างน้อย 1 ก่อนอนุญาต LOADED → RECONCILED (เช็คที่ server action ไม่ใช่แค่ UI — กฎข้อ 5 "หลักฐานมาก่อนตัวเลข")
- ตัด/cancel Outstanding ต้องผ่าน permission ใหม่ (เช่น `outstanding.cancel`) เพิ่มใน Matrix เดิม (ไม่ใช่ Role ใหม่ — แค่ Permission string ใหม่ตาม pattern เดิม) จำกัดเฉพาะ OWNER_ADMIN
- AuditLog: เพิ่ม `module: "LoadingTrip"` / `"Outstanding"` reuse ต่อจากที่มีอยู่ — หน้า "ประวัติ" (S5) ขยาย `classify()`/`EVENT_LABELS` รองรับ event ใหม่ได้ทันทีโดยไม่ต้องรื้อโครงสร้างเดิม (สร้างเที่ยวรถ/ยืนยันขึ้นของ/reconcile/ตัดของค้าง)

---

## 5. หน้าจอหลักที่ควรมี (mobile-first ตามเดิม)

| หน้า | เนื้อหา |
|---|---|
| รายการเที่ยวรถ | list + สถานะ + ปลายทางย่อ |
| สร้าง/แก้เที่ยวรถ | เพิ่มปลายทาง + เพิ่มรายการ (FRESH/OUTSTANDING/ADHOC) + แนบรูป |
| ยืนยันขึ้นของ | กรอกจำนวนรวมต่อแถว + เช็ครูปครบ |
| Reconcile | จัดสรรยอดต่อแถว ↔ Outstanding (มี warning ถ้า CustomerPOLine.qtyCurrent ≠ ProductionItem.qty ล่าสุด) |
| ของค้าง (Outstanding list) | filter ลูกค้า/อายุ, ดูประวัติ allocation, ปุ่มตัด (OWNER_ADMIN) |
| ใบขึ้นของ (พิมพ์ A4 แนวนอน) | ต้องเพิ่ม page-size variant แนวนอนใน `print-settings.ts` (ปัจจุบันมีแค่ portrait A4/9×11 ต่อเนื่อง) |
| ประวัติ (ต่อยอด S5) | เพิ่ม event LoadingTrip/Outstanding เข้า timeline เดิม |

---

## 6. ขอบเขตที่ยังไม่แตะใน P2 รอบแรก (ตามที่ Owner ระบุ)

- ไม่เชื่อม Billing (invoice/ตัดสต๊อกทางบัญชี) เลยในรอบแรก
- ไม่มี Role ใหม่ (ใช้ 3 Role เดิม + Permission string ใหม่เท่าที่จำเป็น)
- ไม่ทำ OCR อ่านจำนวนจากรูป (V1 = คนกรอกตัวเลขรวมเอง รูปเป็นแค่หลักฐานประกอบ)
