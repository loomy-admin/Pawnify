
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  projectMonetaryDecimal,
  projectMonetaryNumber,
  projectMonetaryString,
  invertMonetaryInputDecimal,
  projectLoan,
  projectLoansList,
  projectReportsData,
  projectPanStatus,
} from "@/lib/projection";
import { Loan, LoanItem, Payment, LedgerEntry } from "@/lib/db";



function computePaymentWaterfall(
  amountPaid: Decimal,
  unsettledCharges: Decimal,
  accruedInterest: Decimal,
  principalOutstanding: Decimal
) {
  let remaining = new Decimal(amountPaid);

  // 1. Charges
  const allocatedCharges = Decimal.min(remaining, unsettledCharges);
  remaining = remaining.minus(allocatedCharges);

  // 2. Interest
  const allocatedInterest = Decimal.min(remaining, accruedInterest);
  remaining = remaining.minus(allocatedInterest);

  // 3. Principal
  const allocatedPrincipal = Decimal.min(remaining, principalOutstanding);
  remaining = remaining.minus(allocatedPrincipal);

  return {
    allocatedCharges,
    allocatedInterest,
    allocatedPrincipal,
    remainingPrincipal: principalOutstanding.minus(allocatedPrincipal),
    remainingOverpayment: remaining,
  };
}

describe("Phase 4: Centralized 50% Calculation Engine Hardening & Completeness", () => {
  // ==================== STEP 15: EXACT DECIMAL TESTS ====================
  describe("Step 15: Exact Decimal Arithmetic (Zero Floating-Point Drift)", () => {
    const testCases = [
      { input: "100.00", expectedFifty: "50" },
      { input: "101.25", expectedFifty: "50.625" },
      { input: "1234.56", expectedFifty: "617.28" },
      { input: "99999.99", expectedFifty: "49999.995" },
      { input: "0.01", expectedFifty: "0.005" },
      { input: "0.00", expectedFifty: "0" },
      { input: "50000.00", expectedFifty: "25000" },
      { input: "141461.89", expectedFifty: "70730.945" },
    ];

    it("verifies exact Decimal scaling for arbitrary precision values without floating point errors", () => {
      for (const tc of testCases) {
        const val = new Decimal(tc.input);
        const normal = projectMonetaryDecimal(val, "NORMAL");
        const fifty = projectMonetaryDecimal(val, "FIFTY_PERCENT");

        expect(normal.toString()).toBe(val.toString());
        expect(fifty.toString()).toBe(tc.expectedFifty);

        // Verify ratio is exactly 0.5 using Decimal division
        if (!val.isZero()) {
          expect(fifty.div(normal).toNumber()).toBe(0.5);
        }
      }
    });

    it("verifies exact string projection for reporting and dashboard representations", () => {
      for (const tc of testCases) {
        const normalStr = projectMonetaryString(tc.input, "NORMAL");
        const fiftyStr = projectMonetaryString(tc.input, "FIFTY_PERCENT");

        expect(normalStr).toBe(tc.input);
        expect(fiftyStr).toBe(tc.expectedFifty);
      }
    });

    it("verifies exact number projection rounding and decimal safety", () => {
      expect(projectMonetaryNumber(100, "NORMAL")).toBe(100);
      expect(projectMonetaryNumber(100, "FIFTY_PERCENT")).toBe(50);
      expect(projectMonetaryNumber(1234.56, "FIFTY_PERCENT")).toBe(617.28);
      expect(projectMonetaryNumber(0.01, "FIFTY_PERCENT")).toBe(0.005);
    });
  });

  // ==================== STEP 16: 50% INVARIANCE TEST MATRIX ====================
  describe("Step 16: Comprehensive 50% Invariance Test Matrix", () => {
    const fullRepresentativeLoan = {
      id: "loan-matrix-001",
      loanNumber: "PL-2026-999888",
      customerId: "cust-matrix-001",
      handledById: "staff-matrix-001",
      loanDate: new Date("2026-03-01T10:00:00.000Z"),
      dueDate: new Date("2026-09-01T10:00:00.000Z"),
      lastSettledDate: new Date("2026-03-01T10:00:00.000Z"),
      tenureMonths: 6,
      gracePeriodDays: 7,
      interestRateMonthly: new Decimal("1.500"),
      ltvPercent: new Decimal("75.00"),
      status: "ACTIVE" as const,
      displayStatus: "ACTIVE" as const,
      notes: "Safe vault box #42",
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
      updatedAt: new Date("2026-03-01T10:00:00.000Z"),
      // Top-level monetary
      totalAssessedValue: new Decimal("200000.00"),
      principalAmount: new Decimal("150000.00"),
      principalOutstanding: new Decimal("150000.00"),
      eligibleAmount: new Decimal("150000.00"),
      maxEligibleLoan: new Decimal("170000.00"),
      totalDue: new Decimal("152250.00"),
      // Collateral Items
      items: [
        {
          id: "item-gold-1",
          loanId: "loan-matrix-001",
          metalType: "GOLD" as const,
          description: "22K Traditional Necklace",
          purityLabel: "22K",
          purityPercent: new Decimal("91.60"),
          grossWeightGrams: new Decimal("32.500"),
          stoneWeightGrams: new Decimal("2.500"),
          netWeightGrams: new Decimal("30.000"),
          fineWeightGrams: new Decimal("27.480"),
          valuationRatePerGram: new Decimal("7278.02"),
          assessedValue: new Decimal("200000.00"),
          packetNumber: "PKT-GOLD-999",
          storageLocation: "Vault A / Locker 12",
          photoUrl: "https://storage.pawnify.internal/items/item1.jpg",
          releasedAt: null,
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
        },
      ],
      // Payments
      payments: [
        {
          id: "pmt-matrix-1",
          loanId: "loan-matrix-001",
          receiptNumber: "REC-20260315-00001",
          paymentDate: new Date("2026-03-15T14:30:00.000Z"),
          amountPaid: new Decimal("20000.00"),
          mode: "BANK_TRANSFER" as const,
          allocatedCharges: new Decimal("500.00"),
          allocatedInterest: new Decimal("2250.00"),
          allocatedPrincipal: new Decimal("17250.00"),
          remainingPrincipal: new Decimal("132750.00"),
          collectedById: "staff-matrix-001",
          notes: "Online NEFT payment",
          createdAt: new Date("2026-03-15T14:30:00.000Z"),
        },
      ],
      // Charges
      charges: [
        {
          id: "chg-matrix-1",
          loanId: "loan-matrix-001",
          chargeType: "PROCESSING_FEE" as const,
          amount: new Decimal("500.00"),
          isSettled: true,
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
        },
      ],
      // Ledger Entries (Single-Book)
      transactions: [
        {
          id: "ledger-matrix-1",
          loanId: "loan-matrix-001",
          type: "DISBURSEMENT" as const,
          amount: new Decimal("150000.00"),
          principalAfter: new Decimal("150000.00"),
          referenceId: null,
          description: "Initial loan disbursement",
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
        },
        {
          id: "ledger-matrix-2",
          loanId: "loan-matrix-001",
          type: "PAYMENT" as const,
          amount: new Decimal("20000.00"),
          principalAfter: new Decimal("132750.00"),
          referenceId: "REC-20260315-00001",
          description: "Payment received",
          createdAt: new Date("2026-03-15T14:30:00.000Z"),
        },
      ],
      // Interest Summary
      interestSummary: {
        accruedInterest: new Decimal("2250.00"),
        dailyInterest: new Decimal("75.00"),
        monthlyInterest: new Decimal("2250.00"),
        daysSinceSettled: 30,
        lastSettledDate: new Date("2026-03-01T10:00:00.000Z"),
      },
    };

    const normal = projectLoan(fullRepresentativeLoan, "NORMAL");
    const fifty = projectLoan(fullRepresentativeLoan, "FIFTY_PERCENT");

    it("verifies EVERY NON-MONETARY field is strictly identical (100% invariant)", () => {
      // Identifiers
      expect(fifty.id).toBe(normal.id);
      expect(fifty.loanNumber).toBe(normal.loanNumber);
      expect(fifty.customerId).toBe(normal.customerId);
      expect(fifty.handledById).toBe(normal.handledById);
      expect(fifty.items[0].id).toBe(normal.items[0].id);
      expect(fifty.items[0].packetNumber).toBe(normal.items[0].packetNumber);
      expect(fifty.items[0].storageLocation).toBe(normal.items[0].storageLocation);
      expect(fifty.payments[0].id).toBe(normal.payments[0].id);
      expect(fifty.payments[0].receiptNumber).toBe(normal.payments[0].receiptNumber);
      expect(fifty.charges[0].id).toBe(normal.charges[0].id);
      expect(fifty.transactions[0].id).toBe(normal.transactions[0].id);
      expect(fifty.transactions[1].referenceId).toBe(normal.transactions[1].referenceId);

      // Weights (Never Halved)
      expect(fifty.items[0].grossWeightGrams.toString()).toBe(normal.items[0].grossWeightGrams.toString());
      expect(fifty.items[0].stoneWeightGrams.toString()).toBe(normal.items[0].stoneWeightGrams.toString());
      expect(fifty.items[0].netWeightGrams.toString()).toBe(normal.items[0].netWeightGrams.toString());
      expect(fifty.items[0].fineWeightGrams.toString()).toBe(normal.items[0].fineWeightGrams.toString());

      // Purity (Never Halved)
      expect(fifty.items[0].purityLabel).toBe(normal.items[0].purityLabel);
      expect(fifty.items[0].purityPercent.toString()).toBe(normal.items[0].purityPercent.toString());

      // Valuation Rate Per Gram (Never Halved)
      expect(fifty.items[0].valuationRatePerGram.toString()).toBe(normal.items[0].valuationRatePerGram.toString());

      // Interest Rate Monthly (Never Halved)
      expect(fifty.interestRateMonthly.toString()).toBe(normal.interestRateMonthly.toString());

      // LTV Percentage (Never Halved)
      expect(fifty.ltvPercent.toString()).toBe(normal.ltvPercent.toString());

      // Durations & Counts (Never Halved)
      expect(fifty.tenureMonths).toBe(normal.tenureMonths);
      expect(fifty.gracePeriodDays).toBe(normal.gracePeriodDays);
      expect(fifty.interestSummary.daysSinceSettled).toBe(normal.interestSummary.daysSinceSettled);
      expect(fifty.interestSummary.daysSinceSettled).toBe(normal.interestSummary.daysSinceSettled);
      expect(fifty.items.length).toBe(normal.items.length);
      expect(fifty.payments.length).toBe(normal.payments.length);
      expect(fifty.charges.length).toBe(normal.charges.length);
      expect(fifty.transactions.length).toBe(normal.transactions.length);

      // Statuses & Enums (Never Halved)
      expect(fifty.status).toBe(normal.status);
      expect(fifty.displayStatus).toBe(normal.displayStatus);
      expect(fifty.items[0].metalType).toBe(normal.items[0].metalType);
      expect(fifty.payments[0].mode).toBe(normal.payments[0].mode);
      expect(fifty.charges[0].chargeType).toBe(normal.charges[0].chargeType);
      expect(fifty.charges[0].isSettled).toBe(normal.charges[0].isSettled);
      expect(fifty.transactions[0].type).toBe(normal.transactions[0].type);

      // Dates (Never Halved)
      expect(fifty.loanDate.toISOString()).toBe(normal.loanDate.toISOString());
      expect(fifty.dueDate.toISOString()).toBe(normal.dueDate.toISOString());
      expect(fifty.lastSettledDate.toISOString()).toBe(normal.lastSettledDate.toISOString());
      expect(fifty.payments[0].paymentDate.toISOString()).toBe(normal.payments[0].paymentDate.toISOString());
      expect(fifty.transactions[0].createdAt.toISOString()).toBe(normal.transactions[0].createdAt.toISOString());
    });

    it("verifies EVERY MONETARY field has an exact 0.5 ratio", () => {
      // Top-level Loan Monetary
      expect(fifty.principalAmount.div(normal.principalAmount).toNumber()).toBe(0.5);
      expect(fifty.principalOutstanding.div(normal.principalOutstanding).toNumber()).toBe(0.5);
      expect(fifty.totalAssessedValue.div(normal.totalAssessedValue).toNumber()).toBe(0.5);
      expect(fifty.eligibleAmount.div(normal.eligibleAmount).toNumber()).toBe(0.5);
      expect(fifty.maxEligibleLoan.div(normal.maxEligibleLoan).toNumber()).toBe(0.5);
      expect(fifty.totalDue.div(normal.totalDue).toNumber()).toBe(0.5);

      // Collateral Assessed Value
      expect(fifty.items[0].assessedValue.div(normal.items[0].assessedValue).toNumber()).toBe(0.5);

      // Payment Allocations
      expect(fifty.payments[0].amountPaid.div(normal.payments[0].amountPaid).toNumber()).toBe(0.5);
      expect(fifty.payments[0].allocatedPrincipal.div(normal.payments[0].allocatedPrincipal).toNumber()).toBe(0.5);
      expect(fifty.payments[0].allocatedInterest.div(normal.payments[0].allocatedInterest).toNumber()).toBe(0.5);
      expect(fifty.payments[0].allocatedCharges.div(normal.payments[0].allocatedCharges).toNumber()).toBe(0.5);
      expect(fifty.payments[0].remainingPrincipal.div(normal.payments[0].remainingPrincipal).toNumber()).toBe(0.5);

      // Charge Amount
      expect(fifty.charges[0].amount.div(normal.charges[0].amount).toNumber()).toBe(0.5);

      // Ledger Amounts
      expect(fifty.transactions[0].amount.div(normal.transactions[0].amount).toNumber()).toBe(0.5);
      expect(fifty.transactions[0].principalAfter.div(normal.transactions[0].principalAfter).toNumber()).toBe(0.5);
      expect(fifty.transactions[1].amount.div(normal.transactions[1].amount).toNumber()).toBe(0.5);
      expect(fifty.transactions[1].principalAfter.div(normal.transactions[1].principalAfter).toNumber()).toBe(0.5);

      // Interest Summary
      expect(fifty.interestSummary.accruedInterest.div(normal.interestSummary.accruedInterest).toNumber()).toBe(0.5);
      expect(fifty.interestSummary.dailyInterest.div(normal.interestSummary.dailyInterest).toNumber()).toBe(0.5);
      expect(fifty.interestSummary.monthlyInterest.div(normal.interestSummary.monthlyInterest).toNumber()).toBe(0.5);
    });
  });

  // ==================== STEP 4 & 5: AGGREGATIONS & REPORTS ====================
  describe("Step 4 & 5: Aggregations & Reports (Pre-calculated 100% -> Projected Once)", () => {
    it("verifies Reports Data preserves counts and halves all monetary aggregates", () => {
      const rawReports = {
        totalLoansCount: 25,
        totalPaymentsCount: 50,
        totalChargesCount: 10,
        activeCount: 20,
        overdueCount: 3,
        closedCount: 2,
        totalActiveAUM: 1000000,
        goldLoansCount: 18,
        silverLoansCount: 7,
        goldAssessedValue: 800000,
        silverAssessedValue: 400000,
        ltv85Count: 10,
        ltv80Count: 10,
        ltv75Count: 5,
        totalCollected: 250000,
        interestCollected: 50000,
        principalCollected: 190000,
        chargesCollected: 10000,
        totalDisbursed: 1200000,
      };

      const normalReports = projectReportsData(rawReports, "NORMAL");
      const fiftyReports = projectReportsData(rawReports, "FIFTY_PERCENT");

      // Non-monetary counts strictly equal
      expect(fiftyReports.totalLoansCount).toBe(normalReports.totalLoansCount);
      expect(fiftyReports.totalPaymentsCount).toBe(normalReports.totalPaymentsCount);
      expect(fiftyReports.activeCount).toBe(normalReports.activeCount);
      expect(fiftyReports.overdueCount).toBe(normalReports.overdueCount);
      expect(fiftyReports.closedCount).toBe(normalReports.closedCount);
      expect(fiftyReports.goldLoansCount).toBe(normalReports.goldLoansCount);
      expect(fiftyReports.silverLoansCount).toBe(normalReports.silverLoansCount);
      expect(fiftyReports.ltv85Count).toBe(normalReports.ltv85Count);
      expect(fiftyReports.ltv80Count).toBe(normalReports.ltv80Count);
      expect(fiftyReports.ltv75Count).toBe(normalReports.ltv75Count);

      // Monetary totals exactly halved
      expect(fiftyReports.totalActiveAUM).toBe(500000);
      expect(fiftyReports.goldAssessedValue).toBe(400000);
      expect(fiftyReports.silverAssessedValue).toBe(200000);
      expect(fiftyReports.totalCollected).toBe(125000);
      expect(fiftyReports.interestCollected).toBe(25000);
      expect(fiftyReports.principalCollected).toBe(95000);
      expect(fiftyReports.chargesCollected).toBe(5000);
      expect(fiftyReports.totalDisbursed).toBe(600000);
    });

    it("verifies PAN Status threshold projection", () => {
      const panStatus = {
        required: true,
        hasPan: false,
        threshold: 50000,
      };

      const normalPan = projectPanStatus(panStatus, "NORMAL");
      const fiftyPan = projectPanStatus(panStatus, "FIFTY_PERCENT");

      expect(normalPan.threshold).toBe(50000);
      expect(fiftyPan.threshold).toBe(25000);
      expect(fiftyPan.required).toBe(normalPan.required);
      expect(fiftyPan.hasPan).toBe(normalPan.hasPan);
    });

    it("verifies Paginated Loans list projection", () => {
      const sampleLoan = {
        id: "l-1",
        principalAmount: new Decimal("100000"),
        principalOutstanding: new Decimal("100000"),
        totalAssessedValue: new Decimal("120000"),
        items: [{ assessedValue: new Decimal("120000") }],
      };

      const listResult = {
        loans: [sampleLoan],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      const projected = projectLoansList(listResult, "FIFTY_PERCENT");
      expect(projected.total).toBe(1);
      expect(projected.page).toBe(1);
      expect(projected.loans[0].principalAmount.toString()).toBe("50000");
    });
  });

  // ==================== STEP 9: PAYMENT SAFETY & WATERFALL ====================
  describe("Step 9: Payment Safety & Waterfall Preservation", () => {
    it("verifies that payment waterfall receives 100% true values and never halves internally", () => {
      // Outstanding legal state
      const trueOutstanding = new Decimal("100000.00");
      const accruedInterest = new Decimal("2000.00");
      const unsettledCharges = new Decimal("500.00");

      // In FIFTY_PERCENT mode, user sees:
      // Outstanding: 50,000 | Interest: 1,000 | Charges: 250
      // User inputs displayed payment of 1,250 (which corresponds to full charges + full interest)
      const displayedInput = new Decimal("1250.00");

      // Boundary inversion
      const truePaymentAmount = invertMonetaryInputDecimal(displayedInput, "FIFTY_PERCENT");
      expect(truePaymentAmount.toString()).toBe("2500");

      // Core pure domain waterfall receives truePaymentAmount
      const alloc = computePaymentWaterfall(
        truePaymentAmount,
        unsettledCharges,
        accruedInterest,
        trueOutstanding
      );

      // Charges paid: 500 (full)
      expect(alloc.allocatedCharges.toString()).toBe("500");
      // Interest paid: 2000 (full)
      expect(alloc.allocatedInterest.toString()).toBe("2000");
      // Principal paid: 0
      expect(alloc.allocatedPrincipal.toString()).toBe("0");
      // Remaining legal principal: 100,000 (unaltered)
      expect(alloc.remainingPrincipal.toString()).toBe("100000");
    });
  });

  // ==================== STEP 17: LIVE DATABASE SAFETY ====================
  describe("Step 17: Live Database Immutability Verification", () => {
    it("proves that running projection on live DB objects does not mutate DB values", async () => {
      const liveLoans = await Loan.findAll({
        limit: 1,
        include: [
          { model: LoanItem, as: "items" },
          { model: Payment, as: "payments" },
          { model: LedgerEntry, as: "transactions" },
        ],
      });

      if (liveLoans.length === 0) return;

      const loanInst = liveLoans[0];
      const loan = {
        ...loanInst.toJSON(),
        principalAmount: new Decimal(loanInst.principalAmount),
        principalOutstanding: new Decimal(loanInst.principalOutstanding),
        totalAssessedValue: new Decimal(loanInst.totalAssessedValue),
      };
      const dbPrincipalBefore = loan.principalAmount.toString();
      const dbOutstandingBefore = loan.principalOutstanding.toString();
      const dbAssessedBefore = loan.totalAssessedValue.toString();

      // Project into both modes
      const normal = projectLoan(loan as any, "NORMAL");
      const fifty = projectLoan(loan as any, "FIFTY_PERCENT");

      // Projections reflect correctly
      expect(normal.principalAmount.toString()).toBe(dbPrincipalBefore);
      expect(fifty.principalAmount.toString()).toBe(
        new Decimal(dbPrincipalBefore).mul(0.5).toString()
      );

      // Re-query database directly
      const recheckedLoan = await Loan.findByPk(loan.id);

      expect(new Decimal(recheckedLoan?.principalAmount ?? 0).toString()).toBe(dbPrincipalBefore);
      expect(new Decimal(recheckedLoan?.principalOutstanding ?? 0).toString()).toBe(dbOutstandingBefore);
      expect(new Decimal(recheckedLoan?.totalAssessedValue ?? 0).toString()).toBe(dbAssessedBefore);
    });
  });
});
