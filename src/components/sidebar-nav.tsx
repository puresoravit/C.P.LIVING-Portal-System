"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { NavIcon, type NavIconKey } from "@/components/nav-icons";
import type { NavNode } from "@/lib/nav-tree";
import { collectHrefs, resolveActiveHref, groupContainsActiveHref } from "@/lib/nav-active";

// Phase Nav-1 — Sidebar ใหม่แบบ Group/Submenu รับ Tree ที่กรอง Permission มาจาก
// Server Component แล้ว (layout.tsx) — ตัว Component นี้รับผิดชอบแค่ Active State
// (ผ่าน usePathname, Logic จริงอยู่ใน src/lib/nav-active.ts เพื่อ unit test ได้)
// กับ Expand/Collapse (<details> ล้วนๆ ไม่ต้องมี JS Toggle เอง)
//
// Owner UAT — Billing UI Visual Polish R2 (2026-08-24): R1 (bg-blue-50→Gradient
// Rectangle) ยัง "ลอยอยู่บน Sidebar ขาว" ไม่รู้สึกเชื่อมกับ Content — Requirement หลัก
// ของ R2 คือให้ Active Menu รู้สึกเป็น "ทางเข้าสู่หน้าปัจจุบัน" ไม่ใช่ปุ่มลอย — เทคนิคที่ใช้
// (เลือกจาก Layout จริงของระบบ ไม่ใช่ Copy Reference แบบ Pixel-to-pixel):
//   1. Active Pill "เปิดขอบขวา" ที่ md+ (Desktop เท่านั้น — Sidebar ยืนติดกับ Content
//      จริง): rounded เฉพาะฝั่งซ้าย (rounded-l-xl) + ไม่มี Margin ขวา (bleed ชนขอบ Nav
//      พอดี ผ่าน md:mr-[-8px] ชดเชย px-2 ของ <nav> เป๊ะ) ทำให้ตัว Pill "ทะลุ" ไปจรดเส้น
//      แบ่ง Sidebar/Content แทนที่จะมี Margin ขาวคั่นทั้งสองข้างเหมือน R1 (ซึ่งคือสาเหตุหลัก
//      ที่ทำให้ดู "ลอย")
//   2. Directional Glow ที่ md+: shadow เอียงไปทางขวา (ทางเดียวกับ Content) สีน้ำเงินแบรนด์
//      จางๆ ทำให้แสงจาก Pill "สาด" ข้ามเส้นแบ่งไปยัง Content — จำลองความรู้สึกแบบ
//      Reference (Panel เชื่อมกัน) โดยไม่ต้องวาด Curve/Notch ที่เสี่ยง Overflow บนจอเล็ก
//   3. Content Panel (main ใน layout.tsx) มุมซ้ายบนมน (md:rounded-tl-2xl) "รับ" กับ Pill
//      ให้อ่านเป็น Panel เดียวกัน มากกว่า Sidebar/Content แยกเป็น 2 กล่องเหลี่ยม
//   4. Mobile (< md, เป็น Drawer ลอยทับ Content ไม่ได้ยืนติดกันจริง): **ไม่ใช้ Bleed/
//      Glow เลย** (Owner สั่งชัดว่าเทคนิค Desktop Overlap จะทำให้ Overflow ใน Drawer) —
//      กลับไปเป็น Pill มน 2 ข้างปกติ (rounded-xl เฉย ๆ) ปลอดภัย ไม่มีทาง Overflow
//
// Icon Hierarchy (R2 — เดิม R1 "เล็ก/บาง/จางเกินไป"): Main Menu (depth 0 — ทั้ง Link
// บนสุดและหัว Group) ได้ Chip Container (พื้นหลังกลม/เหลี่ยมมน 28×28px) ให้มี Presence
// ชัดเจน — Submenu (depth ≥ 1) เป็น Icon เปล่าขนาดเล็กกว่า ไม่มี Container — ระยะห่างนี้
// เองคือตัวสื่อ Hierarchy Main vs Submenu (ไม่ต้องพึ่ง Font Size/Color ต่างกันเพิ่ม)
const LINK_CLASS =
  "flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-xl text-sm transition-colors duration-150";
const ACTIVE_CLASS =
  "bg-gradient-to-r from-cp-navy to-cp-navy-light text-white font-medium shadow-md shadow-cp-navy/20 " +
  "md:rounded-l-xl md:rounded-r-none md:mr-[-8px] md:pr-5 md:shadow-[4px_0_14px_-2px_rgba(11,27,58,0.35)]";
const INACTIVE_CLASS = "text-gray-700 hover:bg-gray-100";
const DISABLED_CLASS =
  "flex items-center justify-between px-3 py-1.5 rounded-lg text-sm text-gray-400 cursor-not-allowed select-none";

function IconSlot({ name, active, depth }: { name: NavIconKey | undefined; active: boolean; depth: number }) {
  if (!name) return null;
  if (depth === 0) {
    // Main Menu — Chip Container (ข้อ 2 R2: "Active icon สามารถมี accent/container ที่
    // สัมพันธ์กับ active blue surface") — Inactive = เทาอ่อนกลาง, Active = กระจกขาวโปร่ง
    // แสงบน Gradient Navy
    return (
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors duration-150 ${
          active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
        }`}
      >
        <NavIcon name={name} className="w-[18px] h-[18px]" />
      </span>
    );
  }
  // Submenu — Icon เปล่า เล็กกว่า ไม่มี Container (แยก Hierarchy จาก Main Menu ชัดเจน)
  return <NavIcon name={name} className={`w-[15px] h-[15px] shrink-0 ${active ? "text-white/90" : "text-gray-400"}`} />;
}

function NavGroupView({
  group,
  activeHref,
  depth,
}: {
  group: Extract<NavNode, { type: "group" }>;
  activeHref: string | null;
  depth: number;
}) {
  const [open, setOpen] = useState(() => groupContainsActiveHref(group.items, activeHref));
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="group">
      <summary className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 cursor-pointer list-none hover:bg-gray-100 transition-colors duration-150 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <IconSlot name={group.icon} active={false} depth={depth} />
          {group.label}
        </span>
        <span className="text-gray-400 transition-transform duration-150 group-open:rotate-90 shrink-0 ml-2">
          &rsaquo;
        </span>
      </summary>
      <div className="pl-3 space-y-0.5 mt-0.5 border-l ml-3">
        {group.items.map((child, i) => (
          <NavNodeView key={`${child.type}-${i}`} node={child} activeHref={activeHref} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function NavNodeView({ node, activeHref, depth }: { node: NavNode; activeHref: string | null; depth: number }) {
  if (node.type === "signout") {
    return (
      <SignOutButton
        className={`${LINK_CLASS} ${INACTIVE_CLASS} text-left w-full`}
        label={node.label}
        icon={<IconSlot name={node.icon} active={false} depth={depth} />}
      />
    );
  }

  if (node.type === "group") {
    return <NavGroupView group={node} activeHref={activeHref} depth={depth} />;
  }

  if (node.disabled) {
    return (
      <span className={DISABLED_CLASS}>
        <span className="flex items-center gap-2.5">
          <IconSlot name={node.icon} active={false} depth={depth} />
          {node.label}
        </span>
        <span className="text-[10px] bg-gray-100 text-gray-400 rounded-full px-1.5 py-0.5 ml-2 shrink-0">เร็วๆ นี้</span>
      </span>
    );
  }
  const active = node.href === activeHref;
  return (
    <a href={node.href} className={`${LINK_CLASS} ${active ? ACTIVE_CLASS : INACTIVE_CLASS}`}>
      <IconSlot name={node.icon} active={active} depth={depth} />
      {node.label}
    </a>
  );
}

export function SidebarNav({ tree }: { tree: NavNode[] }) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, collectHrefs(tree));
  return (
    <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
      {tree.map((node, i) => (
        <NavNodeView key={`${node.type}-${i}`} node={node} activeHref={activeHref} depth={0} />
      ))}
    </nav>
  );
}
