"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";

// R6 Phase F — UI จัดการ App Access (Client เฉพาะส่วน Interaction — การตัดสินใจสิทธิ์
// จริงทั้งหมดอยู่ฝั่ง Server Action ซึ่ง Re-check Owner + คำนวณ Diff จาก DB เองเสมอ
// ค่าจาก Client เป็นแค่ "ความต้องการ" ไม่ใช่คำสั่งที่เชื่อได้)

type ManagedUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isOwner: boolean;
  isSelf: boolean;
  appIds: string[];
};

type ManagedApp = { id: string; name: string; description: string };

const ROLE_LABEL: Record<string, string> = {
  OWNER_ADMIN: "ผู้ดูแลระบบ",
  BILLING_STAFF: "พนักงานออกบิล",
  VIEWER: "ผู้ดูรายงาน",
};

// Owner UAT — ฟอร์มสร้างบัญชีพนักงานใหม่ (แยก Component ให้ State ไม่ปนกับส่วนจัดการ
// สิทธิ์ด้านล่าง — การตัดสินใจจริงทั้งหมดอยู่ฝั่ง Server Action ซึ่ง Re-check Owner +
// Validate ซ้ำเองเสมอ) — หลังสร้างสำเร็จ router.refresh() ให้รายชื่อผู้ใช้ในหน้านี้
// อัปเดตทันทีโดยไม่ต้อง Reload เอง
function CreateUserForm({
  apps,
  createAction,
  goldColor,
}: {
  apps: ManagedApp[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  goldColor: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("BILLING_STAFF");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Default ติ๊กทุกแอปที่ Grant ได้ (ปัจจุบันคือ Billing แอปเดียว) — เจตนาหลักของการ
  // สร้างพนักงานคือให้เข้าแอปทำงานได้เลย ไม่ต้องมากด Grant ซ้ำอีกขั้น
  const [grantApps, setGrantApps] = useState<Set<string>>(() => new Set(apps.map((a) => a.id)));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isCreating, startCreate] = useTransition();

  const inputClass =
    "rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2.5 placeholder:text-slate-500 focus:outline-none focus:ring-2";
  const ringStyle = { ["--tw-ring-color" as string]: goldColor };

  function toggleApp(appId: string) {
    setGrantApps((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
    setMessage(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("username", username);
    fd.set("displayName", displayName);
    fd.set("role", role);
    fd.set("newPassword", password);
    fd.set("confirmPassword", confirm);
    for (const id of grantApps) fd.append("appIds", id);
    startCreate(async () => {
      const result = await createAction(fd);
      if (result.success) {
        setMessage({ ok: true, text: result.message ?? "สร้างบัญชีสำเร็จ" });
        setUsername("");
        setDisplayName("");
        setRole("BILLING_STAFF");
        setPassword("");
        setConfirm("");
        setGrantApps(new Set(apps.map((a) => a.id)));
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-5 space-y-4">
      <div>
        <div className="text-sm text-white font-medium">สร้างบัญชีพนักงานใหม่</div>
        <p className="mt-1 text-xs text-slate-400">
          บัญชีที่สร้างจากหน้านี้เป็นบัญชีพนักงานเสมอ (ไม่ใช่เจ้าของกิจการ) — ตั้งรหัสผ่านเริ่มต้นแล้วแจ้งพนักงานให้เปลี่ยนเองได้ที่ My Profile
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setMessage(null);
          }}
          placeholder="ชื่อผู้ใช้ (อังกฤษ/ตัวเลข 3-32 ตัว เช่น somchai)"
          autoComplete="off"
          className={inputClass}
          style={ringStyle}
        />
        <input
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setMessage(null);
          }}
          placeholder="ชื่อที่แสดง เช่น สมชาย ใจดี"
          autoComplete="off"
          className={inputClass}
          style={ringStyle}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} style={ringStyle}>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value} className="text-gray-900">
              {label} ({value})
            </option>
          ))}
        </select>
        <div />
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setMessage(null);
          }}
          placeholder="รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัวอักษร)"
          autoComplete="new-password"
          className={inputClass}
          style={ringStyle}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setMessage(null);
          }}
          placeholder="ยืนยันรหัสผ่าน"
          autoComplete="new-password"
          className={inputClass}
          style={ringStyle}
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs text-slate-400">ให้สิทธิ์เข้าแอปพลิเคชันทันทีที่สร้าง</div>
        {apps.map((app) => (
          <label key={app.id} className="flex items-center gap-2.5 text-sm text-white cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={grantApps.has(app.id)}
              onChange={() => toggleApp(app.id)}
              className="w-4 h-4 accent-[#C9A24B]"
            />
            {app.name}
          </label>
        ))}
      </div>

      {message && (
        <div
          role="status"
          className={`text-sm rounded-lg px-4 py-3 border max-w-2xl ${
            message.ok
              ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/30"
              : "text-red-200 bg-red-500/10 border-red-400/30"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={isCreating || username.trim().length === 0 || password.length === 0}
        className="text-sm font-semibold rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors"
        style={{ background: goldColor, color: "#071228" }}
      >
        {isCreating ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}
      </button>
    </form>
  );
}

export function AccessManager({
  users,
  apps,
  action,
  resetPasswordAction,
  createUserAction,
  goldColor,
}: {
  users: ManagedUser[];
  apps: ManagedApp[];
  action: (targetUserId: string, formData: FormData) => Promise<ActionResult>;
  resetPasswordAction: (targetUserId: string, formData: FormData) => Promise<ActionResult>;
  createUserAction: (formData: FormData) => Promise<ActionResult>;
  goldColor: string;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Owner UAT — Password Reset (แทน "ดูรหัสผ่านปัจจุบัน" ที่ทำไม่ได้จริงเพราะ Hash
  // เป็น One-way — ดูเหตุผลใน actions.ts) — State แยกจาก App Access Form โดยสิ้นเชิง
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isResettingPw, startPwTransition] = useTransition();

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const editable = !!selected && !selected.isOwner && !selected.isSelf;
  const dirty = editable && JSON.stringify([...checked].sort()) !== JSON.stringify([...selected!.appIds].sort());

  function pickUser(id: string) {
    setSelectedId(id);
    setMessage(null);
    setPwMessage(null);
    setNewPassword("");
    setConfirmPassword("");
    const u = users.find((x) => x.id === id);
    setChecked(new Set(u?.appIds ?? []));
  }

  function toggle(appId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
    setMessage(null);
  }

  function save() {
    if (!selected || !dirty) return;
    const fd = new FormData();
    for (const id of checked) fd.append("appIds", id);
    startTransition(async () => {
      const result = await action(selected.id, fd);
      setMessage(
        result.success
          ? { ok: true, text: "บันทึกสิทธิ์เรียบร้อย — มีผลกับผู้ใช้ทันทีตั้งแต่การใช้งานถัดไป" }
          : { ok: false, text: result.error ?? "เกิดข้อผิดพลาด" }
      );
    });
  }

  function resetPassword() {
    if (!selected || newPassword.length === 0) return;
    const fd = new FormData();
    fd.set("newPassword", newPassword);
    fd.set("confirmPassword", confirmPassword);
    startPwTransition(async () => {
      const result = await resetPasswordAction(selected.id, fd);
      if (result.success) {
        setPwMessage({ ok: true, text: result.message ?? "ตั้งรหัสผ่านใหม่สำเร็จ" });
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPwMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Owner UAT — สร้างบัญชีพนักงานใหม่ (อยู่บนสุด — งานแรกที่ Owner มักมาทำที่หน้านี้) */}
      <CreateUserForm apps={apps} createAction={createUserAction} goldColor={goldColor} />

      <div className="pt-2">
        <label className="block text-xs text-slate-400 mb-1.5">ผู้ใช้</label>
        <select
          value={selectedId}
          onChange={(e) => pickUser(e.target.value)}
          className="w-full max-w-sm rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
          style={{ ["--tw-ring-color" as string]: goldColor }}
        >
          <option value="" disabled className="text-gray-900">
            — เลือกผู้ใช้ —
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id} className="text-gray-900">
              {u.displayName} ({u.username}) — {u.isOwner ? "เจ้าของกิจการ" : ROLE_LABEL[u.role] ?? u.role}
            </option>
          ))}
        </select>
      </div>

      {selected && (selected.isOwner || selected.isSelf) && (
        <div className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-400/30 rounded-lg px-4 py-3">
          {selected.isSelf
            ? "ไม่สามารถแก้ไขสิทธิ์ของตัวเองได้ — เจ้าของกิจการเข้าได้ทุกแอปพลิเคชันเสมอ"
            : "เจ้าของกิจการเข้าได้ทุกแอปพลิเคชันโดยปริยาย — ไม่ต้องกำหนดสิทธิ์"}
        </div>
      )}

      {editable && (
        <>
          <div className="space-y-2.5">
            <div className="text-xs text-slate-400">แอปพลิเคชันที่เข้าถึงได้</div>
            {apps.map((app) => (
              <label
                key={app.id}
                className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 cursor-pointer hover:border-white/30"
              >
                <input
                  type="checkbox"
                  checked={checked.has(app.id)}
                  onChange={() => toggle(app.id)}
                  className="mt-0.5 w-4 h-4 accent-[#C9A24B]"
                />
                <span>
                  <span className="block text-sm text-white">{app.name}</span>
                  <span className="block text-xs text-slate-400 mt-0.5">{app.description}</span>
                </span>
              </label>
            ))}
          </div>

          {message && (
            <div
              role="status"
              className={`text-sm rounded-lg px-4 py-3 border ${
                message.ok
                  ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/30"
                  : "text-red-200 bg-red-500/10 border-red-400/30"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={!dirty || isPending}
              className="text-sm font-semibold rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors"
              style={{ background: goldColor, color: "#071228" }}
            >
              {isPending ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </button>
            {dirty && !isPending && <span className="text-xs text-amber-300">● มีการแก้ไขที่ยังไม่ได้บันทึก</span>}
          </div>
        </>
      )}

      {editable && (
        <div className="pt-5 border-t border-white/10 space-y-3">
          <div>
            <div className="text-sm text-white font-medium">ตั้งรหัสผ่านใหม่ (กรณีลืมรหัสผ่าน)</div>
            <p className="mt-1 text-xs text-slate-400">
              ด้วยเหตุผลด้านความปลอดภัย ระบบไม่สามารถแสดงรหัสผ่านปัจจุบันของผู้ใช้ได้ (รหัสผ่านถูกเข้ารหัสแบบทางเดียว) — เจ้าของกิจการสามารถตั้งรหัสผ่านใหม่ให้ผู้ใช้ที่ลืมรหัสผ่านได้แทน
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 max-w-md">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPwMessage(null);
              }}
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
              className="rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2.5 placeholder:text-slate-500 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: goldColor }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPwMessage(null);
              }}
              placeholder="ยืนยันรหัสผ่านใหม่"
              className="rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2.5 placeholder:text-slate-500 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: goldColor }}
            />
          </div>

          {pwMessage && (
            <div
              role="status"
              className={`text-sm rounded-lg px-4 py-3 border max-w-md ${
                pwMessage.ok
                  ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/30"
                  : "text-red-200 bg-red-500/10 border-red-400/30"
              }`}
            >
              {pwMessage.text}
            </div>
          )}

          <button
            onClick={resetPassword}
            disabled={newPassword.length === 0 || isResettingPw}
            className="text-sm font-semibold rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors border border-white/20 text-white hover:bg-white/[0.06]"
          >
            {isResettingPw ? "กำลังตั้งรหัสผ่าน..." : "ตั้งรหัสผ่านใหม่"}
          </button>
        </div>
      )}
    </div>
  );
}
