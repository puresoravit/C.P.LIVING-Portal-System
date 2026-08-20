import { describe, it, expect } from "vitest";
import { safeJsonForScript } from "./safe-json-script";

describe("safeJsonForScript (ข้อ 51 — ป้องกัน Stored XSS จาก </script> ในชื่อลูกค้า/สาขา)", () => {
  it("escape </script> ที่แฝงอยู่ในข้อมูล ไม่ให้แหกออกจาก script tag ได้", () => {
    const malicious = { name: '</script><script>alert("xss")</script>' };
    const result = safeJsonForScript(malicious);
    expect(result).not.toContain("</script>");
    expect(result).toContain("\\u003c/script\\u003e");
  });

  it("ข้อมูลปกติยัง parse กลับเป็น object เดิมได้ถูกต้อง (ไม่กระทบข้อมูลที่ไม่มีปัญหา)", () => {
    const normal = { id: "1", name: "บริษัท ตัวอย่าง จำกัด" };
    const result = safeJsonForScript(normal);
    // \u003c ใน string literal ของ JS จะถูกตีความกลับเป็น "<" ตอน JS engine parse
    // เราจึงต้องเช็คผ่าน eval-like JSON.parse หลัง unescape เพื่อจำลองพฤติกรรมจริงใน browser
    expect(JSON.parse(result.replace(/\\u003c/g, "<"))).toEqual(normal);
  });
});
