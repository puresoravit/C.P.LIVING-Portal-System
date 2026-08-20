import { describe, it, expect } from "vitest";
import { toPgToolsUrl } from "./backup";

describe("toPgToolsUrl (แก้ pg_dump/pg_restore error จาก Prisma-only query param)", () => {
  it("ตัด ?schema= ออก เพราะ libpq ไม่รู้จัก param นี้", () => {
    const result = toPgToolsUrl("postgresql://user:pass@localhost:5432/bill_system?schema=public");
    expect(result).not.toContain("schema");
  });

  it("เก็บ host/port/database/user/password ไว้ครบ", () => {
    const result = toPgToolsUrl("postgresql://user:pass@localhost:5432/bill_system?schema=public");
    const url = new URL(result);
    expect(url.hostname).toBe("localhost");
    expect(url.port).toBe("5432");
    expect(url.pathname).toBe("/bill_system");
    expect(url.username).toBe("user");
    expect(url.password).toBe("pass");
  });

  it("เก็บ query param อื่นที่ libpq รู้จักไว้ (เช่น sslmode)", () => {
    const result = toPgToolsUrl("postgresql://user:pass@host:5432/db?schema=public&sslmode=require");
    expect(result).toContain("sslmode=require");
    expect(result).not.toContain("schema");
  });

  it("ไม่มี ?schema= อยู่แล้วก็ไม่พัง (managed cloud DB URL ทั่วไปไม่มี param นี้)", () => {
    const result = toPgToolsUrl("postgresql://user:pass@host:5432/db");
    const url = new URL(result);
    expect(url.hostname).toBe("host");
  });
});
