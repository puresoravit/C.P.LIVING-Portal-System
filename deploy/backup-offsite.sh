#!/usr/bin/env bash
# ==========================================================================
# backup-offsite.sh — สำรองฐานข้อมูลรายวัน → เข้ารหัส → ส่งขึ้น Google Drive → เก็บกวาด
#
# เรียกจาก cron ของผู้ใช้ billing (ดู README ขั้นตอนที่ 8) เช่นทุกวัน 02:00:
#   0 2 * * * /opt/bill-system/deploy/backup-offsite.sh >> /opt/bill-system/logs/backup-cron.log 2>&1
#
# การเข้ารหัส (นโยบาย Owner: ไฟล์ที่ออกนอกเครื่องต้องเข้ารหัสเสมอ):
#   - gpg Symmetric AES-256 ด้วย Passphrase ใน /root/.backup-passphrase (root อ่านได้คนเดียว)
#   - สำเนา Passphrase สำหรับกู้ภัยพิบัติเก็บไว้ที่เครื่อง Mac: ~/.bill-system-backup-passphrase
#     (ถ้า VPS หายทั้งเครื่อง ใช้ตัวนี้ถอดรหัสไฟล์จาก Drive ได้ — ห้ามเก็บใน Git/Drive เด็ดขาด)
#   - ถอดรหัส: gpg --batch --passphrase-file <ไฟล์กุญแจ> -d ไฟล์.dump.gpg > ไฟล์.dump
#
# ต้องตั้งค่าก่อนใช้ครั้งแรก: rclone config สร้าง Remote ชื่อ "offsite" ชี้ Google Drive บริษัท
# ==========================================================================
set -euo pipefail

APP_DIR="/opt/bill-system"
BACKUP_DIR="$APP_DIR/backups"
ENC_DIR="$BACKUP_DIR/offsite"        # เฉพาะไฟล์เข้ารหัสแล้วเท่านั้นที่อยู่โฟลเดอร์นี้/ขึ้น Drive
PASSFILE="/root/.backup-passphrase"
KEEP_LOCAL_DAYS=14
OFFSITE_REMOTE="offsite:bill-system-backups"

mkdir -p "$ENC_DIR"

# อ่าน BACKUP_SECRET จาก .env (ไม่ Hardcode Secret ในสคริปต์)
BACKUP_SECRET=$(grep '^BACKUP_SECRET=' "$APP_DIR/.env" | cut -d'"' -f2)

# 1. สั่งแอปสร้าง Backup (pg_dump custom format ลง backups/ — กลไกเดิมของระบบ, GET + Bearer)
curl -sf http://127.0.0.1:3000/api/backup/auto \
  -H "Authorization: Bearer $BACKUP_SECRET" \
  || { echo "[$(date -Iseconds)] backup endpoint FAILED"; exit 1; }

# 2. เข้ารหัสไฟล์ dump ที่ยังไม่มีคู่ .gpg (AES-256 Symmetric)
for f in "$BACKUP_DIR"/*.dump; do
  [ -e "$f" ] || continue
  out="$ENC_DIR/$(basename "$f").gpg"
  if [ ! -f "$out" ]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "$PASSFILE" -o "$out" "$f" \
      || { echo "[$(date -Iseconds)] encrypt FAILED: $f"; exit 1; }
  fi
done

# 3. ส่งเฉพาะไฟล์เข้ารหัสขึ้น Google Drive (ไฟล์ Plaintext ไม่มีวันออกนอกเครื่อง)
rclone copy "$ENC_DIR" "$OFFSITE_REMOTE" --include "*.gpg" \
  || { echo "[$(date -Iseconds)] offsite copy FAILED"; exit 1; }

# 4. เก็บกวาดในเครื่องที่เก่ากว่ากำหนด (ทั้ง Plaintext และ Encrypted — ฝั่ง Drive เก็บยาวกว่า)
find "$BACKUP_DIR" -maxdepth 1 -name "*.dump" -mtime +"$KEEP_LOCAL_DAYS" -delete
find "$ENC_DIR" -name "*.dump.gpg" -mtime +"$KEEP_LOCAL_DAYS" -delete

echo "[$(date -Iseconds)] backup + encrypt + offsite OK"
