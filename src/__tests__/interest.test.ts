import { describe, it, expect } from "vitest";
import {
  computeDailyInterest,
  computeMonthlyInterest,
  computeAccruedInterest,
} from "../lib/services/interest";
import Decimal from "decimal.js";

describe("Actual/365 On-Read Interest Computation (§6.3)", () => {
  it("computes monthly interest as principal * (rate / 100)", () => {
    const principal = new Decimal("100000"); // 1 Lakh
    const rateMonthly = new Decimal("1.5"); // 1.5% per month

    const monthly = computeMonthlyInterest(principal, rateMonthly);
    expect(monthly.toString()).toBe("1500");
  });

  it("computes exact daily interest using Actual/365 formula: Principal * (Rate * 12) / 365 / 100", () => {
    const principal = new Decimal("100000");
    const rateMonthly = new Decimal("1.5"); // 18% p.a.

    // 100000 * 18 / 365 / 100 = 49.31506849315068...
    const daily = computeDailyInterest(principal, rateMonthly);
    expect(daily.toFixed(4)).toBe("49.3151");
  });

  it("computes accrued interest over exactly 365 days as exactly 1 year's simple interest", () => {
    const loan = {
      principalOutstanding: new Decimal("100000"),
      interestRateMonthly: new Decimal("1.5"), // 18% p.a. -> 18,000 for 365 days
      lastSettledDate: new Date("2026-01-01T00:00:00Z"),
    };
    const asOfDate = new Date("2027-01-01T00:00:00Z"); // exactly 365 days later

    const accrued = computeAccruedInterest(loan, asOfDate);
    expect(accrued.toString()).toBe("18000");
  });

  it("returns 0 accrued interest if asOfDate is same or earlier than lastSettledDate", () => {
    const loan = {
      principalOutstanding: new Decimal("50000"),
      interestRateMonthly: new Decimal("2.0"),
      lastSettledDate: new Date("2026-05-15T00:00:00Z"),
    };
    const asOfDate = new Date("2026-05-10T00:00:00Z");

    const accrued = computeAccruedInterest(loan, asOfDate);
    expect(accrued.toString()).toBe("0");
  });
});
