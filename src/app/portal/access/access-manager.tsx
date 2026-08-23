"use client";

import { useState, useTransition } from "react";
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

export function AccessManager({
  users,
  apps,
  action,
  goldColor,
}: {
  users: ManagedUser[];
  apps: ManagedApp[];
  action: (targetUserId: string, formData: FormData) => Promise<ActionResult>;
  goldColor: string;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const editable = !!selected && !selected.isOwner && !selected.isSelf;
  const dirty = editable && JSON.stringify([...checked].sort()) !== JSON.stringify([...selected!.appIds].sort());

  function pickUser(id: string) {
    setSelectedId(id);
    setMessage(null);
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

  return (
    <div className="mt-6 space-y-5">
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">ผู้ใช้</label>
        <select
          value={selectedId}
          onChange={(e) => pickUser(e.target.value)}
          className="w-full max-w-sm rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2.5 focus:outline-none focus:ring-2"
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
    </div>
  );
}
