import { describe, it, expect } from "vitest";
import { resolveActiveHref, collectHrefs, collectActiveAliases, groupContainsActiveHref } from "./nav-active";
import type { NavNode } from "./nav-tree";

describe("resolveActiveHref", () => {
  const hrefs = ["/orders", "/orders/new", "/invoices", "/"];

  it("จับคู่ href ที่ตรงเป๊ะ", () => {
    expect(resolveActiveHref("/invoices", hrefs)).toBe("/invoices");
  });

  it("เลือก href ที่ยาวที่สุด (เจาะจงที่สุด) เมื่อ Route ชนกันแบบ prefix (แก้ Bug ที่พบจริง: /orders/new ต้องไม่ทำให้ /orders ถูกไฮไลต์ด้วย)", () => {
    expect(resolveActiveHref("/orders/new", hrefs)).toBe("/orders/new");
  });

  it("Order detail page (/orders/xyz) match กับ /orders ผ่าน prefix เพราะไม่มี href เจาะจงกว่า", () => {
    expect(resolveActiveHref("/orders/cmt123abc", hrefs)).toBe("/orders");
  });

  it("Dashboard ต้อง match เป๊ะเท่านั้น ไม่ prefix-match ถล่มทุกหน้า", () => {
    expect(resolveActiveHref("/", hrefs)).toBe("/");
    expect(resolveActiveHref("/orders", hrefs)).toBe("/orders");
  });

  it("ไม่มี href ไหน match เลยคืนค่า null", () => {
    expect(resolveActiveHref("/settings/vat", hrefs)).toBeNull();
  });

  it("activeMatch alias ชนะ Prefix-match ปกติ (Route ที่มี dynamic id คั่นกลางแต่ควรนับเป็นเมนูอื่น)", () => {
    const aliases = [{ pattern: /^\/production\/loading\/[^/]+\/finalize(\/|$)/, href: "/production/loading/results" }];
    const productionHrefs = ["/production/loading", "/production/loading/results"];
    expect(resolveActiveHref("/production/loading/abc123/finalize", productionHrefs, aliases)).toBe("/production/loading/results");
    // Route อื่นใต้ /production/loading/[id]/ ที่ไม่ตรง Pattern ยังคง Prefix-match ปกติ
    expect(resolveActiveHref("/production/loading/abc123", productionHrefs, aliases)).toBe("/production/loading");
  });
});

describe("collectActiveAliases", () => {
  it("รวบรวม activeMatch จากทุกระดับ (รวม Group ซ้อน) ข้ามเมนูที่ไม่มี Field นี้", () => {
    const tree: NavNode[] = [
      { type: "link", href: "/a", label: "A", perm: null },
      { type: "link", href: "/b", label: "B", perm: null, activeMatch: /^\/b-alias/ },
      { type: "group", label: "G", items: [{ type: "link", href: "/c", label: "C", perm: null, activeMatch: /^\/c-alias/ }] },
    ];
    expect(collectActiveAliases(tree)).toEqual([
      { pattern: /^\/b-alias/, href: "/b" },
      { pattern: /^\/c-alias/, href: "/c" },
    ]);
  });
});

describe("collectHrefs", () => {
  it("รวบรวม href จากทุกระดับ (รวม Group ซ้อน Group) ยกเว้น # (disabled placeholder)", () => {
    const tree: NavNode[] = [
      { type: "link", href: "/a", label: "A", perm: null },
      {
        type: "group",
        label: "G1",
        items: [
          { type: "link", href: "/b", label: "B", perm: null },
          { type: "group", label: "G2", items: [{ type: "link", href: "/c", label: "C", perm: null }] },
          { type: "link", href: "#", label: "Disabled", perm: null, disabled: true },
        ],
      },
      { type: "signout", label: "Sign out" },
    ];
    expect(collectHrefs(tree)).toEqual(["/a", "/b", "/c"]);
  });
});

describe("groupContainsActiveHref", () => {
  const items: NavNode[] = [
    { type: "link", href: "/a", label: "A", perm: null },
    { type: "group", label: "G", items: [{ type: "link", href: "/b", label: "B", perm: null }] },
  ];

  it("true ถ้า activeHref ตรงกับ item ระดับบนสุด", () => {
    expect(groupContainsActiveHref(items, "/a")).toBe(true);
  });

  it("true ถ้า activeHref ตรงกับ item ใน Group ที่ซ้อนอยู่ข้างใน", () => {
    expect(groupContainsActiveHref(items, "/b")).toBe(true);
  });

  it("false ถ้าไม่มี item ไหนตรงเลย หรือ activeHref เป็น null", () => {
    expect(groupContainsActiveHref(items, "/z")).toBe(false);
    expect(groupContainsActiveHref(items, null)).toBe(false);
  });
});
