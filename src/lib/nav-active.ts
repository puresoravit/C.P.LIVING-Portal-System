import type { NavNode } from "@/lib/nav-tree";

// Phase Nav-1 — แยก Logic การหา "เมนูไหนคือ Active ตอนนี้" ออกมาเป็น pure function
// เพื่อ unit test ได้ตรงๆ (ไม่ต้อง render Component) — ต้อง Resolve จาก Tree ทั้งก้อน
// พร้อมกัน ไม่ใช่ prefix-match แยกอิสระทีละ item เพราะ Route จริงชนกัน เช่น /orders
// (เอกสาร/Document) กับ /orders/new (สร้างเอกสาร → ใบส่งของชั่วคราว) — ถ้า prefix-match
// แยกอิสระทีละ item, /orders/new จะ match เป็น Active ทั้ง 2 เมนูพร้อมกันผิดๆ (พบจาก
// การทดสอบจริงตอน Nav-1) ต้องหา href ที่ตรงที่สุด (ยาวที่สุด) เพียงหนึ่งเดียวก่อน
export function collectHrefs(nodes: NavNode[]): string[] {
  const hrefs: string[] = [];
  for (const node of nodes) {
    if (node.type === "link" && node.href !== "#") hrefs.push(node.href);
    else if (node.type === "group") hrefs.push(...collectHrefs(node.items));
  }
  return hrefs;
}

export function matchesHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function resolveActiveHref(pathname: string, allHrefs: string[]): string | null {
  const matches = allHrefs.filter((href) => matchesHref(pathname, href));
  if (matches.length === 0) return null;
  return matches.reduce((longest, h) => (h.length > longest.length ? h : longest));
}

export function groupContainsActiveHref(items: NavNode[], activeHref: string | null): boolean {
  if (!activeHref) return false;
  return items.some((item) => {
    if (item.type === "link") return item.href === activeHref;
    if (item.type === "group") return groupContainsActiveHref(item.items, activeHref);
    return false;
  });
}
