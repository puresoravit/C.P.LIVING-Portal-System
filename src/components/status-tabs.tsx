// Document Status Tabs — Shared UI ใช้ร่วมกันได้ทุกหน้ารายการเอกสาร (Order/Invoice/
// TaxInvoice/BillingNote/RepairNote) แต่ละหน้ากำหนดชุด Tab/Label/Count เองตาม Status
// จริงที่ Document Type นั้นรองรับ (ข้อ 2 — ห้ามเดา Status ที่ไม่มีจริง) component นี้
// รับผิดชอบแค่ Layout/Active State/Responsive เท่านั้น
export type StatusTabItem = { key: string; label: string; count: number };

export function StatusTabs({
  tabs,
  activeKey,
  basePath,
  preserveParams,
}: {
  tabs: StatusTabItem[];
  activeKey: string;
  basePath: string;
  preserveParams: Record<string, string>;
}) {
  return (
    <div className="flex gap-1 mb-3 border-b overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const params = { ...preserveParams };
        if (tab.key !== "all") params.status = tab.key;
        const href = `${basePath}?${new URLSearchParams(params).toString()}`;
        return (
          <a
            key={tab.key}
            href={href}
            className={`px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors duration-150 ${
              isActive
                ? "border-cp-navy text-cp-navy font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label} <span className={isActive ? "text-cp-navy" : "text-gray-400"}>({tab.count})</span>
          </a>
        );
      })}
    </div>
  );
}
