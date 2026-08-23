import type { CompanySettings } from "@/lib/company-settings";

// R6 Phase E.1 — Header Free Layout Enhancement: 6 Element อะตอมที่ HeaderZone
// (header-zone.tsx) จัดวางลง Grid Cell ให้ — แต่ละตัวรับผิดชอบแค่ "เนื้อหา + Typography
// ของตัวเอง" เท่านั้น (fontSizePx/lineHeight/heightPx) ไม่รู้เรื่อง Alignment/ตำแหน่ง/
// Max-width เลย (HeaderZone เป็นคนห่อ Wrapper ที่คุมเรื่องนั้นให้แทน จุดเดียว) — Reuse
// เดิมกับหน้า Print จริงและ Designer's Live Preview ทั้งคู่ (Single Rendering Source
// เหมือน Phase E เดิมทุกประการ)

export function HeaderLogoElement({ logo, heightPx }: { logo?: string | null; heightPx: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Data URI จาก AppSetting หรือไฟล์ static ธรรมดา
    <img src={logo || "/logo.jpg"} alt="" style={{ height: `${heightPx}px`, width: "auto" }} className="object-contain" />
  );
}

export function HeaderCompanyInfoElement({
  company,
  showAddress,
  showPhone,
  showTaxId,
  fontSizePx,
  lineHeight,
}: {
  company: CompanySettings;
  showAddress?: boolean;
  showPhone?: boolean;
  showTaxId?: boolean;
  fontSizePx: number;
  lineHeight: number;
}) {
  return (
    <div style={{ fontSize: `${fontSizePx}px`, lineHeight }}>
      <div className="font-semibold">{company.name}</div>
      {showAddress && company.address && <div className="text-gray-600" style={{ fontSize: "0.83em" }}>{company.address}</div>}
      {(showPhone || showTaxId) && (
        <div className="text-gray-600" style={{ fontSize: "0.83em" }}>
          {showPhone && company.phone && <>โทร {company.phone}</>}
          {showPhone && company.phone && showTaxId && company.taxId && "  ·  "}
          {showTaxId && company.taxId && <>เลขประจำตัวผู้เสียภาษี {company.taxId}</>}
        </div>
      )}
    </div>
  );
}

export function HeaderTitleElement({
  titleTh,
  titleEn,
  fontSizePx,
  lineHeight,
}: {
  titleTh: string;
  titleEn: string;
  fontSizePx: number;
  lineHeight: number;
}) {
  return (
    <div style={{ lineHeight }}>
      <div className="font-semibold" style={{ fontSize: `${fontSizePx}px` }}>
        {titleTh}
      </div>
      <div className="text-gray-700" style={{ fontSize: `${fontSizePx * 0.86}px` }}>
        {titleEn}
      </div>
    </div>
  );
}

export function HeaderDocNumberDateElement({
  rows,
  fontSizePx,
  lineHeight,
}: {
  rows: { label: string; value: React.ReactNode }[];
  fontSizePx: number;
  lineHeight: number;
}) {
  return (
    <div style={{ fontSize: `${fontSizePx}px`, lineHeight }}>
      {rows.map((row, i) => (
        <div key={i}>
          <span className="text-gray-500">{row.label}:</span> {row.value}
        </div>
      ))}
    </div>
  );
}

export function HeaderCustomerNameElement({
  name,
  fontSizePx,
  lineHeight,
}: {
  name: React.ReactNode;
  fontSizePx: number;
  lineHeight: number;
}) {
  return (
    <div style={{ fontSize: `${fontSizePx}px`, lineHeight }}>
      <span className="text-gray-500">ลูกค้า:</span> {name}
    </div>
  );
}

export function HeaderCustomerDetailsElement({
  rows,
  shippingAddress,
  fontSizePx,
  lineHeight,
}: {
  rows: { label: string; value: React.ReactNode }[];
  shippingAddress?: string | null;
  fontSizePx: number;
  lineHeight: number;
}) {
  return (
    <div style={{ fontSize: `${fontSizePx}px`, lineHeight }}>
      {rows.map((row, i) => (
        <div key={i}>
          <span className="text-gray-500">{row.label}:</span> {row.value}
        </div>
      ))}
      {shippingAddress && (
        <div>
          <span className="text-gray-500">สถานที่ส่งสินค้า / Shipping Address:</span> {shippingAddress}
        </div>
      )}
    </div>
  );
}
