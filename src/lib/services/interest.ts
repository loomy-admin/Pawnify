/**
 * Interest Service — §6.3
 *
 * Flat rate (simple interest) method, Actual/365 day-count convention.
 * Interest is computed on-read, never persisted as an incrementing balance.
 * This is the single source of truth for interest calculations.
 *
 * Formula:
 *   annualRatePercent = interestRateMonthly × 12
 *   dailyInterest = principalOutstanding × (annualRatePercent / 365 / 100)
 *   accruedInterest = dailyInterest × daysBetween(lastSettledDate, asOfDate)
 */

import Decimal from "decimal.js";
import { differenceInCalendarDays, addMonths } from "date-fns";
import { debugLog } from "@/lib/debug";
import type { LoanType, CumulativeFrequency, CumulativeTreatment } from "@/lib/db";

export interface LoanForInterest {
  principalOutstanding: Decimal;
  interestRateMonthly: Decimal;
  lastSettledDate: Date;
  loanType?: LoanType | "STANDARD" | "CUMULATIVE";
  cumulativeFrequency?: CumulativeFrequency | "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | null;
  cumulativeTreatment?: CumulativeTreatment | "ADD_TO_CAPITAL" | "KEEP_SEPARATE" | null;
}

/**
 * Daily interest amount for a given principal and monthly rate.
 * dailyInterest = principalOutstanding × (monthlyRate × 12 / 365 / 100)
 */
export function computeDailyInterest(principalOutstanding: Decimal, monthlyRate: Decimal): Decimal {
  const annualRate = monthlyRate.times(new Decimal(12));
  return principalOutstanding.times(annualRate).div(new Decimal(365)).div(new Decimal(100));
}

/**
 * Monthly interest amount (for display purposes — "this month's interest").
 * monthlyInterest = principalOutstanding × (monthlyRate / 100)
 */
export function computeMonthlyInterest(
  principalOutstanding: Decimal,
  monthlyRate: Decimal
): Decimal {
  return principalOutstanding.times(monthlyRate).div(new Decimal(100));
}

/**
 * Helper to get number of months in a compounding/accumulation cycle.
 */
function getCycleMonths(frequency?: string | null): number {
  switch (frequency) {
    case "MONTHLY": return 1;
    case "QUARTERLY": return 3;
    case "HALF_YEARLY": return 6;
    case "YEARLY": return 12;
    default: return 1;
  }
}

/**
 * Accrued interest from lastSettledDate to asOfDate.
 * Supports:
 * 1. STANDARD loans: Flat rate (simple interest) method, Actual/365 day-count convention.
 * 2. CUMULATIVE loans:
 *    - ADD_TO_CAPITAL: Interest accumulates and compounds into principal at each cycle point.
 *    - KEEP_SEPARATE: Interest accumulates across cycles without compounding principal.
 */
export function computeAccruedInterest(loan: LoanForInterest, asOfDate: Date): Decimal {
  const totalDays = differenceInCalendarDays(asOfDate, loan.lastSettledDate);

  if (totalDays <= 0) {
    return new Decimal(0);
  }

  // Handle Standard Simple Interest
  if (loan.loanType !== "CUMULATIVE") {
    const dailyInterest = computeDailyInterest(loan.principalOutstanding, loan.interestRateMonthly);
    const accrued = dailyInterest.times(new Decimal(totalDays)).toDecimalPlaces(2);
    debugLog(
      "interest",
      `[Standard] accrued=${accrued.toString()} principal=${loan.principalOutstanding.toString()} rate=${loan.interestRateMonthly.toString()}%/mo days=${totalDays}`
    );
    return accrued;
  }

  // Handle Cumulative Interest
  const cycleMonths = getCycleMonths(loan.cumulativeFrequency);
  const isAddToCapital = loan.cumulativeTreatment === "ADD_TO_CAPITAL";

  let currentDate = new Date(loan.lastSettledDate);
  let currentPrincipal = new Decimal(loan.principalOutstanding);
  let totalAccrued = new Decimal(0);

  // Advance period-by-period
  let nextCycleDate = addMonths(currentDate, cycleMonths);
  while (nextCycleDate <= asOfDate) {
    const daysInCycle = differenceInCalendarDays(nextCycleDate, currentDate);
    if (daysInCycle > 0) {
      const daily = computeDailyInterest(currentPrincipal, loan.interestRateMonthly);
      const cycleInterest = daily.times(new Decimal(daysInCycle)).toDecimalPlaces(2);
      totalAccrued = totalAccrued.plus(cycleInterest);

      if (isAddToCapital) {
        currentPrincipal = currentPrincipal.plus(cycleInterest);
      }
    }
    currentDate = nextCycleDate;
    nextCycleDate = addMonths(currentDate, cycleMonths);
  }

  // Remaining partial cycle days up to asOfDate
  const remainingDays = differenceInCalendarDays(asOfDate, currentDate);
  if (remainingDays > 0) {
    const daily = computeDailyInterest(currentPrincipal, loan.interestRateMonthly);
    const partialInterest = daily.times(new Decimal(remainingDays)).toDecimalPlaces(2);
    totalAccrued = totalAccrued.plus(partialInterest);
  }

  const roundedTotal = totalAccrued.toDecimalPlaces(2);
  debugLog(
    "interest",
    `[Cumulative:${loan.cumulativeTreatment || "KEEP_SEPARATE"}] accrued=${roundedTotal.toString()} finalPrincipal=${currentPrincipal.toString()} days=${totalDays}`
  );
  return roundedTotal;
}

/**
 * Compute a summary of interest for display on loan detail.
 */
export function computeInterestSummary(loan: LoanForInterest, asOfDate: Date = new Date()) {
  const accrued = computeAccruedInterest(loan, asOfDate);
  const daily = computeDailyInterest(loan.principalOutstanding, loan.interestRateMonthly);
  const monthly = computeMonthlyInterest(loan.principalOutstanding, loan.interestRateMonthly);
  const daysSinceSettled = differenceInCalendarDays(asOfDate, loan.lastSettledDate);

  return {
    accruedInterest: accrued,
    dailyInterest: daily.toDecimalPlaces(2),
    monthlyInterest: monthly.toDecimalPlaces(2),
    daysSinceSettled,
    lastSettledDate: loan.lastSettledDate,
    loanType: loan.loanType || "STANDARD",
    cumulativeFrequency: loan.cumulativeFrequency || null,
    cumulativeTreatment: loan.cumulativeTreatment || null,
  };
}
