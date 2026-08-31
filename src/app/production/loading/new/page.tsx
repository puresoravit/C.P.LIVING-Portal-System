import { BackLink } from "@/components/production/back-link";
import { createLoadingTrip } from "../actions";
import { LoadingTripHeaderForm } from "@/components/production/loading-trip-header-form";
import { todayInputValue } from "@/lib/date-utils";

// P2 CP1 → CP6: สร้างรอบจัดส่งเปล่า (ทางขั้นสูง — ปกติรอบเกิดเองจากการเริ่มขึ้นของในหน้าคิว)
export default function NewLoadingTripPage() {
  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/loading" />
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างรอบจัดส่งเปล่า</h1>
      <p className="text-sm text-gray-500 mb-4">กรอกข้อมูลรอบก่อน แล้วค่อยเพิ่มจุดส่ง/รายการสินค้าในหน้าถัดไป — ปกติแนะนำเริ่มจากหน้าคิวงานแทน</p>
      <LoadingTripHeaderForm action={createLoadingTrip} initial={{ tripDate: todayInputValue(), plateNumber: "", driverName: "", note: "" }} submitLabel="สร้างรอบจัดส่ง" />
    </div>
  );
}
