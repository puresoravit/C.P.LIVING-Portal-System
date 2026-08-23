"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { LOGO_ALLOWED_MIME_TYPES, LOGO_MAX_BYTES } from "@/lib/print-template-settings";
import { normalizeImageFileForUpload } from "@/lib/client-image-normalize";

// R5 — Logo Upload: Validate ฝั่ง Client ก่อน (ชนิดไฟล์/ขนาด) ให้ User เห็น Error ทันที
// ไม่ต้อง Round-trip ไป Server ก่อน แต่ Server (updateLogo action) ยัง Re-validate ซ้ำ
// ทุกครั้งเสมอ ไม่เชื่อ Client ฝ่ายเดียว — ไม่เขียนไฟล์ลง /public เลย ส่ง Base64 Data URI
// ตรงไปเก็บใน AppSetting ผ่าน Hidden Field
export function LogoUploadForm({
  currentLogo,
  updateLogoAction,
  removeLogoAction,
}: {
  currentLogo: string | null;
  updateLogoAction: (formData: FormData) => Promise<ActionResult>;
  removeLogoAction: () => Promise<ActionResult>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  // Owner UAT — Image Upload Compatibility: normalizeImageFileForUpload() Sniff/Convert
  // HEIC-HEIF (ภาพจากกล้อง iPhone) เป็น JPEG ก่อนเสมอ — ไม่มีขั้น Crop ในหน้านี้ (ต่างจาก
  // Avatar) จึงเช็คขนาดไฟล์กับผลลัพธ์หลังแปลงโดยตรง (HEIC มักมีขนาดเล็กกว่า JPEG เทียบเท่า
  // มาก แปลงแล้วอาจเกิน Limit ได้ — ข้อความ Error บอกขนาดจริงหลังแปลงให้ผู้ใช้เข้าใจ)
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    setPreview(null);
    setDataUri(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsNormalizing(true);
    try {
      const normalized = await normalizeImageFileForUpload(file);
      if (!normalized.convertedFromHeic && !LOGO_ALLOWED_MIME_TYPES.includes(normalized.file.type)) {
        setClientError("รองรับเฉพาะไฟล์ PNG, JPEG, WebP หรือ HEIC/HEIF (จากกล้อง iPhone) เท่านั้น");
        e.target.value = "";
        return;
      }
      if (normalized.file.size > LOGO_MAX_BYTES) {
        setClientError(
          `ไฟล์ต้องมีขนาดไม่เกิน ${LOGO_MAX_BYTES / 1024}KB (ไฟล์นี้ ${Math.round(normalized.file.size / 1024)}KB${
            normalized.convertedFromHeic ? " หลังแปลงจาก HEIC เป็น JPEG" : ""
          })`
        );
        e.target.value = "";
        return;
      }
      setPreview(normalized.dataUrl);
      setDataUri(normalized.dataUrl);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "ไม่สามารถอ่านไฟล์รูปได้");
      e.target.value = "";
    } finally {
      setIsNormalizing(false);
    }
  }

  function handleUpload() {
    if (!dataUri || isPending) return;
    const formData = new FormData();
    formData.set("logoDataUri", dataUri);
    startTransition(async () => {
      try {
        const result = await updateLogoAction(formData);
        if (result.success) {
          showSuccess("อัปโหลดโลโก้สำเร็จ");
          setPreview(null);
          setDataUri(null);
        } else {
          showError(result.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  function handleRemove() {
    if (isPending) return;
    startTransition(async () => {
      try {
        const result = await removeLogoAction();
        if (result.success) showSuccess("ลบโลโก้สำเร็จ — กลับไปใช้ค่าเริ่มต้น");
        else showError(result.error);
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="w-32 h-20 border rounded flex items-center justify-center bg-gray-50 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- Preview รูปที่ยังไม่ Upload/Data URI จาก AppSetting ไม่ต้องผ่าน next/image optimizer */}
          <img src={preview ?? currentLogo ?? "/logo.jpg"} alt="ตัวอย่างโลโก้" className="max-w-full max-h-full object-contain" />
        </div>
        <div className="flex-1 space-y-2">
          <input
            type="file"
            accept={[...LOGO_ALLOWED_MIME_TYPES, "image/heic", "image/heif", ".heic", ".heif"].join(",")}
            onChange={handleFileChange}
            disabled={isPending || isNormalizing}
            className="text-sm"
          />
          {isNormalizing && <p className="text-xs text-gray-500">กำลังเตรียมรูป...</p>}
          {clientError && <p className="text-xs text-red-600">{clientError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!dataUri || isPending || isNormalizing}
              onClick={handleUpload}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-1.5"
            >
              {isPending ? "กำลังอัปโหลด..." : "อัปโหลดโลโก้"}
            </button>
            {currentLogo && (
              <button
                type="button"
                disabled={isPending || isNormalizing}
                onClick={handleRemove}
                className="text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-1.5 disabled:opacity-40"
              >
                ลบโลโก้ (กลับไปใช้ Default)
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400">รองรับ PNG, JPEG, WebP, HEIC/HEIF เท่านั้น ขนาดไฟล์ไม่เกิน 200KB</p>
    </div>
  );
}
