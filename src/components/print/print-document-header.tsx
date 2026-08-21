import type { CompanySettings } from "@/lib/company-settings";
import { LOGO_SIZE_PX, type LogoSizeKey } from "@/lib/print-template-settings";

// ข้อ 7.1 Company Header — ใช้ร่วมกันทุกเอกสาร: Logo ซ้าย, ชื่อ/ที่อยู่/โทร/Tax ID
// อยู่กึ่งกลาง แบบ compact สงวนพื้นที่แนวตั้งให้ Item Table เป็นหลัก
//
// R5 — logo/logoSize/showAddress/showPhone/showTaxId มาจาก Template Settings ที่
// Resolve แล้ว (Global + Per-Document Override) — Default ทุกตัว (ไม่ส่ง Prop มาเลย)
// ต้อง Render เหมือนพฤติกรรมเดิมเป๊ะ: Logo /logo.jpg สูง 44px (h-11) ไม่จำกัดความกว้าง,
// แสดงทุกแถวเสมอ — Container ใช้ min-height ตาม logoSize ที่เลือก กัน Logo (Absolute
// Position) ล้นออกนอก Container เวลาเลือก Tier "large" แต่เนื้อหาข้อความสั้นกว่า
export function PrintDocumentHeader({
  company,
  logo,
  logoSize = "normal",
  showAddress = true,
  showPhone = true,
  showTaxId = true,
}: {
  company: CompanySettings;
  logo?: string | null;
  logoSize?: LogoSizeKey;
  showAddress?: boolean;
  showPhone?: boolean;
  showTaxId?: boolean;
}) {
  const { heightPx, maxWidthPx } = LOGO_SIZE_PX[logoSize];
  return (
    <div className="relative mb-1.5" style={{ minHeight: `${heightPx}px` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Data URI จาก AppSetting หรือไฟล์ static ธรรมดา ไม่ต้องผ่าน next/image optimizer สำหรับหน้า print */}
      <img
        src={logo || "/logo.jpg"}
        alt=""
        className="absolute left-0 top-0 w-auto object-contain"
        style={{ height: `${heightPx}px`, maxWidth: maxWidthPx ? `${maxWidthPx}px` : undefined }}
      />
      <div className="text-center px-14">
        <div className="font-semibold text-[length:var(--print-heading-size)] leading-tight">{company.name}</div>
        {showAddress && company.address && (
          <div className="text-[10px] text-gray-600 leading-tight">{company.address}</div>
        )}
        {(showPhone || showTaxId) && (
          <div className="text-[10px] text-gray-600 leading-tight">
            {showPhone && company.phone && <>โทร {company.phone}</>}
            {showPhone && company.phone && showTaxId && company.taxId && "  ·  "}
            {showTaxId && company.taxId && <>เลขประจำตัวผู้เสียภาษี {company.taxId}</>}
          </div>
        )}
      </div>
    </div>
  );
}
