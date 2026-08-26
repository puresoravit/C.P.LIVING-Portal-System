"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";

// ==========================================================================
// R10 (2026-08-26) — Catalog Group Board: หน้า "สินค้าของลูกค้าที่อยู่ในระบบ"
// กลุ่ม = กล่อง Drop Zone (ชื่อแก้ได้/สมาชิกเป็น Chip ลากได้/จำนวนสินค้า Shared) —
// บริษัทที่ยังไม่มีกลุ่มเป็นการ์ดด้านล่าง ลากเข้ากลุ่มไหนก็ได้ หรือลากสมาชิกข้ามกลุ่ม/
// ออกมาที่โซน "ไม่มีกลุ่ม" — ทุกการย้ายตัดสินเคสจริงฝั่ง Server (moveCompanyToCatalog)
// Client แค่บรรยาย Confirm จากข้อมูลที่ Render มา — ปุ่ม "ย้ายไป… ▾" บนทุก Chip/การ์ด
// เป็น Fallback สำหรับ Mobile — ไม่มี Parent/Subset: สมาชิกทุกบริษัทระดับเดียวกันเสมอ
// ==========================================================================

export type BoardMember = { id: string; code: string; companyName: string; privateCount: number };
export type BoardGroup = { id: string; name: string; sharedCount: number; members: BoardMember[] };

export function CatalogGroupBoard({
  groups,
  ungrouped,
  moveAction,
  createGroupAction,
  renameAction,
}: {
  groups: BoardGroup[];
  ungrouped: BoardMember[];
  moveAction: (customerId: string, targetCatalogId: string | null) => Promise<ActionResult>;
  createGroupAction: (formData: FormData) => Promise<ActionResult>;
  renameAction: (catalogId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null); // customerId
  const [overZone, setOverZone] = useState<string | null>(null); // catalogId | "__ungroup__"
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const locate = (customerId: string): { member: BoardMember; group: BoardGroup | null } | null => {
    for (const g of groups) {
      const m = g.members.find((x) => x.id === customerId);
      if (m) return { member: m, group: g };
    }
    const u = ungrouped.find((x) => x.id === customerId);
    return u ? { member: u, group: null } : null;
  };

  function confirmTextFor(customerId: string, targetCatalogId: string | null): string | null {
    const loc = locate(customerId);
    if (!loc) return null;
    const target = targetCatalogId ? groups.find((g) => g.id === targetCatalogId) : null;
    const name = loc.member.companyName;
    if (!loc.group) {
      return target ? `เพิ่ม "${name}" เข้ากลุ่ม "${target.name}"? — เห็น Shared ของกลุ่มทันที` : null;
    }
    if (loc.group.id === targetCatalogId) return null; // กลุ่มเดิม
    const dest = target ? `ย้ายไปกลุ่ม "${target.name}"` : "นำออกจากกลุ่ม";
    if (loc.group.members.length === 1 && loc.group.sharedCount > 0) {
      return `${dest}: "${name}"? — Shared ${loc.group.sharedCount} รายการของกลุ่มเดี่ยวเดิมจะกลายเป็น Private ของบริษัทนี้ (มองเห็นเท่าเดิม ไม่หาย/ไม่ Leak ให้กลุ่มใหม่)`;
    }
    if (loc.group.members.length > 1 && loc.group.sharedCount > 0) {
      return `${dest}: "${name}"? — Shared ${loc.group.sharedCount} รายการยังอยู่กับกลุ่ม "${loc.group.name}" และบริษัทนี้จะไม่เห็นรายการเหล่านั้นอีก (Private ของบริษัทติดตัวไปตามปกติ)`;
    }
    return `${dest}: "${name}"?`;
  }

  function doMove(customerId: string, targetCatalogId: string | null) {
    const text = confirmTextFor(customerId, targetCatalogId);
    if (text === null) return;
    if (!window.confirm(text)) return;
    startTransition(async () => {
      const result = await moveAction(customerId, targetCatalogId);
      if (result.success) {
        setMessage({ ok: true, text: result.message ?? "ย้ายสำเร็จ" });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  function submitCreateGroup() {
    const fd = new FormData();
    fd.set("name", newGroupName);
    startTransition(async () => {
      const result = await createGroupAction(fd);
      if (result.success) {
        setMessage({ ok: true, text: result.message ?? "สร้างกลุ่มแล้ว" });
        setNewGroupName("");
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  function submitRename(catalogId: string) {
    const fd = new FormData();
    fd.set("name", renameValue);
    startTransition(async () => {
      const result = await renameAction(catalogId, fd);
      if (result.success) {
        setMessage({ ok: true, text: result.message ?? "เปลี่ยนชื่อแล้ว" });
        setRenamingId(null);
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error ?? "เกิดข้อผิดพลาด" });
      }
    });
  }

  const zoneProps = (zoneId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragging) {
        e.preventDefault();
        setOverZone(zoneId);
      }
    },
    onDragLeave: () => setOverZone((prev) => (prev === zoneId ? null : prev)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const customerId = e.dataTransfer.getData("text/plain") || dragging;
      setOverZone(null);
      setDragging(null);
      if (customerId) doMove(customerId, zoneId === "__ungroup__" ? null : zoneId);
    },
  });

  const moveTargets = (current: string | null) => [
    ...groups.filter((g) => g.id !== current).map((g) => ({ value: g.id, label: `กลุ่ม: ${g.name}` })),
    ...(current !== null ? [{ value: "__ungroup__", label: "— นำออกจากกลุ่ม —" }] : []),
  ];

  const memberChip = (m: BoardMember, currentGroupId: string | null) => (
    <span
      key={m.id}
      draggable
      onDragStart={(e) => {
        setDragging(m.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", m.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOverZone(null);
      }}
      className={`inline-flex items-center gap-1.5 text-sm bg-white border rounded-full pl-3 pr-1.5 py-1 cursor-grab active:cursor-grabbing ${
        dragging === m.id ? "opacity-40" : ""
      }`}
    >
      <a href={`/products?company=${m.id}`} className="hover:text-blue-700">
        {m.companyName} <span className="text-gray-400">({m.code})</span>
      </a>
      {m.privateCount > 0 && (
        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5" title="สินค้า Private เฉพาะบริษัทนี้ (สมาชิกอื่นในกลุ่มไม่เห็น)">
          Private {m.privateCount}
        </span>
      )}
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (v) doMove(m.id, v === "__ungroup__" ? null : v);
        }}
        className="text-[10px] border-0 bg-transparent text-gray-400 cursor-pointer max-w-[70px]"
        title="ย้ายบริษัทนี้ (Fallback สำหรับ Mobile — เหมือนการลากทุกประการ)"
      >
        <option value="" disabled>
          ย้าย ▾
        </option>
        {moveTargets(currentGroupId).map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </span>
  );

  return (
    <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
      <p className="text-xs text-gray-400 mb-2">
        ลากบริษัทเข้ากลุ่ม/ข้ามกลุ่ม หรือใช้ปุ่ม &quot;ย้าย ▾&quot; — สมาชิกทุกบริษัทในกลุ่มอยู่ระดับเดียวกัน เห็น Shared ร่วมกัน ส่วน Private เป็นของบริษัทนั้นเท่านั้น
      </p>

      {message && (
        <div
          role="status"
          className={`text-sm rounded px-3 py-2 border mb-3 ${
            message.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* สร้างกลุ่มใหม่ */}
      <div className="flex items-center gap-2 mb-4 max-w-md">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="ชื่อกลุ่มใหม่ เช่น ปีนัง"
          className="flex-1 border rounded px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={submitCreateGroup}
          disabled={!newGroupName.trim()}
          className="text-sm bg-blue-600 text-white rounded px-4 py-1.5 disabled:opacity-40 hover:bg-blue-700"
        >
          + สร้างกลุ่ม
        </button>
      </div>

      {/* กลุ่มทั้งหมด (Drop Zones) */}
      <div className="space-y-3 mb-5">
        {groups.map((g) => (
          <div
            key={g.id}
            {...zoneProps(g.id)}
            className={`border rounded-lg p-4 transition-colors ${
              overZone === g.id ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50" : "bg-gray-50/60"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {renamingId === g.id ? (
                <span className="inline-flex items-center gap-1.5">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button type="button" onClick={() => submitRename(g.id)} className="text-xs text-white bg-blue-600 rounded px-2 py-1">
                    บันทึก
                  </button>
                  <button type="button" onClick={() => setRenamingId(null)} className="text-xs text-gray-500">
                    ยกเลิก
                  </button>
                </span>
              ) : (
                <>
                  <span className="font-medium">{g.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(g.id);
                      setRenameValue(g.name);
                    }}
                    className="text-xs text-gray-400 hover:text-blue-600"
                    title="เปลี่ยนชื่อกลุ่ม (ไม่กระทบสมาชิก/สินค้า/เอกสาร)"
                  >
                    ✎ แก้ชื่อ
                  </button>
                </>
              )}
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5">
                Shared {g.sharedCount} รายการ
              </span>
              <span className="text-xs text-gray-400">{g.members.length} บริษัท</span>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[34px]">
              {g.members.map((m) => memberChip(m, g.id))}
              {g.members.length === 0 && <span className="text-xs text-gray-400 self-center">กลุ่มว่าง — ลากบริษัทมาวางที่นี่</span>}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-gray-400 border border-dashed rounded-lg p-4 text-center">ยังไม่มีกลุ่ม — ตั้งชื่อแล้วกด &quot;+ สร้างกลุ่ม&quot; ด้านบน</p>
        )}
      </div>

      {/* บริษัทที่ยังไม่มีกลุ่ม (Drop Zone สำหรับ "นำออกจากกลุ่ม") */}
      <div
        {...zoneProps("__ungroup__")}
        className={`border border-dashed rounded-lg p-4 ${overZone === "__ungroup__" ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50" : ""}`}
      >
        <div className="text-xs text-gray-500 mb-2">บริษัทที่ยังไม่มีกลุ่ม (ลากสมาชิกมาวางที่นี่ = นำออกจากกลุ่ม)</div>
        <div className="flex flex-wrap gap-2 min-h-[34px]">
          {ungrouped.map((m) => memberChip(m, null))}
          {ungrouped.length === 0 && <span className="text-xs text-gray-400 self-center">— ทุกบริษัทอยู่ในกลุ่มแล้ว —</span>}
        </div>
      </div>
    </div>
  );
}
