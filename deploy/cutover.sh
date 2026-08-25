#!/usr/bin/env bash
# ==========================================================================
# cutover.sh — ย้ายข้อมูลจริงล่าสุดจาก Mac → VPS (รันจากเครื่อง Mac ที่ root ของ repo)
#
# ทำอะไร: dump ข้อมูลจริงจาก Mac → ส่งขึ้น VPS → สำรองสถานะ VPS เดิมกันพลาด →
# restore "ทับ" DB หลักทั้งก้อน (--clean: ข้อมูล seed เดิมถูกแทนที่ทั้งหมด จึงไม่มี
# ทางเกิดข้อมูลซ้ำจาก seed) → เปิดแอป → เทียบจำนวนแถวสองฝั่งยืนยันครบ
#
# ห้ามรันจนกว่า Owner สั่ง Cutover — ซ้อมแล้วกับ DB ชั่วคราวเมื่อ 2026-08-25 (ผ่าน)
# ==========================================================================
set -euo pipefail

VPS="root@149.28.129.64"
KEY="$HOME/.ssh/billing-vps"
TS=$(date +%Y%m%d-%H%M%S)
PGBIN="/Library/PostgreSQL/18/bin"
DBURL_MAC=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's/?schema=public//')
COUNT_SQL="SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM customers), (SELECT count(*) FROM products), (SELECT count(*) FROM orders), (SELECT count(*) FROM invoices), (SELECT count(*) FROM app_settings)"

echo "[1/6] Dump ข้อมูลจริงจาก Mac (read-only)..."
"$PGBIN/pg_dump" "$DBURL_MAC" -Fc -f "/tmp/cutover-$TS.dump"
ls -la "/tmp/cutover-$TS.dump"

echo "[2/6] ส่งขึ้น VPS..."
scp -i "$KEY" -o BatchMode=yes "/tmp/cutover-$TS.dump" "$VPS:/tmp/"

echo "[3/6] หยุดแอปชั่วคราว + สำรองสถานะ VPS เดิมไว้ที่ /root/pre-cutover-$TS.dump (กันพลาด)..."
ssh -i "$KEY" -o BatchMode=yes "$VPS" "systemctl stop bill-system && sudo -u postgres pg_dump -Fc -f /tmp/pre-cutover-$TS.dump bill_system && mv /tmp/pre-cutover-$TS.dump /root/pre-cutover-$TS.dump && chmod 600 /root/pre-cutover-$TS.dump"

echo "[4/6] Restore ทับ DB หลัก (seed เดิมถูกแทนที่ทั้งหมด)..."
ssh -i "$KEY" -o BatchMode=yes "$VPS" "sudo -u postgres pg_restore -d bill_system --clean --if-exists --no-owner --role=billing /tmp/cutover-$TS.dump"

echo "[5/6] เปิดแอป + Health check..."
ssh -i "$KEY" -o BatchMode=yes "$VPS" "systemctl start bill-system && sleep 6 && curl -s -o /dev/null -w 'app:%{http_code}\n' http://127.0.0.1:3000/login"

echo "[6/6] เทียบจำนวนแถว Mac ↔ VPS (users/customers/products/orders/invoices/settings)..."
echo -n "Mac: " && "$PGBIN/psql" "$DBURL_MAC" -t -A -c "$COUNT_SQL"
echo -n "VPS: " && ssh -i "$KEY" -o BatchMode=yes "$VPS" "sudo -u postgres psql -d bill_system -t -A -c \"$COUNT_SQL\""

echo "เก็บกวาดไฟล์ชั่วคราว..."
rm "/tmp/cutover-$TS.dump"
ssh -i "$KEY" -o BatchMode=yes "$VPS" "rm /tmp/cutover-$TS.dump"
echo "Cutover เสร็จ — ตรวจสองบรรทัดบนว่าตัวเลขตรงกันทุกช่อง แล้วไปต่อตามขั้นถัดไปใน CUTOVER-CHECKLIST.md"
