import { PrismaClient } from "@prisma/client";

// ป้องกัน hot-reload สร้าง PrismaClient ซ้ำหลายตัวตอน dev (Next.js standard pattern)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
