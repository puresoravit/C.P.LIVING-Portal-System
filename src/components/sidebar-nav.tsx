"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import type { NavNode } from "@/lib/nav-tree";
import { collectHrefs, resolveActiveHref, groupContainsActiveHref } from "@/lib/nav-active";

// Phase Nav-1 — Sidebar ใหม่แบบ Group/Submenu รับ Tree ที่กรอง Permission มาจาก
// Server Component แล้ว (layout.tsx) — ตัว Component นี้รับผิดชอบแค่ Active State
// (ผ่าน usePathname, Logic จริงอยู่ใน src/lib/nav-active.ts เพื่อ unit test ได้)
// กับ Expand/Collapse (<details> ล้วนๆ ไม่ต้องมี JS Toggle เอง)
const LINK_CLASS = "block px-3 py-1.5 rounded text-sm";
const ACTIVE_CLASS = "bg-blue-50 text-blue-700 font-medium";
const INACTIVE_CLASS = "text-gray-700 hover:bg-gray-100";
const DISABLED_CLASS = "flex items-center justify-between px-3 py-1.5 rounded text-sm text-gray-400 cursor-not-allowed select-none";

function NavGroupView({ group, activeHref }: { group: Extract<NavNode, { type: "group" }>; activeHref: string | null }) {
  const [open, setOpen] = useState(() => groupContainsActiveHref(group.items, activeHref));
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="group">
      <summary className="flex items-center justify-between px-3 py-1.5 rounded text-sm font-medium text-gray-600 cursor-pointer list-none hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
        {group.label}
        <span className="text-gray-400 transition-transform duration-150 group-open:rotate-90 shrink-0 ml-2">
          &rsaquo;
        </span>
      </summary>
      <div className="pl-3 space-y-0.5 mt-0.5 border-l ml-3">
        {group.items.map((child, i) => (
          <NavNodeView key={`${child.type}-${i}`} node={child} activeHref={activeHref} />
        ))}
      </div>
    </details>
  );
}

function NavNodeView({ node, activeHref }: { node: NavNode; activeHref: string | null }) {
  if (node.type === "signout") {
    return <SignOutButton className={`${LINK_CLASS} ${INACTIVE_CLASS} text-left w-full`} label={node.label} />;
  }

  if (node.type === "group") {
    return <NavGroupView group={node} activeHref={activeHref} />;
  }

  if (node.disabled) {
    return (
      <span className={DISABLED_CLASS}>
        {node.label}
        <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5 ml-2 shrink-0">เร็วๆ นี้</span>
      </span>
    );
  }
  const active = node.href === activeHref;
  return (
    <a href={node.href} className={`${LINK_CLASS} ${active ? ACTIVE_CLASS : INACTIVE_CLASS}`}>
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
        <NavNodeView key={`${node.type}-${i}`} node={node} activeHref={activeHref} />
      ))}
    </nav>
  );
}
