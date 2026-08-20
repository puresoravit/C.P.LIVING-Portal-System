import type { CompanySettings } from "@/lib/company-settings";

// ข้อ 7.1 Company Header — ใช้ร่วมกันทุกเอกสาร: Logo ซ้าย, ชื่อ/ที่อยู่/โทร/Tax ID
// อยู่กึ่งกลาง แบบ compact สงวนพื้นที่แนวตั้งให้ Item Table เป็นหลัก
export function PrintDocumentHeader({ company }: { company: CompanySettings }) {
  return (
    <div className="relative mb-1.5 min-h-[44px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ static ธรรมดา ไม่ต้องผ่าน next/image optimizer สำหรับหน้า print */}
      <img
        src="/logo.jpg"
        alt=""
        className="absolute left-0 top-0 h-11 w-auto object-contain"
      />
      <div className="text-center px-14">
        <div className="font-semibold text-sm leading-tight">{company.name}</div>
        {company.address && <div className="text-[10px] text-gray-600 leading-tight">{company.address}</div>}
        <div className="text-[10px] text-gray-600 leading-tight">
          {company.phone && <>โทร {company.phone}</>}
          {company.phone && company.taxId && "  ·  "}
          {company.taxId && <>เลขประจำตัวผู้เสียภาษี {company.taxId}</>}
        </div>
      </div>
    </div>
  );
}
