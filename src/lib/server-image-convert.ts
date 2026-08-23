import heicConvert from "heic-convert";

// ==========================================================================
// Owner UAT — Image Upload Compatibility: HEIC/HEIF Decode ทำฝั่ง Server เท่านั้น
// (Node.js ไม่มี CSP บังคับ — ไม่ต้องแลกกับการเปิด 'unsafe-eval' ที่ระบบตั้งใจไม่มีมาตลอด
// ทั้ง Session) — ใช้ heic-convert (ครอบ libheif-js/WASM เดียวกับที่เคยลองฝั่ง Client
// แต่รันในที่ที่ไม่มีข้อจำกัด CSP) — ไฟล์นี้เป็น Server-only ล้วน (ใช้ Buffer/WASM ผ่าน
// Node) ห้าม Import จาก Client Component เด็ดขาด — จุดเข้าเดียวที่ปลอดภัยคือผ่าน
// heic-convert-action.ts (Server Action มี Auth Guard + Re-validate Magic Byte)
// ==========================================================================

// ISO-BMFF "ftyp" Box: 4 Byte แรกเป็นขนาด Box, ตามด้วย "ftyp" (Byte 4-8), แล้ว Major
// Brand 4 Byte (Byte 8-12) — HEIC/HEIF ใช้ค่านี้ระบุชนิดไฟล์เสมอตาม Spec ISO/IEC 23008-12
const HEIC_MAJOR_BRANDS = new Set(["mif1", "msf1", "heic", "heix", "hevc", "hevx"]);

export function looksLikeHeicBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const majorBrand = buffer.toString("ascii", 8, 12).replace(/\0/g, " ").trim();
  return HEIC_MAJOR_BRANDS.has(majorBrand);
}

export async function convertHeicBufferToJpeg(buffer: Buffer, quality = 0.92): Promise<Buffer> {
  const output = await heicConvert({ buffer, format: "JPEG", quality });
  return Buffer.from(output);
}
