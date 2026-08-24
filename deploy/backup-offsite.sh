#!/usr/bin/env bash
# ==========================================================================
# backup-offsite.sh — สำรองฐานข้อมูลรายวัน + ส่งสำเนาออกนอกเครื่อง + เก็บกวาดไฟล์เก่า
#
# เรียกจาก cron ของผู้ใช้ billing (ดู README ขั้นตอนที่ 8) เช่นทุกวัน 02:00:
#   0 2 * * * /opt/bill-system/deploy/backup-offsite.sh >> /opt/bill-system/logs/backup-cron.log 2>&1
#
# ต้องตั้งค่าก่อนใช้:
#   1. BACKUP_SECRET ให้ตรงกับใน .env (อ่านจาก .env ให้อัตโนมัติด้านล่าง)
#   2. rclone config — สร้าง Remote ชื่อ "offsite" ชี้ Google Drive ของบริษัท
#      (rclone config → n → ชื่อ offsite → ประเภท drive → ทำตาม Prompt ครั้งเดียว)
# ==========================================================================
set -euo pipefail

APP_DIR="/opt/bill-system"
BACKUP_DIR="$APP_DIR/backups"
KEEP_LOCAL_DAYS=14      # เก็บ Backup ในเครื่องย้อนหลังกี่วัน
OFFSITE_REMOTE="offsite:bill-system-backups"   # ปลายทาง rclone (Google Drive)

# อ่าน BACKUP_SECRET จาก .env (ไม่ Hardcode Secret ในสคริปต์)
BACKUP_SECRET=$(grep '^BACKUP_SECRET=' "$APP_DIR/.env" | cut -d'"' -f2)

# 1. สั่งแอปสร้าง Backup (pg_dump custom format ลง backups/ — กลไกเดิมของระบบ, GET + Bearer)
curl -sf http://127.0.0.1:3000/api/backup/auto \
  -H "Authorization: Bearer $BACKUP_SECRET" \
  || { echo "[$(date -Iseconds)] backup endpoint FAILED"; exit 1; }

# 2. ส่งสำเนาทั้งโฟลเดอร์ออกนอกเครื่อง (rclone sync เฉพาะไฟล์ใหม่/เปลี่ยน)
rclone copy "$BACKUP_DIR" "$OFFSITE_REMOTE" --include "*.dump" \
  || { echo "[$(date -Iseconds)] offsite copy FAILED"; exit 1; }

# 3. เก็บกวาดไฟล์ในเครื่องที่เก่ากว่ากำหนด (ฝั่ง Offsite เก็บยาวกว่า — จัดการใน Drive เอง)
find "$BACKUP_DIR" -name "*.dump" -mtime +"$KEEP_LOCAL_DAYS" -delete

echo "[$(date -Iseconds)] backup + offsite OK"
