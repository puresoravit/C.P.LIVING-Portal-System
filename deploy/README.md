# คู่มือ Deploy Production — C.P. LIVING Billing

> เป้าหมาย: VPS 1 เครื่อง (Ubuntu 24.04 LTS, 2GB RAM) รัน Next.js + PostgreSQL + Caddy (HTTPS อัตโนมัติ)
> เข้าใช้ผ่าน **`https://portal.cplivingmattress.com`** จากทุกที่ — เว็บบริษัทเดิมไม่ถูกแตะต้องใดๆ
>
> ไฟล์ประกอบในโฟลเดอร์นี้: `Caddyfile` · `bill-system.service` · `env.production.example` · `backup-offsite.sh`

---

## Domain/DNS — ตรวจสอบแล้ว (2026-08-25)

- โดเมน: **cplivingmattress.com** — DNS จัดการบน **Cloudflare** (NS: damiete/frida.ns.cloudflare.com ✓)
- เว็บบริษัทเดิมโฮสต์บน Vercel (`www` ชี้ vercel-dns) — **ห้ามแตะ record ของเว็บเดิม/`www`/MX ทุกตัว**
  (อีเมลบริษัทเป็น Google Workspace ผ่าน MX — ห้ามแตะเช่นกัน)
- ไม่มี CAA record → Let's Encrypt ออกใบรับรองได้ ไม่มีตัวขวาง ✓
- `portal.cplivingmattress.com` ยังว่าง พร้อมใช้ ✓

### ขั้นตอนเพิ่ม Record บน Cloudflare (ทำหลังได้ IP ของ VPS แล้ว — เพิ่มใหม่ 1 รายการเท่านั้น)

เข้า Cloudflare Dashboard → เลือกโดเมน cplivingmattress.com → DNS → Records → **Add record**:

```
Type: A
Name: portal
IPv4 address: <IP ของ VPS>
Proxy status: DNS only (คลิกเมฆส้มให้เป็น "เมฆสีเทา")   ← สำคัญมาก
TTL: Auto
```

> **ทำไมต้อง "DNS only" (เมฆเทา):** ให้ Caddy บนเครื่องเราขอ Certificate จาก Let's Encrypt
> ตรงๆ ได้ (ถ้าเปิด Proxy เมฆส้ม Cloudflare จะคั่นกลาง ต้องตั้ง SSL แบบพิเศษเพิ่มอีกชั้น) —
> เว็บเราเป็นระบบภายในผู้ใช้หลักสิบคน ไม่จำเป็นต้องใช้ CDN/พร็อกซีของ Cloudflare —
> เปิดเป็นเมฆส้มทีหลังได้ถ้าต้องการ (มีขั้นตอนตั้งค่าเพิ่ม แจ้งได้)

---

## ขั้นตอนที่ 1 — สร้าง VPS (Owner เป็นคนสมัคร/ผูกบัตร)

- ผู้ให้บริการ: **Vultr** (มี Datacenter กรุงเทพ) หรือ DigitalOcean (Singapore)
- Spec: **2 vCPU ไม่จำเป็น — 1 vCPU / 2GB RAM / 50GB SSD ก็พอ** (~$10-12/เดือน)
- OS: **Ubuntu 24.04 LTS x64**
- ตอนสร้างให้เพิ่ม **SSH Key** (ห้ามใช้ Password SSH) — สร้างคีย์บนเครื่อง Mac:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/billing-vps -C "billing-vps"
  ```
  แล้วเอาเนื้อไฟล์ `~/.ssh/billing-vps.pub` ไปวางตอนสร้าง VPS
- เปิดตัวเลือก **Auto Backups/Snapshots** ของผู้ให้บริการถ้ามี (~+20% — แนะนำให้เปิด)
- จด **IP Address** ของเครื่องไว้ → ใช้ตั้ง A record (ดูหัวข้อ DNS ด้านบน)

## ขั้นตอนที่ 2 — Hardening พื้นฐาน (ครั้งเดียว)

```bash
ssh -i ~/.ssh/billing-vps root@<IP>

# อัปเดตระบบ + เปิดอัปเดตความปลอดภัยอัตโนมัติ
apt update && apt upgrade -y
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Firewall: เปิดแค่ SSH/HTTP/HTTPS
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

# ปิด SSH ด้วยรหัสผ่าน (เหลือ Key อย่างเดียว)
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

## ขั้นตอนที่ 3 — ติดตั้งของที่ต้องใช้

```bash
# Node.js 24 LTS (ทางการของ NodeSource)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

# PostgreSQL 18 (จาก PGDG ให้ตรงเวอร์ชันที่ dump มาจากเครื่อง Mac)
apt install -y postgresql-common
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt install -y postgresql-18

# Caddy (ทางการ)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# rclone (สำหรับ Offsite Backup ขึ้น Google Drive)
apt install -y rclone

# ผู้ใช้เฉพาะกิจของแอป (ไม่มีสิทธิ์ root)
adduser --system --group --home /opt/bill-system billing
```

## ขั้นตอนที่ 4 — ตั้ง Database

```bash
sudo -u postgres psql <<'PSQL'
CREATE USER billing WITH PASSWORD '<รหัสจาก openssl rand -base64 24>';
CREATE DATABASE bill_system OWNER billing;
PSQL
```
PostgreSQL ฟังแค่ 127.0.0.1 โดย Default อยู่แล้ว — **ไม่ต้อง (และห้าม) เปิดพอร์ต 5432 ใน ufw**

## ขั้นตอนที่ 5 — วางโค้ดแอป

```bash
# บนเครื่อง Mac: ส่งโค้ด (branch ที่ Owner อนุมัติให้ deploy) ขึ้นเครื่อง
rsync -az --exclude node_modules --exclude .next --exclude backups --exclude logs \
  -e "ssh -i ~/.ssh/billing-vps" ./ root@<IP>:/opt/bill-system/

# บน VPS: ติดตั้ง dependency + สร้างไฟล์ env + สั่ง Build
cd /opt/bill-system
cp deploy/env.production.example .env
nano .env        # เติมค่าจริงทุกช่องตามคำแนะนำในไฟล์
chmod 640 .env && chown root:billing .env

npm ci
npx prisma migrate deploy       # สร้าง Schema (18 migrations)
npm run build
chown -R billing:billing /opt/bill-system
mkdir -p logs backups && chown billing:billing logs backups
```

### นำข้อมูลจริงเข้า (เลือกอย่างใดอย่างหนึ่งตอน Cutover)
- **ทาง ก — ยกข้อมูลจากเครื่อง Mac ไป:** ส่งไฟล์ dump ล่าสุดขึ้นไปแล้ว
  ```bash
  pg_restore -d "postgresql://billing:<รหัส>@127.0.0.1:5432/bill_system" --clean --if-exists <ไฟล์.dump>
  ```
- **ทาง ข — เริ่มจากระบบว่าง:** `npx prisma db seed` แล้ว Owner กรอกข้อมูลใหม่บนเว็บจริง
  (ตอนนี้ DB บนเครื่อง Mac เป็น Clean Baseline อยู่แล้ว — ถ้า Owner กรอกข้อมูลจริงบน Mac ไประหว่างรอ ใช้ทาง ก)

## ขั้นตอนที่ 6 — เปิดแอปด้วย systemd

```bash
cp deploy/bill-system.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bill-system
systemctl status bill-system     # ต้องเป็น active (running)
```

## ขั้นตอนที่ 7 — เปิด HTTPS ด้วย Caddy

```bash
cp deploy/Caddyfile /etc/caddy/Caddyfile
cat /etc/caddy/Caddyfile         # ตรวจว่าเป็น portal.cplivingmattress.com ถูกต้อง
systemctl reload caddy
```
รอ DNS ทำงาน (ปกติไม่กี่นาที) แล้วเปิด `https://portal.cplivingmattress.com` — ต้องเจอหน้า Login พร้อมกุญแจเขียว

## ขั้นตอนที่ 8 — Backup อัตโนมัติ + Offsite

```bash
# ครั้งเดียว: ตั้ง rclone remote ชื่อ "offsite" ชี้ Google Drive ของบริษัท
sudo -u billing rclone config

# Cron รายวัน 02:00 (ของผู้ใช้ billing)
sudo -u billing crontab -e
# เพิ่มบรรทัด:
0 2 * * * /opt/bill-system/deploy/backup-offsite.sh >> /opt/bill-system/logs/backup-cron.log 2>&1
```

### แผน Restore (ซ้อมจริง 1 ครั้งก่อน Go-live — เป็นข้อบังคับ)
1. หยุดแอป: `systemctl stop bill-system`
2. กู้ข้อมูล: `pg_restore -d "<DATABASE_URL แบบไม่มี ?schema>" --clean --if-exists <ไฟล์.dump>`
3. เปิดแอป: `systemctl start bill-system` แล้วเข้าเว็บตรวจข้อมูล
4. กรณีเครื่องหายทั้งเครื่อง: สร้าง VPS ใหม่ตามคู่มือนี้ + ดึง dump จาก Google Drive มา Restore
   (ทุกอย่างที่ระบบต้องใช้อยู่ใน Git + dump — ไม่มีของสำคัญที่อยู่นอกสองที่นี้)

## ขั้นตอนที่ 9 — Monitoring (ฟรี)

- สมัคร [UptimeRobot](https://uptimerobot.com) (ฟรี) → เพิ่ม Monitor ชนิด HTTPS ชี้
  `https://portal.cplivingmattress.com/login` เช็คทุก 5 นาที → ตั้งอีเมลแจ้งเตือน Owner

---

## Checklist วัน Cutover (ก่อนประกาศใช้จริง)

- [ ] Owner สั่ง **merge → main** และยืนยันให้ Deploy (กติกาเดิม: ผมไม่ทำจนกว่าจะสั่ง)
- [ ] Restore ข้อมูลจริงชุดล่าสุด + เทียบยอด Dashboard ตรงกับเครื่องเดิม
- [ ] ทดสอบตามแผน Phase 3 (Smoke Test) ครบทุกข้อ
- [ ] **ลงทะเบียน Passkey ใหม่** บนอุปกรณ์จริงทุกเครื่อง (ของเดิมผูกกับ localhost ใช้ไม่ได้ — ตามสเปค)
- [ ] ลบ/ปิดบัญชี `claude_test` และข้อมูลทดสอบทุกชิ้นที่เกิดระหว่าง Smoke Test
- [ ] เปลี่ยนรหัส `admin` ใหม่ (รหัสเคยพิมพ์ในแชทระหว่าง UAT)
- [ ] Backup อัตโนมัติวิ่งแล้วอย่างน้อย 1 รอบ + ไฟล์โผล่บน Google Drive จริง
- [ ] ซ้อม Restore สำเร็จแล้วอย่างน้อย 1 ครั้ง
