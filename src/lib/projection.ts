/**
 * Centralized Monetary Projection Module
 *
 * Implements the projection boundary between true 100% financial domain logic
 * and the user-facing display presentation.
 *
 * Core Rule:
 * - NORMAL: monetary value × 1
 * - FIFTY_PERCENT: monetary value × 0.5
 *
 * Critical Architecture Invariants:
 * 1. Database always stores TRUE 100% values.
 * 2. Pure domain services (valuation, interest, payments, loans) calculate using TRUE 100% values.
 * 3. Weights, purities, interest rates, LTV %, durations, counts, IDs, and statuses are NEVER HALVED.
 * 4. User monetary input contract: In FIFTY_PERCENT mode, user inputs displayed amounts, which
 *    the server converts back to true amounts (× 2) before calling pure domain services.
 */

import Decimal from "decimal.js";
import type { CalculationMode } from "@/lib/auth/session";
import type {
  LoanRegisterResult,
  PaymentRegisterResult,
  DisbursementRegisterResult,
  OverdueLoansResult,
  CustomerWiseSummaryResult,
  AccountWiseSummaryResult,
  DayBookSummaryReportResult,
  PortfolioSummaryResult,
  TransactionHistoryResult,
} from "@/lib/services/reports";


const HALF_DECIMAL = new Decimal("0.5");
const DOUBLE_DECIMAL = new Decimal("2");

export type GenericRecord = Record<string, unknown>;

/**
 * Projects a Decimal monetary value based on calculation mode.
 */
export function projectMonetaryDecimal(
  value: Decimal | string | number | null | undefined,
  mode: CalculationMode
): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  const d = value instanceof Decimal ? value : new Decimal(value as any);
  if (mode === "FIFTY_PERCENT") {
    return d.mul(HALF_DECIMAL);
  }
  return d;
}

/**
 * Projects a numeric monetary value based on calculation mode.
 * Uses Decimal math to avoid floating point inaccuracies.
 */
export function projectMonetaryNumber(
  value: number | null | undefined,
  mode: CalculationMode
): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (mode === "FIFTY_PERCENT") {
    return new Decimal(value.toString()).mul(HALF_DECIMAL).toNumber();
  }
  return value;
}

/**
 * Projects a string monetary value based on calculation mode.
 */
export function projectMonetaryString(
  value: string | null | undefined,
  mode: CalculationMode
): string {
  if (!value) {
    return "0";
  }
  if (mode === "FIFTY_PERCENT") {
    return new Decimal(value).mul(HALF_DECIMAL).toString();
  }
  return value;
}

/**
 * Input Contract: Converts displayed monetary input from client back to true 100% legal amount.
 * - In NORMAL mode: trueAmount = displayedAmount × 1
 * - In FIFTY_PERCENT mode: trueAmount = displayedAmount × 2
 */
export function invertMonetaryInputDecimal(
  displayedAmount: Decimal | string | number,
  mode: CalculationMode
): Decimal {
  const d = displayedAmount instanceof Decimal ? displayedAmount : new Decimal(displayedAmount as any);
  if (mode === "FIFTY_PERCENT") {
    return d.mul(DOUBLE_DECIMAL);
  }
  return d;
}

export function invertMonetaryInputNumber(
  displayedAmount: number,
  mode: CalculationMode
): number {
  if (mode === "FIFTY_PERCENT") {
    return new Decimal(displayedAmount.toString()).mul(DOUBLE_DECIMAL).toNumber();
  }
  return displayedAmount;
}

/**
 * Projects a single Loan Item (collateral).
 * Only assessedValue is projected.
 * Weights, purity, valuation rate, packet number, storage location remain 100% untouched.
 */
export function projectLoanItem<T extends { assessedValue: Decimal }>(
  item: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return item;
  return {
    ...item,
    assessedValue: projectMonetaryDecimal(item.assessedValue, mode),
  };
}

/**
 * Projects a Loan Charge.
 * Only amount is projected.
 */
export function projectLoanCharge<T extends { amount: Decimal }>(
  charge: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return charge;
  return {
    ...charge,
    amount: projectMonetaryDecimal(charge.amount, mode),
  };
}

/**
 * Projects a Payment record.
 * Monetary allocations are projected.
 * Receipt number, date, mode, notes remain untouched.
 */
export function projectPayment<
  T extends {
    amountPaid: Decimal;
    allocatedPrincipal: Decimal;
    allocatedInterest: Decimal;
    allocatedCharges: Decimal;
    remainingPrincipal: Decimal;
  }
>(payment: T, mode: CalculationMode): T {
  if (mode === "NORMAL") return payment;
  return {
    ...payment,
    amountPaid: projectMonetaryDecimal(payment.amountPaid, mode),
    allocatedPrincipal: projectMonetaryDecimal(payment.allocatedPrincipal, mode),
    allocatedInterest: projectMonetaryDecimal(payment.allocatedInterest, mode),
    allocatedCharges: projectMonetaryDecimal(payment.allocatedCharges, mode),
    remainingPrincipal: projectMonetaryDecimal(payment.remainingPrincipal, mode),
  };
}

/**
 * Projects a single Ledger Entry (single-book transaction log).
 * amount and principalAfter are projected.
 */
export function projectLedgerEntry<
  T extends {
    amount: Decimal;
    principalAfter: Decimal;
  }
>(entry: T, mode: CalculationMode): T {
  if (mode === "NORMAL") return entry;
  return {
    ...entry,
    amount: projectMonetaryDecimal(entry.amount, mode),
    principalAfter: projectMonetaryDecimal(entry.principalAfter, mode),
  };
}

/**
 * Projects an interest summary object.
 */
export function projectInterestSummary<
  T extends {
    accruedInterest: Decimal;
    dailyInterest: Decimal;
    monthlyInterest: Decimal;
    daysSinceSettled?: number;
  }
>(summary: T, mode: CalculationMode): T {
  if (mode === "NORMAL") return summary;
  return {
    ...summary,
    accruedInterest: projectMonetaryDecimal(summary.accruedInterest, mode),
    dailyInterest: projectMonetaryDecimal(summary.dailyInterest, mode),
    monthlyInterest: projectMonetaryDecimal(summary.monthlyInterest, mode),
    // daysSinceSettled remains untouched (duration, not monetary)
  };
}

/**
 * Projects a Loan in a list or detail view.
 * Strictly preserves:
 * - ltvPercent
 * - interestRateMonthly
 * - tenureMonths
 * - gracePeriodDays
 * - loanNumber, dates, statuses
 */
export function projectLoan<T extends GenericRecord>(
  loan: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return loan;

  const projected: GenericRecord = { ...loan };

  if ("principalAmount" in loan && loan.principalAmount !== undefined) {
    projected.principalAmount = projectMonetaryDecimal(loan.principalAmount as Decimal, mode);
  }
  if ("principalOutstanding" in loan && loan.principalOutstanding !== undefined) {
    projected.principalOutstanding = projectMonetaryDecimal(loan.principalOutstanding as Decimal, mode);
  }
  if ("totalAssessedValue" in loan && loan.totalAssessedValue !== undefined) {
    projected.totalAssessedValue = projectMonetaryDecimal(loan.totalAssessedValue as Decimal, mode);
  }
  if ("eligibleAmount" in loan && loan.eligibleAmount !== undefined) {
    projected.eligibleAmount = projectMonetaryDecimal(loan.eligibleAmount as Decimal, mode);
  }
  if ("maxEligibleLoan" in loan && loan.maxEligibleLoan !== undefined) {
    projected.maxEligibleLoan = projectMonetaryDecimal(loan.maxEligibleLoan as Decimal, mode);
  }
  if ("totalDue" in loan && loan.totalDue !== undefined) {
    projected.totalDue = projectMonetaryDecimal(loan.totalDue as Decimal, mode);
  }

  if (Array.isArray(loan.items)) {
    projected.items = (loan.items as Array<{ assessedValue: Decimal }>).map((it) =>
      projectLoanItem(it, mode)
    );
  }
  if (Array.isArray(loan.payments)) {
    projected.payments = (
      loan.payments as Array<{
        amountPaid: Decimal;
        allocatedPrincipal: Decimal;
        allocatedInterest: Decimal;
        allocatedCharges: Decimal;
        remainingPrincipal: Decimal;
      }>
    ).map((p) => projectPayment(p, mode));
  }
  if (Array.isArray(loan.charges)) {
    projected.charges = (loan.charges as Array<{ amount: Decimal }>).map((c) =>
      projectLoanCharge(c, mode)
    );
  }
  if (Array.isArray(loan.transactions)) {
    projected.transactions = (
      loan.transactions as Array<{
        amount: Decimal;
        principalAfter: Decimal;
      }>
    ).map((t) => projectLedgerEntry(t, mode));
  }
  if (loan.interestSummary && typeof loan.interestSummary === "object") {
    projected.interestSummary = projectInterestSummary(
      loan.interestSummary as {
        accruedInterest: Decimal;
        dailyInterest: Decimal;
        monthlyInterest: Decimal;
        daysElapsed?: number;
      },
      mode
    );
  }

  return projected as T;
}

/**
 * Projects a paginated list of loans.
 */
export function projectLoansList<T extends { loans: GenericRecord[]; total: number }>(
  result: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return result;
  return {
    ...result,
    loans: result.loans.map((loan) => projectLoan(loan, mode)),
  };
}

/**
 * Projects Dashboard Stats.
 * Monetary aggregates are projected at 50%.
 * Counts, LTV percent, and durations remain 100% unchanged.
 */
export function projectDashboardStats<T extends GenericRecord>(
  stats: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return stats;

  const projectDecimalOrString = (val: unknown) => {
    if (val instanceof Decimal) return projectMonetaryDecimal(val, mode);
    if (typeof val === "string") return projectMonetaryString(val, mode);
    if (typeof val === "number") return projectMonetaryNumber(val, mode);
    return val;
  };

  const lss = stats.loanStatusSummary as GenericRecord | undefined;
  const loanStatusSummary = lss && typeof lss === "object"
    ? {
        ACTIVE: lss.ACTIVE && typeof lss.ACTIVE === "object"
          ? {
              count: (lss.ACTIVE as { count: number }).count,
              amount: projectMonetaryDecimal((lss.ACTIVE as { amount: Decimal }).amount, mode),
            }
          : undefined,
        OVERDUE: lss.OVERDUE && typeof lss.OVERDUE === "object"
          ? {
              count: (lss.OVERDUE as { count: number }).count,
              amount: projectMonetaryDecimal((lss.OVERDUE as { amount: Decimal }).amount, mode),
            }
          : undefined,
        CLOSED: lss.CLOSED && typeof lss.CLOSED === "object"
          ? {
              count: (lss.CLOSED as { count: number }).count,
              amount: projectMonetaryDecimal((lss.CLOSED as { amount: Decimal }).amount, mode),
            }
          : undefined,
      }
    : stats.loanStatusSummary;

  const collectionsSummary = stats.collectionsSummary && typeof stats.collectionsSummary === "object"
    ? {
        ...(stats.collectionsSummary as GenericRecord),
        totalCollected: projectMonetaryDecimal((stats.collectionsSummary as { totalCollected: Decimal }).totalCollected, mode),
        principalCollected: projectMonetaryDecimal((stats.collectionsSummary as { principalCollected: Decimal }).principalCollected, mode),
        interestCollected: projectMonetaryDecimal((stats.collectionsSummary as { interestCollected: Decimal }).interestCollected, mode),
        chargesCollected: projectMonetaryDecimal((stats.collectionsSummary as { chargesCollected: Decimal }).chargesCollected, mode),
      }
    : stats.collectionsSummary;

  const disbursementSummary = stats.disbursementSummary && typeof stats.disbursementSummary === "object"
    ? {
        ...(stats.disbursementSummary as GenericRecord),
        totalDisbursed: projectMonetaryDecimal((stats.disbursementSummary as { totalDisbursed: Decimal }).totalDisbursed, mode),
      }
    : stats.disbursementSummary;

  const portfolioSummary = stats.portfolioSummary && typeof stats.portfolioSummary === "object"
    ? {
        ...(stats.portfolioSummary as GenericRecord),
        totalPrincipalDisbursed: projectMonetaryDecimal((stats.portfolioSummary as { totalPrincipalDisbursed: Decimal }).totalPrincipalDisbursed, mode),
        totalPrincipalOutstanding: projectMonetaryDecimal((stats.portfolioSummary as { totalPrincipalOutstanding: Decimal }).totalPrincipalOutstanding, mode),
        totalAccruedInterest: projectMonetaryDecimal((stats.portfolioSummary as { totalAccruedInterest: Decimal }).totalAccruedInterest, mode),
        totalExposure: projectMonetaryDecimal((stats.portfolioSummary as { totalExposure: Decimal }).totalExposure, mode),
      }
    : stats.portfolioSummary;

  const recentActivity = Array.isArray(stats.recentActivity)
    ? (stats.recentActivity as GenericRecord[]).map((e) => ({
        ...e,
        amount: projectMonetaryDecimal(e.amount as Decimal, mode),
        principalAfter: projectMonetaryDecimal(e.principalAfter as Decimal, mode),
      }))
    : stats.recentActivity;

  return {
    ...stats,
    totalAUM: projectMonetaryString(stats.totalAUM as string, mode),
    totalPrincipalOutstanding: projectDecimalOrString(stats.totalPrincipalOutstanding),
    totalAccruedInterest: projectDecimalOrString(stats.totalAccruedInterest),
    totalExposure: projectDecimalOrString(stats.totalExposure),
    totalActivePrincipal: stats.totalActivePrincipal ? projectDecimalOrString(stats.totalActivePrincipal) : undefined,
    totalOverduePrincipal: stats.totalOverduePrincipal ? projectDecimalOrString(stats.totalOverduePrincipal) : undefined,
    totalClosedPrincipal: stats.totalClosedPrincipal ? projectDecimalOrString(stats.totalClosedPrincipal) : undefined,
    totalPaymentsCollected: stats.totalPaymentsCollected ? projectDecimalOrString(stats.totalPaymentsCollected) : undefined,
    totalDisbursedAmount: stats.totalDisbursedAmount ? projectDecimalOrString(stats.totalDisbursedAmount) : undefined,
    overdueAmount: projectMonetaryString(stats.overdueAmount as string, mode),
    weeklyInterestAccrued: projectMonetaryString(stats.weeklyInterestAccrued as string, mode),
    disbursedToday:
      stats.disbursedToday && typeof stats.disbursedToday === "object"
        ? {
            count: (stats.disbursedToday as { count: number }).count,
            amount: projectMonetaryString((stats.disbursedToday as { amount: string }).amount, mode),
          }
        : stats.disbursedToday,
    disbursedWeek:
      stats.disbursedWeek && typeof stats.disbursedWeek === "object"
        ? {
            count: (stats.disbursedWeek as { count: number }).count,
            amount: projectMonetaryString((stats.disbursedWeek as { amount: string }).amount, mode),
          }
        : stats.disbursedWeek,
    disbursedPeriod:
      stats.disbursedPeriod && typeof stats.disbursedPeriod === "object"
        ? {
            count: (stats.disbursedPeriod as { count: number }).count,
            amount: projectDecimalOrString((stats.disbursedPeriod as { amount: unknown }).amount),
          }
        : stats.disbursedPeriod,
    collectionsToday:
      stats.collectionsToday && typeof stats.collectionsToday === "object"
        ? {
            count: (stats.collectionsToday as { count: number }).count,
            amount: projectMonetaryString((stats.collectionsToday as { amount: string }).amount, mode),
          }
        : stats.collectionsToday,
    collectionsPeriod:
      stats.collectionsPeriod && typeof stats.collectionsPeriod === "object"
        ? {
            count: (stats.collectionsPeriod as { count: number }).count,
            totalCollected: projectDecimalOrString((stats.collectionsPeriod as { totalCollected: unknown }).totalCollected),
            principalCollected: projectDecimalOrString((stats.collectionsPeriod as { principalCollected: unknown }).principalCollected),
            interestCollected: projectDecimalOrString((stats.collectionsPeriod as { interestCollected: unknown }).interestCollected),
            chargesCollected: projectDecimalOrString((stats.collectionsPeriod as { chargesCollected: unknown }).chargesCollected),
          }
        : stats.collectionsPeriod,
    recentLoans: Array.isArray(stats.recentLoans)
      ? (stats.recentLoans as GenericRecord[]).map((l) => projectLoan(l, mode))
      : stats.recentLoans,
    overdueLoans: Array.isArray(stats.overdueLoans)
      ? (stats.overdueLoans as GenericRecord[]).map((l) => projectLoan(l, mode))
      : stats.overdueLoans,
    loanStatusSummary,
    collectionsSummary,
    disbursementSummary,
    portfolioSummary,
    recentActivity,
  } as T;
}

/**
 * Projects Dashboard Chart Data.
 */
export function projectDashboardChartData<T extends GenericRecord>(
  chartData: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return chartData;

  return {
    ...chartData,
    metalBreakdown: Array.isArray(chartData.metalBreakdown)
      ? (chartData.metalBreakdown as Array<{ value: number }>).map((item) => ({
          ...item,
          value: projectMonetaryNumber(item.value, mode),
        }))
      : chartData.metalBreakdown,
    statusBreakdown: Array.isArray(chartData.statusBreakdown)
      ? (chartData.statusBreakdown as Array<{ value: number }>).map((item) => ({
          ...item,
          value: projectMonetaryNumber(item.value, mode),
        }))
      : chartData.statusBreakdown,
    monthlyTrend: Array.isArray(chartData.monthlyTrend)
      ? (chartData.monthlyTrend as Array<{ disbursed: number; collected: number }>).map((item) => ({
          ...item,
          disbursed: projectMonetaryNumber(item.disbursed, mode),
          collected: projectMonetaryNumber(item.collected, mode),
        }))
      : chartData.monthlyTrend,
  };
}

/**
 * Projects Reports Data.
 */
export function projectReportsData<T extends GenericRecord>(
  reports: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return reports;

  return {
    ...reports,
    totalActiveAUM: projectMonetaryNumber(reports.totalActiveAUM as number, mode),
    goldAssessedValue: projectMonetaryNumber(reports.goldAssessedValue as number, mode),
    silverAssessedValue: projectMonetaryNumber(reports.silverAssessedValue as number, mode),
    totalCollected: projectMonetaryNumber(reports.totalCollected as number, mode),
    interestCollected: projectMonetaryNumber(reports.interestCollected as number, mode),
    principalCollected: projectMonetaryNumber(reports.principalCollected as number, mode),
    chargesCollected: projectMonetaryNumber(reports.chargesCollected as number, mode),
    totalDisbursed: projectMonetaryNumber(reports.totalDisbursed as number, mode),
    // All counts (totalLoansCount, activeCount, ltv85Count, etc.) untouched!
  };
}

/**
 * Projects Customer PAN Status.
 * Threshold monetary limit is projected in FIFTY_PERCENT mode to match displayed loan balances.
 */
export function projectPanStatus<T extends { threshold: number }>(
  panStatus: T,
  mode: CalculationMode
): T {
  if (mode === "NORMAL") return panStatus;
  return {
    ...panStatus,
    threshold: projectMonetaryNumber(panStatus.threshold, mode),
  };
}

/*/**
 * Projects Loan Register Report.
 */
export function projectLoanRegisterReport(report: LoanRegisterResult, mode: CalculationMode): LoanRegisterResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      principalAmount: projectMonetaryDecimal(item.principalAmount, mode),
      principalOutstanding: projectMonetaryDecimal(item.principalOutstanding, mode),
      totalAssessedValue: projectMonetaryDecimal(item.totalAssessedValue, mode),
    })),
    summary: {
      ...report.summary,
      totalPrincipalAmount: projectMonetaryDecimal(report.summary.totalPrincipalAmount, mode),
      totalPrincipalOutstanding: projectMonetaryDecimal(report.summary.totalPrincipalOutstanding, mode),
    },
  };
}

/**
 * Projects Payment Register Report.
 */
export function projectPaymentRegisterReport(report: PaymentRegisterResult, mode: CalculationMode): PaymentRegisterResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      amountPaid: projectMonetaryDecimal(item.amountPaid, mode),
      allocatedCharges: projectMonetaryDecimal(item.allocatedCharges, mode),
      allocatedInterest: projectMonetaryDecimal(item.allocatedInterest, mode),
      allocatedPrincipal: projectMonetaryDecimal(item.allocatedPrincipal, mode),
      remainingPrincipal: projectMonetaryDecimal(item.remainingPrincipal, mode),
    })),
    summary: {
      ...report.summary,
      totalAmountPaid: projectMonetaryDecimal(report.summary.totalAmountPaid, mode),
      totalAllocatedPrincipal: projectMonetaryDecimal(report.summary.totalAllocatedPrincipal, mode),
      totalAllocatedInterest: projectMonetaryDecimal(report.summary.totalAllocatedInterest, mode),
      totalAllocatedCharges: projectMonetaryDecimal(report.summary.totalAllocatedCharges, mode),
    },
  };
}

/**
 * Projects Disbursement Register Report.
 */
export function projectDisbursementRegisterReport(report: DisbursementRegisterResult, mode: CalculationMode): DisbursementRegisterResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      disbursementAmount: projectMonetaryDecimal(item.disbursementAmount, mode),
    })),
    summary: {
      ...report.summary,
      totalDisbursedAmount: projectMonetaryDecimal(report.summary.totalDisbursedAmount, mode),
    },
  };
}

/**
 * Projects Overdue Loans Report.
 */
export function projectOverdueLoansReport(report: OverdueLoansResult, mode: CalculationMode): OverdueLoansResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      principalAmount: projectMonetaryDecimal(item.principalAmount, mode),
      principalOutstanding: projectMonetaryDecimal(item.principalOutstanding, mode),
      accruedInterest: projectMonetaryDecimal(item.accruedInterest, mode),
      totalDue: projectMonetaryDecimal(item.totalDue, mode),
    })),
    summary: {
      ...report.summary,
      totalPrincipalOutstanding: projectMonetaryDecimal(report.summary.totalPrincipalOutstanding, mode),
      totalAccruedInterest: projectMonetaryDecimal(report.summary.totalAccruedInterest, mode),
      totalDue: projectMonetaryDecimal(report.summary.totalDue, mode),
    },
  };
}

/**
 * Projects Customer-wise Loan Summary Report.
 */
export function projectCustomerWiseSummaryReport(report: CustomerWiseSummaryResult, mode: CalculationMode): CustomerWiseSummaryResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      outstandingPrincipal: projectMonetaryDecimal(item.outstandingPrincipal, mode),
      accruedInterest: projectMonetaryDecimal(item.accruedInterest, mode),
      totalPayments: projectMonetaryDecimal(item.totalPayments, mode),
    })),
    summary: {
      ...report.summary,
      totalOutstandingPrincipal: projectMonetaryDecimal(report.summary.totalOutstandingPrincipal, mode),
      totalAccruedInterest: projectMonetaryDecimal(report.summary.totalAccruedInterest, mode),
      totalPayments: projectMonetaryDecimal(report.summary.totalPayments, mode),
    },
  };
}

/**
 * Projects Account-wise Financial Summary Report.
 */
export function projectAccountWiseSummaryReport(report: AccountWiseSummaryResult, mode: CalculationMode): AccountWiseSummaryResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      totalInflow: projectMonetaryDecimal(item.totalInflow, mode),
      totalOutflow: projectMonetaryDecimal(item.totalOutflow, mode),
      netMovement: projectMonetaryDecimal(item.netMovement, mode),
    })),
    summary: {
      ...report.summary,
      totalInflowAllAccounts: projectMonetaryDecimal(report.summary.totalInflowAllAccounts, mode),
      totalOutflowAllAccounts: projectMonetaryDecimal(report.summary.totalOutflowAllAccounts, mode),
      netMovementAllAccounts: projectMonetaryDecimal(report.summary.netMovementAllAccounts, mode),
    },
  };
}

/**
 * Projects Day Book Summary Report.
 */
export function projectDayBookSummaryReport(report: DayBookSummaryReportResult, mode: CalculationMode): DayBookSummaryReportResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    summary: {
      ...report.summary,
      totalInflow: projectMonetaryDecimal(report.summary.totalInflow, mode),
      totalOutflow: projectMonetaryDecimal(report.summary.totalOutflow, mode),
      netCashFlow: projectMonetaryDecimal(report.summary.netCashFlow, mode),
    },
  };
}

/**
 * Projects Portfolio Summary Report.
 */
export function projectPortfolioSummaryReport(report: PortfolioSummaryResult, mode: CalculationMode): PortfolioSummaryResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    pointInTime: {
      ...report.pointInTime,
      principalDisbursedTotal: projectMonetaryDecimal(report.pointInTime.principalDisbursedTotal, mode),
      principalOutstandingTotal: projectMonetaryDecimal(report.pointInTime.principalOutstandingTotal, mode),
      accruedInterestTotal: projectMonetaryDecimal(report.pointInTime.accruedInterestTotal, mode),
      totalExposure: projectMonetaryDecimal(report.pointInTime.totalExposure, mode),
      goldAssessedValue: projectMonetaryDecimal(report.pointInTime.goldAssessedValue, mode),
      silverAssessedValue: projectMonetaryDecimal(report.pointInTime.silverAssessedValue, mode),
    },
    period: {
      ...report.period,
      disbursementsAmount: projectMonetaryDecimal(report.period.disbursementsAmount, mode),
      collectionsAmount: projectMonetaryDecimal(report.period.collectionsAmount, mode),
      principalCollected: projectMonetaryDecimal(report.period.principalCollected, mode),
      interestCollected: projectMonetaryDecimal(report.period.interestCollected, mode),
      chargesCollected: projectMonetaryDecimal(report.period.chargesCollected, mode),
    },
  };
}

/**
 * Projects Transaction History Report.
 */
export function projectTransactionHistoryReport(report: TransactionHistoryResult, mode: CalculationMode): TransactionHistoryResult {
  if (mode === "NORMAL") return report;

  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      amount: projectMonetaryDecimal(item.amount, mode),
      principalAfter: projectMonetaryDecimal(item.principalAfter, mode),
    })),
    summary: {
      ...report.summary,
      totalInflow: projectMonetaryDecimal(report.summary.totalInflow, mode),
      totalOutflow: projectMonetaryDecimal(report.summary.totalOutflow, mode),
      netMovement: projectMonetaryDecimal(report.summary.netMovement, mode),
    },
  };
}

