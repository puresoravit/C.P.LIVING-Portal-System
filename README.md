# ระบบออกบิล (Bill System) — Phase 1: Foundation

ระบบจัดการลูกค้า / สินค้า / ราคา / ส่วนลด / ออกบิล / รายงานยอดขาย
สำหรับโรงงานผลิตที่นอน (ทดแทนระบบออกบิลเดิม)

> **สถานะ**: Phase 1 (Foundation) — Authentication, Role/Permission,
> Customer, Branch, Product Type, Product Master
> ดู Requirement เต็มที่ `docs/REQUIREMENTS.md` และแผน Phase ที่ `docs/PHASES.md`

## Tech Stack

- **Next.js 14** (App Router, TypeScript) — Frontend + Backend ในโปรเจกต์เดียว
- **PostgreSQL + Prisma ORM** — Database, Migration, Type-safety
- **NextAuth.js** (Credentials Provider) + **bcryptjs** — Authentication
- **Tailwind CSS** — Styling
- **Zod** — Validation
- **Vitest** — Automated Testing

## เริ่มต้นใช้งาน (Local Development)

### 1. ติดตั้ง Dependencies

```bash
npm install
```

`@prisma/client` จะรัน `prisma generate` ให้อัตโนมัติหลัง install (เป็นพฤติกรรม
มาตรฐานของ Prisma) — ถ้าไม่เกิดขึ้นเอง (เช่น ติดตั้งแบบ offline/CI บางระบบ)
ให้รันเองด้วย `npx prisma generate` ก่อนไปขั้นตอนถัดไป

### 2. ตั้งค่า Database

ต้องมี PostgreSQL รันอยู่ (แนะนำใช้ Docker):

```bash
docker run --name bill-system-db -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=bill_system -p 5432:5432 -d postgres:16
```

คัดลอกไฟล์ env และแก้ค่าให้ตรงกับเครื่อง:

```bash
cp .env.example .env
```

### 3. รัน Migration + Seed ข้อมูลเริ่มต้น

```bash
npm run prisma:migrate -- --name init
npm run prisma:seed
```

Seed จะสร้าง:
- User แรก: `admin` / `ChangeMe123!` (Role: OWNER_ADMIN) — **เปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก**
- Product Type ตั้งต้น: TYPE A, TYPE B, TYPE C
- VAT Rate ตั้งต้น: 7%

### 4. รันโปรเจกต์

```bash
npm run dev
```

เปิด http://localhost:3000 — จะ redirect ไปหน้า `/login` อัตโนมัติ

### 5. รัน Test

```bash
npm test
```

## Environment Variables (Development vs Production)

โปรเจกต์นี้มีไฟล์ template สอง — ไม่มี secret จริงในทั้งคู่ commit ได้ปลอดภัย:

- **`.env.example`** — ค่าเริ่มต้นสำหรับ local development (`DATABASE_URL`
  ชี้ไป localhost, `NEXTAUTH_URL` เป็น `http://localhost:3000`)
- **`.env.production.example`** — ตัวอย่างค่าที่ต้องใช้ตอน deploy จริง
  (`DATABASE_URL` ต้องเป็น Managed PostgreSQL, `NEXTAUTH_URL` ต้องเป็น
  `https://` domain จริง, secrets ต้องสุ่มใหม่แยกจาก dev เสมอ)

ไฟล์ค่าจริง (`.env`, `.env.production`, `.env.local` ฯลฯ) ทั้งหมดอยู่ใน
`.gitignore` แล้ว — **ห้าม commit ไฟล์ที่มีค่าจริงเด็ดขาด** ไม่ว่าจะเป็น
environment ไหน

**กฎสำคัญที่ต้องทำตอน deploy จริง (ไม่ใช่แค่ copy ค่าจาก dev)**:
1. `NEXTAUTH_SECRET` และ `BACKUP_SECRET` ต้องสุ่มใหม่ **แยกจากค่าที่ใช้ตอน
   dev เสมอ** — ห้ามใช้ค่าเดียวกันข้าม environment
2. `NEXTAUTH_URL` ต้องเป็น `https://` (ไม่ใช่ `http://`) — โค้ดใน
   `src/lib/auth.ts` เช็ค `NODE_ENV === "production"` เพื่อเปิด secure
   cookie โดยอัตโนมัติ (ไม่ได้พึ่ง URL string อย่างเดียว) แต่ NEXTAUTH_URL
   เองก็ยังต้องตรงกับ domain จริงเพื่อให้ callback/redirect ทำงานถูกต้อง
3. `DATABASE_URL` ชี้ไป Managed PostgreSQL ที่เลือกไว้ (ดูหัวข้อ Backup
   Strategy ด้านล่างประกอบ)

## โครงสร้างโปรเจกต์

```
prisma/
  schema.prisma       ครบ 17 ตารางตาม Requirement ข้อ 57
                       (Phase 1 ใช้งานจริงแค่ User/Customer/Branch/ProductType/Product
                        ตารางอื่นเตรียมโครงไว้รองรับ Phase 2-8)
  seed.ts              สร้างข้อมูลเริ่มต้น
src/
  lib/
    db.ts              Prisma client
    auth.ts            NextAuth config
    permissions.ts     Permission Matrix กลาง (แก้สิทธิ์ที่เดียว)
    validation.ts      Zod schema กลาง
  middleware.ts        Route guard (บังคับ login)
  app/
    login/             หน้า Login
    (dashboard)/        ต้อง login ก่อนเข้า
      customers/        Customer Master (ข้อ 4)
      branches/          Branch Master (ข้อ 5)
      product-types/     Product Type Master (ข้อ 6)
      products/          Product Master (ข้อ 7)
```

## หลักการสำคัญที่ยึดตลอดโปรเจกต์ (ข้อ 79)

Priority การตัดสินใจ: **Data Correctness > Business Logic Correctness >
Ease of Use > Speed of Daily Billing > Traceability > Reporting >
Maintainability > UI Appearance**

ถ้าต้องเลือกระหว่าง "ระบบดูสวย" กับ "ระบบคีย์เร็วและข้อมูลถูก" — เลือกอย่างหลังเสมอ

## Phase ถัดไป

ดูรายละเอียดที่ `docs/PHASES.md` — ขั้นต่อไปคือ **Phase 2: Business Rule**
(Price Master, Price History, Effective Date, Discount Rules, VAT Setting)

## Backup Strategy (ข้อ 49)

**บน Managed Cloud PostgreSQL (Railway/Supabase/Neon/RDS ฯลฯ)**: ให้ถือว่า
**Automated Backup ของผู้ให้บริการเป็นระบบสำรองหลัก** (point-in-time
recovery / daily snapshot ที่ provider ทำให้อัตโนมัติ) — กลไก `pg_dump`
ด้านล่างนี้เป็นแค่เครื่องมือสำรอง/กู้คืนแบบ manual เสริม (เช่น ก่อนทำการ
เปลี่ยนแปลงข้อมูลครั้งใหญ่ หรือย้ายข้อมูลออกไปเก็บที่อื่น) เพราะไฟล์ที่
เขียนไว้ในโฟลเดอร์ `backups/` เป็น local disk ของ server ที่รันแอปอยู่ —
ถ้า deploy บน platform ที่ไม่มี persistent disk (serverless/ephemeral
container) ไฟล์เหล่านี้จะหายเมื่อ restart/redeploy ไม่ควรพึ่งเป็นระบบ
สำรองหลักตอนอยู่บน cloud

**บนเครื่อง PC เดียว (deployment เดิม)**: กลไก `pg_dump` นี้ยังคงเป็น
ระบบสำรองหลักได้ตามปกติ เพราะ disk ของเครื่องนั้น persist อยู่แล้ว

ต้องติดตั้ง `pg_dump` และ `pg_restore` ให้อยู่ใน PATH ของเครื่อง (มากับการติดตั้ง
PostgreSQL อยู่แล้ว — ถ้าติดตั้ง PostgreSQL ในเครื่องนี้แล้วไม่ต้องทำอะไรเพิ่ม)

### Windows (Task Scheduler)

1. เปิด Task Scheduler → Create Basic Task
2. ตั้งให้รันทุกวัน (เช่น ตี 2)
3. Action: Start a program → `curl.exe`
4. Arguments: `-H "Authorization: Bearer YOUR_BACKUP_SECRET" "http://localhost:3000/api/backup/auto"`

### Linux/Mac (cron)

```bash
crontab -e
# เพิ่มบรรทัดนี้ (รันทุกวันตี 2)
0 2 * * * curl -s -H "Authorization: Bearer YOUR_BACKUP_SECRET" "http://localhost:3000/api/backup/auto" >> /var/log/bill-system-backup.log 2>&1
```

**หมายเหตุ**: secret ส่งผ่าน `Authorization` header ไม่ใช่ query string (`?secret=...`) เพื่อไม่ให้หลุดผ่าน server access log/browser history เวลาเปิดใช้งานผ่าน internet

ไฟล์ backup จะถูกเก็บไว้ที่โฟลเดอร์ `backups/` ในโปรเจกต์ — ดูรายการและดาวน์โหลด
ได้ที่หน้า "สำรอง/กู้คืนข้อมูล" ในเมนู (ต้องเป็น OWNER_ADMIN)

**⚠️ อย่าลืมตั้งค่า `BACKUP_SECRET` ใน `.env` เป็นค่าสุ่มที่คาดเดายาก**
