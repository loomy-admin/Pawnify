import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  projectMonetaryDecimal,
  projectMonetaryNumber,
  projectMonetaryString,
  invertMonetaryInputDecimal,
  invertMonetaryInputNumber,
  projectLoanItem,
  projectLoanCharge,
  projectPayment,
  projectLedgerEntry,
  projectInterestSummary,
  projectLoan,
  projectLoansList,
  projectDashboardStats,
  projectDashboardChartData,
  projectReportsData,
} from "@/lib/projection";



describe("Phase 3B: Monetary Projection & Boundary Verification", () => {
  const sampleLoan = {
    id: "loan-test-123",
    loanNumber: "PL-2026-000001",
    loanDate: new Date("2026-01-01"),
    dueDate: new Date("2026-07-01"),
    lastSettledDate: new Date("2026-01-01"),
    status: "ACTIVE" as const,
    displayStatus: "ACTIVE" as const,
    customerId: "cust-1",
    handledById: "staff-1",
    tenureMonths: 6,
    gracePeriodDays: 7,
    interestRateMonthly: new Decimal("1.500"),
    ltvPercent: new Decimal("75.00"),
    totalAssessedValue: new Decimal("100000.00"),
    principalAmount: new Decimal("75000.00"),
    principalOutstanding: new Decimal("75000.00"),
    eligibleAmount: new Decimal("80000.00"),
    maxEligibleLoan: new Decimal("85000.00"),
    totalDue: new Decimal("76125.00"),
    items: [
      {
        id: "item-1",
        loanId: "loan-test-123",
        metalType: "GOLD" as const,
        description: "22K Gold Bangles",
        purityLabel: "22K",
        purityPercent: new Decimal("91.60"),
        grossWeightGrams: new Decimal("15.500"),
        stoneWeightGrams: new Decimal("0.500"),
        netWeightGrams: new Decimal("15.000"),
        fineWeightGrams: new Decimal("13.740"),
        valuationRatePerGram: new Decimal("6666.67"),
        assessedValue: new Decimal("100000.00"),
        packetNumber: "PKT-001",
        storageLocation: "Vault A-1",
      },
    ],
    payments: [
      {
        id: "pmt-1",
        receiptNumber: "REC-001",
        amountPaid: new Decimal("10000.00"),
        allocatedPrincipal: new Decimal("8000.00"),
        allocatedInterest: new Decimal("1500.00"),
        allocatedCharges: new Decimal("500.00"),
        remainingPrincipal: new Decimal("67000.00"),
        mode: "CASH" as const,
        paymentDate: new Date("2026-02-01"),
      },
    ],
    charges: [
      {
        id: "chg-1",
        loanId: "loan-test-123",
        chargeType: "PROCESSING_FEE" as const,
        amount: new Decimal("500.00"),
        isSettled: false,
      },
    ],
    transactions: [
      {
        id: "tx-1",
        loanId: "loan-test-123",
        transactionType: "DISBURSEMENT" as const,
        amount: new Decimal("75000.00"),
        principalAfter: new Decimal("75000.00"),
        entryDate: new Date("2026-01-01"),
      },
    ],
    interestSummary: {
      accruedInterest: new Decimal("1125.00"),
      dailyInterest: new Decimal("37.50"),
      monthlyInterest: new Decimal("1125.00"),
      daysSinceSettled: 30,
    },
  };

  it("T6: Same loan in NORMAL vs FIFTY_PERCENT has monetary output ratio = exactly 0.5", () => {
    const normal = projectLoan(sampleLoan, "NORMAL");
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");

    // Principal Amount
    expect(fifty.principalAmount.div(normal.principalAmount).toNumber()).toBe(0.5);
    expect(fifty.principalAmount.toString()).toBe("37500");

    // Principal Outstanding
    expect(fifty.principalOutstanding.div(normal.principalOutstanding).toNumber()).toBe(0.5);
    expect(fifty.principalOutstanding.toString()).toBe("37500");

    // Total Assessed Value
    expect(fifty.totalAssessedValue.div(normal.totalAssessedValue).toNumber()).toBe(0.5);
    expect(fifty.totalAssessedValue.toString()).toBe("50000");

    // Total Due
    expect(fifty.totalDue.div(normal.totalDue).toNumber()).toBe(0.5);

    // Collateral Assessed Value
    expect(fifty.items[0].assessedValue.div(normal.items[0].assessedValue).toNumber()).toBe(0.5);
    expect(fifty.items[0].assessedValue.toString()).toBe("50000");

    // Payment Allocations
    expect(fifty.payments[0].amountPaid.div(normal.payments[0].amountPaid).toNumber()).toBe(0.5);
    expect(fifty.payments[0].allocatedPrincipal.div(normal.payments[0].allocatedPrincipal).toNumber()).toBe(0.5);
    expect(fifty.payments[0].allocatedInterest.div(normal.payments[0].allocatedInterest).toNumber()).toBe(0.5);
    expect(fifty.payments[0].allocatedCharges.div(normal.payments[0].allocatedCharges).toNumber()).toBe(0.5);
    expect(fifty.payments[0].remainingPrincipal.div(normal.payments[0].remainingPrincipal).toNumber()).toBe(0.5);

    // Charges
    expect(fifty.charges[0].amount.div(normal.charges[0].amount).toNumber()).toBe(0.5);

    // Ledger / Transactions
    expect(fifty.transactions[0].amount.div(normal.transactions[0].amount).toNumber()).toBe(0.5);
    expect(fifty.transactions[0].principalAfter.div(normal.transactions[0].principalAfter).toNumber()).toBe(0.5);

    // Interest Summary
    expect(fifty.interestSummary.accruedInterest.div(normal.interestSummary.accruedInterest).toNumber()).toBe(0.5);
    expect(fifty.interestSummary.dailyInterest.div(normal.interestSummary.dailyInterest).toNumber()).toBe(0.5);
    expect(fifty.interestSummary.monthlyInterest.div(normal.interestSummary.monthlyInterest).toNumber()).toBe(0.5);
  });

  it("T7: Weights are identical between NORMAL and FIFTY_PERCENT", () => {
    const normal = projectLoan(sampleLoan, "NORMAL");
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");

    expect(fifty.items[0].grossWeightGrams.equals(normal.items[0].grossWeightGrams)).toBe(true);
    expect(fifty.items[0].stoneWeightGrams.equals(normal.items[0].stoneWeightGrams)).toBe(true);
    expect(fifty.items[0].netWeightGrams.equals(normal.items[0].netWeightGrams)).toBe(true);
    expect(fifty.items[0].fineWeightGrams.equals(normal.items[0].fineWeightGrams)).toBe(true);
    expect(fifty.items[0].grossWeightGrams.toString()).toBe("15.5");
  });

  it("T8: Purity is identical between NORMAL and FIFTY_PERCENT", () => {
    const normal = projectLoan(sampleLoan, "NORMAL");
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");

    expect(fifty.items[0].purityPercent.equals(normal.items[0].purityPercent)).toBe(true);
    expect(fifty.items[0].purityLabel).toBe(normal.items[0].purityLabel);
    expect(fifty.items[0].purityPercent.toString()).toBe("91.6");
  });

  it("T9: Rates are identical between NORMAL and FIFTY_PERCENT", () => {
    const normal = projectLoan(sampleLoan, "NORMAL");
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");

    expect(fifty.items[0].valuationRatePerGram.equals(normal.items[0].valuationRatePerGram)).toBe(true);
    expect(fifty.interestRateMonthly.equals(normal.interestRateMonthly)).toBe(true);
    expect(fifty.interestRateMonthly.toString()).toBe("1.5");
  });

  it("T10: LTV is identical between NORMAL and FIFTY_PERCENT", () => {
    const normal = projectLoan(sampleLoan, "NORMAL");
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");

    expect(fifty.ltvPercent.equals(normal.ltvPercent)).toBe(true);
    expect(fifty.ltvPercent.toString()).toBe("75");
  });

  it("T11: Tenure and durations are identical between NORMAL and FIFTY_PERCENT", () => {
    const normal = projectLoan(sampleLoan, "NORMAL");
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");

    expect(fifty.tenureMonths).toBe(normal.tenureMonths);
    expect(fifty.gracePeriodDays).toBe(normal.gracePeriodDays);
    expect(fifty.interestSummary.daysSinceSettled).toBe(normal.interestSummary.daysSinceSettled);
    expect(fifty.loanDate.getTime()).toBe(normal.loanDate.getTime());
    expect(fifty.dueDate.getTime()).toBe(normal.dueDate.getTime());
  });

  it("T12: Counts and IDs are identical between NORMAL and FIFTY_PERCENT", () => {
    const normal = projectLoan(sampleLoan, "NORMAL");
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");

    expect(fifty.items.length).toBe(normal.items.length);
    expect(fifty.payments.length).toBe(normal.payments.length);
    expect(fifty.charges.length).toBe(normal.charges.length);
    expect(fifty.transactions.length).toBe(normal.transactions.length);
    expect(fifty.id).toBe(normal.id);
    expect(fifty.loanNumber).toBe(normal.loanNumber);
    expect(fifty.items[0].packetNumber).toBe(normal.items[0].packetNumber);
    expect(fifty.items[0].storageLocation).toBe(normal.items[0].storageLocation);
  });

  it("T13: Double-halving prevention — no monetary field becomes 25%", () => {
    // Normal mode project
    const normal = projectLoan(sampleLoan, "NORMAL");
    expect(normal.principalAmount.toString()).toBe("75000");

    // FIFTY_PERCENT mode project once
    const fifty = projectLoan(sampleLoan, "FIFTY_PERCENT");
    expect(fifty.principalAmount.toString()).toBe("37500");

    // Input model remains unmodified in memory / db
    expect(sampleLoan.principalAmount.toString()).toBe("75000");
    expect(sampleLoan.items[0].assessedValue.toString()).toBe("100000");

    // Checking that calling pure domain functions does not halve
    // E.g. invertMonetaryInputDecimal returns the exact doubled amount
    const inverted = invertMonetaryInputDecimal(fifty.principalAmount, "FIFTY_PERCENT");
    expect(inverted.toString()).toBe("75000");
  });

  it("T14: Database integrity — original source object is never mutated", () => {
    const originalPrincipal = sampleLoan.principalAmount.toString();
    const originalAssessed = sampleLoan.totalAssessedValue.toString();

    projectLoan(sampleLoan, "FIFTY_PERCENT");

    expect(sampleLoan.principalAmount.toString()).toBe(originalPrincipal);
    expect(sampleLoan.totalAssessedValue.toString()).toBe(originalAssessed);
  });

  it("T15: Payment input contract — FIFTY_PERCENT displayed input is inverted back to true amount", () => {
    // In FIFTY_PERCENT mode, user sees ₹50,000 outstanding balance (true is ₹100,000).
    // 1. Standard payment: User types ₹5,000 in payment input box.
    const displayedInput = new Decimal("5000.00");
    const trueAmount50 = invertMonetaryInputDecimal(displayedInput, "FIFTY_PERCENT");
    expect(trueAmount50.toString()).toBe("10000");

    // In NORMAL mode, server preserves 1:1
    const trueAmountNormal = invertMonetaryInputDecimal(displayedInput, "NORMAL");
    expect(trueAmountNormal.toString()).toBe("5000");

    // Number variation
    expect(invertMonetaryInputNumber(5000, "FIFTY_PERCENT")).toBe(10000);
    expect(invertMonetaryInputNumber(5000, "NORMAL")).toBe(5000);

    // 2. Decimal payment: User enters ₹1,234.56
    const decimalInput = new Decimal("1234.56");
    const trueDecimal = invertMonetaryInputDecimal(decimalInput, "FIFTY_PERCENT");
    expect(trueDecimal.toString()).toBe("2469.12");

    // 3. Payment near outstanding principal: User enters ₹49,999.50
    const nearFullInput = new Decimal("49999.50");
    const trueNearFull = invertMonetaryInputDecimal(nearFullInput, "FIFTY_PERCENT");
    expect(trueNearFull.toString()).toBe("99999");

    // 4. Payment equal to displayed outstanding balance: User enters ₹50,000.00
    const fullBalanceInput = new Decimal("50000.00");
    const trueFullBalance = invertMonetaryInputDecimal(fullBalanceInput, "FIFTY_PERCENT");
    expect(trueFullBalance.toString()).toBe("100000");
  });

  it("Dashboard & Reports projection: preserves counts and halving monetary metrics", () => {
    const sampleDashboard = {
      activeCount: 15,
      overdueCount: 3,
      closedCount: 5,
      totalAUM: "1000000.00",
      overdueAmount: "150000.00",
      dueIn7Days: 2,
      dueIn30Days: 8,
      avgLtv: "78.5",
      weeklyInterestAccrued: "3500.00",
      disbursedToday: { count: 2, amount: "120000.00" },
      disbursedWeek: { count: 7, amount: "450000.00" },
      collectionsToday: { count: 4, amount: "50000.00" },
      customerCount: 20,
    };

    const projectedStats = projectDashboardStats(sampleDashboard, "FIFTY_PERCENT");

    // Monetary fields halved
    expect(projectedStats.totalAUM).toBe("500000");
    expect(projectedStats.overdueAmount).toBe("75000");
    expect(projectedStats.weeklyInterestAccrued).toBe("1750");
    expect(projectedStats.disbursedToday.amount).toBe("60000");
    expect(projectedStats.disbursedWeek.amount).toBe("225000");
    expect(projectedStats.collectionsToday.amount).toBe("25000");

    // Non-monetary counts and LTV strictly preserved
    expect(projectedStats.activeCount).toBe(15);
    expect(projectedStats.overdueCount).toBe(3);
    expect(projectedStats.closedCount).toBe(5);
    expect(projectedStats.dueIn7Days).toBe(2);
    expect(projectedStats.dueIn30Days).toBe(8);
    expect(projectedStats.avgLtv).toBe("78.5");
    expect(projectedStats.customerCount).toBe(20);
    expect(projectedStats.disbursedToday.count).toBe(2);
    expect(projectedStats.disbursedWeek.count).toBe(7);
    expect(projectedStats.collectionsToday.count).toBe(4);
  });
});
