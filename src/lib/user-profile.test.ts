import { describe, it, expect } from "vitest";
import {
  resolveTitlePrefix,
  formatDisplayName,
  validateAvatarDataUri,
  validateNewPassword,
  AVATAR_MAX_BYTES,
} from "./user-profile";

describe("user-profile", () => {
  it("resolveTitlePrefix รับเฉพาะ MR/MS ที่นิยามไว้ นอกนั้น null เสมอ", () => {
    expect(resolveTitlePrefix("MR")).toBe("MR");
    expect(resolveTitlePrefix("MS")).toBe("MS");
    expect(resolveTitlePrefix("DR")).toBeNull();
    expect(resolveTitlePrefix(null)).toBeNull();
    expect(resolveTitlePrefix(undefined)).toBeNull();
  });

  it("formatDisplayName ต่อคำนำหน้าเฉพาะเมื่อมีค่าถูกต้อง", () => {
    expect(formatDisplayName("MR", "สมชาย")).toBe("Mr. สมชาย");
    expect(formatDisplayName("MS", "สมหญิง")).toBe("Ms. สมหญิง");
    expect(formatDisplayName(null, "สมชาย")).toBe("สมชาย");
    expect(formatDisplayName("INVALID", "สมชาย")).toBe("สมชาย");
  });

  it("validateAvatarDataUri ปฏิเสธรูปแบบผิด/ชนิดไฟล์ไม่รองรับ/เกินขนาด", () => {
    expect(validateAvatarDataUri("not-a-data-uri").valid).toBe(false);
    expect(validateAvatarDataUri("data:image/svg+xml;base64,PHN2Zz4=").valid).toBe(false);
    const bigBase64 = Buffer.alloc(AVATAR_MAX_BYTES + 1).toString("base64");
    expect(validateAvatarDataUri(`data:image/png;base64,${bigBase64}`).valid).toBe(false);
  });

  it("validateAvatarDataUri ยอมรับ PNG/JPEG/WebP ที่ขนาดไม่เกินลิมิต", () => {
    const okBase64 = Buffer.alloc(1024).toString("base64");
    expect(validateAvatarDataUri(`data:image/png;base64,${okBase64}`).valid).toBe(true);
    expect(validateAvatarDataUri(`data:image/jpeg;base64,${okBase64}`).valid).toBe(true);
    expect(validateAvatarDataUri(`data:image/webp;base64,${okBase64}`).valid).toBe(true);
  });

  it("validateNewPassword บังคับความยาวขั้นต่ำและต้อง Confirm ตรงกัน", () => {
    expect(validateNewPassword("short", "short").valid).toBe(false);
    expect(validateNewPassword("longenough1", "different1").valid).toBe(false);
    expect(validateNewPassword("longenough1", "longenough1").valid).toBe(true);
  });
});
