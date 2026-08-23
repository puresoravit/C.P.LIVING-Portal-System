import { convertHeicToJpeg } from "@/lib/heic-convert-action";

// ==========================================================================
// Owner UAT — Image Upload Compatibility: จุดกลางสำหรับ "รับไฟล์รูปจาก Input →
// คืน File/Data URI ที่พร้อมเข้า Preview/Crop/Upload Pipeline เดิม" ใช้ร่วมกันทั้ง Avatar
// (profile-form.tsx) และ Company Logo (logo-upload-form.tsx)
//
// รองรับ HEIC/HEIF จากกล้อง iPhone: ไม่มี Browser ไหนถอดรหัส HEIC ได้เองในตัว (แม้แต่
// Safari/iOS เองก็ยังพบเคส <input type=file> คืนไฟล์ HEIC ดิบมาโดยไม่ Auto-convert ให้ใน
// บาง Flow) — เคย Implement เป็น Client-side Decode ผ่าน Library (heic-to/libheif-wasm)
// มาก่อนแล้วพบว่า Decoder ต้องใช้ eval() ภายใน Web Worker จริง (ยืนยันจาก Error CSP ตรงๆ
// ไม่ใช่การเดา) ซึ่งจะบังคับให้ต้องเปิด 'unsafe-eval' ทั้งแอพ — ขัดกับนโยบายความปลอดภัย
// ที่ตั้งใจไม่มี 'unsafe-eval' มาตลอดทั้งระบบ (ข้อ 51) จึง**ย้าย Decode ไปทำฝั่ง Server
// แทน** (Node.js ไม่มี CSP บังคับ) ผ่าน Server Action เดียว (heic-convert-action.ts) —
// ไฟล์ปกติ (JPEG/PNG/WebP) ยังคงอ่านตรงๆ ฝั่ง Client เหมือนเดิมทุกประการ ไม่มี Round-trip
// ขึ้น Server โดยไม่จำเป็น — Sniff HEIC ด้วย Magic Byte ("ftyp" Box ของ ISO-BMFF) เอง
// ตรงๆ (ไม่ใช้ Library ภายนอก — Logic สั้นพอที่จะดูแลเองได้ ลด Dependency ที่ไม่จำเป็น)
// ไม่พึ่ง MIME/นามสกุลอย่างเดียวเพราะมือถือหลายรุ่นส่ง File.type เป็นค่าว่างสำหรับ HEIC
// ==========================================================================

export type NormalizedImageFile = {
  file: File;
  dataUrl: string;
  convertedFromHeic: boolean;
};

const HEIC_EXT_RE = /\.(heic|heif)$/i;
const HEIC_MIME_HINTS = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
const HEIC_MAJOR_BRANDS = new Set(["mif1", "msf1", "heic", "heix", "hevc", "hevx"]);

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

/** อ่าน Major Brand จาก ISO-BMFF "ftyp" Box (Byte 8-12 ของไฟล์) — มาตรฐานเดียวกับที่ HEIC/
 * HEIF ทุกไฟล์ต้องมีตาม Spec ISO/IEC 23008-12 — แม่นกว่าเช็คนามสกุล/MIME (ปลอมง่ายกว่า)
 * มาก แต่ยังคง Fallback ไปที่นามสกุล/MIME ไว้เผื่อไฟล์ที่มีปัญหาโครงสร้างเล็กน้อยแต่ยังเปิด
 * ได้จริง กัน False-negative ที่ทำให้ผู้ใช้งง */
async function looksLikeHeic(file: File): Promise<boolean> {
  try {
    const head = await file.slice(0, 12).arrayBuffer();
    if (head.byteLength >= 12) {
      const majorBrand = new TextDecoder("ascii")
        .decode(head.slice(8, 12))
        .replace(/\0/g, " ")
        .trim();
      if (HEIC_MAJOR_BRANDS.has(majorBrand)) return true;
    }
  } catch {
    // อ่าน Header ไม่สำเร็จ — ตกไปใช้ Fallback ด้านล่างต่อ
  }
  return HEIC_EXT_RE.test(file.name) || HEIC_MIME_HINTS.includes(file.type);
}

/** แปลงไฟล์ที่ผู้ใช้เลือกให้พร้อมใช้กับ Pipeline เดิม (Preview/Crop/Upload) เสมอ —
 * ไฟล์ปกติ (JPEG/PNG/WebP) อ่านตรงฝั่ง Client ไม่มี Overhead ใดๆ — ไฟล์ HEIC/HEIF ถูกส่ง
 * ไป Decode ฝั่ง Server (ดู Comment บนสุดของไฟล์นี้ว่าทำไม) แล้วได้ JPEG Data URI กลับมา —
 * Error จากทุกขั้นตอนถูกครอบด้วยข้อความภาษาไทยที่อ่านง่ายเสมอ */
export async function normalizeImageFileForUpload(file: File): Promise<NormalizedImageFile> {
  if (!(await looksLikeHeic(file))) {
    return { file, dataUrl: await readAsDataUrl(file), convertedFromHeic: false };
  }

  const fd = new FormData();
  fd.set("file", file);
  const result = await convertHeicToJpeg(fd);
  if (!result.success) {
    throw new Error(result.error === "UNAUTHORIZED" ? "กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง" : result.error);
  }

  // หมายเหตุ: ห้ามใช้ fetch(dataUri) แปลงกลับเป็น Blob (เคยลองแล้วโดน CSP connect-src
  // บล็อกเช่นกัน — data: ไม่อยู่ใน Allowlist ของ connect-src ซึ่งถูกต้องตามหลัก CSP) ถอด
  // Base64 เองตรงๆ ด้วย atob() แทน ไม่ต้องพึ่ง Network API ใดๆ เลย
  const convertedName = file.name.replace(HEIC_EXT_RE, "") + ".jpg";
  const base64 = result.dataUri.slice(result.dataUri.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const convertedFile = new File([bytes], convertedName || "photo.jpg", { type: "image/jpeg" });
  return { file: convertedFile, dataUrl: result.dataUri, convertedFromHeic: true };
}
