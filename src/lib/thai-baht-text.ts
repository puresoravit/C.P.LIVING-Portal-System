import { Decimal } from "@prisma/client/runtime/library";

// ==========================================================================
// แปลงจำนวนเงินเป็นข้อความภาษาไทย เช่น 88410.00 -> "แปดหมื่นแปดพันสี่ร้อยสิบบาทถ้วน"
// ตามตัวอย่างเอกสารจริงที่ใช้ในระบบ (ใบส่งของ/ใบกำกับภาษี/ใบวางบิล ทุกใบต้องมี)
// ==========================================================================

const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function convertGroup(numStr: string): string {
  let result = "";
  const len = numStr.length;
  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i], 10);
    if (digit === 0) continue;
    const position = len - i - 1; // 0 = หน่วย, 1 = สิบ, ...

    if (position === 0) {
      // หลักหน่วย: "เอ็ด" ถ้าเป็นเลข 1 และมีหลักอื่นนำหน้า (ไม่ใช่เลขเดี่ยว)
      if (digit === 1 && len > 1) {
        result += "เอ็ด";
      } else {
        result += DIGITS[digit];
      }
    } else if (position === 1) {
      // หลักสิบ: "ยี่สิบ" ไม่ใช่ "สองสิบ", ไม่ใส่ "หนึ่ง" หน้า "สิบ"
      if (digit === 1) result += "สิบ";
      else if (digit === 2) result += "ยี่สิบ";
      else result += DIGITS[digit] + "สิบ";
    } else {
      result += DIGITS[digit] + POSITIONS[position];
    }
  }
  return result;
}

/** แปลงเลขจำนวนเต็ม (ไม่มีทศนิยม) เป็นคำอ่านภาษาไทย รองรับหลักล้านซ้ำ (ล้านล้าน) */
function convertInteger(n: number): string {
  if (n === 0) return "ศูนย์";
  let result = "";
  let remaining = n;
  const millionGroups: number[] = [];
  while (remaining > 0) {
    millionGroups.unshift(remaining % 1_000_000);
    remaining = Math.floor(remaining / 1_000_000);
  }
  for (let i = 0; i < millionGroups.length; i++) {
    const group = millionGroups[i];
    if (group === 0) continue;
    result += convertGroup(String(group));
    if (i < millionGroups.length - 1) result += "ล้าน";
  }
  return result;
}

/**
 * แปลงจำนวนเงิน (Decimal/number) เป็นข้อความภาษาไทยพร้อมคำลงท้าย "บาทถ้วน" หรือ "บาทสตางค์"
 * ปัดเศษทศนิยม 2 ตำแหน่งก่อนแปลงเสมอ (Round Half Up ตามมาตรฐานระบบ)
 */
export function toThaiBahtText(amount: Decimal | number): string {
  const value = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const baht = value.floor().toNumber();
  const satang = value.sub(value.floor()).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  const bahtText = convertInteger(baht) + "บาท";
  if (satang === 0) {
    return bahtText + "ถ้วน";
  }
  return bahtText + convertInteger(satang) + "สตางค์";
}
