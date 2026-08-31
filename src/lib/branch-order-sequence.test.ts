import { describe, expect, it, vi } from "vitest";
import { getNextBranchOrderSeq } from "./branch-order-sequence";

describe("getNextBranchOrderSeq", () => {
  it("upserts with create lastSeq=1 and update increment, scoped by branchId", async () => {
    const upsert = vi.fn().mockResolvedValue({ branchId: "b1", lastSeq: 3 });
    const fakeClient = { branchOrderSequence: { upsert } } as any;

    const seq = await getNextBranchOrderSeq("b1", fakeClient);

    expect(seq).toBe(3);
    expect(upsert).toHaveBeenCalledWith({
      where: { branchId: "b1" },
      create: { branchId: "b1", lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
    });
  });
});
