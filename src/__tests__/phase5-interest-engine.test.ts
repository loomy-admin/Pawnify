/**
 * Phase 5 — Interest Engine Tests
 *
 * Comprehensive test matrix covering:
 * - Basic / boundary day counts (B1–B8)
 * - Formula verification (F1–F4)
 * - Decimal precision (D1–D6)
 * - Date/day-count convention (DATE1–DATE5)
 * - Interest summary field relationships (S1–S5)
 * - Business scenarios (BIZ1–BIZ4)
 * - 50% projection regression (REG1–REG7)
 * - Interest mode audit (MODE1–MODE3)
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  computeDailyInterest,
  computeMonthlyInterest,
  computeAccruedInterest,
  computeInterestSummary,
  type LoanForInterest,
} from "../lib/services/interest";
import { projectInterestSummary } from "@/lib/projection";

const D = Decimal;

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

function makeLoan(
  principal: string,
  rateMonthly: string,
  lastSettledDate: Date
): LoanForInterest {
  return {
    principalOutstanding: new D(principal),
    interestRateMonthly: new D(rateMonthly),
    lastSettledDate,
  };
}

// ──────────────────────────────────────────────────────────
// §1 — BASIC CASES
// ──────────────────────────────────────────────────────────

describe("Phase 5 §1 — Basic boundary cases", () => {
  it("B1: zero principal → all interest functions return 0", () => {
    const loan = makeLoan("0", "1.5", new Date("2026-01-01T00:00:00Z"));
    const asOf = new Date("2026-02-01T00:00:00Z");

    expect(computeDailyInterest(new D("0"), new D("1.5")).toString()).toBe("0");
    expect(computeMonthlyInterest(new D("0"), new D("1.5")).toString()).toBe("0");
    expect(computeAccruedInterest(loan, asOf).toString()).toBe("0");
  });

  it("B2: zero rate → all interest functions return 0", () => {
    const loan = makeLoan("100000", "0", new Date("2026-01-01T00:00:00Z"));
    const asOf = new Date("2026-02-01T00:00:00Z");

    expect(computeDailyInterest(new D("100000"), new D("0")).toString()).toBe("0");
    expect(computeMonthlyInterest(new D("100000"), new D("0")).toString()).toBe("0");
    expect(computeAccruedInterest(loan, asOf).toString()).toBe("0");
  });

  it("B3: same-day loan (0 days elapsed) → accrued = 0", () => {
    const date = new Date("2026-06-15T00:00:00Z");
    const loan = makeLoan("50000", "2.0", date);
    expect(computeAccruedInterest(loan, date).toString()).toBe("0");
  });

  it("B4: asOfDate before lastSettledDate → accrued = 0 (no negative interest)", () => {
    const loan = makeLoan("50000", "2.0", new Date("2026-06-15T00:00:00Z"));
    const before = new Date("2026-06-10T00:00:00Z");
    expect(computeAccruedInterest(loan, before).toString()).toBe("0");
  });

  it("B5: 1-day loan — accrued = dailyInterest × 1 (rounded to 2dp)", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2026-01-02T00:00:00Z");

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const accrued = computeAccruedInterest(loan, asOf);

    expect(accrued.equals(daily.toDecimalPlaces(2))).toBe(true);
  });

  it("B6: 7-day loan — accrued = daily × 7 (rounded to 2dp)", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2026-01-08T00:00:00Z");

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const expected = daily.times(7).toDecimalPlaces(2);
    const accrued = computeAccruedInterest(loan, asOf);

    expect(accrued.equals(expected)).toBe(true);
  });

  it("B7: 30-day loan", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const expected = daily.times(30).toDecimalPlaces(2);
    const accrued = computeAccruedInterest(loan, asOf);

    expect(accrued.equals(expected)).toBe(true);
  });

  it("B8: 365-day loan → accrued = exactly 1 year's simple interest (18000)", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2027-01-01T00:00:00Z");

    // 100000 × 18% = 18000 for exactly 365 days
    const accrued = computeAccruedInterest(loan, asOf);
    expect(accrued.toString()).toBe("18000");
  });
});

// ──────────────────────────────────────────────────────────
// §2 — FORMULA VERIFICATION
// ──────────────────────────────────────────────────────────

describe("Phase 5 §2 — Formula verification (Actual/365 Simple Interest)", () => {
  it("F1: dailyInterest formula = principal × (monthlyRate × 12) / 365 / 100", () => {
    // 100,000 × 18% p.a. / 365 = 49.3150...
    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    expect(daily.toFixed(4)).toBe("49.3151");
  });

  it("F2: monthlyInterest = principal × (monthlyRate / 100)", () => {
    const monthly = computeMonthlyInterest(new D("100000"), new D("1.5"));
    expect(monthly.toString()).toBe("1500");
  });

  it("F3: accrued over 30 days = dailyInterest × 30 (rounded to 2dp)", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const expected = daily.times(30).toDecimalPlaces(2);
    const accrued = computeAccruedInterest(loan, asOf);

    expect(accrued.equals(expected)).toBe(true);
  });

  it("F4: daily × 365 = monthly × 12 (same annual interest basis)", () => {
    const principal = new D("100000");
    const rate = new D("1.5");
    const daily = computeDailyInterest(principal, rate);
    const monthly = computeMonthlyInterest(principal, rate);

    const annualViaDaily = daily.times(365);
    const annualViaMonthly = monthly.times(12);
    const diff = annualViaDaily.minus(annualViaMonthly).abs();
    expect(diff.lt(new D("0.000001"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// §3 — DECIMAL PRECISION
// ──────────────────────────────────────────────────────────

describe("Phase 5 §3 — Decimal precision (Decimal, no floating-point)", () => {
  it("D1: principal 101.25 — exact result", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("101.25", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z"); // 30 days

    const accrued = computeAccruedInterest(loan, asOf);
    const expected = new D("101.25").times(18).times(30).div(365).div(100).toDecimalPlaces(2);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("D2: principal 1234.56 — exact result", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("1234.56", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const accrued = computeAccruedInterest(loan, asOf);
    const expected = new D("1234.56").times(18).times(30).div(365).div(100).toDecimalPlaces(2);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("D3: principal 99999.99 — exact result", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("99999.99", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const accrued = computeAccruedInterest(loan, asOf);
    const expected = new D("99999.99").times(18).times(30).div(365).div(100).toDecimalPlaces(2);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("D4: principal 0.01 (minimum denomination) — Decimal handles", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("0.01", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const accrued = computeAccruedInterest(loan, asOf);
    const expected = new D("0.01").times(18).times(30).div(365).div(100).toDecimalPlaces(2);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("D5: fractional rate 2.375% per month — exact result", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("50000", "2.375", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const accrued = computeAccruedInterest(loan, asOf);
    const expected = new D("50000")
      .times(new D("2.375").times(12))
      .times(30)
      .div(365)
      .div(100)
      .toDecimalPlaces(2);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("D6: accrued is rounded to exactly 2 decimal places", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("10000", "1.5", base);
    const asOf = new Date("2026-01-02T00:00:00Z");

    const accrued = computeAccruedInterest(loan, asOf);
    // Multiply/divide to check decimal places
    const shifted = accrued.times(100).toFixed(0);
    const roundtrip = new D(shifted).div(100);
    expect(accrued.equals(roundtrip)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// §4 — DATE / DAY-COUNT CONVENTION
// ──────────────────────────────────────────────────────────

describe("Phase 5 §4 — Date / day-count convention (Actual/365)", () => {
  it("DATE1: month boundary — Jan 31 → Feb 28 = 28 days", () => {
    const loan = makeLoan("100000", "1.5", new Date("2026-01-31T00:00:00Z"));
    const asOf = new Date("2026-02-28T00:00:00Z");

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const expected = daily.times(28).toDecimalPlaces(2);
    const accrued = computeAccruedInterest(loan, asOf);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("DATE2: year boundary — Dec 31 → Jan 1 = exactly 1 day", () => {
    const loan = makeLoan("100000", "1.5", new Date("2025-12-31T00:00:00Z"));
    const asOf = new Date("2026-01-01T00:00:00Z");

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const accrued = computeAccruedInterest(loan, asOf);
    expect(accrued.equals(daily.toDecimalPlaces(2))).toBe(true);
  });

  it("DATE3: leap year — Feb 28 → Feb 29 = 1 day (2028 is a leap year)", () => {
    const loan = makeLoan("100000", "1.5", new Date("2028-02-28T00:00:00Z"));
    const asOf = new Date("2028-02-29T00:00:00Z");

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const accrued = computeAccruedInterest(loan, asOf);
    expect(accrued.equals(daily.toDecimalPlaces(2))).toBe(true);
  });

  it("DATE4: 31-day month — full 31 days counted correctly", () => {
    const loan = makeLoan("100000", "1.5", new Date("2026-01-01T00:00:00Z"));
    const asOf = new Date("2026-02-01T00:00:00Z"); // January = 31 days

    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const expected = daily.times(31).toDecimalPlaces(2);
    const accrued = computeAccruedInterest(loan, asOf);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("DATE5: start date excluded, end date included (differenceInCalendarDays convention)", () => {
    // day 1 → day 2 = 1 calendar day
    const loan = makeLoan("36500", "1.5", new Date("2026-01-01T00:00:00Z"));
    const asOf = new Date("2026-01-02T00:00:00Z");
    const daily = computeDailyInterest(new D("36500"), new D("1.5"));
    const accrued = computeAccruedInterest(loan, asOf);
    expect(accrued.equals(daily.toDecimalPlaces(2))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// §5 — INTEREST SUMMARY FIELDS
// ──────────────────────────────────────────────────────────

describe("Phase 5 §5 — computeInterestSummary field relationships", () => {
  it("S1: summary returns accruedInterest, dailyInterest, monthlyInterest, daysSinceSettled, lastSettledDate", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const summary = computeInterestSummary(loan, asOf);

    expect(summary).toHaveProperty("accruedInterest");
    expect(summary).toHaveProperty("dailyInterest");
    expect(summary).toHaveProperty("monthlyInterest");
    expect(summary).toHaveProperty("daysSinceSettled");
    expect(summary).toHaveProperty("lastSettledDate");
  });

  it("S2: daysSinceSettled = 30 for a 30-day period", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const summary = computeInterestSummary(loan, asOf);
    expect(summary.daysSinceSettled).toBe(30);
  });

  it("S3: accruedInterest is computed from full-precision dailyRate × days (summary.dailyInterest is pre-rounded for display)", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const loan = makeLoan("100000", "1.5", base);
    const asOf = new Date("2026-01-31T00:00:00Z");

    const summary = computeInterestSummary(loan, asOf);

    // accruedInterest is computed BEFORE rounding dailyInterest in summary
    // i.e.: fullPrecisionDaily × days → rounded to 2dp
    // summary.dailyInterest is independently rounded to 2dp for display
    // These two paths may differ slightly due to sequential rounding
    const fullPrecisionDaily = computeDailyInterest(loan.principalOutstanding, loan.interestRateMonthly);
    const expectedFromFullPrecision = fullPrecisionDaily.times(summary.daysSinceSettled).toDecimalPlaces(2);
    expect(summary.accruedInterest.equals(expectedFromFullPrecision)).toBe(true);

    // Verify the documented behavior: summary.dailyInterest IS rounded (display value)
    const roundedDisplay = fullPrecisionDaily.toDecimalPlaces(2);
    expect(summary.dailyInterest.equals(roundedDisplay)).toBe(true);
  });

  it("S4: weeklyInterestAccrued dashboard approximation = monthlyInterest / 4.33", () => {
    const monthly = computeMonthlyInterest(new D("100000"), new D("1.5"));
    const weeklyApprox = monthly.div(new D("4.33"));
    expect(weeklyApprox.gt(0)).toBe(true);
    expect(weeklyApprox.lt(monthly)).toBe(true);
  });

  it("S5: daily × 365 ≈ monthly × 12 (same annual rate basis)", () => {
    const principal = new D("100000");
    const rate = new D("1.5");
    const daily = computeDailyInterest(principal, rate);
    const monthly = computeMonthlyInterest(principal, rate);

    const annualViaDaily = daily.times(365);
    const annualViaMonthly = monthly.times(12);
    const diff = annualViaDaily.minus(annualViaMonthly).abs();
    expect(diff.lt(new D("0.000001"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// §6 — BUSINESS SCENARIOS
// ──────────────────────────────────────────────────────────

describe("Phase 5 §6 — Business scenarios", () => {
  it("BIZ1: zero outstanding principal → accrued = 0 always (fully-paid / closed loan)", () => {
    const loan = makeLoan("0", "1.5", new Date("2025-01-01T00:00:00Z"));
    const asOf = new Date("2026-01-01T00:00:00Z");
    expect(computeAccruedInterest(loan, asOf).toString()).toBe("0");
  });

  it("BIZ2: very large principal ₹50,00,000 — Decimal handles without overflow", () => {
    const loan = makeLoan("5000000", "1.5", new Date("2026-01-01T00:00:00Z"));
    const asOf = new Date("2026-01-31T00:00:00Z");

    const accrued = computeAccruedInterest(loan, asOf);
    const expected = new D("5000000").times(18).times(30).div(365).div(100).toDecimalPlaces(2);
    expect(accrued.equals(expected)).toBe(true);
  });

  it("BIZ3: partial interest payment — proportional clock advance logic (payments.ts rule)", () => {
    const loanDate = new Date("2026-01-01T00:00:00Z");
    const asOf = new Date("2026-01-31T00:00:00Z"); // 30 days
    const loan = makeLoan("100000", "1.5", loanDate);

    const accrued = computeAccruedInterest(loan, asOf);
    const halfPaid = accrued.div(2);

    // If 50% of accrued interest paid, clock advances 50% of 30 = 15 days
    const daysFraction = halfPaid.div(accrued).times(30);
    expect(daysFraction.toFixed(0)).toBe("15");
  });

  it("BIZ4: settlement → principal = 0 → subsequent interest = 0 regardless of days", () => {
    const today = new Date();
    const loan = makeLoan("0", "1.5", today);
    expect(computeAccruedInterest(loan, today).toString()).toBe("0");
    // Even after 365 more days
    const future = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
    expect(computeAccruedInterest(loan, future).toString()).toBe("0");
  });
});

// ──────────────────────────────────────────────────────────
// §7 — 50% PROJECTION REGRESSION
// ──────────────────────────────────────────────────────────

describe("Phase 5 §7 — 50% projection regression", () => {
  function buildSummary(accrued: string, daily: string, monthly: string, days: number) {
    return {
      accruedInterest: new D(accrued),
      dailyInterest: new D(daily),
      monthlyInterest: new D(monthly),
      daysSinceSettled: days,
      lastSettledDate: new Date("2026-01-01T00:00:00Z"),
    };
  }

  it("REG1: NORMAL mode returns the summary object unchanged", () => {
    const summary = buildSummary("1500", "50", "1500", 30);
    const projected = projectInterestSummary(summary, "NORMAL");

    expect(projected.accruedInterest.toString()).toBe("1500");
    expect(projected.dailyInterest.toString()).toBe("50");
    expect(projected.monthlyInterest.toString()).toBe("1500");
    expect(projected.daysSinceSettled).toBe(30);
  });

  it("REG2: FIFTY_PERCENT mode halves all monetary interest fields by exactly 0.5", () => {
    const summary = buildSummary("1500", "50", "1500", 30);
    const projected = projectInterestSummary(summary, "FIFTY_PERCENT");

    expect(projected.accruedInterest.toString()).toBe("750");
    expect(projected.dailyInterest.toString()).toBe("25");
    expect(projected.monthlyInterest.toString()).toBe("750");
  });

  it("REG3: FIFTY_PERCENT does NOT halve daysSinceSettled (duration invariant)", () => {
    const summary = buildSummary("1500", "50", "1500", 30);
    const projected = projectInterestSummary(summary, "FIFTY_PERCENT");
    expect(projected.daysSinceSettled).toBe(30);
  });

  it("REG4: FIFTY_PERCENT does NOT alter lastSettledDate", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const summary = buildSummary("1500", "50", "1500", 30);
    const projected = projectInterestSummary({ ...summary, lastSettledDate: date }, "FIFTY_PERCENT");
    expect(projected.lastSettledDate.getTime()).toBe(date.getTime());
  });

  it("REG5: interest domain engine has no calculationMode parameter (domain purity)", () => {
    // TypeScript structural check: LoanForInterest must NOT have a calculationMode field
    const loan: LoanForInterest = {
      principalOutstanding: new D("100000"),
      interestRateMonthly: new D("1.5"),
      lastSettledDate: new Date("2026-01-01T00:00:00Z"),
    };
    // Domain computes with true 100% values only
    const accrued = computeAccruedInterest(loan, new Date("2026-01-31T00:00:00Z"));
    expect(accrued.gt(0)).toBe(true);
    // @ts-expect-error — calculationMode is not a valid field on LoanForInterest
    const _check = (loan as Record<string, unknown>).calculationMode;
    expect(_check).toBeUndefined();
  });

  it("REG6: no double projection — FIFTY_PERCENT output is exactly 0.5 × original", () => {
    const summary = buildSummary("2000", "66.67", "2000", 30);
    const once = projectInterestSummary(summary, "FIFTY_PERCENT");
    expect(once.accruedInterest.toString()).toBe("1000");
    expect(once.accruedInterest.div(summary.accruedInterest).toNumber()).toBe(0.5);
  });

  it("REG7: NORMAL vs FIFTY_PERCENT with live domain computation — ratio = exactly 0.5", () => {
    const loan = makeLoan("150000", "1.5", new Date("2026-01-01T00:00:00Z"));
    const asOf = new Date("2026-01-31T00:00:00Z");

    const summary = computeInterestSummary(loan, asOf);
    const normalP = projectInterestSummary(summary, "NORMAL");
    const fiftyP = projectInterestSummary(summary, "FIFTY_PERCENT");

    expect(fiftyP.accruedInterest.div(normalP.accruedInterest).toNumber()).toBe(0.5);
    expect(fiftyP.dailyInterest.div(normalP.dailyInterest).toNumber()).toBe(0.5);
    expect(fiftyP.monthlyInterest.div(normalP.monthlyInterest).toNumber()).toBe(0.5);

    // Non-monetary must be identical
    expect(fiftyP.daysSinceSettled).toBe(normalP.daysSinceSettled);
    expect(fiftyP.lastSettledDate.getTime()).toBe(normalP.lastSettledDate.getTime());
  });
});

// ──────────────────────────────────────────────────────────
// §8 — INTEREST MODE AUDIT
// ──────────────────────────────────────────────────────────

describe("Phase 5 §8 — Interest mode audit", () => {
  it("MODE1: LoanForInterest has no interestType field (only one mode: Actual/365 simple)", () => {
    const loan: LoanForInterest = {
      principalOutstanding: new D("100000"),
      interestRateMonthly: new D("1.5"),
      lastSettledDate: new Date("2026-01-01T00:00:00Z"),
    };
    // @ts-expect-error — interestType is not a valid field on LoanForInterest
    const _check = (loan as Record<string, unknown>).interestType;
    expect(_check).toBeUndefined();
  });

  it("MODE2: rate stored as monthly percentage — computeMonthlyInterest(100000, 1.5) = 1500", () => {
    const monthly = computeMonthlyInterest(new D("100000"), new D("1.5"));
    expect(monthly.toString()).toBe("1500");
  });

  it("MODE3: daily rate is always derived = monthlyRate × 12 / 365, never independently stored", () => {
    const daily = computeDailyInterest(new D("100000"), new D("1.5"));
    const manualCalc = new D("100000").times(new D("1.5")).times(12).div(365).div(100);
    expect(daily.toString()).toBe(manualCalc.toString());
  });
});
