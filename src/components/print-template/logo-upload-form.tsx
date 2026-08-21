"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { LOGO_ALLOWED_MIME_TYPES, LOGO_MAX_BYTES } from "@/lib/print-template-settings";

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
  const { showSuccess, showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [thrownError, setThrownError] = useState<unknown>(null);

  if (thrownError) throw thrownError;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    setPreview(null);
    setDataUri(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!LOGO_ALLOWED_MIME_TYPES.includes(file.type)) {
      setClientError("รองรับเฉพาะไฟล์ PNG, JPEG หรือ WebP เท่านั้น");
      e.target.value = "";
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setClientError(`ไฟล์ต้องมีขนาดไม่เกิน ${LOGO_MAX_BYTES / 1024}KB (ไฟล์นี้ ${Math.round(file.size / 1024)}KB)`);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      setDataUri(result);
    };
    reader.readAsDataURL(file);
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
            accept={LOGO_ALLOWED_MIME_TYPES.join(",")}
            onChange={handleFileChange}
            disabled={isPending}
            className="text-sm"
          />
          {clientError && <p className="text-xs text-red-600">{clientError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!dataUri || isPending}
              onClick={handleUpload}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-1.5"
            >
              {isPending ? "กำลังอัปโหลด..." : "อัปโหลดโลโก้"}
            </button>
            {currentLogo && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleRemove}
                className="text-sm text-gray-600 hover:text-red-600 border rounded px-4 py-1.5 disabled:opacity-40"
              >
                ลบโลโก้ (กลับไปใช้ Default)
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400">รองรับ PNG, JPEG, WebP เท่านั้น ขนาดไฟล์ไม่เกิน 200KB</p>
    </div>
  );
}
