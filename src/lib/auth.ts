import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isRateLimited, recordFailedAttempt, resetAttempts } from "@/lib/rate-limit";
import { isProduction } from "@/lib/auth-cookies";
import { finishAuthentication, safeCredentialRef } from "@/lib/webauthn";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

// ---------------------------------------------------------------
// Authentication config (ข้อ 3 User Management, ข้อ 51 Security)
// - Password เก็บเป็น bcrypt hash เท่านั้น ห้าม plain text
// - Session เก็บ role ไว้ตรวจสอบสิทธิ์ในทุกหน้า/ทุก API route
// ---------------------------------------------------------------

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 วัน — ค่า default ของ NextAuth ระบุชัดเจนไว้ในโค้ดแทนการพึ่ง default โดยไม่รู้ตัว
  // บังคับ secure cookie (ต้องส่งผ่าน HTTPS เท่านั้น, ชื่อ cookie ขึ้นต้น __Secure-)
  // ตาม NODE_ENV แทนที่จะพึ่งแค่การ parse NEXTAUTH_URL อัตโนมัติของ NextAuth —
  // กันกรณีตั้ง NEXTAUTH_URL ผิดพลาดตอน deploy จริงแล้ว cookie หลุดไม่ secure
  // โดยไม่มีใครสังเกตเห็น — middleware.ts ต้องใช้ isProduction ตัวเดียวกันนี้
  // (ผ่าน src/lib/auth-cookies.ts) ไม่งั้นชื่อ cookie จะไม่ตรงกัน
  useSecureCookies: isProduction,
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // Rate limit ตาม username ก่อนแตะ DB เลย — กัน brute-force (ข้อ 51)
        // ไม่บอกความแตกต่างระหว่าง "โดน rate limit" กับ "รหัสผิด" ให้ผู้ใช้เห็น
        // (ทั้งคู่คืน null เหมือนกัน) เพื่อไม่เปิดช่องให้เดา username ที่มีจริง
        const rateLimitKey = credentials.username.toLowerCase();
        if (isRateLimited(rateLimitKey)) return null;

        const user = await db.user.findUnique({
          where: { username: credentials.username },
        });

        if (!user || !user.active) {
          recordFailedAttempt(rateLimitKey);
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          recordFailedAttempt(rateLimitKey);
          return null;
        }

        resetAttempts(rateLimitKey);

        return {
          id: user.id,
          name: user.displayName,
          email: user.email ?? undefined,
          role: user.role,
        };
      },
    }),

    // Phase G — Passkey/WebAuthn: Provider ที่ 2 ใน NextAuth "เดิม" (ไม่ใช่ Session System
    // คู่ขนาน) — Client ทำ navigator.credentials.get() กับ OS Prompt จริง (Face ID/Touch ID/
    // Fingerprint) แล้วส่ง Assertion JSON + challengeId มาที่ authorize() นี้ → Verify ฝั่ง
    // Server ทั้งหมดผ่าน finishAuthentication() (challenge single-use/expiry, origin, rpID,
    // signature, counter, เจ้าของ credential) → คืน User Object รูปแบบเดียวกับ Credentials
    // Provider เป๊ะ → jwt/session callbacks ด้านล่างตั้ง role/uid เหมือนเดิม → Middleware/
    // requireUser/can()/App Access/isOwner/Inactivity Logout ทำงานเหมือน Password Login
    // ทุกประการ (Passkey = Authentication เท่านั้น ไม่แตะ Authorization)
    CredentialsProvider({
      id: "passkey",
      name: "passkey",
      credentials: {
        challengeId: { label: "challengeId", type: "text" },
        response: { label: "response", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.challengeId || !credentials?.response) return null;

        let response: AuthenticationResponseJSON;
        try {
          response = JSON.parse(credentials.response);
          if (!response || typeof response.id !== "string" || !response.response) return null;
        } catch {
          return null;
        }

        // Rate limit ต่อ credentialId (Brute-force Assertion ปลอมต่อ Credential เดียว) — Key คนละ
        // Namespace กับ Username ของ Password Login
        const rateLimitKey = `passkey:${response.id}`;
        if (isRateLimited(rateLimitKey)) return null;

        const result = await finishAuthentication(credentials.challengeId, response);

        if (!result.ok) {
          recordFailedAttempt(rateLimitKey);
          // Audit เฉพาะกรณีที่รู้ว่า Credential ไหน (ข้อมูลปลอดภัย: reason + ref ย่อ) — ไม่เก็บ
          // Assertion/Challenge/Signature ใดๆ — ใช้ userId ของเจ้าของ Credential ถ้าหาเจอ
          if (result.credentialId && result.reason !== "unknown_credential") {
            const owner = await db.webAuthnCredential.findUnique({ where: { id: result.credentialId }, select: { userId: true } });
            if (owner) {
              await db.auditLog.create({
                data: {
                  userId: owner.userId,
                  action: "PASSKEY_LOGIN_FAILED",
                  module: "Auth",
                  recordId: owner.userId,
                  newValue: { reason: result.reason, credentialRef: safeCredentialRef(result.credentialId) },
                },
              });
            }
          }
          return null;
        }

        resetAttempts(rateLimitKey);
        await db.auditLog.create({
          data: {
            userId: result.user.id,
            action: "PASSKEY_LOGIN_SUCCESS",
            module: "Auth",
            recordId: result.user.id,
            newValue: { credentialRef: safeCredentialRef(result.credentialId) },
          },
        });

        return {
          id: result.user.id,
          name: result.user.displayName,
          email: result.user.email ?? undefined,
          role: result.user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.uid = (user as any).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.uid;
      }
      return session;
    },
  },
};
