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
  active: boolean;
  appIds: string[];
};

type ManagedApp = { id: string; name: string; description: string; enabled: boolean };

const ROLE_LABEL: Record<string, string> = {
  OWNER_ADMIN: "ผู้ดูแลระบบ",
  BILLING_STAFF: "พนักงานออกบิล",
  VIEWER: "ผู้ดูรายงาน",
};

// Post-Go-live — Owner ขอคำอธิบายชัดๆ ในหน้าต่างว่าแต่ละตำแหน่งเห็น/ทำอะไรได้บ้าง —
// เนื้อหาสรุปจาก Permission Matrix จริง (src/lib/permissions.ts) ฉบับภาษาคน ถ้า Matrix
// เปลี่ยนต้องอัปเดตข้อความนี้ตามด้วย
const ROLE_INFO: { key: string; label: string; sees: string; cannot: string }[] = [
  {
    key: "OWNER_ADMIN",
    label: "ผู้ดูแลระบบ",
    sees: "เห็นทุกเมนู ทำได้ทุกอย่าง — จัดการลูกค้า/สาขา สินค้า ราคา/VAT ส่วนลด เอกสารทุกชนิด (สร้าง/พิมพ์/ยกเลิก) Dashboard รายงานทั้งหมด ตั้งค่าระบบ และดู Audit Log",
    cannot: "เข้า Access Management (หน้านี้) ไม่ได้ — สงวนให้เจ้าของกิจการเท่านั้น",
  },
  {
    key: "BILLING_STAFF",
    label: "พนักงานออกบิล",
    sees: "งานเอกสารครบวงจร — ดูข้อมูลลูกค้า/สาขา/สินค้า/กลุ่มส่วนลด สร้าง/พิมพ์/ยกเลิกเอกสารได้ทุกชนิด (ใบเสนอราคา ออเดอร์ ใบส่งของชั่วคราว ใบกำกับภาษี ใบวางบิล ใบส่งคืนซ่อม)",
    cannot: "แก้ข้อมูลหลัก (ลูกค้า/สินค้า/ราคา/ส่วนลด) ไม่ได้ และไม่เห็น Dashboard/รายงาน/ตั้งค่าระบบ",
  },
  {
    key: "VIEWER",
    label: "ผู้ดูรายงาน",
    sees: "ดูอย่างเดียว — Dashboard รายงาน Export ได้ และเปิดดูข้อมูลลูกค้า/สินค้าได้",
    cannot: "สร้างหรือแก้ไขอะไรไม่ได้เลย (ไม่มีเมนูสร้างเอกสาร)",
  },
];

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
  // Default ติ๊กทุกแอปที่ Grant ได้จริง (ปัจจุบันคือ Billing แอปเดียว) — เจตนาหลักของการ
  // สร้างพนักงานคือให้เข้าแอปทำงานได้เลย ไม่ต้องมากด Grant ซ้ำอีกขั้น
  const [grantApps, setGrantApps] = useState<Set<string>>(() => new Set(apps.filter((a) => a.enabled).map((a) => a.id)));
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
          <label
            key={app.id}
            className={`flex items-center gap-2.5 text-sm w-fit ${
              app.enabled ? "text-white cursor-pointer" : "text-slate-500 cursor-not-allowed"
            }`}
          >
            <input
              type="checkbox"
              checked={grantApps.has(app.id)}
              disabled={!app.enabled}
              onChange={() => toggleApp(app.id)}
              className="w-4 h-4 accent-[#C9A24B] disabled:opacity-40"
            />
            {app.name}
            {!app.enabled && (
              <span className="text-[10px] tracking-wider text-slate-500 border border-white/10 rounded-full px-2 py-0.5">
                เร็วๆ นี้
              </span>
            )}
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
  updateRoleAction,
  setActiveAction,
  deleteUserAction,
  goldColor,
}: {
  users: ManagedUser[];
  apps: ManagedApp[];
  action: (targetUserId: string, formData: FormData) => Promise<ActionResult>;
  resetPasswordAction: (targetUserId: string, formData: FormData) => Promise<ActionResult>;
  createUserAction: (formData: FormData) => Promise<ActionResult>;
  updateRoleAction: (targetUserId: string, formData: FormData) => Promise<ActionResult>;
  setActiveAction: (targetUserId: string, active: boolean) => Promise<ActionResult>;
  deleteUserAction: (targetUserId: string) => Promise<ActionResult>;
  goldColor: string;
}) {
  const router = useRouter();
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

  // Post-Go-live — เปลี่ยนตำแหน่ง (Role) + ปิด/เปิด/ลบบัญชี — State แยกส่วนกันชัดเจน
  const [roleValue, setRoleValue] = useState("");
  const [roleMessage, setRoleMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSavingRole, startRoleTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isChangingStatus, startStatusTransition] = useTransition();

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const manageable = !!selected && !selected.isOwner && !selected.isSelf;
  const editable = manageable && selected!.active;
  const dirty = editable && JSON.stringify([...checked].sort()) !== JSON.stringify([...selected!.appIds].sort());
  const roleDirty = editable && roleValue !== "" && roleValue !== selected!.role;

  function pickUser(id: string) {
    setSelectedId(id);
    setMessage(null);
    setPwMessage(null);
    setRoleMessage(null);
    setStatusMessage(null);
    setNewPassword("");
    setConfirmPassword("");
    const u = users.find((x) => x.id === id);
    setChecked(new Set(u?.appIds ?? []));
    setRoleValue(u?.role ?? "");
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

  function saveRole() {
    if (!selected || !roleDirty) return;
    const fd = new FormData();
    fd.set("role", roleValue);
    startRoleTransition(async () => {
      const result = await updateRoleAction(selected.id, fd);
      if (result.success) {
        setRoleMessage({ ok: true, text: result.message ?? "เปลี่ยนตำแหน่งเรียบร้อย" });
        router.refresh();
      } else {
        setRoleMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  function changeActive(nextActive: boolean) {
    if (!selected) return;
    const label = `${selected.displayName} (${selected.username})`;
    const ok = nextActive
      ? window.confirm(`เปิดการใช้งานบัญชี ${label} อีกครั้ง?`)
      : window.confirm(`ปิดการใช้งานบัญชี ${label}?\n\nพนักงานคนนี้จะเข้าสู่ระบบไม่ได้ทันที (Session ที่ค้างอยู่จะถูกเด้งออก) — เปิดกลับได้ทุกเมื่อจากหน้านี้`);
    if (!ok) return;
    startStatusTransition(async () => {
      const result = await setActiveAction(selected.id, nextActive);
      setStatusMessage(
        result.success
          ? { ok: true, text: result.message ?? "บันทึกเรียบร้อย" }
          : { ok: false, text: result.error ?? "เกิดข้อผิดพลาด" }
      );
      if (result.success) router.refresh();
    });
  }

  function deleteUser() {
    if (!selected) return;
    const label = `${selected.displayName} (${selected.username})`;
    if (!window.confirm(`ลบบัญชี ${label} ออกจากระบบถาวร?\n\nการลบถาวรย้อนกลับไม่ได้ — ระบบจะยอมลบเฉพาะบัญชีที่ไม่มีเอกสารอ้างถึงเท่านั้น`)) return;
    startStatusTransition(async () => {
      const result = await deleteUserAction(selected.id);
      if (result.success) {
        setSelectedId("");
        setStatusMessage(null);
        router.refresh();
      } else {
        setStatusMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Owner UAT — สร้างบัญชีพนักงานใหม่ (อยู่บนสุด — งานแรกที่ Owner มักมาทำที่หน้านี้) */}
      <CreateUserForm apps={apps} createAction={createUserAction} goldColor={goldColor} />

      {/* Post-Go-live — คำอธิบายสิทธิ์แต่ละตำแหน่ง (Owner ขอให้เห็นในหน้าต่างเลยว่าใคร
          เห็น/ทำอะไรได้แค่ไหน) — ใช้อ้างอิงตอนตั้ง/เปลี่ยนตำแหน่งด้านล่าง */}
      <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-5">
        <div className="text-sm text-white font-medium">ตำแหน่ง (Role) แต่ละแบบ เห็น/ทำอะไรได้บ้าง</div>
        <p className="mt-1 text-xs text-slate-400">
          ตำแหน่งกำหนดสิทธิ์ &quot;ภายใน&quot; แอป Billing (เมนูที่เห็น สิ่งที่ทำได้) — ต้องการให้พนักงานเห็นทุกเมนูไปก่อน ให้ตั้งตำแหน่งเป็น
          &quot;ผู้ดูแลระบบ&quot; แล้วค่อยปรับลงภายหลังได้ทุกเมื่อ
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {ROLE_INFO.map((r) => (
            <div key={r.key} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-sm font-semibold" style={{ color: goldColor }}>
                {r.label}
              </div>
              <div className="mt-1.5 text-xs text-slate-300 leading-relaxed">{r.sees}</div>
              <div className="mt-1.5 text-xs text-slate-500 leading-relaxed">ข้อจำกัด: {r.cannot}</div>
            </div>
          ))}
        </div>
      </div>

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
              {u.active ? "" : " [ปิดการใช้งานแล้ว]"}
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

      {/* Post-Go-live — บัญชีที่ปิดการใช้งานแล้ว: เหลือแค่ เปิดกลับ / ลบถาวร (ส่วนจัดการ
          สิทธิ์/ตำแหน่ง/รหัสผ่านซ่อนไว้ — ไม่มีความหมายจนกว่าจะเปิดใช้งานกลับ) */}
      {manageable && !selected!.active && (
        <div className="space-y-3">
          <div className="text-sm text-slate-300 bg-white/[0.04] border border-white/15 rounded-lg px-4 py-3">
            บัญชีนี้ถูกปิดการใช้งานอยู่ — เข้าสู่ระบบไม่ได้ — เปิดกลับเพื่อใช้งานต่อ หรือลบถาวรหากไม่ใช้แล้ว
            (ลบได้เฉพาะบัญชีที่ไม่มีเอกสารในระบบอ้างถึง)
          </div>
          {statusMessage && (
            <div
              role="status"
              className={`text-sm rounded-lg px-4 py-3 border ${
                statusMessage.ok
                  ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/30"
                  : "text-red-200 bg-red-500/10 border-red-400/30"
              }`}
            >
              {statusMessage.text}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={() => changeActive(true)}
              disabled={isChangingStatus}
              className="text-sm font-semibold rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors"
              style={{ background: goldColor, color: "#071228" }}
            >
              {isChangingStatus ? "กำลังบันทึก..." : "เปิดการใช้งานอีกครั้ง"}
            </button>
            <button
              onClick={deleteUser}
              disabled={isChangingStatus}
              className="text-sm font-semibold rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors border border-red-400/40 text-red-300 hover:bg-red-500/10"
            >
              ลบบัญชีถาวร
            </button>
          </div>
        </div>
      )}

      {/* Post-Go-live — เปลี่ยนตำแหน่ง (Role): รองรับกรณีเลื่อน/ปรับตำแหน่งพนักงาน —
          มีผลทันทีโดยพนักงานไม่ต้อง Logout (Role อ่านสดจาก DB ใน jwt callback แล้ว) */}
      {editable && (
        <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 space-y-3">
          <div>
            <div className="text-sm text-white font-medium">ตำแหน่ง (Role)</div>
            <p className="mt-1 text-xs text-slate-400">
              เปลี่ยนแล้วมีผลกับเมนูและสิทธิ์ของพนักงานทันที ไม่ต้องให้ออกจากระบบก่อน — ดูคำอธิบายสิทธิ์แต่ละตำแหน่งที่กล่องด้านบน
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={roleValue}
              onChange={(e) => {
                setRoleValue(e.target.value);
                setRoleMessage(null);
              }}
              className="rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: goldColor }}
            >
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value} className="text-gray-900">
                  {label} ({value})
                </option>
              ))}
            </select>
            <button
              onClick={saveRole}
              disabled={!roleDirty || isSavingRole}
              className="text-sm font-semibold rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors"
              style={{ background: goldColor, color: "#071228" }}
            >
              {isSavingRole ? "กำลังบันทึก..." : "บันทึกตำแหน่งใหม่"}
            </button>
            {roleDirty && !isSavingRole && <span className="text-xs text-amber-300">● ยังไม่ได้บันทึก</span>}
          </div>
          {roleMessage && (
            <div
              role="status"
              className={`text-sm rounded-lg px-4 py-3 border ${
                roleMessage.ok
                  ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/30"
                  : "text-red-200 bg-red-500/10 border-red-400/30"
              }`}
            >
              {roleMessage.text}
            </div>
          )}
        </div>
      )}

      {editable && (
        <>
          <div className="space-y-2.5">
            <div className="text-xs text-slate-400">
              แอปพลิเคชันที่เข้าถึงได้ — ผู้ใช้จะเห็นเฉพาะแอปที่ติ๊กไว้บน Application Portal เท่านั้น
            </div>
            {apps.map((app) => (
              <label
                key={app.id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  app.enabled
                    ? "border-white/15 bg-white/[0.04] cursor-pointer hover:border-white/30"
                    : "border-white/10 bg-white/[0.02] cursor-not-allowed opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked.has(app.id)}
                  disabled={!app.enabled}
                  onChange={() => toggle(app.id)}
                  className="mt-0.5 w-4 h-4 accent-[#C9A24B] disabled:opacity-40"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm text-white">
                    {app.name}
                    {!app.enabled && (
                      <span className="text-[10px] tracking-wider text-slate-500 border border-white/10 rounded-full px-2 py-0.5">
                        เร็วๆ นี้
                      </span>
                    )}
                  </span>
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

      {/* Post-Go-live — ปิดการใช้งานบัญชี (กรณีพนักงานลาออก/พ้นสภาพ) — จงใจเป็นขั้นแรก
          ของการลบเสมอ: ปิดก่อน (ย้อนกลับได้) แล้วค่อยลบถาวรจากสถานะปิดอีกที (กันลบพลาด
          ในคลิกเดียว) — บัญชีที่มีเอกสารอ้างถึงจะลบถาวรไม่ได้ ใช้ปิดค้างไว้แทน */}
      {editable && (
        <div className="pt-5 border-t border-white/10 space-y-3">
          <div>
            <div className="text-sm text-white font-medium">ปิดการใช้งานบัญชี (กรณีลาออก / พ้นสภาพพนักงาน)</div>
            <p className="mt-1 text-xs text-slate-400">
              ปิดแล้วเข้าสู่ระบบไม่ได้ทันที และ Session ที่ค้างอยู่จะถูกเด้งออก — เปิดกลับได้ทุกเมื่อ —
              หากต้องการลบออกจากระบบถาวร ให้ปิดการใช้งานก่อน แล้วปุ่มลบถาวรจะแสดงขึ้นมา
            </p>
          </div>
          {statusMessage && (
            <div
              role="status"
              className={`text-sm rounded-lg px-4 py-3 border ${
                statusMessage.ok
                  ? "text-emerald-200 bg-emerald-500/10 border-emerald-400/30"
                  : "text-red-200 bg-red-500/10 border-red-400/30"
              }`}
            >
              {statusMessage.text}
            </div>
          )}
          <button
            onClick={() => changeActive(false)}
            disabled={isChangingStatus}
            className="text-sm font-semibold rounded-lg px-5 py-2.5 disabled:opacity-40 transition-colors border border-red-400/40 text-red-300 hover:bg-red-500/10"
          >
            {isChangingStatus ? "กำลังบันทึก..." : "ปิดการใช้งานบัญชีนี้"}
          </button>
        </div>
      )}
    </div>
  );
}
