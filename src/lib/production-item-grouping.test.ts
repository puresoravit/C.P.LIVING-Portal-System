import { describe, expect, it } from "vitest";
import { groupItemsBySpecHash } from "./production-item-grouping";

describe("groupItemsBySpecHash", () => {
  it("groups items sharing the same specHash into one block (e.g. same family/gusset/thickness/fabric/layers, different size)", () => {
    const items = [
      { id: "a", specHash: "hash-1", size: "3.5", qty: 2 },
      { id: "b", specHash: "hash-1", size: "6", qty: 1 },
    ];
    const groups = groupItemsBySpecHash(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[0].totalQty).toBe(3);
    expect(groups[0].representative.id).toBe("a");
  });

  it("keeps genuinely different specs in separate groups", () => {
    const items = [
      { id: "a", specHash: "hash-1", size: "3.5", qty: 2 },
      { id: "b", specHash: "hash-2", size: "3.5", qty: 1 },
    ];
    const groups = groupItemsBySpecHash(items);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.totalQty)).toEqual([2, 1]);
  });

  it("handles a mix: some items share a spec, one is unique", () => {
    const items = [
      { id: "a", specHash: "hash-1", qty: 1 },
      { id: "b", specHash: "hash-2", qty: 5 },
      { id: "c", specHash: "hash-1", qty: 3 },
    ];
    const groups = groupItemsBySpecHash(items);
    expect(groups).toHaveLength(2);
    const group1 = groups.find((g) => g.specHash === "hash-1")!;
    expect(group1.items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(group1.totalQty).toBe(4);
    const group2 = groups.find((g) => g.specHash === "hash-2")!;
    expect(group2.totalQty).toBe(5);
  });

  it("returns groups ordered by first appearance in the input (deterministic display order)", () => {
    const items = [
      { id: "a", specHash: "hash-B", qty: 1 },
      { id: "b", specHash: "hash-A", qty: 1 },
      { id: "c", specHash: "hash-B", qty: 1 },
    ];
    const groups = groupItemsBySpecHash(items);
    expect(groups.map((g) => g.specHash)).toEqual(["hash-B", "hash-A"]);
  });

  it("empty input gives empty output", () => {
    expect(groupItemsBySpecHash([])).toEqual([]);
  });
});
