# Cutover Checklist — ลำดับเปิดใช้จริง (ตามที่ Owner กำหนด)

> หลักการ: **ข้อมูลจริงต้องขึ้นก่อนเปิดประตูสู่สาธารณะ** — ระบบบน VPS จะไม่ถูกเปิด Public
> ตราบใดที่ยังเป็นข้อมูล seed/รหัสตั้งต้น — Smoke Test ของจริงทำบนโดเมนจริง+ข้อมูลจริงเท่านั้น
>
> สถานะเตรียมพร้อม (ทำแล้ว 2026-08-25 กลางคืน): แอป staged+ทดสอบครบบน VPS, ซ้อม
> restore ด้วยข้อมูลจริงผ่านแล้ว, cutover.sh พร้อมใช้, Caddyfile validate แล้วรอสลับ

## ☐ 1. DNS พร้อม
- เพื่อน/ผู้ดูแลเพิ่ม A record: `portal` → `149.28.129.64` **DNS only (เมฆเทา)** ที่ Cloudflare
- ตรวจ: `dig +short A portal.cplivingmattress.com` ต้องตอบ `149.28.129.64`

## ☐ 2. Production Checkpoint (ต้องมีคำสั่ง Owner ชัดเจน)
- Owner อนุมัติ **merge `phase-e-workflow-ux` → `main`** (แนะนำ) → merge + tag `production-v1`
- Re-sync โค้ดล่าสุดขึ้น VPS + `npm ci && npm run build` + restart service

## ☐ 3. Cutover ข้อมูลจริง
- Owner หยุดคีย์ข้อมูลบน Mac ชั่วคราว (กันข้อมูลตกหล่นระหว่างย้าย)
- รัน `bash deploy/cutover.sh` จากเครื่อง Mac — สคริปต์สำรองสถานะ VPS เดิมให้อัตโนมัติก่อนทับ
- ตรวจตัวเลขเทียบสองฝั่งท้ายสคริปต์ต้องตรงกันทุกช่อง

## ☐ 4. ตรวจ Auth/Data Integrity บน VPS (ยังไม่เปิด Public)
- ผู้ใช้ในระบบต้องเป็นชุดจริงจาก Mac (admin + claude_test) ไม่ใช่ seed
- รัน Integrity SQL (แบบเดียวกับ Final Audit) บน DB หลัก

## ☐ 5. เปิด HTTPS
```bash
ssh -i ~/.ssh/billing-vps root@149.28.129.64 \
  "cp /etc/caddy/Caddyfile.ready /etc/caddy/Caddyfile && systemctl reload caddy"
```
- รอ ~1-2 นาที → เปิด `https://portal.cplivingmattress.com` ต้องเจอหน้า Login กุญแจเขียว

## ☐ 6. Smoke Test บนโดเมนจริง
- Login ด้วยรหัสผ่านจริงของ admin (Desktop + มือถือผ่านเน็ตมือถือ ไม่ใช่ Wi-Fi ร้าน)
- สร้างเอกสารทดสอบ 1 ชุด: QT → Order → Confirm → Print 9×11 → มาร์ค PRINTED → ใบวางบิล
- Dashboard/รายงาน แสดงถูก, Mobile UI ปกติ, พิมพ์จริงกับ EPSON ถ้าสะดวก
- **ลบเอกสารทดสอบทั้งหมด (ยกเลิกเอกสาร) ก่อน Go-live — ห้ามทิ้ง test transaction ปนข้อมูลจริง**

## ☐ 7. Passkey ลงทะเบียนใหม่
- My Profile → เพิ่ม Passkey บนทุกอุปกรณ์จริง (Mac Touch ID / iPhone Face ID)
- ของเดิมที่ผูก localhost ใช้ไม่ได้แล้ว — ลบทิ้งจากรายการได้

## ☐ 8. Offsite Backup + ซ้อมกู้รอบจริง
- `sudo -u billing rclone config` บน VPS → เชื่อม Google Drive บริษัท (Owner ล็อกอิน ~5 นาที)
- ตั้ง cron ตาม deploy/README.md ขั้นตอนที่ 8 → รอ/สั่งรัน 1 รอบ → เห็นไฟล์บน Drive จริง
- ซ้อม restore จากไฟล์บน Drive ลง DB ชั่วคราว 1 ครั้ง (แบบเดียวกับที่ซ้อมแล้ว)

## ☐ 9. เก็บกวาดก่อนประกาศใช้
- ปิด/ลบบัญชี `claude_test`
- **เปลี่ยนรหัสผ่าน `admin` ใหม่** (รหัสเดิมเคยถูกพิมพ์ในแชทระหว่าง UAT)
- ตั้ง UptimeRobot ชี้ `https://portal.cplivingmattress.com/login`

## ☐ 10. Go-live (ต้องมีคำสั่ง Owner ชัดเจน)
- ประกาศให้พนักงานเริ่มใช้ URL ใหม่
- เครื่อง Mac เลิกเป็น server — เก็บ backup ชุดสุดท้ายไว้เป็นประวัติ

## Rollback Procedure (Production Security Audit 2026-08-25)

**Code (deploy commit ใหม่แล้วพัง):**
```bash
# บน Mac — กลับไป tag ก่อนหน้าที่รู้ว่าดี
git checkout production-live-2026-08-25 -- .   # หรือ tag อื่นที่ต้องการ
rsync -avz --exclude node_modules --exclude .next --exclude /backups --exclude /logs \
  --exclude .env --exclude .git --exclude .claude --exclude "*.dump" \
  -e "ssh -i ~/.ssh/billing-vps" ./ root@<IP>:/opt/bill-system/
ssh -i ~/.ssh/billing-vps root@<IP> \
  "cd /opt/bill-system && sudo -u billing npm run build && systemctl restart bill-system"
```
ต้อง `git checkout <branch> -- .` กลับมาที่ branch ปกติหลัง rollback เสร็จ ไม่ปล่อย working tree ค้างที่ tag เก่า

**Database (migration/ข้อมูลพัง):**
```bash
# Restore จาก dump ล่าสุดที่รู้ว่าถูกต้อง (local หรือถอดรหัสจาก offsite)
sudo -u postgres pg_restore -d bill_system --clean --if-exists /root/<ไฟล์>.dump
```
ก่อน restore ทับ ให้ `pg_dump` สถานะปัจจุบันเก็บไว้ก่อนเสมอ (กันพลาดซ้อนพลาด)

**VPS หายทั้งเครื่อง (Vultr disk พัง/instance หาย):**
1. สร้าง VPS ใหม่ (Ubuntu, region เดิม) ทำตาม `deploy/README.md` ขั้นตอน 1-4 (Node/PG/Caddy/user)
2. โค้ด: จาก Git บน Mac (หรือ GitHub ถ้าตั้งแล้ว) — rsync ขึ้นเครื่องใหม่ตามขั้นตอนที่ 5
3. Secrets: สร้างใหม่ทั้งหมด (`.env` จาก `env.production.example`) — ไม่ต้องใช้ค่าเดิม
   (NEXTAUTH_SECRET/BACKUP_SECRET ใหม่ได้ ผู้ใช้แค่ต้อง login ใหม่ครั้งเดียว)
4. Database: decrypt ไฟล์ offsite ล่าสุดด้วย Passphrase (`~/.bill-system-backup-passphrase`
   บน Mac) แล้ว `pg_restore` เข้า DB ใหม่
5. DNS: ชี้ `portal.cplivingmattress.com` A record ไป IP ใหม่ที่ Cloudflare (จุดเดียวที่ต้องแก้ DNS)
6. Caddy จะขอ TLS cert ใหม่อัตโนมัติเมื่อ DNS ชี้ถูกและเปิด 80/443
7. ทุกคน login/Passkey ใหม่ (Passkey ผูกกับ Origin ไม่ใช่ Server เฉพาะเครื่อง — ถ้า Domain
   เดิมไม่เปลี่ยน ไม่ต้อง register Passkey ใหม่)
