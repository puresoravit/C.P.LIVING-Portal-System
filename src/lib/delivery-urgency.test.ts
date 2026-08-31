import { describe, expect, it } from "vitest";
import { deliveryUrgency } from "./delivery-urgency";

const NOW = new Date(2026, 7, 30); // 30 ส.ค. 2026

describe("deliveryUrgency", () => {
  it("UNSET when no requestedDate", () => {
    expect(deliveryUrgency(null, "UNSET", NOW).level).toBe("UNSET");
  });

  it("UNSET when dateMode is UNSET even with a date present", () => {
    expect(deliveryUrgency(new Date(2026, 7, 30), "UNSET", NOW).level).toBe("UNSET");
  });

  it("OVERDUE for a past date, with days-overdue count", () => {
    const r = deliveryUrgency(new Date(2026, 7, 28), "EXACT", NOW);
    expect(r.level).toBe("OVERDUE");
    expect(r.label).toContain("2 วัน");
  });

  it("TODAY for the exact current date", () => {
    expect(deliveryUrgency(new Date(2026, 7, 30), "EXACT", NOW).level).toBe("TODAY");
  });

  it("TOMORROW for the next day", () => {
    expect(deliveryUrgency(new Date(2026, 7, 31), "EXACT", NOW).level).toBe("TOMORROW");
  });

  it("SOON for 2-6 days out", () => {
    expect(deliveryUrgency(new Date(2026, 8, 2), "EXACT", NOW).level).toBe("SOON");
    expect(deliveryUrgency(new Date(2026, 8, 5), "EXACT", NOW).level).toBe("SOON");
  });

  it("LATER for 7+ days out", () => {
    expect(deliveryUrgency(new Date(2026, 8, 10), "EXACT", NOW).level).toBe("LATER");
  });

  it("prefixes ESTIMATE mode labels with ประมาณ", () => {
    const r = deliveryUrgency(new Date(2026, 7, 30), "ESTIMATE", NOW);
    expect(r.label).toContain("ประมาณ");
  });

  it("ignores time-of-day when comparing dates (whole-day granularity)", () => {
    const laterToday = new Date(2026, 7, 30, 23, 59);
    expect(deliveryUrgency(laterToday, "EXACT", NOW).level).toBe("TODAY");
  });
});
