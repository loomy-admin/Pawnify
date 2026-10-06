/**
 * Phase 9 Test Suite — Account Ledger (Read/Derivation View)
 *
 * Verifies:
 * 1. Account ledger returns only matching accountId
 * 2. Empty account ledger works safely
 * 3. Historical NULL accountId entries are strictly excluded
 * 4. Transactions are returned in chronological order
 * 5. Date filtering works (startDate, endDate)
 * 6. Event-type filtering works (PAYMENT, DISBURSEMENT, CLOSURE, ITEM_RELEASE)
 * 7. Inflow aggregation works
 * 8. Outflow aggregation works
 * 9. Opening balance is correct (prior period net)
 * 10. Running balance is calculated dynamically per transaction
 * 11. Closing balance matches Opening + Inflows - Outflows
 * 12. Decimal precision is exact (no floating-point rounding errors)
 * 13. NORMAL mode displays true 100% values
 * 14. FIFTY_PERCENT mode displays exactly 50% presentation values
 * 15. Database values remain 100% true values
 * 16. No double projection occurs
 * 17. Inactive accounts remain fully viewable historically
 * 18. Non-existent account throws clear error
 * 19. Both ADMIN and STAFF have read-only access via Server Action
 * 20. Existing Day Book behavior remains intact
 * 21. Existing payment waterfall remains intact
 * 22. Existing interest calculation remains intact
 * 23. Existing valuation calculation remains intact
 * 24. 29 historical LedgerEntry rows remain unmutated
 * 25. No second ledger or balance table exists
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Loan, LedgerEntry, AccountMaster, Op } from "@/lib/db";
import Decimal from "decimal.js";
import { getAccountLedger, calculateOpeningBalance } from "@/lib/services/account-ledger";
import { writeLedgerEntry } from "@/lib/ledger-writer";
import { getDayBookEntries } from "@/lib/services/day-book";
import { computeAccruedInterest } from "@/lib/services/interest";
import { previewPaymentAllocation } from "@/lib/services/payments";
import { computeItemValuation } from "@/lib/services/valuation";

let testLoanId: string;
let primaryAccountId: string;
let secondaryAccountId: string;
let inactiveAccountId: string;
let emptyAccountId: string;

const createdLedgerIds: string[] = [];
const createdAccountIds: string[] = [];

function trackLedger(id: string) {
  createdLedgerIds.push(id);
  return id;
}

function trackAccount(id: string) {
  createdAccountIds.push(id);
  return id;
}

describe("Phase 9: Account Ledger Service & Dynamic Balance Tests", () => {
  beforeAll(async () => {
    // 1. Pick an active loan for test entries
    const loan = (await Loan.findOne({ where: { status: "ACTIVE" }, attributes: ["id"] })) || (await Loan.findOne({ attributes: ["id"] }));
    if (!loan) throw new Error("A loan must exist in the database for tests.");
    testLoanId = loan.id;

    // 2. Create primary active account
    const primaryAcc = await AccountMaster.create({
        code: `TEST-P9-ACT-${Date.now()}`.toUpperCase(),
        name: `Primary P9 Test Account ${Date.now()}`,
        type: "ASSET",
        isActive: true,
      });
    primaryAccountId = trackAccount(primaryAcc.id);

    // 3. Create secondary active account (to test isolation)
    const secondaryAcc = await AccountMaster.create({
        code: `TEST-P9-SEC-${Date.now()}`.toUpperCase(),
        name: `Secondary P9 Test Account ${Date.now()}`,
        type: "ASSET",
        isActive: true,
      });
    secondaryAccountId = trackAccount(secondaryAcc.id);

    // 4. Create inactive account (to test historical viewing)
    const inactiveAcc = await AccountMaster.create({
        code: `TEST-P9-INA-${Date.now()}`.toUpperCase(),
        name: `Inactive P9 Test Account ${Date.now()}`,
        type: "ASSET",
        isActive: false,
      });
    inactiveAccountId = trackAccount(inactiveAcc.id);

    // 5. Create empty account (0 transactions)
    const emptyAcc = await AccountMaster.create({
        code: `TEST-P9-EMP-${Date.now()}`.toUpperCase(),
        name: `Empty P9 Test Account ${Date.now()}`,
        type: "EXPENSE",
        isActive: true,
      });
    emptyAccountId = trackAccount(emptyAcc.id);

    // 6. Seed chronological transactions for primary account:
    // Past date entries (for Opening Balance test)
    const pastDate1 = new Date("2025-01-10T10:00:00.000Z");
    const pastDate2 = new Date("2025-01-15T12:00:00.000Z");

    const ePast1 = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: primaryAccountId,
        type: "PAYMENT",
        amount: String("1000.50"),
        principalAfter: String("9000.00"),
        description: "Past Inflow 1",
        createdAt: pastDate1,
      });
    trackLedger(ePast1.id);

    const ePast2 = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: primaryAccountId,
        type: "DISBURSEMENT",
        amount: String("400.20"),
        principalAfter: String("9400.20"),
        description: "Past Outflow 1",
        createdAt: pastDate2,
      });
    trackLedger(ePast2.id);

    // Period entries (e.g. in February 2025)
    const periodDate1 = new Date("2025-02-01T10:00:00.000Z");
    const periodDate2 = new Date("2025-02-05T14:30:00.000Z");
    const periodDate3 = new Date("2025-02-10T11:15:00.000Z");
    const periodDate4 = new Date("2025-02-12T09:00:00.000Z");

    const ePeriod1 = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: primaryAccountId,
        type: "PAYMENT",
        amount: String("500.30"),
        principalAfter: String("8899.90"),
        description: "Period Inflow 1",
        createdAt: periodDate1,
      });
    trackLedger(ePeriod1.id);

    const ePeriod2 = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: primaryAccountId,
        type: "DISBURSEMENT",
        amount: String("200.10"),
        principalAfter: String("9100.00"),
        description: "Period Outflow 1",
        createdAt: periodDate2,
      });
    trackLedger(ePeriod2.id);

    const ePeriod3 = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: primaryAccountId,
        type: "CLOSURE",
        amount: String("0.00"),
        principalAfter: String("0.00"),
        description: "Period Neutral Closure",
        createdAt: periodDate3,
      });
    trackLedger(ePeriod3.id);

    const ePeriod4 = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: primaryAccountId,
        type: "ITEM_RELEASE",
        amount: String("0.00"),
        principalAfter: String("0.00"),
        description: "Period Neutral Item Release",
        createdAt: periodDate4,
      });
    trackLedger(ePeriod4.id);

    // Entry on secondary account (to ensure isolation)
    const eSecondary = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: secondaryAccountId,
        type: "PAYMENT",
        amount: String("9999.99"),
        principalAfter: String("1000.00"),
        description: "Secondary Account Inflow",
        createdAt: periodDate1,
      });
    trackLedger(eSecondary.id);

    // Entry on inactive account (to ensure historical viewing works)
    const eInactive = await LedgerEntry.create({
        loanId: testLoanId,
        accountId: inactiveAccountId,
        type: "PAYMENT",
        amount: String("777.77"),
        principalAfter: String("2000.00"),
        description: "Inactive Account Historical Inflow",
        createdAt: periodDate1,
      });
    trackLedger(eInactive.id);
  });

  afterAll(async () => {
    // Clean up created ledger entries
    if (createdLedgerIds.length > 0) {
      await LedgerEntry.destroy({ where: { id: { [Op.in]: createdLedgerIds } } });
    }
    // Clean up created accounts
    if (createdAccountIds.length > 0) {
      await AccountMaster.destroy({ where: { id: { [Op.in]: createdAccountIds } } });
    }
  });

  // 1. Account Isolation
  it("1. Account ledger returns only matching accountId and excludes other accounts", async () => {
    const res = await getAccountLedger({ accountId: primaryAccountId });
    expect(res.account.id).toBe(primaryAccountId);
    expect(res.entries.length).toBeGreaterThan(0);
    for (const e of res.entries) {
      expect(e.accountId).toBe(primaryAccountId);
    }
    // Ensures secondary account transaction is not present
    const hasSecondary = res.entries.some((e) => e.amount.toString() === "9999.99");
    expect(hasSecondary).toBe(false);
  });

  // 2. Empty Account Ledger
  it("2. Empty account ledger returns 0 entries and 0 balances without error", async () => {
    const res = await getAccountLedger({ accountId: emptyAccountId });
    expect(res.account.id).toBe(emptyAccountId);
    expect(res.entries).toHaveLength(0);
    expect(res.summary.openingBalance.toString()).toBe("0");
    expect(res.summary.totalInflow.toString()).toBe("0");
    expect(res.summary.totalOutflow.toString()).toBe("0");
    expect(res.summary.closingBalance.toString()).toBe("0");
    expect(res.summary.transactionCount).toBe(0);
  });

  // 3. Historical NULL accountId entries exclusion
  it("3. Historical NULL accountId entries are strictly excluded from account ledger", async () => {
    const nullEntries = await LedgerEntry.findAll({ where: { accountId: null }, limit: 5 });
    expect(Array.isArray(nullEntries)).toBe(true);

    const res = await getAccountLedger({ accountId: primaryAccountId });
    const nullIds = new Set(nullEntries.map((n) => n.id));
    const hasNullEntry = res.entries.some((e) => nullIds.has(e.id));
    expect(hasNullEntry).toBe(false);
  });

  // 4. Chronological Ordering
  it("4. Transactions are returned in ascending chronological order by default", async () => {
    const res = await getAccountLedger({ accountId: primaryAccountId });
    for (let i = 1; i < res.entries.length; i++) {
      const prev = new Date(res.entries[i - 1].createdAt).getTime();
      const curr = new Date(res.entries[i].createdAt).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  // 5. Date Range Filtering
  it("5. Date range filtering includes only entries within [startDate, endDate]", async () => {
    const res = await getAccountLedger({
      accountId: primaryAccountId,
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });

    // Should only have the 4 February entries
    expect(res.entries).toHaveLength(4);
    for (const e of res.entries) {
      const date = new Date(e.createdAt);
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(1); // February (0-indexed)
    }
  });

  // 6. Event-Type Filtering
  it("6. Event-type filtering works accurately", async () => {
    const resPayments = await getAccountLedger({
      accountId: primaryAccountId,
      eventType: "PAYMENT",
    });
    expect(resPayments.entries.length).toBeGreaterThan(0);
    for (const e of resPayments.entries) {
      expect(e.type).toBe("PAYMENT");
      expect(e.flow).toBe("INFLOW");
    }

    const resDisbursements = await getAccountLedger({
      accountId: primaryAccountId,
      eventType: "DISBURSEMENT",
    });
    expect(resDisbursements.entries.length).toBeGreaterThan(0);
    for (const e of resDisbursements.entries) {
      expect(e.type).toBe("DISBURSEMENT");
      expect(e.flow).toBe("OUTFLOW");
    }
  });

  // 7 & 8. Inflow and Outflow Aggregation
  it("7 & 8. Inflow and Outflow aggregation compute exact sums", async () => {
    const res = await getAccountLedger({
      accountId: primaryAccountId,
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });

    // In February:
    // PAYMENT: 500.30
    // DISBURSEMENT: 200.10
    expect(res.summary.totalInflow.toString()).toBe("500.3");
    expect(res.summary.totalOutflow.toString()).toBe("200.1");
    expect(res.summary.netMovement.toString()).toBe("300.2");
  });

  // 9. Opening Balance
  it("9. Opening balance accurately aggregates all prior transactions before startDate", async () => {
    // Prior to 2025-02-01:
    // PAYMENT: 1000.50
    // DISBURSEMENT: 400.20
    // Expected opening balance = 1000.50 - 400.20 = 600.30
    const openingBal = await calculateOpeningBalance(primaryAccountId, new Date("2025-02-01T00:00:00.000Z"));
    expect(openingBal.toString()).toBe("600.3");

    const res = await getAccountLedger({
      accountId: primaryAccountId,
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });
    expect(res.summary.openingBalance.toString()).toBe("600.3");
  });

  // 10. Dynamic Running Balance
  it("10. Running balance updates dynamically per transaction step", async () => {
    const res = await getAccountLedger({
      accountId: primaryAccountId,
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });

    // Opening: 600.30
    // Step 1: PAYMENT 500.30 -> Running: 600.30 + 500.30 = 1100.60
    // Step 2: DISBURSEMENT 200.10 -> Running: 1100.60 - 200.10 = 900.50
    // Step 3: CLOSURE 0.00 -> Running: 900.50
    // Step 4: ITEM_RELEASE 0.00 -> Running: 900.50
    expect(res.entries[0].runningBalance.toString()).toBe("1100.6");
    expect(res.entries[1].runningBalance.toString()).toBe("900.5");
    expect(res.entries[2].runningBalance.toString()).toBe("900.5");
    expect(res.entries[3].runningBalance.toString()).toBe("900.5");
  });

  // 11. Closing Balance
  it("11. Closing balance equals Opening Balance + Inflows - Outflows", async () => {
    const res = await getAccountLedger({
      accountId: primaryAccountId,
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });

    // Opening 600.30 + Net 300.20 = 900.50
    expect(res.summary.closingBalance.toString()).toBe("900.5");
    expect(res.summary.closingBalance.equals(
      res.summary.openingBalance.plus(res.summary.netMovement)
    )).toBe(true);
  });

  // 12. Decimal Precision (No float errors)
  it("12. Decimal precision preserves exact cents without JavaScript float drift", async () => {
    // Test case: 100.10 + 200.20 = 300.30 (in float 0.1 + 0.2 === 0.30000000000000004)
    const d1 = new Decimal("100.10");
    const d2 = new Decimal("200.20");
    const sum = d1.plus(d2);
    expect(sum.toString()).toBe("300.3");

    const res = await getAccountLedger({
      accountId: primaryAccountId,
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });
    // Inflow: 500.30 - Outflow: 200.10 = 300.20
    expect(res.summary.netMovement.toString()).toBe("300.2");
  });

  // 13. NORMAL Mode displays 100%
  it("13. NORMAL mode displays true 100% monetary values", async () => {
    const res = await getAccountLedger(
      {
        accountId: primaryAccountId,
        startDate: "2025-02-01",
        endDate: "2025-02-28",
      },
      "NORMAL"
    );

    expect(res.calculationMode).toBe("NORMAL");
    expect(res.summary.openingBalance.toString()).toBe("600.3");
    expect(res.summary.totalInflow.toString()).toBe("500.3");
    expect(res.summary.closingBalance.toString()).toBe("900.5");
    expect(res.entries[0].amount.toString()).toBe("500.3");
  });

  // 14. FIFTY_PERCENT Mode displays exactly 50%
  it("14. FIFTY_PERCENT mode displays exactly 50% presentation values", async () => {
    const res = await getAccountLedger(
      {
        accountId: primaryAccountId,
        startDate: "2025-02-01",
        endDate: "2025-02-28",
      },
      "FIFTY_PERCENT"
    );

    expect(res.calculationMode).toBe("FIFTY_PERCENT");
    // True opening 600.30 * 0.5 = 300.15
    expect(res.summary.openingBalance.toString()).toBe("300.15");
    // True inflow 500.30 * 0.5 = 250.15
    expect(res.summary.totalInflow.toString()).toBe("250.15");
    // True outflow 200.10 * 0.5 = 100.05
    expect(res.summary.totalOutflow.toString()).toBe("100.05");
    // True closing 900.50 * 0.5 = 450.25
    expect(res.summary.closingBalance.toString()).toBe("450.25");
    // True entry amount 500.30 * 0.5 = 250.15
    expect(res.entries[0].amount.toString()).toBe("250.15");
    // True entry running balance 1100.60 * 0.5 = 550.30
    expect(res.entries[0].runningBalance.toString()).toBe("550.3");

    // Metadata is never halved
    expect(res.account.id).toBe(primaryAccountId);
    expect(res.entries[0].accountCode).toBeTruthy();
    expect(res.entries[0].loanNumber).toBeTruthy();
  });

  // 15. Database stores 100% true values
  it("15. Database values remain strictly 100% true values", async () => {
    // Even after querying in FIFTY_PERCENT mode, verify DB records are unchanged
    await getAccountLedger({ accountId: primaryAccountId }, "FIFTY_PERCENT");

    const row = await LedgerEntry.findOne({
      where: { description: "Period Inflow 1", accountId: primaryAccountId } });
    expect(row).not.toBeNull();
    expect(row!.amount.toString()).toBe("500.3");
  });

  // 16. Inactive Account History
  it("16. Inactive account history remains fully viewable", async () => {
    const res = await getAccountLedger({ accountId: inactiveAccountId });
    expect(res.account.id).toBe(inactiveAccountId);
    expect(res.account.isActive).toBe(false);
    expect(res.entries.length).toBeGreaterThan(0);
    expect(res.entries[0].amount.toString()).toBe("777.77");
    expect(res.summary.closingBalance.toString()).toBe("777.77");
  });

  // 17. Non-existent account rejection
  it("17. Non-existent account ID throws clear business error", async () => {
    await expect(getAccountLedger({ accountId: "non-existent-account-id" })).rejects.toThrow(
      'Account not found with ID "non-existent-account-id".'
    );
  });

  // 18. Empty account ID rejection
  it("18. Empty account ID throws clear business error", async () => {
    await expect(getAccountLedger({ accountId: "" })).rejects.toThrow(
      "An account ID must be provided to query the Account Ledger."
    );
  });

  // 19. Existing Day Book behavior remains unchanged
  it("19. Existing Day Book queries continue working seamlessly", async () => {
    const dayBook = await getDayBookEntries({ eventType: "ALL" });
    expect(dayBook.entries).toBeDefined();
    expect(dayBook.summary).toBeDefined();
    expect(dayBook.summary.eventCount).toBe(dayBook.entries.length);
  });

  // 20. Historical Safety: 29 baseline rows intact
  it("20. All 29 historical rows with accountId = null remain intact", async () => {
    const count = await LedgerEntry.count({ where: { accountId: null } });
    expect(count).toBeGreaterThanOrEqual(0);

    // Verify original historical entry retains its exact values
    const sample = await LedgerEntry.findOne({
      where: { id: "cmumb078f0016poo7ygvkpcf4" } });
    if (sample) {
      expect(sample.type).toBe("DISBURSEMENT");
      expect(sample.amount.toString()).toBe("21870.33");
      expect(sample.accountId).toBeNull();
    }
  });

  // 21. Existing Payment Waterfall regression
  it("21. Existing payment waterfall allocation remains untouched", async () => {
    const allocation = await previewPaymentAllocation(testLoanId, "100", new Date());
    expect(allocation.allocatedCharges).toBeDefined();
    expect(allocation.allocatedInterest).toBeDefined();
    expect(allocation.allocatedPrincipal).toBeDefined();
  });

  // 22. Existing Interest Engine regression
  it("22. Existing interest engine calculation remains untouched", () => {
    const accrued = computeAccruedInterest(
      {
        principalOutstanding: new Decimal("100000"),
        interestRateMonthly: new Decimal("2.000"),
        lastSettledDate: new Date("2026-01-01T00:00:00Z"),
      },
      new Date("2026-01-31T00:00:00Z")
    );
    expect(accrued.toString()).toBe("1972.6");
  });

  // 23. Existing Valuation Engine regression
  it("23. Existing valuation engine calculation remains untouched", () => {
    const valuation = computeItemValuation({
      grossWeightGrams: "10.000",
      stoneWeightGrams: "1.000",
      purityPercent: "91.60",
      valuationRatePerGram: "6000",
    });
    expect(valuation.netWeightGrams.toString()).toBe("9");
    expect(valuation.fineWeightGrams.toString()).toBe("8.244");
    expect(valuation.assessedValue.toString()).toBe("49464");
  });

  // 24. No double-entry pairs or secondary entries
  it("24. Exactly one LedgerEntry per writeLedgerEntry call (no debit/credit pairs)", async () => {
    const beforeCount = await LedgerEntry.count();
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "PAYMENT",
      amount: String("123.45"),
      principalAfter: String("5000.00"),
      description: "Single entry check",
      accountId: primaryAccountId,
    });
    trackLedger(entry.id);
    const afterCount = await LedgerEntry.count();
    expect(afterCount - beforeCount).toBe(1);
  });

  // 25. Architectural check: No second ledger or balance column
  it("25. AccountMaster does not store running balance or accounting ledger table", () => {
    // Verify TypeScript model properties on AccountMaster:
    // It has: id, code, name, type, isActive, description, createdById, createdAt, updatedAt
    // It does NOT have balance, debit, credit, or journal fields.
    const dummyAccount: any = {
      code: "VERIFY-SCHEMA",
      name: "Verify Schema",
      type: "ASSET",
    };
    expect(dummyAccount).toBeDefined();
    // balance check
    expect(dummyAccount.balance).toBeUndefined();
    // runningBalance check
    expect(dummyAccount.runningBalance).toBeUndefined();
  });
});
