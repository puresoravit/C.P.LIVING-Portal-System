import { BackLink } from "@/components/production/back-link";
import { createLoadingTrip } from "../actions";
import { LoadingTripHeaderForm } from "@/components/production/loading-trip-header-form";
import { todayInputValue } from "@/lib/date-utils";

// P2 CP1 — สร้างเที่ยวรถ: กรอกแค่หัวเที่ยว (วันที่/รถ/หมายเหตุ) แล้วไปเพิ่มจุดส่งต่อที่หน้า detail
export default function NewLoadingTripPage() {
  return (
    <div className="max-w-2xl">
      <BackLink fallbackHref="/production/loading" />
      <h1 className="text-lg font-semibold mt-2 mb-1">สร้างเที่ยวรถ</h1>
      <p className="text-sm text-gray-500 mb-4">กรอกข้อมูลเที่ยวก่อน แล้วค่อยเพิ่มจุดส่ง/รายการสินค้าในหน้าถัดไป</p>
      <LoadingTripHeaderForm action={createLoadingTrip} initial={{ tripDate: todayInputValue(), vehicleNote: "", note: "" }} submitLabel="สร้างเที่ยวรถ" />
    </div>
  );
}
