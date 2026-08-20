import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

describe("logger (ข้อ 67 — console คือ channel หลักที่รับประกันว่าใช้ได้เสมอ)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("logError พิมพ์ entry เต็มเป็น JSON บรรทัดเดียวลง console เสมอ (ไม่ใช่แค่ message สั้นๆ)", async () => {
    const { logError } = await import("./logger");
    logError("test-context", new Error("boom"));

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const printed = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(printed.level).toBe("ERROR");
    expect(printed.context).toBe("test-context");
    expect(printed.message).toBe("boom");
    expect(printed.stack).toContain("Error: boom");
  });

  it("redact ข้อมูลอ่อนไหวใน extra ก่อนพิมพ์ลง console เสมอ", async () => {
    const { logError } = await import("./logger");
    logError("login", new Error("failed"), {
      username: "admin",
      password: "supersecret",
      token: "abc123",
    });

    const printed = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(printed.extra.username).toBe("admin");
    expect(printed.extra.password).toBe("[REDACTED]");
    expect(printed.extra.token).toBe("[REDACTED]");
  });

  it("redact ทำงานกับ nested object ด้วย", async () => {
    const { logError } = await import("./logger");
    logError("nested", new Error("x"), {
      user: { name: "admin", passwordHash: "$2a$..." },
    });

    const printed = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(printed.extra.user.name).toBe("admin");
    expect(printed.extra.user.passwordHash).toBe("[REDACTED]");
  });

  it("ไม่ throw แม้เขียนไฟล์ไม่ได้ (เช่น read-only filesystem บน ephemeral container)", async () => {
    vi.mocked(fs.appendFileSync).mockImplementation(() => {
      throw new Error("EROFS: read-only file system");
    });
    const { logError } = await import("./logger");

    expect(() => logError("ctx", new Error("x"))).not.toThrow();
    // console.error ยังต้องทำงานแม้ไฟล์เขียนไม่ได้
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("readRecentLogs คืน [] เฉยๆ ถ้าไฟล์ยังไม่มี (ไม่ throw)", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { readRecentLogs } = await import("./logger");
    expect(readRecentLogs()).toEqual([]);
  });
});
