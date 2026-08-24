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
// Owner UAT — Billing UI Visual Polish R3 (2026-08-24): R2 แก้แค่ Margin/Glow ของ
// Active Pill บน Sidebar ขาว — Owner ยืนยันว่ายังไม่ตรง Requirement เพราะปัญหาจริงคือ
// Sidebar ทั้งแถบไม่มี "มวลสี" ให้เชื่อมกับ Content ได้ (ดู sidebar-shell.tsx สำหรับ
// Gradient Navy ใหม่ของพื้น Sidebar) — รอบนี้จึง Redesign "Active-state Shape" ใหม่
// ทั้งชุดให้เข้ากับพื้น Navy แทนที่จะ Patch ของเดิม:
//   - พื้นหลัง Sidebar เป็น Navy เข้มแล้ว (ไม่ใช่ขาว) → Active ต้องใช้สี "สว่างกว่า" พื้น
//     เพื่อให้ Pop เห็นชัดว่ากำลังอยู่ตรงไหน (Requirement ข้อ 2 "ฟ้า/น้ำเงินของ Brand")
//     — ใช้ Tailwind blue-500→600 (สว่าง+อิ่มสีกว่า cp-navy พื้นหลังชัดเจน) แทน Gradient
//     cp-navy→cp-navy-light เดิมของ R2 ที่แทบกลืนกับพื้นใหม่นี้พอดี
//   - Inactive/Group/Divider/Disabled ทั้งหมดพลิกจาก เทา-บน-ขาว → ขาวโปร่งแสง-บน-Navy
//     (Requirement ข้อ 3: "ถ้าอยู่บนพื้น Blue/Navy ให้ใช้ตัวอักษร/Icon สีขาวหรือสีอ่อน")
//
// Owner UAT — Billing UI Visual Polish R4 (2026-08-24): R3 ทำให้ Sidebar เป็นพื้น Navy
// จริงแล้ว แต่ขอบ Content (Cream) ที่ชนกับ Active Pill ยังเป็น "เส้นตรงแข็งๆ" — Owner
// ต้องการให้พื้นครีมของ Content "ไหลเข้าหา/โอบรับ" Active Menu จนดูเป็น Shape เดียวกัน
// (ไม่ใช่ Glow/ไม่ใช่ยืด Pill ให้ยาว — สั่งห้ามทั้งคู่ตรงๆ) — ใช้เทคนิค "Concave Corner
// Connector" (Squircle Tab แบบเดียวกับ Sidebar ของ macOS System Settings/หลาย Dashboard
// พรีเมียม): วาง Quarter-circle 2 ชิ้นเล็กๆ (16×16px) ชิดขอบขวาบนและขวาล่างของ Pill ที่
// Active เท่านั้น แต่ละชิ้นเป็น radial-gradient ที่ "เจาะ" ส่วนโค้งสีครีม (มุมที่ชิดกับ Pill)
// ออกจากพื้นหลัง Transparent (ให้เห็น Navy ของ Sidebar จริงๆ ทะลุออกมานอกส่วนโค้ง กันสี
// เพี้ยนจาก Gradient Navy ของ Sidebar ที่ไล่เฉดตามแนวตั้ง — ไม่ Hardcode สี Navy คงที่)
// ผลลัพธ์: มองเห็นพื้นครีมโค้งเว้าเข้ามาจากด้านบน วกไปสัมผัส Pill แล้วโค้งเว้ากลับออก
// ด้านล่าง ต่อเนื่องเป็นเส้นเดียวกับขอบ Pill (Pill ต้อง Flush ชนขอบขวาสุดของ Sidebar
// พอดี — Reintroduce Bleed Technique จาก R2 แต่รอบนี้เป็นฐานรองรับ Curve ไม่ใช่ตัว
// เทคนิคหลักเหมือน R2) — **Desktop (md+) เท่านั้น**: Mobile Drawer ไม่ได้ยืนชิด Content
// จริง Curve จะดูลอย/เสี่ยง Overflow จึงปิดไว้ (hidden md:block) ตามที่ Owner อนุญาตชัดเจน
// ให้ Mobile คง Shape ปลอดภัยเดิม (rounded-xl ปกติ 2 ข้าง ไม่ Bleed)
const CONNECTOR_RADIUS = 16; // px — ต้อง <= ความสูง Pill/2 ไม่งั้นโค้งจะทับกันเองดูแปลก (Pill สูง ~34px จาก py-1.5+text-sm สบายๆ)
const CREAM_HEX = "#F7F5F0"; // = cp-cream (Arbitrary radial-gradient รับแค่ Literal Value ไม่อ้าง Tailwind Token ได้ตรงๆ)

/** Concave Corner ที่ขอบ Pill กับ Content — ดู Comment ยาวด้านบนของไฟล์สำหรับเหตุผล
 * เต็ม — Render เฉพาะตอน Active + เฉพาะ Desktop (Parent ต้องมี position:relative ผ่าน
 * ACTIVE_CLASS อยู่แล้ว) */
function ActiveConnector({ edge }: { edge: "top" | "bottom" }) {
  const gradientAt = edge === "top" ? "bottom right" : "top right";
  return (
    <span
      aria-hidden
      className={`hidden md:block absolute right-0 ${edge === "top" ? "bottom-full" : "top-full"} w-4 h-4 pointer-events-none`}
      style={{
        background: `radial-gradient(circle at ${gradientAt}, ${CREAM_HEX} ${CONNECTOR_RADIUS}px, transparent ${CONNECTOR_RADIUS}px)`,
      }}
    />
  );
}

const LINK_CLASS =
  "flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-xl text-sm transition-colors duration-200";
// R4 — rounded-l-xl/rounded-r-none + md:mr-[-8px] (Bleed ชดเชย px-2 ของ <nav> พอดี — ดู
// SidebarNav ด้านล่าง) เฉพาะ md+ ให้ขอบขวา Pill ชนขอบ Sidebar/Content พอดีเป๊ะ เป็นฐาน
// ให้ ActiveConnector ทั้ง 2 ชิ้นต่อโค้งได้สนิทไม่มีช่องว่าง — Mobile ไม่ Bleed (rounded-xl
// ปกติทั้ง 2 ข้างจาก Base Class) ปลอดภัยจาก Overflow ตามเดิม
const ACTIVE_CLASS =
  "relative bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium shadow-lg shadow-blue-950/40 " +
  "md:rounded-l-xl md:rounded-r-none md:mr-[-8px] md:pr-5";
const INACTIVE_CLASS = "text-white/75 hover:bg-white/10 hover:text-white";
const DISABLED_CLASS =
  "flex items-center justify-between px-3 py-1.5 rounded-lg text-sm text-white/30 cursor-not-allowed select-none";

function IconSlot({ name, active, depth }: { name: NavIconKey | undefined; active: boolean; depth: number }) {
  if (!name) return null;
  if (depth === 0) {
    // Main Menu — Chip Container กระจกฝ้าบนพื้น Navy (ข้อ 2 R2 ยังใช้ต่อ: "Active icon
    // มี Container สัมพันธ์กับ Active Surface") — Inactive = ขาวจางกลืนพื้น Navy,
    // Active = ขาวสว่างขึ้นบน Blue Pill
    return (
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors duration-200 ${
          active ? "bg-white/25 text-white" : "bg-white/10 text-white/70"
        }`}
      >
        <NavIcon name={name} className="w-[18px] h-[18px]" />
      </span>
    );
  }
  // Submenu — Icon เปล่า เล็กกว่า ไม่มี Container (แยก Hierarchy จาก Main Menu ชัดเจน)
  return <NavIcon name={name} className={`w-[15px] h-[15px] shrink-0 ${active ? "text-white/90" : "text-white/50"}`} />;
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
      <summary className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-medium text-white/85 cursor-pointer list-none hover:bg-white/10 hover:text-white transition-colors duration-200 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <IconSlot name={group.icon} active={false} depth={depth} />
          {group.label}
        </span>
        <span className="text-white/40 transition-transform duration-200 group-open:rotate-90 shrink-0 ml-2">
          &rsaquo;
        </span>
      </summary>
      <div className="pl-3 space-y-0.5 mt-0.5 border-l border-white/10 ml-3">
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
        <span className="text-[10px] bg-white/10 text-white/40 rounded-full px-1.5 py-0.5 ml-2 shrink-0">เร็วๆ นี้</span>
      </span>
    );
  }
  const active = node.href === activeHref;
  return (
    <a href={node.href} className={`${LINK_CLASS} ${active ? ACTIVE_CLASS : INACTIVE_CLASS}`}>
      {active && (
        <>
          <ActiveConnector edge="top" />
          <ActiveConnector edge="bottom" />
        </>
      )}
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
