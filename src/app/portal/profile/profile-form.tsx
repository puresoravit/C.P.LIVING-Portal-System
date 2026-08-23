"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import type { ActionResult } from "@/lib/action-result";
import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_BYTES, TITLE_PREFIX_OPTIONS, TITLE_PREFIX_LABELS } from "@/lib/user-profile";
import { UserAvatar } from "@/components/portal/user-avatar";
import { AvatarCropper } from "@/components/portal/avatar-cropper";
import { CP_GOLD, MOTION_EASE } from "@/components/portal/cp-brand";

// R6 Phase F — Owner UAT: My Profile Form — Draft → Save/Cancel เดียวกับ Pattern ที่
// พิสูจน์แล้วในหน้าอื่นของระบบ (Document Designer ฯลฯ): ทุกการแก้ไข (พิมพ์ชื่อ/เลือก
// คำนำหน้า/Crop รูป) เป็น Local State ล้วนๆ จนกว่าจะกด "บันทึกการเปลี่ยนแปลง" — Username/
// Role/Owner Status เป็น Read-only เสมอ ไม่มี Input ให้แก้เลยแม้แต่ช่องเดียว (กันเป็น
// ช่องทางแก้ Auth Identity/Permission โดยไม่ตั้งใจ)

type InitialUser = {
  username: string;
  displayName: string;
  titlePrefix: string | null;
  avatarDataUri: string | null;
  roleLabel: string;
  isOwner: boolean;
};

const RAW_UPLOAD_MAX_BYTES = 8 * 1024 * 1024; // ไฟล์ต้นฉบับก่อน Crop (ยังไม่ส่ง Server) — จำกัดกว้างๆ กันไฟล์ใหญ่เกินจน Canvas ทำงานหนัก

export function ProfileForm({
  user,
  updateProfileAction,
  changePasswordAction,
}: {
  user: InitialUser;
  updateProfileAction: (formData: FormData) => Promise<ActionResult>;
  changePasswordAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const { showSuccess, showError } = useToast();
  const [thrownError, setThrownError] = useState<unknown>(null);
  if (thrownError) throw thrownError;

  // ---------- Profile Draft ----------
  const [titlePrefix, setTitlePrefix] = useState(user.titlePrefix ?? "");
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatarDataUri);
  const [avatarAction, setAvatarAction] = useState<"keep" | "set" | "remove">("keep");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, startSaving] = useTransition();

  const dirty = titlePrefix !== (user.titlePrefix ?? "") || displayName !== user.displayName || avatarAction !== "keep";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAvatarError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
      setAvatarError("รองรับเฉพาะไฟล์ PNG, JPEG หรือ WebP เท่านั้น");
      return;
    }
    if (file.size > RAW_UPLOAD_MAX_BYTES) {
      setAvatarError(`ไฟล์ต้นฉบับใหญ่เกินไป (ไม่เกิน ${RAW_UPLOAD_MAX_BYTES / 1024 / 1024}MB)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleCropConfirm(croppedDataUri: string) {
    setCropSrc(null);
    // ตรวจขนาดผลลัพธ์หลัง Crop ฝั่ง Client ก่อน (Server ยัง Re-validate ซ้ำเสมอตอน Save)
    const base64Length = croppedDataUri.split(",")[1]?.length ?? 0;
    const approxBytes = Math.ceil((base64Length * 3) / 4);
    if (approxBytes > AVATAR_MAX_BYTES) {
      setAvatarError(`รูปหลัง Crop ใหญ่เกิน ${AVATAR_MAX_BYTES / 1024}KB — ลองซูมลดลงหรือใช้ภาพต้นฉบับที่เล็กกว่านี้`);
      return;
    }
    setAvatarPreview(croppedDataUri);
    setAvatarAction("set");
  }

  function handleRemoveAvatar() {
    setAvatarPreview(null);
    setAvatarAction("remove");
  }

  function handleCancel() {
    setTitlePrefix(user.titlePrefix ?? "");
    setDisplayName(user.displayName);
    setAvatarPreview(user.avatarDataUri);
    setAvatarAction("keep");
    setAvatarError(null);
  }

  function handleSave() {
    if (!dirty || isSaving) return;
    const fd = new FormData();
    fd.set("titlePrefix", titlePrefix);
    fd.set("displayName", displayName);
    fd.set("avatarAction", avatarAction);
    if (avatarAction === "set" && avatarPreview) fd.set("avatarDataUri", avatarPreview);
    startSaving(async () => {
      try {
        const result = await updateProfileAction(fd);
        if (result.success) {
          showSuccess(result.message ?? "บันทึกสำเร็จ");
          setAvatarAction("keep");
          // Router ไม่ Refresh เองอัตโนมัติสำหรับ Client Component — reload ให้ทุกจุดที่
          // อ่าน User (Portal Header ฯลฯ) เห็นค่าใหม่ทันทีสอดคล้องกันหมด (Single Source
          // of Truth เดียวกับ getPortalUser ที่ Revalidate ไปแล้วฝั่ง Server)
          window.location.reload();
        } else {
          showError(result.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  // ---------- Change Password ----------
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [isChangingPw, startChangingPw] = useTransition();

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (isChangingPw) return;
    setPwError(null);
    const fd = new FormData();
    fd.set("currentPassword", currentPassword);
    fd.set("newPassword", newPassword);
    fd.set("confirmPassword", confirmPassword);
    startChangingPw(async () => {
      try {
        const result = await changePasswordAction(fd);
        if (result.success) {
          showSuccess(result.message ?? "เปลี่ยนรหัสผ่านสำเร็จ");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } else {
          setPwError(result.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        setThrownError(err);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ---------- Avatar + Profile Fields ---------- */}
      <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
        <h2 className="text-sm font-medium text-slate-200 mb-5">ข้อมูลโปรไฟล์ / Profile Information</h2>

        <div className="flex items-center gap-5 mb-6">
          <UserAvatar avatarDataUri={avatarPreview} displayName={displayName || user.displayName} size={88} />
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-medium rounded-lg px-3 py-2 transition-colors"
                style={{ background: CP_GOLD, color: "#071228", transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
              >
                เปลี่ยนรูป / Change Photo
              </button>
              {avatarPreview && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="text-xs text-slate-300 hover:text-red-300 border border-white/15 rounded-lg px-3 py-2 transition-colors"
                  style={{ transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
                >
                  ลบรูป / Remove
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept={AVATAR_ALLOWED_MIME_TYPES.join(",")} onChange={handleFileChange} className="hidden" />
            <p className="text-[11px] text-slate-500">PNG, JPEG, WebP — ไม่เกิน {AVATAR_MAX_BYTES / 1024}KB หลัง Crop</p>
            {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
          </div>
        </div>

        {cropSrc && (
          <div className="mb-6 bg-black/20 border border-white/10 rounded-xl p-5">
            <AvatarCropper imageSrc={cropSrc} onCancel={() => setCropSrc(null)} onConfirm={handleCropConfirm} />
          </div>
        )}

        <div className="grid sm:grid-cols-[120px_1fr] gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">คำนำหน้า</label>
            <select
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: CP_GOLD }}
            >
              <option value="" className="text-gray-900">
                ไม่ระบุ
              </option>
              {TITLE_PREFIX_OPTIONS.map((k) => (
                <option key={k} value={k} className="text-gray-900">
                  {TITLE_PREFIX_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">ชื่อที่แสดง / Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: CP_GOLD }}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Username</label>
            <input
              value={user.username}
              disabled
              readOnly
              title="Username ผูกกับการเข้าสู่ระบบ แก้ไขไม่ได้"
              className="w-full rounded-lg bg-white/5 border border-white/10 text-slate-400 text-sm px-3 py-2.5 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">บทบาท / Role</label>
            <div className="flex items-center gap-2 h-[42px]">
              <span className="text-sm text-slate-200 border border-white/15 rounded-lg px-3 py-2">{user.roleLabel}</span>
              {user.isOwner && (
                <span className="text-xs font-medium rounded-lg px-3 py-2" style={{ color: CP_GOLD, border: `1px solid ${CP_GOLD}` }}>
                  เจ้าของกิจการ / Owner
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || isSaving || !!cropSrc}
            className="text-sm font-medium rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors"
            style={{ background: CP_GOLD, color: "#071228", transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
          >
            {isSaving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง / Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={!dirty || isSaving}
            className="text-sm text-slate-300 hover:text-white border border-white/15 rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors"
            style={{ transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
          >
            ยกเลิก / Cancel
          </button>
          {dirty && <span className="text-xs text-amber-300">● มีการแก้ไขที่ยังไม่ได้บันทึก</span>}
        </div>
      </section>

      {/* ---------- Change Password ---------- */}
      <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
        <h2 className="text-sm font-medium text-slate-200 mb-1">เปลี่ยนรหัสผ่าน / Change Password</h2>
        <p className="text-xs text-slate-500 mb-5">ต้องกรอกรหัสผ่านปัจจุบันให้ถูกต้องก่อนเสมอ</p>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
          {pwError && (
            <div role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">
              {pwError}
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">รหัสผ่านปัจจุบัน</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: CP_GOLD }}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: CP_GOLD }}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: CP_GOLD }}
            />
          </div>
          <button
            disabled={isChangingPw}
            className="text-sm font-medium rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors"
            style={{ background: CP_GOLD, color: "#071228", transitionDuration: "180ms", transitionTimingFunction: MOTION_EASE }}
          >
            {isChangingPw ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
          </button>
        </form>
      </section>
    </div>
  );
}
