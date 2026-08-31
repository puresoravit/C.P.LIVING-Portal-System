import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BackLink } from "@/components/production/back-link";
import { StartStockJobForm } from "@/components/production/start-stock-job-form";
import { startStockJob } from "../actions";

// CP6 — "+ เพิ่มรายการขึ้นของ" จากหน้าคิว: งานที่ไม่มีใบสั่งผลิต (ของจากสต็อก/กะทันหัน)
// ห้ามสร้าง fake ProductionOrder — เปิดจุดส่งเปล่าแล้วไปเพิ่มสินค้าที่หน้าเตรียมขึ้นของ
export default async function StartStockJobPage() {
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "loadingTrip.manage")) redirect("/production/loading");

  const [customers, openRuns] = await Promise.all([
    db.customer.findMany({
      where: { active: true },
      select: { id: true, companyName: true, branches: { where: { active: true }, select: { id: true, name: true } } },
      orderBy: { companyName: "asc" },
    }),
    db.loadingTrip.findMany({
      where: { loadedAt: null, reconciledAt: null, cancelledAt: null },
      include: { drops: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/loading" />
      <h1 className="text-lg font-semibold mt-2 mb-1">เพิ่มรายการขึ้นของ (ไม่มีใบสั่งผลิต)</h1>
      <p className="text-sm text-gray-500 mb-3">
        สำหรับของจากสต็อกหรืองานกะทันหันที่ไม่ได้ผ่านใบสั่งผลิต — เลือกปลายทางก่อน แล้วไปเพิ่มรายการสินค้าที่หน้าเตรียมขึ้นของ
      </p>
      <StartStockJobForm
        customers={customers.map((c) => ({ id: c.id, name: c.companyName, branches: c.branches }))}
        openRuns={openRuns.map((r) => ({
          id: r.id,
          label: `${r.tripNo} · ${r.tripDate.toLocaleDateString("th-TH")}${r.plateNumber ? ` · ${r.plateNumber}` : ""}${r.driverName ? ` (${r.driverName})` : ""} · ${r.drops.length} จุดส่ง`,
        }))}
        action={startStockJob}
      />
    </div>
  );
}
