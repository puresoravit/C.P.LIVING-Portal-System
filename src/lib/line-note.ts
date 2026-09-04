// ==========================================================================
// Owner (2026-09-04) — "หมายเหตุ (ถ้ามี)" ต่อรายการสินค้าใน Order/ใบเสนอราคา
//
// เดิมช่องนี้คือ descriptionOverride = "พิมพ์ทับชื่อสินค้า" (ออกแบบไว้สำหรับไซส์พิเศษ) —
// Owner เจอจริงว่าพิมพ์ "สินค้าตัวอย่าง" แล้วชื่อ Mary หายไปจากเอกสารทั้งใบ จึงเปลี่ยนเป็น
// "หมายเหตุ" ที่ต่อท้ายชื่อในวงเล็บบรรทัดเดียว: `ชื่อสินค้า (หมายเหตุ)` — ชื่อมาจากระบบเสมอ
// (descriptionOverride เหลือเป็นกลไกภายในของไซส์พิเศษเท่านั้น ผู้ใช้ไม่เห็น/ไม่กรอกอีก)
//
// โควตาความยาว (Owner): ชื่อ + หมายเหตุ รวมกันต้องไม่เกิน 1 บรรทัดของคอลัมน์ "รายการ" บน
// กระดาษ — ชื่อยาวเหลือที่ให้หมายเหตุน้อย ชื่อสั้นใส่ได้เยอะ (ไม่ใช่โควตาคงที่ของหมายเหตุ)
// เพราะแบบฟอร์ม Invoice นับแถวตายตัว (14 แถว) แถวที่ขึ้น 2 บรรทัดจะทำให้หน้าล้น
//
// นับเป็น "ตัวอักษรที่มองเห็น" (Grapheme) ไม่ใช่ UTF-16 unit — สระ/วรรณยุกต์ไทยลอยอยู่บน
// พยัญชนะ ไม่กินความกว้าง (ที่ = 1 ตัว ไม่ใช่ 3) — ค่าคงที่ปรับได้จุดเดียวที่นี่
// ==========================================================================

/** ความกว้างคอลัมน์ "รายการ" บนกระดาษ ≈ 55 ตัวอักษรที่มองเห็น (ชื่อ + " (" + หมายเหตุ + ")") */
export const LINE_TEXT_MAX_CHARS = 55;

/** " (" + ")" ที่ห่อหมายเหตุ */
const WRAPPER_CHARS = 3;

let segmenter: Intl.Segmenter | null | undefined;
function graphemeSegmenter(): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  try {
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "grapheme" }) : null;
  } catch {
    segmenter = null;
  }
  return segmenter;
}

/** จำนวนตัวอักษรที่มองเห็นจริง (Grapheme) — Fallback เป็น .length ถ้า Runtime ไม่รองรับ */
export function visibleLength(text: string): number {
  const seg = graphemeSegmenter();
  if (!seg) return text.length;
  let n = 0;
  for (const _ of seg.segment(text)) n++;
  return n;
}

export function normalizeLineNote(note: string | null | undefined): string {
  return (note ?? "").trim();
}

/** ข้อความที่แสดง/พิมพ์บนเอกสาร: `ชื่อสินค้า (หมายเหตุ)` หรือชื่อเฉยๆ ถ้าไม่มีหมายเหตุ */
export function composeLineName(name: string, note?: string | null): string {
  const n = normalizeLineNote(note);
  return n ? `${name} (${n})` : name;
}

/** หมายเหตุใส่ได้อีกกี่ตัวอักษรสำหรับชื่อสินค้านี้ (ติดลบได้ถ้าชื่อเองก็ยาวเกินบรรทัดอยู่แล้ว) */
export function lineNoteRemaining(name: string, note?: string | null): number {
  return LINE_TEXT_MAX_CHARS - WRAPPER_CHARS - visibleLength(name) - visibleLength(normalizeLineNote(note));
}

/** จำนวนตัวอักษรสูงสุดที่หมายเหตุใส่ได้สำหรับชื่อนี้ (ไม่ต่ำกว่า 0) */
export function lineNoteCapacity(name: string): number {
  return Math.max(0, LINE_TEXT_MAX_CHARS - WRAPPER_CHARS - visibleLength(name));
}

/** ข้อความ Error ถ้าหมายเหตุยาวเกินโควตาของชื่อนี้ — null = ผ่าน (ไม่มีหมายเหตุ = ผ่านเสมอ) */
export function lineNoteError(name: string, note?: string | null): string | null {
  const n = normalizeLineNote(note);
  if (!n) return null;
  const over = -lineNoteRemaining(name, n);
  if (over <= 0) return null;
  return `หมายเหตุยาวเกิน ${over} ตัวอักษร — สินค้านี้ใส่หมายเหตุได้ไม่เกิน ${lineNoteCapacity(name)} ตัวอักษร (ชื่อ + หมายเหตุ ต้องอยู่ใน 1 บรรทัดของเอกสาร)`;
}
