// Owner UAT Fix Batch 3 — ข้อ 5: ขยาย Pattern ปุ่ม × เล็กๆ ที่ใช้ล้างค่าค้นหาใน
// ProductSearchPicker (Client Component, Controlled Input) ไปยังช่องค้นหา `q` ของหน้า
// รายการเอกสาร/สินค้าทั่วระบบ — หน้าพวกนี้เป็น Server Component ล้วนๆ (GET Form ธรรมดา,
// Uncontrolled Input) จึงไม่จำเป็นต้องใช้ Client Component/JS เลย: ปุ่ม × ที่นี่เป็นแค่
// <a> ธรรมดาไปที่ URL เดิมแต่ตัด q ออก (คง Filter/Tab/Date Range อื่นที่กำลังใช้อยู่ไว้
// ทั้งหมดผ่าน preserveParams ที่แต่ละหน้าคำนวณเอง) รีเซ็ต Pagination กลับหน้า 1 ไปในตัว
// (ตรงกับพฤติกรรมเดิมของปุ่ม "ค้นหา" อยู่แล้วที่ไม่มี Hidden page Field) — ตำแหน่ง/ขนาด/
// สี Copy จาก ProductSearchPicker เป๊ะเพื่อความสม่ำเสมอของ Pattern ทั่วระบบ
export function SearchInputWithClear({
  name = "q",
  defaultValue,
  placeholder,
  autoFocus,
  basePath,
  preserveParams,
  className = "w-full border rounded px-3 py-1.5 text-sm",
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  basePath: string;
  preserveParams: Record<string, string>;
  className?: string;
}) {
  const qs = new URLSearchParams(preserveParams).toString();
  const clearHref = qs ? `${basePath}?${qs}` : basePath;
  const hasValue = !!defaultValue;

  return (
    <div className="relative">
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className={`${className} ${hasValue ? "pr-7" : ""}`}
      />
      {hasValue && (
        <a
          href={clearHref}
          aria-label="ล้างการค้นหา"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-base leading-none w-5 h-5 flex items-center justify-center"
        >
          ×
        </a>
      )}
    </div>
  );
}
