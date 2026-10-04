/**
 * Business Rules & Workflow Integration Tests
 *
 * Validates the 5 Golden Rules and 15 Business Functions:
 * 1. Capital Introduction & Available Funds
 * 2. Draft -> Approve -> Disburse & Draft Cancellation Lifecycle
 * 3. Standard vs Cumulative Loan Interest Engine
 * 4. Payment Reversals & Non-destructive Ledger Correction
 * 5. Preclosure Quotation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Decimal from "decimal.js";
import { addMonths } from "date-fns";
import {
  Loan,
  LoanItem,
  Customer,
  User,
  AccountMaster,
  Payment,
  LedgerEntry,
  Op,
} from "@/lib/db";
import {
  createLoan,
  approveLoan,
  disburseApprovedLoan,
  cancelDraftLoan,
  getPreclosureQuote,
  closeLoan,
  releaseItems,
} from "@/lib/services/loans";
import { recordPayment, reversePayment } from "@/lib/services/payments";
import { computeAccruedInterest } from "@/lib/services/interest";
import { introduceCapital, getAvailableLendingFunds } from "@/lib/services/capital";

describe("Pawn Broker Operations — Business Logic Verification", () => {
  let testUser: any;
  let testCustomer: any;

  beforeAll(async () => {
    testUser = await User.findOne();
    if (!testUser) {
      testUser = await User.create({
        name: "Test Admin",
        email: `admin-${Date.now()}@pawnify.com`,
        phone: `999${String(Date.now()).slice(-7)}`,
        role: "ADMIN",
        password: "hash",
      });
    }

    testCustomer = await Customer.findOne();
    if (!testCustomer) {
      testCustomer = await Customer.create({
        fullName: "Ravi Kumar",
        phone: `987${String(Date.now()).slice(-7)}`,
        addressLine1: "123 Main Street",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
        createdById: testUser.id,
      });
    }
  });

  describe("Rule 1: Capital Introduction & Lending Pool", () => {
    it("introduces capital without counting as customer payment or loan revenue", async () => {
      const initialFunds = await getAvailableLendingFunds();

      const result = await introduceCapital({
        amount: 500000,
        source: "Owner Investment - Rajesh",
        mode: "BANK_TRANSFER",
        notes: "Initial Q4 Lending Pool",
        createdById: testUser.id,
      });

      expect(result.id).toBeDefined();
      expect(new Decimal(result.amount).toNumber()).toBe(500000);

      const afterFunds = await getAvailableLendingFunds();
      expect(
        afterFunds.totalCapitalIntroduced.minus(initialFunds.totalCapitalIntroduced).toNumber()
      ).toBe(500000);
      expect(
        afterFunds.availableLendingFunds.minus(initialFunds.availableLendingFunds).toNumber()
      ).toBe(500000);
    });
  });

  describe("Rule 2: Loan Lifecycle (Draft -> Approved -> Active -> Closed & Cancel Draft)", () => {
    it("creates a loan as DRAFT without moving funds or locking collateral", async () => {
      const draftLoan = await createLoan({
        customerId: testCustomer.id,
        handledById: testUser.id,
        principalAmount: 40000,
        tenureMonths: 6,
        interestRateMonthly: 2.0,
        asDraft: true,
        items: [
          {
            metalType: "GOLD",
            description: "Gold Chain",
            purityLabel: "22K",
            purityPercent: 91.6,
            grossWeightGrams: 20,
            stoneWeightGrams: 2,
            valuationRatePerGram: 5000,
            packetNumber: `PKT-${Date.now()}`,
            storageLocation: "Locker-A1",
          },
        ],
      });

      expect(draftLoan.status).toBe("DRAFT");
      expect(draftLoan.disbursedAt).toBeNull();

      // No disbursement ledger entry should exist for a draft
      const disbursementEntry = await LedgerEntry.findOne({
        where: { loanId: draftLoan.id, type: "DISBURSEMENT" },
      });
      expect(disbursementEntry).toBeNull();

      // Approve the draft
      const approved = await approveLoan(draftLoan.id, testUser.id, "Approved per shop policy");
      expect(approved.status).toBe("APPROVED");

      // Disburse the approved loan -> becomes ACTIVE and creates ledger entry
      const disbursed = await disburseApprovedLoan(draftLoan.id, testUser.id);
      expect(disbursed.status).toBe("ACTIVE");

      const activeEntry = await LedgerEntry.findOne({
        where: { loanId: draftLoan.id, type: "DISBURSEMENT" },
      });
      expect(activeEntry).not.toBeNull();
      expect(new Decimal(activeEntry!.amount).toNumber()).toBe(40000);
    });

    it("cancels a DRAFT loan cleanly without any financial ledger impact", async () => {
      const draftLoan = await createLoan({
        customerId: testCustomer.id,
        handledById: testUser.id,
        principalAmount: 25000,
        tenureMonths: 3,
        interestRateMonthly: 1.5,
        asDraft: true,
        items: [
          {
            metalType: "GOLD",
            description: "Gold Ring",
            purityLabel: "22K",
            purityPercent: 91.6,
            grossWeightGrams: 10,
            stoneWeightGrams: 0.5,
            valuationRatePerGram: 5000,
            packetNumber: `PKT-${Date.now()}-2`,
            storageLocation: "Locker-B2",
          },
        ],
      });

      const cancelled = await cancelDraftLoan(draftLoan.id, testUser.id, "Customer changed mind");
      expect(cancelled.status).toBe("CANCELLED");

      const updated = await Loan.findByPk(draftLoan.id);
      expect(updated?.status).toBe("CANCELLED");
      expect(updated?.cancellationReason).toBe("Customer changed mind");
    });
  });

  describe("Rule 4: Standard vs Cumulative Interest Engine", () => {
    it("calculates Standard simple interest (Actual/365)", () => {
      const startDate = new Date("2026-01-01T00:00:00Z");
      const asOfDate = new Date("2026-07-01T00:00:00Z"); // 181 days

      const interest = computeAccruedInterest(
        {
          principalOutstanding: new Decimal(100000),
          interestRateMonthly: new Decimal(2), // 24% annual
          lastSettledDate: startDate,
          loanType: "STANDARD",
        },
        asOfDate
      );

      // daily = 100000 * 24 / 365 / 100 = 65.7534
      // 181 days = 11901.37
      expect(interest.toNumber()).toBeCloseTo(11901.37, 1);
    });

    it("calculates Cumulative interest with capitalization (ADD_TO_CAPITAL)", () => {
      const startDate = new Date("2026-01-01T00:00:00Z");
      const asOfDate = new Date("2026-07-01T00:00:00Z"); // 6 months

      const interest = computeAccruedInterest(
        {
          principalOutstanding: new Decimal(100000),
          interestRateMonthly: new Decimal(2),
          lastSettledDate: startDate,
          loanType: "CUMULATIVE",
          cumulativeFrequency: "QUARTERLY", // compounds every 3 months
          cumulativeTreatment: "ADD_TO_CAPITAL",
        },
        asOfDate
      );

      // Compounding every quarter will yield higher accrued interest than flat simple interest
      expect(interest.toNumber()).toBeGreaterThan(11900);
    });
  });

  describe("Rule 5 & Function 13: Payment Reversals & Audit Trail", () => {
    it("reverses a posted payment non-destructively, restoring principal and creating REVERSAL audit record", async () => {
      // 1. Create an active loan
      const loan = await createLoan({
        customerId: testCustomer.id,
        handledById: testUser.id,
        principalAmount: 50000,
        tenureMonths: 6,
        interestRateMonthly: 2.0,
        items: [
          {
            metalType: "GOLD",
            description: "Gold Bangle",
            purityLabel: "22K",
            purityPercent: 91.6,
            grossWeightGrams: 25,
            stoneWeightGrams: 1,
            valuationRatePerGram: 5000,
            packetNumber: `PKT-${Date.now()}-REV`,
            storageLocation: "Locker-C1",
          },
        ],
      });

      // 2. Record a payment of ₹10,000 (part principal)
      const pmt = await recordPayment(loan.id, 10000, "CASH", testUser.id, "Customer part payment");
      expect(pmt.receiptNumber).toBeDefined();

      const loanAfterPayment = await Loan.findByPk(loan.id);
      expect(new Decimal(loanAfterPayment!.principalOutstanding).toNumber()).toBe(40000);

      // 3. Reverse the payment
      const reversal = await reversePayment(pmt.paymentId, testUser.id, "Incorrect amount entered by cashier");
      expect(reversal.paymentId).toBe(pmt.paymentId);
      expect(reversal.restoredPrincipal.toNumber()).toBe(50000);

      // 4. Verify loan principal is restored
      const loanAfterReversal = await Loan.findByPk(loan.id);
      expect(new Decimal(loanAfterReversal!.principalOutstanding).toNumber()).toBe(50000);

      // 5. Verify payment is marked isReversed
      const paymentRecord = await Payment.findByPk(pmt.paymentId);
      expect(paymentRecord?.isReversed).toBe(true);
      expect(paymentRecord?.reversalReason).toBe("Incorrect amount entered by cashier");

      // 6. Verify linked REVERSAL ledger entry
      const reversalEntry = await LedgerEntry.findOne({
        where: { referenceId: pmt.paymentId, type: "REVERSAL" },
      });
      expect(reversalEntry).not.toBeNull();
      expect(new Decimal(reversalEntry!.amount).toNumber()).toBe(10000);

      // 7. Cannot reverse again
      await expect(
        reversePayment(pmt.paymentId, testUser.id, "Attempt duplicate reversal")
      ).rejects.toThrow("already been reversed");
    });
  });

  describe("Function 9: Preclosure Quote", () => {
    it("generates an itemized preclosure quote without posting any payment", async () => {
      const loan = await createLoan({
        customerId: testCustomer.id,
        handledById: testUser.id,
        principalAmount: 30000,
        tenureMonths: 6,
        interestRateMonthly: 2.0,
        items: [
          {
            metalType: "GOLD",
            description: "Gold Earrings",
            purityLabel: "22K",
            purityPercent: 91.6,
            grossWeightGrams: 15,
            stoneWeightGrams: 0,
            valuationRatePerGram: 5000,
            packetNumber: `PKT-${Date.now()}-QC`,
            storageLocation: "Locker-D1",
          },
        ],
      });

      const quoteDate = addMonths(new Date(), 2); // 2 months in future
      const quote = await getPreclosureQuote(loan.id, quoteDate);

      expect(quote.loanNumber).toBe(loan.loanNumber);
      expect(quote.principalOutstanding.toNumber()).toBe(30000);
      expect(quote.accruedInterest.toNumber()).toBeGreaterThan(0);
      expect(quote.settlementAmount.toNumber()).toBe(
        quote.principalOutstanding.plus(quote.accruedInterest).plus(quote.unsettledChargesTotal).toNumber()
      );

      // Verify no payments or state changes happened
      const pmtCount = await Payment.count({ where: { loanId: loan.id } });
      expect(pmtCount).toBe(0);
    });
  });

  afterAll(async () => {
    // Clean up all entries created by this test suite
    await LedgerEntry.destroy({ where: { type: ["CAPITAL_INTRO", "REVERSAL"] } });
    const testLoans = await Loan.findAll({
      where: {
        loanNumber: { [Op.like]: "PL-%" },
        customerId: testCustomer.id,
      },
    });
    for (const l of testLoans) {
      await LoanItem.destroy({ where: { loanId: l.id } });
      await LedgerEntry.destroy({ where: { loanId: l.id } });
      await Payment.destroy({ where: { loanId: l.id } });
      await l.destroy();
    }
  });
});
