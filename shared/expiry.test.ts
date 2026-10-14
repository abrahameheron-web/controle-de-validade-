import { describe, expect, it } from "vitest";
import { entersThreeMonthRangeSoon, getExpiryThresholds, getProductStatus, parseCalendarDate } from "./expiry";

const day = (year: number, monthIndex: number, date: number) => new Date(year, monthIndex, date);

describe("product expiry calendar rules", () => {
  it("uses calendar months for the three, two and one-month thresholds", () => {
    const thresholds = getExpiryThresholds("2026-12-20");
    expect(thresholds.threeMonths).toEqual(day(2026, 8, 20));
    expect(thresholds.twoMonths).toEqual(day(2026, 9, 20));
    expect(thresholds.oneMonth).toEqual(day(2026, 10, 20));
  });

  it("clamps a month subtraction to the final day of the target month", () => {
    expect(getExpiryThresholds("2026-05-31").threeMonths).toEqual(day(2026, 1, 28));
  });

  it("moves the product through every category on the threshold day", () => {
    const expiry = "2026-12-20";
    expect(getProductStatus(expiry, day(2026, 8, 19))).toBe("normal");
    expect(getProductStatus(expiry, day(2026, 8, 20))).toBe("threeMonths");
    expect(getProductStatus(expiry, day(2026, 9, 20))).toBe("twoMonths");
    expect(getProductStatus(expiry, day(2026, 10, 20))).toBe("oneMonth");
    expect(getProductStatus(expiry, day(2026, 10, 21))).toBe("oneMonth");
    expect(getProductStatus(expiry, day(2026, 11, 21))).toBe("expired");
  });

  it("warns from seven days before the three-month range through its start day", () => {
    expect(entersThreeMonthRangeSoon("2026-12-20", day(2026, 8, 13))).toBe(true);
    expect(entersThreeMonthRangeSoon("2026-12-20", day(2026, 8, 20))).toBe(true);
    expect(entersThreeMonthRangeSoon("2026-12-20", day(2026, 8, 12))).toBe(false);
    expect(entersThreeMonthRangeSoon("2026-12-20", day(2026, 8, 21))).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    expect(Number.isNaN(parseCalendarDate("2026-02-30").getTime())).toBe(true);
  });
});
