import { CP_GOLD } from "@/components/portal/cp-brand";
import type { AppDefinition } from "@/lib/app-registry";

// R6 Phase F — Icon ของ Application Card (Inline SVG ทั้งหมด ไม่พึ่ง Library ภายนอก)
// สี: แอพที่เข้าได้ = ทอง, Coming Soon = เทาจาง
export function AppIcon({ icon, accessible }: { icon: AppDefinition["icon"]; accessible: boolean }) {
  const stroke = accessible ? CP_GOLD : "rgba(255,255,255,0.45)";
  const common = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

  switch (icon) {
    case "billing":
      return (
        <svg {...common}>
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v4h4" />
          <path d="M10 12h6M10 16h6" />
          <circle cx="10" cy="8.5" r="1.4" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <rect x="8" y="6" width="8" height="3.5" rx="0.5" />
          <path d="M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 17h.01M12 17h.01M15.5 17h.01" strokeWidth="2.2" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M4 7.5l8 4.5 8-4.5" />
          <path d="M12 12v9" />
        </svg>
      );
    case "factory":
      return (
        <svg {...common}>
          <path d="M3 21V10l5 3v-3l5 3v-3l8 4.5V21z" />
          <path d="M7 21v-3M12 21v-3M17 21v-3" />
        </svg>
      );
    case "dots":
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="1.6" fill={stroke} />
          <circle cx="12" cy="12" r="1.6" fill={stroke} />
          <circle cx="18" cy="12" r="1.6" fill={stroke} />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <path d="M9.5 12l2 2 3.5-4" />
        </svg>
      );
  }
}
