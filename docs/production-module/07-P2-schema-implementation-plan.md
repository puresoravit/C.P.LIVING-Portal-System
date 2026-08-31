# 07 — P2 Schema + Implementation Plan (เพื่อ Owner Review — ยังไม่ migrate/implement)

**สถานะ: ข้อเสนอสุดท้ายก่อนลงมือ** — schema ในเอกสารนี้ยังไม่ถูกเขียนลง `schema.prisma` และยังไม่มี migration ใดๆ ถูกสร้าง รอ Owner อนุมัติเอกสารนี้ก่อนทุกกรณี

## 0. Owner Decisions ที่ตัดสินแล้ว (2026-08-30) — บันทึกเป็นทางการ

| # | คำตัดสิน |
|---|---|
| D1 | Outstanding record เดียวต่อเนื่องตลอดอายุ + ทุกการขึ้น/ตัด/ปรับเป็น immutable history · ห้าม reset age จาก partial fulfillment |
| D2 | อายุของค้างเริ่มนับจาก **reconcile ครั้งแรกที่พบว่าไม่ครบและ Outstanding ถูกสร้างจริง** — Order Age กับ Outstanding Age เป็นคนละความหมาย |
| D3 | มี Cancel Production Order แยกใบ · cascade **ทางเดียว**: Customer Order → Production Order เท่านั้น ห้ามย้อนขึ้น |
| D4 | ไม่มี reopen ใน V1 — cancel เป็น terminal fact ห้ามล้าง `cancelledAt` |
| D5 | Cancel หลังเริ่มผลิตได้ แต่ warning สูง + confirm + reason + audit + ห้ามลบ/ย้อน Production history — และให้ตรวจ permission ก่อน (ดูข้อ 1) |

## 1. ผลตรวจ permission `customerPo.cancel` + ข้อเสนอ boundary (ตามคำสั่ง D5)

**ผลตรวจจริง** (`src/lib/permissions.ts` บรรทัด 53, 77): permission นี้ถูกถือโดย **ทั้ง OWNER_ADMIN และ BILLING_STAFF** — คือพนักงานทั่วไปถืออยู่ → ตามเงื่อนไข Owner ต้องเสนอ boundary ที่ปลอดภัยกว่าสำหรับ cancel หลังเริ่มผลิต:

| Permission | ใครถือ | ใช้เมื่อไหร่ |
|---|---|---|
| `customerPo.cancel` *(เดิม — ไม่แก้)* | ADMIN + STAFF | ยกเลิกออเดอร์ที่**ยังไม่มีใบสั่งผลิตใดเริ่มผลิต** |
| `productionOrder.cancel` *(ใหม่)* | ADMIN + STAFF | ยกเลิกใบสั่งผลิตแยกใบที่**ยังไม่เริ่มผลิต** (D3) |
| `production.cancelStarted` *(ใหม่)* | **OWNER_ADMIN เท่านั้น** | ต้องมี**เพิ่มเติม**เมื่อการยกเลิก (ไม่ว่าทางไหน) กระทบใบสั่งผลิตที่ `productionStartedAt ≠ null` — พนักงานกดจะเจอข้อความ "ใบนี้เริ่มผลิตแล้ว ต้องให้ผู้ดูแลระบบเป็นผู้ยกเลิก" |
| `outstanding.cancel` *(ใหม่)* | **OWNER_ADMIN เท่านั้น** | ตัดของค้าง (กฎข้อ 8 เดิม: "ตัดของค้างต้องอนุมัติ — หัวหน้า/ผู้ดูแลระบบเท่านั้น") |

เป็นการเพิ่ม **permission string 3 ตัวใน matrix เดิม** ตาม pattern ที่มีอยู่ (`productionMasterSpec.manage` ก็ถูกเพิ่มแบบนี้) — **ไม่ใช่ role ใหม่ ไม่ใช่ architecture ใหม่** — เสนอไว้ตรงนี้เพื่อรอ Owner อนุมัติพร้อมเอกสาร ไม่ทำเองเงียบๆ

## 2. Relation diagram (ภาษาคน)

```
ออเดอร์ลูกค้า (CustomerPO) ─── บรรทัดสินค้า (CustomerPOLine = ยอดจริงที่ลูกค้าต้องได้)
        │                              │
        │ ออกใบสั่งผลิต                  │ อ้างกลับ (nullable)
        ▼                              │
ใบสั่งผลิต (ProductionOrder) ── Rev ── ProductionItem (สิ่งที่สั่งผลิตจริง — immutable ต่อ Rev)
                                       │
                                       │ อ้างกลับ (nullable — ของ ADHOC ไม่มี)
                                       ▼
เที่ยวรถ (LoadingTrip) ── จุดส่ง (LoadingDrop: ลูกค้า/สาขา + ลำดับ + รูปใบขีดนับ)
                                └── รายการขึ้นของ (LoadingLine: แผนจะขึ้น / ขึ้นจริง)
                                            │
                                            │ ตอนกระทบยอด คนเลือกเองว่าตัดจากไหน
                                            ▼
                              สมุดจดการตัด (OutstandingAllocation — เพิ่มได้อย่างเดียว ห้ามแก้/ลบ)
                                            │
                                            ▼
                              บัตรของค้าง (OutstandingDelivery: เลขตั้งต้น+วันเริ่มค้าง ห้ามแก้ตลอดชีวิต)
                                            └── ผูกกลับ CustomerPOLine (รู้เสมอว่าค้างจากออเดอร์ไหน)
```

อ่านทวนกลับ: *ของค้างใบนี้มาจากบรรทัดไหนของออเดอร์ไหน (`customerPoLineId`) · เกิดจากเที่ยวไหน (`openedFromTripId`) · เริ่มค้างเมื่อไร (`openedAt` — แก้ไม่ได้) · เคยเอาไปกี่ครั้ง ครั้งละเท่าไร ใครเลือก (allocation แถวต่อครั้ง) · เคยถูกตัดเพราะอะไร (allocation ชนิด CUT + เหตุผล) · เหลือเท่าไร (qtyOriginal − Σ)* — ครบทุกข้อของ D1

**หมายเหตุการตั้งชื่อ** (กฎ CLAUDE.md เรื่องชนความหมายมาตรฐาน — grep แล้วไม่ชนชื่อจริงทั้งหมด): ใช้ `OutstandingDelivery` ไม่ใช่ `Outstanding` เฉยๆ เพราะในโลกบัญชี/ERP คำว่า outstanding ลอยๆ หมายถึง**ยอดเงินค้างชำระ** — วันหน้าถ้าเชื่อม Billing (P6) จะมี outstanding ทางการเงินโผล่มาแน่ ตั้งชื่อให้แยกขาดตั้งแต่วันนี้ (บทเรียนเดียวกับ `PurchaseOrder` → `CustomerPO`)

## 3. Proposed Prisma Schema (additive ทั้งหมด — ยังไม่เขียนลงไฟล์จริง)

```prisma
// ---------- P2: การขึ้นของและจัดส่ง ----------

enum LoadingSourceType {
  FRESH        // ตัดจากออเดอร์/ใบผลิตรอบนี้ตรงๆ
  OUTSTANDING  // เอาของค้างเก่ามาขึ้น
  ADHOC        // ของหน้างาน ไม่มี ProductionItem รองรับ (free text V1)
}

enum AllocationKind {
  LOAD  // นำขึ้นรถจริง (เกิดจาก reconcile)
  CUT   // ตัดของค้างแบบอนุมัติ (กฎข้อ 8 — outstanding.cancel เท่านั้น, reason บังคับ)
}

model LoadingTrip {
  id             String    @id @default(cuid())
  tripNo         String    @unique // getNextSeq("TRIP", YYYYMM) → TRIP-202609-00001 (reuse DocumentSequence เดิม)
  tripDate       DateTime  // วันออกรถตามแผน
  vehicleNote    String?   // ทะเบียน/คนขับ — free text V1 (ไม่ทำ master รถก่อนเวลา)
  note           String?
  version        Int       @default(0) // optimistic lock (pattern CustomerPO.version)
  // สถานะ = ข้อเท็จจริง timestamp ล้วน ไม่มีคอลัมน์ status text เลย (บทเรียน S4: guard ห้ามผูกกับ
  // ข้อความที่แอดมินแก้ได้) — DRAFT = ทุกอันว่าง, LOADED = loadedAt, RECONCILED = reconciledAt
  loadedAt       DateTime? // ยืนยันขึ้นของจริงแล้ว — one-way
  loadedById     String?
  reconciledAt   DateTime? // กระทบยอดแล้ว — one-way
  reconciledById String?
  cancelledAt    DateTime? // ยกเลิกได้เฉพาะช่วง DRAFT (ก่อน loadedAt) — ของจริงยังไม่ออกจากโกดัง
  cancelledById  String?
  cancelReason   String?
  createdById    String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  drops LoadingDrop[]

  @@map("loading_trips")
}

model LoadingDrop {
  id         String      @id @default(cuid())
  tripId     String
  trip       LoadingTrip @relation(fields: [tripId], references: [id])
  seq        Int         // ลำดับจุดส่งในเที่ยว (ไปไหนก่อน-หลัง)
  customerId String      // เที่ยวเดียวหลายลูกค้า/สาขาได้ — ปลายทางอยู่ระดับ Drop
  branchId   String?
  photoPaths String[]    // รูปใบขึ้นของที่ขีดนับแล้วของจุดส่งนี้ (กฎข้อ 6 — pattern poImagePaths)
  note       String?

  lines LoadingLine[]

  @@unique([tripId, seq])
  @@map("loading_drops")
}

model LoadingLine {
  id               String            @id @default(cuid())
  dropId           String
  drop             LoadingDrop       @relation(fields: [dropId], references: [id])
  sourceType       LoadingSourceType
  customerPoLineId String?           // null เฉพาะ ADHOC — ตัวเชื่อมยอด "ลูกค้าต้องได้" (identity ถาวร เพราะ line เป็น soft-delete)
  productionItemId String?           // ProductionItem ที่ผลิตจริง (สอบย้อนถึง Rev ที่ผลิต) — null ได้
  productId        String?           // snapshot ระดับ id (ไม่ FK แข็ง — ของ ADHOC ไม่มี)
  skuSnapshot      String?
  labelSnapshot    String            // ชื่อที่แสดง ณ วันขึ้นของ (pattern productionLabelSnapshot) / free text ของ ADHOC
  size             String?
  qtyPlanned       Int               // แผนจะขึ้น (กรอกตอนจัดเที่ยว)
  qtyLoaded        Int?              // ขึ้นจริง (คนยืนยันยอดรวมเองตอน confirm — null จนกว่าจะยืนยัน)
  note             String?

  allocations OutstandingAllocation[]

  @@map("loading_lines")
}

model OutstandingDelivery {
  id               String    @id @default(cuid())
  customerPoLineId String    // anchor = CustomerPOLine (source of truth ของยอดลูกค้า)
  qtyOriginal      Int       // เลขตั้งต้น — ห้ามแก้ตลอดชีวิตแถว (D1)
  openedAt         DateTime  @default(now()) // จุดเริ่มนับอายุ (D2: ตอน reconcile แรกที่พบว่าไม่ครบ) — ตั้งครั้งเดียว
  openedById       String
  openedFromTripId String?   // เที่ยวที่ทำให้รู้ว่าค้าง (สอบย้อน)
  closedAt         DateTime? // ตั้งใน tx เดียวกับ allocation ที่ทำให้ Σ ครบ qtyOriginal — one-way
  createdAt        DateTime  @default(now())

  allocations OutstandingAllocation[]

  @@map("outstanding_deliveries")
}

model OutstandingAllocation {
  id            String              @id @default(cuid())
  outstandingId String
  outstanding   OutstandingDelivery @relation(fields: [outstandingId], references: [id])
  loadingLineId String?             // LOAD = ผูกเที่ยวเสมอ · CUT = null (ตัดโดยไม่มีการขึ้นของ)
  loadingLine   LoadingLine?        @relation(fields: [loadingLineId], references: [id])
  kind          AllocationKind
  qty           Int                 // > 0 เสมอ
  reason        String?             // บังคับเมื่อ kind = CUT
  actorId       String              // "ใครเลือก" (D1)
  createdAt     DateTime            @default(now())

  @@map("outstanding_allocations")
}
```

**คอลัมน์เพิ่มบนตารางเดิม (Cancellation — จาก doc 05 ที่อนุมัติแนวทางแล้ว):**

```prisma
model CustomerPO {        // เพิ่ม 3 คอลัมน์ nullable
  cancelledAt   DateTime?
  cancelledById String?
  cancelReason  String?
}
model ProductionOrder {   // เพิ่ม 3 คอลัมน์ nullable (D3: ยกเลิกแยกใบได้ ใช้ field ชุดเดียวกัน)
  cancelledAt   DateTime?
  cancelledById String?
  cancelReason  String?
}
enum RevisionChangeType { // เพิ่ม 1 ค่า
  CANCEL_ORDER
}
```

**ไม่มี**: FK ไปตาราง Billing ใดๆ · การแก้/ลบคอลัมน์เดิม · ตาราง sequence ใหม่ (ใช้ DocumentSequence เดิม docType "TRIP" — ตรวจแล้วยังว่าง) · status text column ใหม่

## 4. State transitions

```
LoadingTrip:   วางแผน (DRAFT) ──ยืนยันขึ้นของ──▶ ขึ้นแล้ว (LOADED) ──กระทบยอด──▶ กระทบแล้ว (RECONCILED)
                    │ ยกเลิกได้เฉพาะตรงนี้ (ของยังไม่ออกจริง)
                    ▼
                ยกเลิกแล้ว
   หลัง LOADED ห้ามยกเลิก/ห้ามแก้รายการ — ความจริงเกิดแล้ว แก้ผ่านการกระทบยอด
   หลัง RECONCILED ทุกอย่าง immutable — แก้ผิดใช้ allocation ปรับปรุง (CUT/LOAD เพิ่ม) ไม่แตะแถวเดิม

OutstandingDelivery:  เปิด (OPEN) ──Σ allocation = qtyOriginal──▶ ปิด (closedAt)
   ปิดได้ 2 ทาง: ขึ้นครบ (LOAD จนครบ) หรือ ตัดแบบอนุมัติ (CUT + เหตุผล + admin) หรือผสมกัน
   ไม่มี reopen — เลข/วันที่ตั้งต้นไม่ถูกแตะไม่ว่ากรณีใด (D1)

Cancellation (จาก 05 + D3):
   CustomerPO: ปกติ ──▶ ยกเลิก (terminal, D4)   ── cascade ──▶ ProductionOrder ทุกใบที่ยัง active
   ProductionOrder: ปกติ ──▶ ยกเลิก (terminal)  ── ห้าม cascade ขึ้น ── CustomerPO ยัง active ออกใบใหม่ได้
```

## 5. Transaction boundaries

**Reconcile (ธุรกรรมใหญ่สุดของ P2 — `db.$transaction` เดียว):**
```
1. CAS: updateMany LoadingTrip WHERE id AND reconciledAt IS NULL AND loadedAt IS NOT NULL
        AND cancelledAt IS NULL → SET reconciledAt/reconciledById
   count=0 → กระทบไปแล้ว (idempotent no-op) หรือยังไม่ยืนยันขึ้นของ (error ข้อความชัด)
2. Validate ใน tx (server-side ทั้งหมด ไม่เชื่อ UI):
   - ทุก line: qtyLoaded ≠ null
   - ทุก drop ที่มี line: photoPaths ≥ 1 (กฎข้อ 6 หลักฐานมาก่อนตัวเลข)
   - line ชนิด OUTSTANDING: Σ allocation ที่ผู้ใช้เลือก = qtyLoaded (ทุกชิ้นต้องชี้ที่มา — คนเลือก ไม่มี FIFO)
3. สร้าง OutstandingAllocation (kind=LOAD) ตามที่คนเลือก
4. ปิด OutstandingDelivery ที่ Σ ครบ → closedAt (ใน tx เดียวกัน — ไม่มีจังหวะครึ่งๆ กลางๆ)
5. เช็ค shortfall ต่อ customerPoLineId ที่เกี่ยว: ยอดลูกค้าต้องได้ (qtyCurrent) − Σ qtyLoaded
   สะสมทุกเที่ยวที่ reconcile แล้ว − Σ CUT > 0 และไม่มีบัตร OPEN อยู่ → เปิด OutstandingDelivery ใหม่
   (openedAt = ตอนนี้ ตาม D2, openedFromTripId = เที่ยวนี้)
6. AuditLog: RECONCILE 1 แถว + OPEN_OUTSTANDING ต่อบัตรที่เปิด — correlationId เดียวกันหมด
```

**Cancel CustomerPO** (จาก 05 + D3/D5): tx เดียว — CAS version+cancelledAt → Revision(CANCEL_ORDER) → cascade ProductionOrder ที่ active → AuditLog correlationId เดียว · ถ้ามีใบที่เริ่มผลิตแล้วต้องผ่าน `production.cancelStarted` (เช็คก่อนเข้า tx + error ชัด)
**Cancel ProductionOrder แยกใบ** (D3): tx เดียว — CAS cancelledAt IS NULL → AuditLog · **ไม่แตะ CustomerPO** · guard เดิม 4 จุด (สร้าง/แก้/พิมพ์/Rev) เช็ค cancelledAt ใน tx ของตัวเอง
**Cut Outstanding**: tx เดียว — เช็ค OPEN + qty ≤ เหลือ → allocation(CUT, reason) → ปิดถ้าครบ → AuditLog

## 6. Concurrency / Idempotency

| จุด | กลไก | pattern เดิมที่ reuse |
|---|---|---|
| แก้เที่ยวช่วง DRAFT | `version` CAS — reject+reload ไม่ auto-merge | `CustomerPO.version` |
| ยืนยันขึ้นของ / กระทบยอด / ยกเลิก (ทุก entity) | CAS บน timestamp `IS NULL` — กดซ้ำ/ชนกัน = no-op เงียบหรือข้อความ "ทำไปแล้ว" | `productionStartedAt`, `printedAt` |
| เปิดบัตรค้างซ้ำ (2 คน reconcile เที่ยวต่างกันพร้อมกัน) | การเปิดบัตรอยู่ใน tx ของ reconcile ซึ่งผ่าน CAS ระดับเที่ยวมาก่อนแล้ว + เช็ค "ไม่มีบัตร OPEN" ใน tx | serializable ผ่าน CAS ต้นทาง |
| ตัดของค้างเกินยอดเหลือ | เช็ค Σ ใน tx เดียวกับการสร้าง allocation | — |

## 7. Audit strategy

- module ใหม่: `"LoadingTrip"`, `"Outstanding"` + event ใน newValue: `CONFIRM_LOADED` / `RECONCILE` / `OPEN_OUTSTANDING` / `CUT_OUTSTANDING` / `CANCEL` — โครงเดียวกับ `START_PRODUCTION`/`PRINT_REVISION` ที่หน้า "ประวัติ" S5 อ่านอยู่แล้ว → ขยาย `classify()`/`EVENT_LABELS` ไม่รื้ออะไร
- เก็บ `customerId`/`branchId`/`customerPoId` ซ้ำทุกแถวตามกฎ CLAUDE.md — event ระดับบัตรค้าง/จุดส่งมีลูกค้าชัด ใส่ครบ; event ระดับเที่ยว (หลายลูกค้า) ใส่ null ที่ระดับเที่ยวแต่มีแถวย่อยระดับลูกค้าประกอบ
- `correlationId` ทุก action ที่กระทบหลาย entity (reconcile, cascade cancel) — เริ่มใช้จริงจากงาน cancellation

## 8. Migration preview (1 migration, additive 100%)

| ประเภท | รายการ |
|---|---|
| ตารางใหม่ 5 | `loading_trips`, `loading_drops`, `loading_lines`, `outstanding_deliveries`, `outstanding_allocations` |
| enum ใหม่ 2 | `LoadingSourceType`, `AllocationKind` |
| ค่า enum เพิ่ม 1 | `RevisionChangeType` + `CANCEL_ORDER` |
| คอลัมน์เพิ่ม 6 | `cancelledAt/cancelledById/cancelReason` × (`customer_pos`, `production_orders`) — nullable ทั้งหมด |
| แก้/ลบของเดิม | **ศูนย์** — ไม่มี backfill, ไม่มี destructive op, Billing ไม่โดนแตะ |
| โค้ดไม่ใช่ schema | permission string 3 ตัวใน matrix เดิม (ข้อ 1) + docType "TRIP" (ไม่ต้อง migrate — DocumentSequence สร้างแถวเองตอนใช้ครั้งแรก) |

## 9. Implementation checkpoints (test/regress แยกกันได้)

| CP | เนื้อหา | Automated verification |
|---|---|---|
| **CP0** Cancellation | migration ส่วน cancel (6 คอลัมน์+enum) · `cancelCustomerPO`/`cancelProductionOrder` · guard 4 action เดิม · permission ใหม่ 2 (`productionOrder.cancel`, `production.cancelStarted`) · badge state ที่ 3 · banner · event ประวัติ | DB smoke: ยกเลิกก่อน/หลังเริ่มผลิต, cascade ทางเดียว (D3), idempotent, ชนกับการแก้ไข, staff โดน block เมื่อเริ่มผลิตแล้ว, ประวัติ/Rev อยู่ครบ |
| **CP1** โครงเที่ยวรถ | ตาราง Loading 3 ตัว · สร้าง/แก้เที่ยว DRAFT (trip/drop/line, picker FRESH กรอง cancelled) · list/detail · เลขที่ TRIP | unit + DB smoke: CRUD, version CAS, tripNo ไม่ซ้ำ, picker ไม่โชว์ของที่ยกเลิก |
| **CP2** ยืนยันขึ้นของ + ใบพิมพ์ | กรอก qtyLoaded + รูปต่อ drop + `loadedAt` CAS · profile A4 แนวนอนใหม่ (ไม่แตะ profile เดิมที่ห้ามแตะ) · หน้าพิมพ์ใบขึ้นของ | DB smoke: CAS one-way, บังคับรูปฝั่ง server · build/print snapshot |
| **CP3** Reconcile + Outstanding | ธุรกรรมข้อ 5 เต็ม · picker OUTSTANDING · เปิด/ปิดบัตร · UI เลือก allocation (โชว์ warning qtyCurrent ≠ ProductionItem.qty) | DB regression ชุดใหญ่แบบ S6: partial→เปิดบัตร→เที่ยวถัดไปตัดบัตร→ปิดบัตร→ตอบ 4 คำถามย้อนหลังครบ, idempotent reconcile, กันตัดเกิน |
| **CP4** หน้าของค้าง + ตัด + ประวัติ | list/detail บัตรค้าง (อายุจาก openedAt) · ปุ่มตัด (admin, reason) · ขยายหน้าประวัติ S5 · เปิดใช้การ์ด "ของค้างส่ง" บนแดชบอร์ดด้วย query จริง (พ้นสถานะ placeholder เพราะข้อมูลจริงมีแล้ว — ถือเป็นการยกเลิก stop condition เดิมข้อ dashboard **เฉพาะการ์ดนี้** ขอ Owner ยืนยันตอนถึง CP4) | DB smoke: CUT + ปิดบัตร + audit — snapshot หน้าประวัติ |
| **CP5** Regression รวม + เอกสาร | รัน E2E ทั้ง flow P1+P2 · อัปเดต docs · เตรียม UAT checklist | tsc/tests/build + DB regression เต็ม |

หลังทุก CP: `tsc` + tests + build + restart server + commit เป็น checkpoint แยก (กติกาเดิม)

## 10. จุดที่ Owner ต้องดูตาจริง (automation แทนไม่ได้)

1. **ใบขึ้นของ A4 แนวนอนบนกระดาษจริง** — ช่องพอเขียน/ขีดนับด้วยปากกาหน้างานไหม ตัดกระดาษสะดวกไหม (เหมือนที่เคยจูนใบสั่งผลิต)
2. **ถ่าย+แนบรูปจากมือถือหน้างานจริง** — ผมทดสอบ upload ผ่าน browser ได้ แต่ workflow กล้องมือถือจริง/แสง/ขนาดไฟล์ ต้องมือจริง
3. **ภาษาหน้าจอ reconcile** — "ตัดจากค้างเก่า vs ของใหม่" พนักงานอ่านแล้วเลือกถูกโดยไม่ต้องอธิบายไหม (จุดที่ผิดแล้วเจ็บสุดของ P2)
4. **ความแรงของ warning ยกเลิกหลังเริ่มผลิต** — ความรู้สึก "เตือนพอ/เตือนเกิน" เป็นเรื่องสายตา
5. **ลำดับจุดส่งบนใบพิมพ์ตรงกับที่คนขับใช้จริง**

---

**ถ้า Owner อนุมัติเอกสารนี้** → เริ่ม CP0 (Cancellation) ก่อนเพราะเป็น operational requirement ของ P1 ที่ค้างอยู่และไม่พึ่งตาราง P2 เลย → แล้วไล่ CP1→CP5 หยุดรีวิวตามจุดที่ตกลง
