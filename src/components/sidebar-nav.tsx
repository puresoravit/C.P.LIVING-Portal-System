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
// Content แล้วมีติ่งครีมเล็กๆ" — R5 เคยลองโครง 2 ชั้น (Cream Slot + Blue Pill ข้างใน) แต่
// Owner ตัดสินขั้นสุดท้าย (R6): **เอา Blue Pill ออกทั้งหมด** เหลือชั้นเดียว —
//
//   Active Tab = แถบครีมล้วน (สีเดียวกับพื้น Content เป๊ะ) ครอบ Icon+Label — Desktop:
//   ขอบซ้ายมน (rounded-l-2xl) ขอบขวาตัดตรง Bleed ชนขอบ Content พอดี (md:mr-[-8px]
//   ชดเชย px-2 ของ <nav>) หลอมเป็นเนื้อเดียวกับ Content ไม่มีเส้นแบ่ง — ขอบขวาของ Tab
//   และ Fillet ทั้งคู่อยู่บนแกนตั้งเดียวกันทั้งเส้น (แนวตรงระดับเดียว ไม่เชิด/ไม่ห้อย)
//
//   Fillet โค้งเว้า 2 ชิ้น (radial-gradient hard-edge — ดู ActiveFillet): มุมขวาบน/ล่าง
//   ของ Tab ให้ขอบครีมกวาดโค้งกลับเข้าแนว Content นุ่มนวล — นอกโค้งเป็น Transparent ให้
//   Navy Gradient จริงของ Sidebar ทะลุออกมา (ไม่ Hardcode Navy กันสีเพี้ยนจากไล่เฉด)
//
//   สี Active บนครีม: Label = Navy เข้ม, Icon Chip = ฟ้า Brand ทึบ (Accent จุดเดียว
//   ไม่ใช่ Frame/พื้นซ้อน) — Label ห่อ truncate บังคับ 1 บรรทัดเสมอ
//
//   Mobile (< md): Tab ครีมมนปกติ 2 ข้าง ไม่ Bleed ไม่มี Fillet (เรียบง่าย ปลอดภัยจาก
//   Overflow — Owner อนุญาตชัดเจนให้ Mobile ต่างจาก Desktop ได้)
// Owner UAT R6.1 — Geometry Fix ตาม Screenshot ที่ Owner มาร์คลูกศรแดง: ของเดิม (R4-R6)
// วางจุดศูนย์กลางวงครีมไว้ที่ "มุมรอยต่อ" เอง → เส้นโค้งวิ่งชน "ตั้งฉาก" กับทั้งขอบบน
// ของ Tab และแนวตั้งของ Content (คณิตศาสตร์: Tangent ของวง ณ จุดตัดตั้งฉากกับรัศมีเสมอ)
// ทำให้เกิด "บ่า/Step" ที่จุดชนทั้งสองข้าง และ Silhouette ป่องออกเป็น Bubble มีคอแบบที่
// Owner ชี้พอดี — แก้เป็นเรขาคณิต Tab-flare ที่ถูกต้อง (แบบแท็บ Browser/macOS จริง):
// **จุดศูนย์กลางวงอยู่มุมตรงข้ามรอยต่อ + Transparent อยู่ในวง / ครีมอยู่นอกวง** —
// เส้นโค้งจึง "สัมผัส" (Tangent) ขอบบนของ Tab ที่ปลายหนึ่ง แล้วกวาดไปสัมผัสแนวตั้งของ
// Content ที่อีกปลายพอดีเป๊ะ: ไม่มีบ่า ไม่มี Step ปลายโค้งบน/ล่างจบบนแนวตั้งเดียวกัน
// (แนวขอบ Content) แล้วไหลต่อเป็นเส้นตรงเดียว — ครีม "กินเข้าไป" ในซอกมุมระหว่าง Tab
// กับขอบ Content ตามทิศลูกศรที่ Owner ชี้ — Bonus: พื้นที่ครีมของ Fillet แบบใหม่แนบชิด
// ขอบเท่านั้น (ส่วนใหญ่ของกล่องเป็น Transparent) จึงไม่มีทางทับ Chevron แถวข้างอีกเลย
const FILLET_RADIUS = 28; // px — รัศมีโค้ง Tangent (ขยายจาก 24 ให้กวาดยาวตามลูกศร)
const CREAM_HEX = "#F7F5F0"; // = cp-cream (Arbitrary radial-gradient รับแค่ Literal Value ไม่อ้าง Tailwind Token ได้ตรงๆ)

// R7.1 — Owner UAT: พบเส้น/พื้นสีน้ำเงินกระพริบที่รอยต่อระหว่าง Indicator กำลังไหล — Root
// Cause คือ Fillet ทั้งคู่วางแบบ position:absolute + bottom-full/top-full ซึ่งดันตัวเองออก
// นอกกรอบ (Border Box) ของ <a> พ่อแม่ทั้งหมด (Absolute Positioning ไม่มีทางขยาย Box ของ
// พ่อแม่ได้) — View Transition Snapshot ของ Chrome Capture ตาม Border Box ของ Element ที่
// ติด view-transition-name เท่านั้น ส่วนที่ "ล้น" ออกนอกกรอบจะถูกตัดหายไปจาก Snapshot ที่
// กำลังเคลื่อนที่ (บันทึกไว้ใน Chrome DevRel Docs) → ระหว่าง Slide เฟรมกลางจึงไม่มี Fillet
// ติดไปด้วย เห็นเป็นกล่องเหลี่ยมไม่มีโค้ง แล้ว "โผล่กลับมา" ทันทีตอนจบ Transition = ที่มา
// ของอาการกระพริบที่รอยต่อ — **แก้โดยให้ Fillet แต่ละชิ้นมี view-transition-name เป็นของ
// ตัวเอง** (คนละชื่อกับ cp-nav-active): กรอบของ Fillet เอง = 28×28px เท่ากับพื้นที่ Paint
// จริงพอดี ไม่มีอะไรล้นออกนอกกรอบตัวเองเลย จึงถูก Capture ครบทุกเฟรม เคลื่อนที่ไปพร้อมกับ
// Body หลักด้วย animation-duration/easing ชุดเดียวกัน (ดู globals.css) อ่านเป็นก้อนเดียว
// — Stop มี Ramp 2px (R-2 → R, ขยายจาก 1px) ให้ขอบโค้ง Antialias ทนต่อการ Scale ระหว่าง
// Transition Interpolate ขนาดได้มากขึ้นโดยไม่เห็นรอยหยัก
function ActiveFillet({ edge }: { edge: "top" | "bottom" }) {
  // จุดศูนย์กลาง = มุมตรงข้ามรอยต่อ: Fillet บน → รอยต่ออยู่มุมขวาล่าง → ศูนย์กลาง top left
  const gradientAt = edge === "top" ? "top left" : "bottom left";
  const vtNameClass = edge === "top" ? "[view-transition-name:cp-nav-fillet-top]" : "[view-transition-name:cp-nav-fillet-bottom]";
  return (
    <span
      aria-hidden
      className={`hidden md:block absolute right-0 ${edge === "top" ? "bottom-full" : "top-full"} w-7 h-7 pointer-events-none ${vtNameClass}`}
      style={{
        background: `radial-gradient(circle at ${gradientAt}, transparent ${FILLET_RADIUS - 2}px, ${CREAM_HEX} ${FILLET_RADIUS}px)`,
      }}
    />
  );
}

// R6.1 — Hover ของเมนูที่ยังไม่เลือกใช้ Transition เบา/เร็วกว่า Active (150ms) ไม่แย่ง
// Hierarchy จาก Active Tab (ตาม Requirement ข้อ 3)
const LINK_CLASS =
  "flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-xl text-sm transition-colors duration-150";
// Owner UAT R6 (2026-08-24) — Owner สั่งชัด: "เอากรอบ/พื้นสีน้ำเงินที่ครอบ Active Item
// ออก" (ไม่เอา Blue Pill ซ้อนในช่องครีมแบบ R5 — Layered Look ทำให้ Fillet ดูเป็นติ่งขาว
// เกยแปลกๆ และดัน Text แตก 2 บรรทัด) → Active เหลือ **ชั้นเดียว: แถบครีมล้วน** สีเดียว
// กับ Content เป๊ะ (ตรง Reference ที่ Active Tab เป็นสีเดียวกับพื้น Content) — ตัวอักษร/
// Icon พลิกเป็น Navy เข้มบนครีม (อ่านชัด) + Icon Chip เป็นสีฟ้า Brand ทึบ (Blue Accent
// เดียวที่เหลือ — เป็น Chip เล็ก ไม่ใช่ Frame/พื้นซ้อน) — Desktop: ขอบซ้ายมน ขอบขวาตัด
// ตรง Bleed ชนขอบ Content (md:mr-[-8px]) → ขอบขวาของ Tab + Fillet บน/ล่าง อยู่บนแกน
// ตั้งเดียวกันทั้งเส้น (ไม่เชิด/ไม่ห้อย — เป็นแนวตรงระดับเดียวกับขอบ Content ตาม
// Acceptance) — Mobile: Pill ครีมมนปกติ 2 ข้าง ไม่ Bleed ไม่มี Fillet (เรียบง่ายตามที่
// Owner กำหนด) — py-2 สูงกว่า Inactive เล็กน้อยให้ Tab มี Presence โดยไม่ต้องพึ่งสีสด
// R7 — Luxury Sliding Indicator: `[view-transition-name:cp-nav-active]` ผูก Active Tab
// เข้ากับ Cross-document View Transition (globals.css `@view-transition`) — Browser จับคู่
// Element ชื่อนี้ระหว่างหน้าเก่า/ใหม่แล้ว Morph ตำแหน่ง+ขนาดให้เอง (Snapshot รวม Fillet
// ที่เป็นลูกด้วย → Cutout ทั้ง Shape เลื่อนเป็นชิ้นเดียว): Cream Indicator "ไหล" จากเมนู
// เดิมไปเมนูใหม่ต่อเนื่องจริง ทั้งคลิกและ Back/Forward โดย**ไม่แตะกลไก Navigation ใดๆ**
// (ยังเป็น <a> Full Page Load เดิม — Middleware/App-Access Check ทำงานทุก Request ตามเดิม
// เป๊ะ ไม่มี Click Delay เพราะ Transition เล่นหลังหน้าใหม่ Render แล้ว) — ตำแหน่ง/ความสูง
// อิง Element จริงเสมอ (Browser Interpolate Rect จริง รองรับ Main/Submenu สูงต่างกันโดย
// ธรรมชาติ ไม่มี Hardcode ต่อเมนู) — Browser ที่ไม่รองรับ (เช่น Firefox) = สลับทันทีแบบ
// เดิม (Progressive Enhancement) — Micro-interaction: `cp-nav-rise-in` บน Icon+Label
// ข้างใน (ยก 2px, Delay 90ms ให้ "ตามหลัง Indicator" ตามที่ Owner ระบุ) — ทั้งคู่ปิดเมื่อ
// prefers-reduced-motion (ดู globals.css)
const ACTIVE_CLASS =
  "relative flex items-center pl-3 pr-3 py-2 rounded-xl text-sm bg-cp-cream text-cp-navy font-medium " +
  "[view-transition-name:cp-nav-active] md:rounded-l-2xl md:rounded-r-none md:mr-[-8px] md:my-1";
const INACTIVE_CLASS = "text-white/75 hover:bg-white/10 hover:text-white";
const DISABLED_CLASS =
  "flex items-center justify-between px-3 py-1.5 rounded-lg text-sm text-white/30 cursor-not-allowed select-none";

function IconSlot({ name, active, depth }: { name: NavIconKey | undefined; active: boolean; depth: number }) {
  if (!name) return null;
  if (depth === 0) {
    // Main Menu — Chip Container (ข้อ 2 R2 ยังใช้ต่อ) — Inactive = กระจกฝ้าขาวจางบนพื้น
    // Navy — Active (R6): Tab เป็นครีมแล้ว Chip เปลี่ยนเป็นสีฟ้า Brand ทึบ ตัว Icon ขาว
    // (Blue Accent จุดเดียวบน Tab ครีม — ไม่ใช่ Frame/พื้นซ้อน)
    return (
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors duration-200 ${
          active ? "bg-blue-600 text-white" : "bg-white/10 text-white/70"
        }`}
      >
        <NavIcon name={name} className="w-[18px] h-[18px]" />
      </span>
    );
  }
  // Submenu — Icon เปล่า เล็กกว่า ไม่มี Container (แยก Hierarchy จาก Main Menu ชัดเจน)
  // Active (R6): Navy เข้มบนพื้น Tab ครีม
  return <NavIcon name={name} className={`w-[15px] h-[15px] shrink-0 ${active ? "text-cp-navy" : "text-white/50"}`} />;
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
      <summary className="flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-medium text-white/85 cursor-pointer list-none hover:bg-white/10 hover:text-white transition-colors duration-150 [&::-webkit-details-marker]:hidden">
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
    // R6 — ชั้นเดียว: <a> = Tab ครีมล้วน (สีเดียวกับ Content) + Fillet โค้งบน/ล่าง —
    // Label ห่อ truncate (min-w-0 ให้ Flex Item หดได้จริง) บังคับ 1 บรรทัดเสมอตาม
    // Acceptance (ไม่มีทางแตก 2 บรรทัดไม่ว่าข้อความยาวแค่ไหน)
    return (
      <a href={node.href} className={ACTIVE_CLASS}>
        <ActiveFillet edge="top" />
        <ActiveFillet edge="bottom" />
        {/* Wrapper แยกสำหรับ rise-in — Transform อยู่ที่เนื้อในเท่านั้น ตัว Tab/Fillet
            ไม่ขยับ (เรขาคณิตรอยต่อคงที่ 100%) */}
        <span className="flex items-center gap-2.5 min-w-0 cp-nav-rise-in">
          <IconSlot name={node.icon} active depth={depth} />
          <span className="min-w-0 truncate">{node.label}</span>
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
    // R7 — Root Cause ที่ Owner เห็น "โค้งบนของ Dashboard หัก/ชน Header": <nav> เป็น
    // overflow-y-auto (Scroll Container จะ Clip ทุกอย่างที่ยื่นพ้นขอบ Padding Box) —
    // Fillet บนของรายการแรกสูง 28px แต่ py-3 ให้พื้นที่เหนือรายการแรกแค่ 12px → โค้งโดน
    // ตัดขาดเป็นรอยหักเฉพาะเมนูแรก (เมนูกลางลิสต์มีแถวอื่นอยู่เหนือจึงไม่โดน) — แก้เป็น
    // py-8 (32px ≥ 28px + เผื่อ) ทั้งบน/ล่าง: Dashboard (แรกสุด) และเมนูท้ายลิสต์ได้
    // Geometry ครบเหมือนเมนูกลางทุกประการ + ได้ระยะหายใจจาก Header ตามที่ Owner ขอ
    <nav className="flex-1 px-2 py-8 space-y-0.5 overflow-y-auto">
      {tree.map((node, i) => (
        <NavNodeView key={`${node.type}-${i}`} node={node} activeHref={activeHref} depth={0} />
      ))}
    </nav>
  );
}
