import type { StatusBadgeConfig } from "@/components/status-badge";

// S4 UAT round 3 (2026-08-29) — Owner: อย่า hardcode สี/ข้อความสถานะกระจายไปทั่วแต่ละหน้า
// ให้รวมจุดเดียว (StatusBadge เดิมที่ Billing ใช้ทั้ง 5 หน้ารายการ) + ห้ามสร้าง state
// ซ้ำซ้อนใหม่ — ทั้งสองสถานะข้างล่างนี้ derive จากข้อมูลที่มีอยู่แล้วตรงๆ ไม่มี field ใหม่:
//
//   - CustomerPO.status (ค่าคงที่จาก settings, ไม่เคยถูกแก้หลังสร้างเลยทั้งระบบ) — สิ่งที่
//     Owner อยากเห็นจริงๆ คือ "ออกใบสั่งผลิตหรือยัง" ซึ่ง derive ได้จากจำนวน ProductionOrder
//     ที่ผูกกับ P.O. นี้โดยตรง
//   - ProductionOrder.status ใช้ settings.productionOrderStatuses[0] ("รอเริ่มผลิต") จนกว่า
//     จะเข้า settings.inProgressStatus ("กำลังผลิต") ตอน confirmPrintRevision ครั้งแรก — สอง
//     state นี้ derive ได้จาก order.productionStartedAt ตรงๆ (ไม่ต้องพึ่ง raw status text
//     ในการตัดสินสี กัน drift ถ้า admin เผลอพิมพ์ status ไม่ตรง settings)
//
// สียึดชุดเดียวกันทั้งโมดูล Production (Owner กำหนดตรงๆ รอบ UAT 4): amber = รอออกเอกสาร/
// ต้องดำเนินการต่อ, blue = ออกเอกสารแล้วแต่ยังไม่เริ่มลงมือ, green = กำลังดำเนินการอยู่จริง

// CP0 (2026-08-30) — เพิ่ม state "ยกเลิกแล้ว" (สีแดง) derive จาก cancelledAt fact ตรงๆ
// terminal state ชนะทุกอย่าง — status text เดิมใน DB ไม่ถูกแตะตอนยกเลิก (เก็บเป็นประวัติ)

export function customerPoStatusBadge(hasProductionOrder: boolean, cancelled = false): { status: string; config: StatusBadgeConfig } {
  return {
    status: cancelled ? "CANCELLED" : hasProductionOrder ? "HAS_PRODUCTION_ORDER" : "NO_PRODUCTION_ORDER",
    config: {
      NO_PRODUCTION_ORDER: { label: "รอออกใบสั่งผลิต", className: "bg-amber-100 text-amber-700" },
      HAS_PRODUCTION_ORDER: { label: "ออกใบสั่งผลิตแล้ว", className: "bg-blue-100 text-blue-700" },
      CANCELLED: { label: "ยกเลิกแล้ว", className: "bg-red-100 text-red-700" },
    },
  };
}

// P2 CP1 — สถานะเที่ยวรถ derive จาก timestamp facts ล้วน (loadedAt/reconciledAt/cancelledAt)
// CP1 มีแต่ "วางแผน" — state อื่นเตรียมไว้ให้ CP2/CP3 ที่เป็นผู้ตั้ง fact
export function loadingTripStatusBadge(trip: {
  loadedAt: Date | null;
  reconciledAt: Date | null;
  cancelledAt: Date | null;
}): { status: string; config: StatusBadgeConfig } {
  const status = trip.cancelledAt ? "CANCELLED" : trip.reconciledAt ? "RECONCILED" : trip.loadedAt ? "LOADED" : "DRAFT";
  return {
    status,
    config: {
      DRAFT: { label: "วางแผน", className: "bg-amber-100 text-amber-700" },
      LOADED: { label: "ขึ้นของแล้ว", className: "bg-blue-100 text-blue-700" },
      RECONCILED: { label: "กระทบยอดแล้ว", className: "bg-green-100 text-green-700" },
      CANCELLED: { label: "ยกเลิกแล้ว", className: "bg-red-100 text-red-700" },
    },
  };
}

export function productionOrderStatusBadge(
  started: boolean,
  settings: { productionOrderStatuses: string[]; inProgressStatus: string },
  cancelled = false
): { status: string; config: StatusBadgeConfig } {
  return {
    status: cancelled ? "CANCELLED" : started ? "IN_PROGRESS" : "PENDING",
    config: {
      PENDING: { label: settings.productionOrderStatuses[0] ?? "รอเริ่มผลิต", className: "bg-blue-100 text-blue-700" },
      IN_PROGRESS: { label: settings.inProgressStatus, className: "bg-green-100 text-green-700" },
      CANCELLED: { label: "ยกเลิกแล้ว", className: "bg-red-100 text-red-700" },
    },
  };
}
