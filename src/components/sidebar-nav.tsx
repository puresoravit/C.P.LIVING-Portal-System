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
// Owner UAT — Billing UI Visual Polish R5 (2026-08-24): R4 (ติ่งโค้งครีม 16px ที่ปลาย
// ขวาของ Blue Pill) Owner ยืนยันว่ายังไม่ตรง Reference — สิ่งที่ต้องการคือ "Cream
// Content Surface โอบ Active Menu ทั้งก้อน (Icon+Text)" ไม่ใช่ "Blue Pill ยื่นเข้า
// Content แล้วมีติ่งครีมเล็กๆ" — Redesign Active Composition เป็น 2 ชั้น:
//
//   ชั้นนอก "Cream Slot" (ตัว <a> เอง, Desktop md+ เท่านั้น): แถบสีครีม (สีเดียวกับพื้น
//   Content เป๊ะ) ครอบทั้งรายการ สูงกว่า/กว้างกว่า Blue Pill รอบด้าน — ขอบซ้ายมน
//   (rounded-l-2xl) ขอบขวาตัดตรงและ Bleed ชนขอบ Content พอดี (md:mr-[-8px] ชดเชย px-2
//   ของ <nav>) จึงหลอมเป็นเนื้อเดียวกับพื้นครีมของ Content โดยไม่มีเส้นแบ่งใดๆ (ข้อ 7)
//   — อ่านเป็น "ช่องเปิดจาก Sidebar เข้าสู่หน้า Content" ตาม Reference
//
//   ชั้นใน "Blue Pill" (<span> ข้างใน): Gradient ฟ้า Brand ครอบ Icon+Label ครบทั้งรายการ
//   เหมือนเดิม (ข้อ 1) แต่ตอนนี้ "ลอยอยู่ภายใน" ช่องครีม — มีครีมล้อมทุกด้าน (บน/ล่าง/
//   ซ้าย 5px, ขวา 8px ก่อนไหลต่อเข้า Content) = "Cream โอบรอบทั้งข้อความและไอคอน" จริง
//   — Padding ภายใน Pill (px-3 py-1.5) คงเดิมเป๊ะ ตัวอักษรไม่ชิด Curve (ข้อ 9)
//
//   Fillet โค้งเว้า 2 ชิ้น (radial-gradient hard-edge 16px — เทคนิคเดิมจาก R4 แต่ย้ายจุด
//   เกาะ): ต่อที่มุมขวาบน/ขวาล่างของ "Cream Slot" (ไม่ใช่ของ Blue Pill แบบ R4) ให้ขอบครีม
//   โค้งกลับเข้าสู่แนวขอบ Content อย่างนุ่มนวลทั้งบนและล่าง — เมื่อรวมกับ Slot ที่สูงเต็ม
//   รายการ Curve ทั้งชุดจึง "เริ่มก่อนระดับตัวอักษรและจบหลังตัวอักษร" (ข้อ 3) ไม่ใช่ติ่ง
//   เล็กที่ปลายขวาอีกต่อไป — พื้นที่นอกโค้งเป็น Transparent ให้ Navy Gradient จริงของ
//   Sidebar ทะลุออกมา (ไม่ Hardcode Navy กันสีเพี้ยนจากการไล่เฉดแนวตั้ง)
//
//   ไม่มี Arrow (ข้อ 5), ไม่มี Glow (ข้อ 6 — Shadow ที่เหลืออยู่เป็นของ Blue Pill ตัวเอง
//   ธรรมดา ไม่ได้ใช้หลอกการเชื่อม), โครงสร้างเดียวใช้ได้ทั้ง Main Menu และ Submenu ทุก
//   Depth (ข้อ 8 — Bleed ฝั่งขวาเท่ากันทุกชั้นเพราะ Submenu Container เยื้องเฉพาะฝั่งซ้าย)
//
//   Mobile (< md): Slot โปร่งใสไม่มี Padding — Blue Pill เต็มแถวเหมือน R3 เป๊ะ (Pill มน
//   2 ข้าง ไม่ Bleed ไม่มี Curve — Owner อนุญาตชัดเจนให้ Mobile ใช้ Shape ปลอดภัยเดิม)
// Owner UAT R5.1 — Owner มาร์ค Screenshot ชี้ตรงรอยต่อของ Reference: Curve ในตัวอย่าง
// "กวาดกว้างและยาว" (ราวๆ ครึ่งความสูงของ Tab) ของเรา 16px สั้นเกินไปเลยอ่านเป็นรอยบาก
// ไม่ใช่รอยต่อไหลลื่น — ขยายเป็น 24px + เพิ่ม Margin แนวตั้งรอบ Slot (md:my-1 ใน
// ACTIVE_SLOT_CLASS) ให้โค้งมีที่กวาดเต็มวงโดยกินพื้นที่แถวข้างเคียงน้อยลง 4px (กัน
// วงครีมรัศมีใหม่ที่ใหญ่ขึ้นไปทับ Chevron "›" ของ Group Summary แถวติดกัน — คำนวณระยะ
// แล้ว: Chevron อยู่ห่างจุดศูนย์กลางวง ~26px > 24px พอดีเมื่อมี my-1)
const FILLET_RADIUS = 24; // px — รัศมีโค้งเว้าที่ขอบครีมวกกลับเข้าแนว Content
const CREAM_HEX = "#F7F5F0"; // = cp-cream (Arbitrary radial-gradient รับแค่ Literal Value ไม่อ้าง Tailwind Token ได้ตรงๆ)

/** โค้งเว้าที่มุมขวาบน/ล่างของ Cream Slot — Render เฉพาะตอน Active + Desktop เท่านั้น
 * (Parent คือ <a> Slot ที่มี position:relative) — ดู Comment ยาวบนสุดของไฟล์ */
function ActiveFillet({ edge }: { edge: "top" | "bottom" }) {
  const gradientAt = edge === "top" ? "bottom right" : "top right";
  return (
    <span
      aria-hidden
      className={`hidden md:block absolute right-0 ${edge === "top" ? "bottom-full" : "top-full"} w-6 h-6 pointer-events-none`}
      style={{
        background: `radial-gradient(circle at ${gradientAt}, ${CREAM_HEX} ${FILLET_RADIUS}px, transparent ${FILLET_RADIUS}px)`,
      }}
    />
  );
}

const LINK_CLASS =
  "flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-xl text-sm transition-colors duration-200";
// R5 — ตัว <a> ของรายการ Active คือ "Cream Slot" (Desktop) / Wrapper โปร่งใส (Mobile)
const ACTIVE_SLOT_CLASS =
  "relative block md:bg-cp-cream md:rounded-l-2xl md:rounded-r-none md:mr-[-8px] md:my-1 md:py-[5px] md:pl-[5px] md:pr-2";
// R5 — Blue Pill ชั้นในครอบ Icon+Label (Mobile = เต็มแถวเหมือน R3 เพราะ Slot ไม่มี Padding)
const ACTIVE_PILL_CLASS =
  "relative z-10 flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-xl text-sm w-full " +
  "bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium shadow-lg shadow-blue-950/40 md:shadow-md md:shadow-blue-950/30";
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
  if (active) {
    // R5 — โครง 2 ชั้น: <a> = Cream Slot (โอบทั้งก้อน), <span> ข้างใน = Blue Pill
    // (ดู Comment ยาวบนสุดของไฟล์)
    return (
      <a href={node.href} className={ACTIVE_SLOT_CLASS}>
        <ActiveFillet edge="top" />
        <ActiveFillet edge="bottom" />
        <span className={ACTIVE_PILL_CLASS}>
          <IconSlot name={node.icon} active depth={depth} />
          {node.label}
        </span>
      </a>
    );
  }
  return (
    <a href={node.href} className={`${LINK_CLASS} ${INACTIVE_CLASS}`}>
      <IconSlot name={node.icon} active={false} depth={depth} />
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
