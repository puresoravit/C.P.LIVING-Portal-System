import { describe, it, expect } from "vitest";
import { filterNav, type NavNode } from "./nav-tree";

describe("filterNav", () => {
  const tree: NavNode[] = [
    { type: "link", href: "/a", label: "A", perm: "order.create" },
    { type: "link", href: "/b", label: "B", perm: null },
    {
      type: "group",
      label: "Group1",
      items: [
        { type: "link", href: "/c", label: "C", perm: "invoice.create" },
        { type: "link", href: "/d", label: "D", perm: "taxInvoice.create" },
      ],
    },
    { type: "signout", label: "Sign out" },
  ];

  it("แสดง link ที่ไม่มี perm (null) เสมอ", () => {
    const result = filterNav(tree, () => false);
    expect(result.some((n) => n.type === "link" && n.href === "/b")).toBe(true);
  });

  it("ซ่อน link ที่ Role ไม่มี Permission", () => {
    const result = filterNav(tree, () => false);
    expect(result.some((n) => n.type === "link" && n.href === "/a")).toBe(false);
  });

  it("แสดง signout เสมอไม่ว่า Permission จะเป็นอย่างไร", () => {
    const result = filterNav(tree, () => false);
    expect(result.some((n) => n.type === "signout")).toBe(true);
  });

  it("ซ่อนทั้ง Group ถ้าไม่มี item ไหนผ่าน Permission เลย", () => {
    const result = filterNav(tree, () => false);
    expect(result.some((n) => n.type === "group")).toBe(false);
  });

  it("แสดง Group แต่กรองเหลือเฉพาะ item ที่ผ่าน Permission ภายใน", () => {
    const result = filterNav(tree, (perm) => perm === "invoice.create");
    const group = result.find((n) => n.type === "group") as Extract<NavNode, { type: "group" }>;
    expect(group).toBeDefined();
    expect(group.items).toHaveLength(1);
    expect(group.items[0]).toMatchObject({ href: "/c" });
  });

  it("แสดงทุกอย่างถ้า Role มีทุก Permission", () => {
    const result = filterNav(tree, () => true);
    expect(result).toHaveLength(4);
  });
});
