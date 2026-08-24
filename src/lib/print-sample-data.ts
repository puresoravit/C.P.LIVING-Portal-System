import type { DocumentTypeKey } from "./print-template-settings";

// ==========================================================================
// R6 Phase E — Sample/Preview Data สำหรับ Visual Document Designer เท่านั้น
// ข้อมูลทั้งหมดในไฟล์นี้เป็นข้อมูลสมมติล้วนๆ (ชื่อสินค้า/ลูกค้า/เลขที่เอกสาร/ยอดเงิน)
// ไม่ผูกกับ Transaction จริงใดๆ ในระบบ ไม่มีการอ่าน/เขียน Database จากไฟล์นี้เลย —
// Designer เป็น Presentation Layer เท่านั้น ห้ามสร้าง/แก้ไขข้อมูลเอกสารจริงเพื่อ
// Preview เด็ดขาด (ตามที่ Owner ระบุไว้ตรงๆ)
// ==========================================================================

export type SampleDensity = "short" | "long";

// ---------------------------------------------------------------------------
// Amount-in-words สำหรับ Sample Data เท่านั้น — คัดลอกอัลกอริทึมแปลงตัวเลขเป็นคำอ่าน
// ภาษาไทยจาก src/lib/thai-baht-text.ts มาแบบไม่พึ่ง @prisma/client/runtime (Decimal)
// เพราะไฟล์นี้ถูก import จาก Client Component (Visual Designer) — @prisma/client
// runtime ใช้ fs/child_process ซึ่ง Bundle ขึ้น Browser ไม่ได้ (Build ล้มเหลวถ้า import
// ตรง) ตัวเลข Sample ทั้งหมดในไฟล์นี้เป็นจำนวนเต็มอยู่แล้ว (ปัดด้วย Math.round) จึงไม่
// จำเป็นต้องใช้ Decimal Precision — ห้ามใช้ฟังก์ชันนี้กับข้อมูลเงินจริงเด็ดขาด (ใช้
// toThaiBahtText ของจริงเท่านั้นสำหรับเอกสารจริง)
const SAMPLE_DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const SAMPLE_POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function sampleConvertGroup(numStr: string): string {
  let result = "";
  const len = numStr.length;
  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i], 10);
    if (digit === 0) continue;
    const position = len - i - 1;
    if (position === 0) {
      result += digit === 1 && len > 1 ? "เอ็ด" : SAMPLE_DIGITS[digit];
    } else if (position === 1) {
      if (digit === 1) result += "สิบ";
      else if (digit === 2) result += "ยี่สิบ";
      else result += SAMPLE_DIGITS[digit] + "สิบ";
    } else {
      result += SAMPLE_DIGITS[digit] + SAMPLE_POSITIONS[position];
    }
  }
  return result;
}

function sampleConvertInteger(n: number): string {
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
    result += sampleConvertGroup(String(group));
    if (i < millionGroups.length - 1) result += "ล้าน";
  }
  return result;
}

/** เทียบเท่า toThaiBahtText ของจริง แต่รับ plain number เท่านั้น — สำหรับ Sample Data ใน
 * Visual Designer เท่านั้น (ดูเหตุผลด้านบน) */
export function sampleAmountToThaiWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);
  const bahtText = sampleConvertInteger(baht) + "บาท";
  return satang === 0 ? bahtText + "ถ้วน" : bahtText + sampleConvertInteger(satang) + "สตางค์";
}

const SAMPLE_PRODUCT_NAMES = [
  "พรมม้วนลายเปอร์เซีย",
  "พรมเช็ดเท้ายาง",
  "ผ้าใบกันสาด",
  "พรมปูพื้นสนามหญ้าเทียม",
  "ม่านม้วนกันแดด",
  "เสื่อน้ำมันลายไม้",
  "พรมออฟฟิศไทล์",
  "ผ้าใบคลุมรถบรรทุก",
  "พรมเช็ดเท้าโลโก้",
  "แผ่นยางกันลื่น",
  "พรมทางเดินกันไฟ",
  "ม่านพลาสติกใส",
  "พรมเช็ดเท้าเส้นด้าย",
  "ผ้าใบกันฝุ่นก่อสร้าง",
];
const SAMPLE_SIZES = ["1.2x2 ม.", "2x3 ม.", "60x90 ซม.", "1x1 ม.", "1.5x2.5 ม."];
const SAMPLE_UNITS = ["ผืน", "ม้วน", "ตร.ม.", "ชิ้น"];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function itemCount(density: SampleDensity): number {
  return density === "long" ? 14 : 3;
}

type SamplePriceItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  discount: number;
  net: number;
};

function buildPriceItems(density: SampleDensity, discountRate: number): SamplePriceItem[] {
  return Array.from({ length: itemCount(density) }, (_, i) => {
    const quantity = 2 + (i % 5);
    const unitPrice = 350 + i * 25;
    const gross = quantity * unitPrice;
    const discount = Math.round(gross * discountRate);
    return { id: `sample-${i}`, quantity, unitPrice, gross, discount, net: gross - discount };
  });
}

// ---------------------------------------------------------------------------
// Quotation
// ---------------------------------------------------------------------------
export function getSampleQuotationData(density: SampleDensity, applyDiscount: boolean, hasVat: boolean) {
  const priced = buildPriceItems(density, applyDiscount ? 0.05 : 0);
  const items = priced.map((p, i) => ({
    id: p.id,
    productNameSnapshot: pick(SAMPLE_PRODUCT_NAMES, i),
    sizeSnapshot: pick(SAMPLE_SIZES, i),
    quantity: p.quantity,
    unitSnapshot: pick(SAMPLE_UNITS, i),
    unitPriceSnapshot: p.unitPrice,
    discountAmount: p.discount,
    netAmount: p.net,
  }));
  const grossAmount = priced.reduce((s, p) => s + p.gross, 0);
  const discountAmount = priced.reduce((s, p) => s + p.discount, 0);
  const netBeforeVat = grossAmount - discountAmount;
  const vatRateSnapshot = 7;
  const vatAmount = hasVat ? Math.round(netBeforeVat * (vatRateSnapshot / 100)) : 0;
  const grandTotal = netBeforeVat + vatAmount;
  return {
    items,
    note: "ตัวอย่างหมายเหตุสำหรับแสดงผลใน Designer",
    grossAmount,
    discountAmount,
    applyDiscount,
    vatMode: hasVat ? "STANDARD" : "NONE",
    vatRateSnapshot,
    netBeforeVat,
    vatAmount,
    grandTotal,
  };
}

// ---------------------------------------------------------------------------
// Invoice (ใบส่งของชั่วคราว) — ไม่มี VAT เสมอ
// ---------------------------------------------------------------------------
export function getSampleInvoiceData(density: SampleDensity, applyDiscount: boolean) {
  const priced = buildPriceItems(density, applyDiscount ? 0.05 : 0);
  const items = priced.map((p, i) => ({
    id: p.id,
    productNameSnapshot: pick(SAMPLE_PRODUCT_NAMES, i),
    sizeSnapshot: pick(SAMPLE_SIZES, i),
    quantity: p.quantity,
    unitSnapshot: pick(SAMPLE_UNITS, i),
    unitPriceSnapshot: p.unitPrice,
    discountAmount: p.discount,
    netAmount: p.net,
  }));
  const grossAmount = priced.reduce((s, p) => s + p.gross, 0);
  const discountAmount = priced.reduce((s, p) => s + p.discount, 0);
  return { items, grossAmount, discountAmount, applyDiscount, grandTotal: grossAmount - discountAmount };
}

// ---------------------------------------------------------------------------
// Tax Invoice — มี VAT เสมอ
// ---------------------------------------------------------------------------
export function getSampleTaxInvoiceData(density: SampleDensity) {
  // Phase H — Sample มีส่วนลด 5% เพื่อให้ Designer เห็นคอลัมน์/แถวส่วนลดครบตาม
  // Invariant "Sample ต้องมีครบทุก Field ที่หน้าพิมพ์จริงมีโอกาสแสดง" — ลำดับคำนวณ
  // เดียวกับเอกสารจริง: gross − discount = net(VAT-inc) แล้วถอด VAT ออกจาก net
  const priced = buildPriceItems(density, 0.05);
  const items = priced.map((p, i) => ({
    id: p.id,
    description: pick(SAMPLE_PRODUCT_NAMES, i),
    size: pick(SAMPLE_SIZES, i),
    quantity: p.quantity,
    unit: pick(SAMPLE_UNITS, i),
    unitPrice: p.unitPrice,
    amount: p.gross,
    discountAmount: p.discount,
  }));
  const grossAmount = priced.reduce((s, p) => s + p.gross, 0);
  const discountAmount = priced.reduce((s, p) => s + p.discount, 0);
  const netAmount = grossAmount - discountAmount;
  const vatPct = 7; // Sample คงที่ (ข้อมูลสมมติของ Designer — เอกสารจริงอ่านจาก VAT configuration เสมอ)
  const vatAmount = Math.round((netAmount * vatPct) / (100 + vatPct));
  const valueAmount = netAmount - vatAmount;
  return { items, grossAmount, discountAmount, valueAmount, vatPct, vatAmount, netAmount };
}

// ---------------------------------------------------------------------------
// Billing Note — รายการคือ Invoice ที่ถูกรวมบิล ไม่ใช่ Product Item
// ---------------------------------------------------------------------------
export function getSampleBillingNoteData(density: SampleDensity) {
  const n = density === "long" ? 10 : 3;
  const invoices = Array.from({ length: n }, (_, i) => {
    const grandTotal = 4200 + i * 850;
    return {
      id: `sample-inv-${i}`,
      invoiceNumber: `IV-SAMPLE-${String(i + 1).padStart(3, "0")}`,
      invoiceDateLabel: "01/08/2569",
      dueDateLabel: "31/08/2569",
      grandTotal,
    };
  });
  const totalAmount = invoices.reduce((s, inv) => s + inv.grandTotal, 0);
  return { invoices, totalAmount };
}

// ---------------------------------------------------------------------------
// Repair / Return Note — ไม่มีราคา/VAT
// ---------------------------------------------------------------------------
export function getSampleRepairNoteData(density: SampleDensity) {
  const n = itemCount(density);
  const items = Array.from({ length: n }, (_, i) => ({
    id: `sample-${i}`,
    description: pick(SAMPLE_PRODUCT_NAMES, i),
    size: pick(SAMPLE_SIZES, i),
    quantity: 1 + (i % 3),
    unit: pick(SAMPLE_UNITS, i),
  }));
  return { items, remark: "ตัวอย่างหมายเหตุการซ่อม/คืนสินค้าสำหรับแสดงผลใน Designer" };
}

// ---------------------------------------------------------------------------
// Title + Customer Info block content ต่อประเภทเอกสาร — Layout/ข้อความอ้างอิงจาก
// หน้า Print จริงของแต่ละประเภท (ดู src/app/(dashboard)/<doc>/[id]/print/page.tsx)
// เป็นข้อความคงที่ ไม่ใช่ Field ที่ Designer แก้ไขได้ (แสดงเพื่อ Preview เท่านั้น)
// ---------------------------------------------------------------------------
export type SampleDocInfo = {
  titleTh: string;
  titleEn: string;
  customerLeft: { label: string; value: string }[];
  customerRight: { label: string; value: string }[];
  shippingAddress?: string;
};

const SAMPLE_CUSTOMER_NAME = "บริษัท ตัวอย่างลูกค้า จำกัด";
const SAMPLE_ADDRESS = "123 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10110";
const SAMPLE_SHIPPING = "456 ถนนสมมติ ตำบลสมมติ อำเภอสมมติ ชลบุรี 20000";

// ---------------------------------------------------------------------------
// R6 Phase E.3 — Semantic Element Free Layout ต้องการข้อมูลแบ่งระดับ Field เดียว (1
// Element = 1 บรรทัด) ตรงกับที่หน้า Print จริงทั้ง 5 ส่งให้ HeaderZone (ดู
// quotations/[id]/print/page.tsx เป็นตัวอย่างอ้างอิง) — เนื้อหาข้อมูลเหมือนเดิมทุกประการ
// แค่จัดกลุ่มละเอียดขึ้น ไม่ใช่ข้อมูลชุดใหม่ — Field ที่ประเภทเอกสารนั้นไม่มีจริง (เช่น
// Billing Note ไม่มี customerAddress) จะเป็น undefined ตรงกับที่หน้า Print จริงไม่ส่ง Key
// นั้นเข้า HeaderZone เช่นกัน (Data-driven Suppression เดียวกัน)
// ---------------------------------------------------------------------------
export type SampleHeaderZoneInfo = {
  titleTh: string;
  titleEn: string;
  docNumber: string;
  docDate: string;
  customerCode?: string;
  reference?: string;
  customerName: string;
  customerAddress?: string;
  customerTaxId?: string;
  shippingAddress?: string;
};

export function getSampleHeaderZoneInfo(docType: DocumentTypeKey): SampleHeaderZoneInfo {
  switch (docType) {
    case "QUOTATION":
      return {
        titleTh: "ใบเสนอราคา",
        titleEn: "QUOTATION",
        docNumber: "QT-SAMPLE-001",
        docDate: "22/08/2569",
        customerCode: "C-0001",
        customerName: SAMPLE_CUSTOMER_NAME,
        customerAddress: SAMPLE_ADDRESS,
        // Owner UAT (2026-08-23) — หน้าพิมพ์ใบเสนอราคาจริงแสดงเลขผู้เสียภาษีลูกค้าได้ (เมื่อ
        // ลูกค้ามี taxId) แต่ Sample เดิมไม่มี Field นี้ → Element ไม่โผล่บน Designer เลย
        // ทำให้ Owner จัดตำแหน่ง/ซ่อนไม่ได้ทั้งที่ของจริงพิมพ์ออกมา — Invariant สำคัญ:
        // Sample ของแต่ละประเภทเอกสารต้องมีครบทุก Field ที่หน้าพิมพ์จริง "มีโอกาสแสดง"
        customerTaxId: "0-1055-55555-55-5",
        shippingAddress: SAMPLE_SHIPPING,
      };
    case "INVOICE":
      return {
        titleTh: "ใบส่งของชั่วคราว",
        titleEn: "INVOICE",
        docNumber: "IV-SAMPLE-001",
        docDate: "22/08/2569",
        customerCode: "C-0001",
        customerName: SAMPLE_CUSTOMER_NAME,
        customerAddress: SAMPLE_ADDRESS,
        shippingAddress: SAMPLE_SHIPPING,
      };
    case "TAX_INVOICE":
      return {
        titleTh: "ใบกำกับภาษี / ใบเสร็จรับเงิน",
        titleEn: "TAX INVOICE / RECEIPT",
        docNumber: "TX-SAMPLE-001",
        docDate: "22/08/2569",
        customerCode: "C-0001",
        customerName: SAMPLE_CUSTOMER_NAME,
        customerAddress: SAMPLE_ADDRESS,
        customerTaxId: "0-1055-55555-55-5",
        shippingAddress: SAMPLE_SHIPPING,
      };
    case "BILLING_NOTE":
      return {
        titleTh: "ใบวางบิล",
        titleEn: "BILLING NOTE",
        docNumber: "BN-SAMPLE-001",
        docDate: "22/08/2569",
        customerName: SAMPLE_CUSTOMER_NAME,
        customerTaxId: "0-1055-55555-55-5",
      };
    case "REPAIR_NOTE":
      return {
        titleTh: "ใบส่งคืนสินค้าฝากซ่อม",
        titleEn: "REPAIR / RETURN NOTE",
        docNumber: "RN-SAMPLE-001",
        docDate: "22/08/2569",
        customerCode: "C-0001",
        reference: "IV-SAMPLE-001",
        customerName: SAMPLE_CUSTOMER_NAME,
        customerAddress: SAMPLE_ADDRESS,
        shippingAddress: SAMPLE_SHIPPING,
      };
  }
}

export function getSampleDocInfo(docType: DocumentTypeKey): SampleDocInfo {
  switch (docType) {
    case "QUOTATION":
      return {
        titleTh: "ใบเสนอราคา",
        titleEn: "QUOTATION",
        customerLeft: [
          { label: "ลูกค้า", value: SAMPLE_CUSTOMER_NAME },
          { label: "ที่อยู่", value: SAMPLE_ADDRESS },
        ],
        customerRight: [
          { label: "เลขที่", value: "QT-SAMPLE-001" },
          { label: "วันที่", value: "22/08/2569" },
          { label: "รหัสลูกค้า", value: "C-0001" },
        ],
        shippingAddress: SAMPLE_SHIPPING,
      };
    case "INVOICE":
      return {
        titleTh: "ใบส่งของชั่วคราว",
        titleEn: "INVOICE",
        customerLeft: [
          { label: "ลูกค้า", value: SAMPLE_CUSTOMER_NAME },
          { label: "ที่อยู่", value: SAMPLE_ADDRESS },
        ],
        customerRight: [
          { label: "เลขที่", value: "IV-SAMPLE-001" },
          { label: "วันที่", value: "22/08/2569" },
          { label: "รหัสลูกค้า", value: "C-0001" },
        ],
        shippingAddress: SAMPLE_SHIPPING,
      };
    case "TAX_INVOICE":
      return {
        titleTh: "ใบกำกับภาษี / ใบเสร็จรับเงิน",
        titleEn: "TAX INVOICE / RECEIPT",
        customerLeft: [
          { label: "ลูกค้า", value: SAMPLE_CUSTOMER_NAME },
          { label: "เลขประจำตัวผู้เสียภาษี", value: "0-1055-55555-55-5" },
          { label: "ที่อยู่", value: SAMPLE_ADDRESS },
        ],
        customerRight: [
          { label: "เลขที่", value: "TX-SAMPLE-001" },
          { label: "วันที่", value: "22/08/2569" },
          { label: "รหัสลูกค้า", value: "C-0001" },
        ],
        shippingAddress: SAMPLE_SHIPPING,
      };
    case "BILLING_NOTE":
      return {
        titleTh: "ใบวางบิล",
        titleEn: "BILLING NOTE",
        customerLeft: [
          { label: "ลูกค้า", value: SAMPLE_CUSTOMER_NAME },
          { label: "เลขประจำตัวผู้เสียภาษี", value: "0-1055-55555-55-5" },
        ],
        customerRight: [
          { label: "เลขที่", value: "BN-SAMPLE-001" },
          { label: "วันที่", value: "22/08/2569" },
        ],
      };
    case "REPAIR_NOTE":
      return {
        titleTh: "ใบส่งคืนสินค้าฝากซ่อม",
        titleEn: "REPAIR / RETURN NOTE",
        customerLeft: [
          { label: "ลูกค้า", value: SAMPLE_CUSTOMER_NAME },
          { label: "ที่อยู่", value: SAMPLE_ADDRESS },
        ],
        customerRight: [
          { label: "เลขที่", value: "RN-SAMPLE-001" },
          { label: "วันที่", value: "22/08/2569" },
          { label: "รหัสลูกค้า", value: "C-0001" },
          { label: "อ้างถึง", value: "IV-SAMPLE-001" },
        ],
        shippingAddress: SAMPLE_SHIPPING,
      };
  }
}
