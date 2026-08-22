import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  // --- Admin user แรกของระบบ (เปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก) ---
  const adminPasswordHash = await bcrypt.hash("ChangeMe123!", 10);
  await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@example.com",
      passwordHash: adminPasswordHash,
      displayName: "ผู้ดูแลระบบ",
      role: "OWNER_ADMIN",
    },
  });

  // --- Product Type ตั้งต้น (ข้อ 6): A, B, C — เพิ่ม D ในอนาคตได้จากหน้า UI ---
  const types = [
    { code: "A", name: "TYPE A", sortOrder: 1 },
    { code: "B", name: "TYPE B", sortOrder: 2 },
    { code: "C", name: "TYPE C", sortOrder: 3 },
  ];
  for (const t of types) {
    await db.productType.upsert({ where: { code: t.code }, update: {}, create: t });
  }

  // --- R6 — Product Category ตั้งต้น (คุณลักษณะสินค้า แยกจาก Product Type/กลุ่มส่วนลด
  // ด้านบน) เพิ่มเองได้จากหน้า UI ทีหลัง ไม่ต้อง Hardcode เพิ่มในโค้ด ---
  const categories = [
    { code: "MATTRESS", name: "ฟูกที่นอน", usesSize: true, sortOrder: 1 },
    { code: "PILLOW", name: "หมอน", usesSize: false, sortOrder: 2 },
    { code: "OTHER", name: "อื่นๆ / ระบุเอง", usesSize: false, sortOrder: 3 },
  ];
  for (const c of categories) {
    await db.productCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  // --- VAT Rate ตั้งต้น 7% (ข้อ 26) ---
  const existingVat = await db.vatRate.findFirst({ where: { effectiveTo: null } });
  if (!existingVat) {
    await db.vatRate.create({
      data: { ratePct: 7.0, effectiveFrom: new Date("2020-01-01") },
    });
  }

  // --- ข้อมูลบริษัทเริ่มต้น (แก้ได้ที่หน้า ตั้งค่า > ข้อมูลบริษัท) ---
  await db.appSetting.upsert({
    where: { key: "company.name" },
    update: {},
    create: { key: "company.name", value: "(กรุณาตั้งชื่อบริษัทที่หน้า ตั้งค่า > ข้อมูลบริษัท)" },
  });

  console.log("Seed สำเร็จ — เข้าสู่ระบบด้วย username: admin / password: ChangeMe123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
