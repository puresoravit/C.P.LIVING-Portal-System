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

## Backup อัตโนมัติ (ข้อ 49)

ต้องติดตั้ง `pg_dump` และ `pg_restore` ให้อยู่ใน PATH ของเครื่อง (มากับการติดตั้ง
PostgreSQL อยู่แล้ว — ถ้าติดตั้ง PostgreSQL ในเครื่องนี้แล้วไม่ต้องทำอะไรเพิ่ม)

### Windows (Task Scheduler)

1. เปิด Task Scheduler → Create Basic Task
2. ตั้งให้รันทุกวัน (เช่น ตี 2)
3. Action: Start a program → `curl.exe`
4. Arguments: `"http://localhost:3000/api/backup/auto?secret=YOUR_BACKUP_SECRET"`

### Linux/Mac (cron)

```bash
crontab -e
# เพิ่มบรรทัดนี้ (รันทุกวันตี 2)
0 2 * * * curl -s "http://localhost:3000/api/backup/auto?secret=YOUR_BACKUP_SECRET" >> /var/log/bill-system-backup.log 2>&1
```

ไฟล์ backup จะถูกเก็บไว้ที่โฟลเดอร์ `backups/` ในโปรเจกต์ — ดูรายการและดาวน์โหลด
ได้ที่หน้า "สำรอง/กู้คืนข้อมูล" ในเมนู (ต้องเป็น OWNER_ADMIN)

**⚠️ อย่าลืมตั้งค่า `BACKUP_SECRET` ใน `.env` เป็นค่าสุ่มที่คาดเดายาก**
