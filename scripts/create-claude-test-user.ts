/**
 * Temporary Claude UAT Account — Safe Setup
 *
 * Owner รันสคริปต์นี้เองเท่านั้น (Claude ไม่รัน — ถูกบล็อกโดย Auto-mode Classifier
 * ในฐานะ Account Creation ด้วย และไม่ควรทำแม้ทำได้ เพราะเป็นการสร้าง Credential จริง)
 *
 * สร้างบัญชีทดสอบ `claude_test` — Role BILLING_STAFF (สิทธิ์ต่ำสุดที่ยังใช้งาน
 * Billing ได้จริง), isOwner=false เสมอ (ไม่มีทาง Grant Access Management ได้แม้แต่
 * โดยอ้อม — Access Management ผูกกับ isOwner=true ที่ auth.ts/portal/access เท่านั้น
 * ไม่ผูกกับ Role ใดๆ), ให้สิทธิ์ App "billing" อย่างเดียว (ไม่ใช่ทุกแอปใน Portal)
 *
 * รหัสผ่าน: อ่านจาก Prompt แบบซ่อนตัวอักษร (Terminal ไม่ Echo กลับ) หรือ Environment
 * Variable CLAUDE_TEST_PASSWORD ถ้าตั้งไว้ก่อนรัน — ไม่ Hardcode/ไม่ Log/ไม่ผ่าน
 * argv (argv โผล่ใน `ps` ของเครื่องได้) ที่ใดในสคริปต์นี้เลย
 *
 * Idempotent: รันซ้ำได้ปลอดภัย — ถ้ามี Username นี้อยู่แล้วจะ "ไม่" สร้างซ้ำและ "ไม่"
 * เขียนทับรหัสผ่านเดิมโดยไม่ตั้งใจ (ถาม Confirm ก่อนถ้าจะ Reset รหัส) แต่จะ Sync
 * Role/isOwner/App Access ให้ตรง Spec เสมอ (กันกรณีมีคนแก้ไขบัญชีนี้ไปเป็นอย่างอื่น)
 *
 * รันด้วย: npx tsx scripts/create-claude-test-user.ts
 *
 * ก่อนขึ้น Production: ต้อง Disable/Delete บัญชีนี้ — ดูคำสั่งท้ายไฟล์
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { validateNewPassword, PASSWORD_MIN_LENGTH } from "../src/lib/user-profile";

const USERNAME = "claude_test";
const DISPLAY_NAME = "Claude (UAT Test Account)";
const ROLE = "BILLING_STAFF" as const;
const APP_ID = "billing";

const db = new PrismaClient();

/** อ่านรหัสผ่านแบบไม่ Echo ตัวอักษรกลับหน้าจอ (เหมือน sudo) — ใช้ได้เฉพาะ Interactive
 * TTY เท่านั้น (Owner รันตรงใน Terminal ของตัวเอง ไม่ใช่ผ่าน Pipe/CI) */
function readHiddenInput(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error("ไม่ใช่ Interactive Terminal — กรุณาตั้ง Environment Variable CLAUDE_TEST_PASSWORD แทน"));
      return;
    }
    stdout.write(promptText);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (char: string) => {
      char = char.toString();
      if (char === "\n" || char === "\r" || char === "") {
        cleanup();
        stdout.write("\n");
        resolve(input);
      } else if (char === "") {
        cleanup();
        stdout.write("\n");
        process.exit(1);
      } else if (char === "" || char === "\b") {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    stdin.on("data", onData);
  });
}

async function confirm(promptText: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(promptText);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.CLAUDE_TEST_PASSWORD;
  if (fromEnv) {
    console.log("ใช้รหัสผ่านจาก Environment Variable CLAUDE_TEST_PASSWORD");
    return fromEnv;
  }
  const password = await readHiddenInput(
    `ตั้งรหัสผ่านสำหรับบัญชี "${USERNAME}" (อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร, จะไม่แสดงบนหน้าจอ): `
  );
  const confirmPassword = await readHiddenInput("ยืนยันรหัสผ่านอีกครั้ง: ");
  const check = validateNewPassword(password, confirmPassword);
  if (!check.valid) {
    throw new Error(check.error);
  }
  return password;
}

async function main() {
  const existing = await db.user.findUnique({ where: { username: USERNAME } });

  let userId: string;
  if (existing) {
    console.log(`บัญชี "${USERNAME}" มีอยู่แล้ว (สร้างเมื่อ ${existing.createdAt.toISOString()}) — จะไม่สร้างซ้ำ`);
    const wantsReset = await confirm("ต้องการตั้งรหัสผ่านใหม่ให้บัญชีนี้ด้วยหรือไม่? (y/N): ");
    if (wantsReset) {
      const password = await readPassword();
      const passwordHash = await bcrypt.hash(password, 10);
      await db.user.update({
        where: { id: existing.id },
        data: { passwordHash, role: ROLE, isOwner: false, active: true, displayName: DISPLAY_NAME },
      });
      console.log("ตั้งรหัสผ่านใหม่แล้ว");
    } else {
      // ยัง Sync Role/isOwner/Active ให้ตรง Spec เผื่อมีการแก้ไขบัญชีนี้ไปก่อนหน้า
      await db.user.update({
        where: { id: existing.id },
        data: { role: ROLE, isOwner: false, active: true, displayName: DISPLAY_NAME },
      });
    }
    userId = existing.id;
  } else {
    const password = await readPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await db.user.create({
      data: {
        username: USERNAME,
        displayName: DISPLAY_NAME,
        passwordHash,
        role: ROLE,
        isOwner: false,
        active: true,
      },
    });
    userId = created.id;
    console.log(`สร้างบัญชี "${USERNAME}" สำเร็จ (Role: ${ROLE}, isOwner: false)`);
  }

  await db.userAppAccess.upsert({
    where: { userId_appId: { userId, appId: APP_ID } },
    update: {},
    create: { userId, appId: APP_ID },
  });
  console.log(`ให้สิทธิ์เข้าแอป "${APP_ID}" เรียบร้อย (แอปอื่นใน Portal ไม่ได้รับสิทธิ์)`);

  console.log("\nเสร็จสิ้น — Username สำหรับ Login:", USERNAME);
}

main()
  .catch((err) => {
    console.error("ล้มเหลว:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

/**
 * ก่อนขึ้น Production — Disable บัญชีนี้ (เก็บ Audit Trail ไว้ ไม่ลบ Row):
 *   npx tsx -e "
 *     import { PrismaClient } from '@prisma/client';
 *     const db = new PrismaClient();
 *     db.user.update({ where: { username: 'claude_test' }, data: { active: false } })
 *       .then(() => console.log('disabled')).finally(() => db.\$disconnect());
 *   "
 *
 * หรือลบถาวร (จะลบ AuditLog/UserAppAccess ที่ผูกกับบัญชีนี้ด้วยตาม FK — ตรวจสอบก่อนว่า
 * ไม่มี Record อื่นอ้างอิงถึง userId นี้อยู่):
 *   npx tsx -e "
 *     import { PrismaClient } from '@prisma/client';
 *     const db = new PrismaClient();
 *     db.user.delete({ where: { username: 'claude_test' } })
 *       .then(() => console.log('deleted')).finally(() => db.\$disconnect());
 *   "
 */
