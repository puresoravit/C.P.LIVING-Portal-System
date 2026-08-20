import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isRateLimited, recordFailedAttempt, resetAttempts } from "@/lib/rate-limit";

// ---------------------------------------------------------------
// Authentication config (ข้อ 3 User Management, ข้อ 51 Security)
// - Password เก็บเป็น bcrypt hash เท่านั้น ห้าม plain text
// - Session เก็บ role ไว้ตรวจสอบสิทธิ์ในทุกหน้า/ทุก API route
// ---------------------------------------------------------------
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
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
