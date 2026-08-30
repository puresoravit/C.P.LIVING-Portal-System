import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BackLink } from "@/components/production/back-link";
import { StartLoadingJobForm } from "@/components/production/start-loading-job-form";
import { startLoadingJob } from "../../actions";

// CP6 — หน้าเริ่มขึ้นของจากคิว: ทวนรายการใน Rev ปัจจุบันของใบสั่งผลิตให้ตรวจก่อน แล้วถาม
// "ยืนยันว่าจะขึ้นออเดอร์นี้วันนี้ใช่ไหม?" — การกดยืนยันคือฝ่ายขึ้นของรับรองว่าผลิตเสร็จจริง
// (fact productionCompletedAt ตั้งครั้งเดียว) + เปิด/เข้ารอบจัดส่ง prefill รายการให้อัตโนมัติ
export default async function StartLoadingJobPage(props: { params: Promise<{ productionOrderId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!can((session?.user as any)?.role, "loadingTrip.manage")) redirect("/production/loading");

  const order = await db.productionOrder.findUnique({
    where: { id: params.productionOrderId },
    include: {
      customerPo: {
        select: { cancelledAt: true, customer: { select: { companyName: true } }, branch: { select: { name: true } } },
      },
    },
  });
  if (!order) notFound();

  // มีจุดส่งของใบนี้ในรอบ active อยู่แล้ว — CP7 (Owner UAT): เดิม redirect() บังคับตรงนี้ทำ
  // ปุ่มย้อนกลับเด้งวนไม่หยุด (กลับมาหน้านี้ปุ๊บ redirect ไปข้างหน้าทันทีอีกรอบ) เปลี่ยนเป็น
  // แสดงลิงก์ให้กดเองแทน — ไม่มี auto-navigation ก็ไม่มี loop ให้ back button ติด
  const existingDrop = await db.loadingDrop.findFirst({
    where: { productionOrderId: order.id, trip: { cancelledAt: null, reconciledAt: null } },
    select: { tripId: true },
  });
  if (existingDrop) {
    return (
      <div className="max-w-2xl">
        <BackLink fallbackHref="/production/loading" />
        <div className="mt-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-3 py-3">
          ออเดอร์นี้เริ่มขึ้นของไปแล้ว —{" "}
          <a href={`/production/loading/${existingDrop.tripId}`} className="font-semibold underline">
            ไปที่รอบจัดส่ง →
          </a>
        </div>
      </div>
    );
  }

  const cancelled = !!(order.cancelledAt || order.customerPo.cancelledAt);

  const revision = await db.productionOrderRevision.findUnique({
    where: { productionOrderId_revNo: { productionOrderId: order.id, revNo: order.currentRevNo } },
    include: { items: { orderBy: { id: "asc" } } },
  });
  const items = revision?.items ?? [];
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const openRuns = await db.loadingTrip.findMany({
    where: { loadedAt: null, reconciledAt: null, cancelledAt: null },
    include: { drops: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/loading" />
      <h1 className="text-lg font-semibold mt-2 mb-0.5">
        เริ่มขึ้นของ — {order.customerPo.customer.companyName}
        {order.customerPo.branch && <span className="text-gray-500 font-normal"> — {order.customerPo.branch.name}</span>}
      </h1>
      <p className="text-xs text-gray-400 font-mono mb-3">{order.prodNo}</p>

      {cancelled ? (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2">
          ✕ ใบสั่งผลิต/ออเดอร์นี้ถูกยกเลิกแล้ว — ขึ้นของไม่ได้
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-lg p-3 mb-3">
            <div className="text-sm font-medium mb-1.5">
              รายการที่ผลิต ({items.length} รายการ · {totalQty} ชิ้น)
              {order.currentRevNo > 0 && <span className="text-xs text-gray-500 font-normal ml-1.5">แก้ไขครั้งที่ {order.currentRevNo}</span>}
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-gray-500">ใบสั่งผลิตนี้ไม่มีรายการสินค้า</p>
            ) : (
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-sm border-b border-dashed pb-1">
                    <span className="min-w-0">
                      {item.productionLabelSnapshot ?? item.nameSnapshot ?? "—"}
                      {item.size && <span className="text-gray-500"> (ไซส์ {item.size})</span>}
                    </span>
                    <span className="font-semibold shrink-0">{item.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <StartLoadingJobForm
            confirmQuestion="ยืนยันว่าจะขึ้นออเดอร์นี้วันนี้ใช่ไหม?"
            confirmNote="การยืนยัน = ฝ่ายขึ้นของรับรองว่าผลิตเสร็จพร้อมขึ้นรถแล้ว ระบบจะบันทึกผู้ยืนยันและเวลา แล้วเตรียมรายการขึ้นของให้จากใบสั่งผลิต (แก้/เพิ่มได้ก่อนพิมพ์)"
            submitLabel="ยืนยัน เริ่มขึ้นของ"
            openRuns={openRuns.map((r) => ({
              id: r.id,
              label: `${r.tripNo} · ${r.tripDate.toLocaleDateString("th-TH")}${r.plateNumber ? ` · ${r.plateNumber}` : ""}${r.driverName ? ` (${r.driverName})` : ""} · ${r.drops.length} จุดส่ง`,
            }))}
            action={startLoadingJob.bind(null, order.id)}
          />
        </>
      )}
    </div>
  );
}
