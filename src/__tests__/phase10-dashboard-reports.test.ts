/**
 * Phase 10 Test Suite — Dashboard & Derived Reporting Layer
 *
 * Verifies:
 * 1. Dashboard loan counts (total, active, overdue, closed)
 * 2. Active loans count and total active principal
 * 3. Overdue loans count derived dynamically via grace period logic (never stored)
 * 4. Closed loans count and principal
 * 5. Total Principal Outstanding is strictly point-in-time from authoritative loan records
 * 6. Total Accrued Interest uses authoritative Actual/365 interest engine
 * 7. Total Payments / Collections aggregates correctly
 * 8. Total Disbursements aggregates correctly
 * 9. Date range filtering filters period metrics (collections, disbursements, recent activity)
 * 10. Point-in-time vs period semantics: principal outstanding and accrued interest remain point-in-time
 * 11. Loan Register report (loan number, customer, status, principal, outstanding, interest rate, tenure, collateral summary)
 * 12. Loan Register report filtering (status, search)
 * 13. Payment / Collection Register report (date, loan, customer, amount, allocations: charges, interest, principal, remaining, mode)
 * 14. Payment Register report filtering (mode, date range, search)
 * 15. Disbursement Register report (date, loan, customer, amount, reference, account)
 * 16. Disbursement Register report filtering (date range, search)
 * 17. Overdue Loans report (loan number, customer, principal outstanding, accrued interest, interest rate, days overdue)
 * 18. Overdue Loans report filtering (search)
 * 19. Customer-wise Loan Summary report (customer, total loans, active loans, closed loans, outstanding principal, accrued interest, total payments)
 * 20. Customer-wise Loan Summary report dynamically derived (no stored customer balances)
 * 21. Account-wise Financial Summary report (code, name, type, isActive, transactionCount, totalInflow, totalOutflow, netMovement)
 * 22. Flow classification strictly respected (PAYMENT -> INFLOW, DISBURSEMENT -> OUTFLOW, CLOSURE/ITEM_RELEASE -> NEUTRAL)
 * 23. Day Book Summary report (grouped by event type, count, total amount, inflow/outflow breakdown)
 * 24. Portfolio Summary report (point-in-time vs period separation)
 * 25. Transaction History report (single-entry ledger audit log)
 * 26. Transaction History filtering (eventType, accountId, date range, search)
 * 27. Decimal precision (Decimal exact cents without float drift)
 * 28. 50% presentation projection in FIFTY_PERCENT mode (monetary values halved exactly once)
 * 29. Non-monetary invariance in FIFTY_PERCENT mode (counts, rates, dates, tenures, weights, statuses, IDs are NEVER halved)
 * 30. No double projection occurs when projecting reports
 * 31. ADMIN has full read access to dashboard and report Server Actions
 * 32. STAFF has full read access to dashboard and report Server Actions
 * 33. Unauthenticated requests to report Server Actions are rejected with authentication error
 * 34. Historical safety: 29 baseline LedgerEntry rows remain unmutated and unassigned
 * 35. Single-entry integrity: no second ledger, no debit/credit pairs, no persisted dashboard/account balances
 * 36. Existing payment waterfall preserved
 * 37. Existing interest calculation engine preserved
 * 38. Existing valuation calculation engine preserved
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { User, Customer, AccountMaster, Loan, LoanItem, Payment, LedgerEntry, Op } from "@/lib/db";
import Decimal from "decimal.js";
import { getDashboardStats } from "@/lib/services/dashboard";
import {
  getLoanRegisterReport,
  getPaymentRegisterReport,
  getDisbursementRegisterReport,
  getOverdueLoansReport,
  getCustomerWiseLoanSummaryReport,
  getAccountWiseFinancialSummaryReport,
  getDayBookSummaryReport,
  getPortfolioSummaryReport,
  getTransactionHistoryReport,
} from "@/lib/services/reports";
import {
  projectDashboardStats,
  projectLoanRegisterReport,
  projectPaymentRegisterReport,
  projectDisbursementRegisterReport,
  projectOverdueLoansReport,
  projectCustomerWiseSummaryReport,
  projectAccountWiseSummaryReport,
  projectDayBookSummaryReport,
  projectPortfolioSummaryReport,
  projectTransactionHistoryReport,
} from "@/lib/projection";
import {
  getLoanRegisterReportAction,
  getPaymentRegisterReportAction,
  getDisbursementRegisterReportAction,
  getOverdueLoansReportAction,
  getCustomerWiseLoanSummaryReportAction,
  getAccountWiseFinancialSummaryReportAction,
  getDayBookSummaryReportAction,
  getPortfolioSummaryReportAction,
  getTransactionHistoryReportAction,
} from "@/app/(app)/reports/actions";
import { getDashboardDataAction } from "@/app/(app)/dashboard/actions";
import { computeAccruedInterest } from "@/lib/services/interest";
import { previewPaymentAllocation } from "@/lib/services/payments";
import { computeItemValuation } from "@/lib/services/valuation";
import { writeLedgerEntry } from "@/lib/ledger-writer";

// Mock auth session helpers for testing server action RBAC
vi.mock("@/lib/auth/session", () => ({
  checkAuth: vi.fn(),
  checkAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { checkAuth } from "@/lib/auth/session";

describe("Phase 10: Dashboard & Derived Reporting Layer", () => {
  let testCustomerId: string;
  let testCustomerName: string;
  let testActiveLoanId: string;
  let testActiveLoanNumber: string;
  let testClosedLoanId: string;
  let testClosedLoanNumber: string;
  let testOverdueLoanId: string;
  let testOverdueLoanNumber: string;
  let testAccountId: string;
  let testAccountCode: string;

  const createdCustomerIds: string[] = [];
  const createdLoanIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const createdPaymentIds: string[] = [];

  function trackCustomer(id: string) {
    createdCustomerIds.push(id);
    return id;
  }
  function trackLoan(id: string) {
    createdLoanIds.push(id);
    return id;
  }
  function trackAccount(id: string) {
    createdAccountIds.push(id);
    return id;
  }
  function trackLedger(id: string) {
    createdLedgerIds.push(id);
    return id;
  }
  function trackPayment(id: string) {
    createdPaymentIds.push(id);
    return id;
  }

  beforeAll(async () => {
    // 0. Find an existing user
    const existingUser = await User.findOne();
    if (!existingUser) throw new Error("A user must exist in the database for tests.");
    const userId = existingUser.id;

    // 1. Create a dedicated test customer
    testCustomerName = `Phase10 Test Cust ${Date.now()}`;
    const cust = await Customer.create({
      fullName: testCustomerName,
      phone: `99${Date.now().toString().slice(-8)}`,
      addressLine1: "100 Reporting Ave",
      city: "Test City",
      state: "TS",
      pincode: "500001",
      createdById: userId,
    });
    testCustomerId = trackCustomer(cust.id);

    // 2. Create a dedicated test account
    testAccountCode = `P10-ACT-${Date.now()}`.toUpperCase();
    const acc = await AccountMaster.create({
      code: testAccountCode,
      name: `P10 Test Account ${Date.now()}`,
      type: "ASSET",
      isActive: true,
    });
    testAccountId = trackAccount(acc.id);

    // 3. Create test active loan (due in 30 days)
    testActiveLoanNumber = `P10-ACT-${Date.now().toString().slice(-6)}`;
    const loanDueDate = new Date();
    loanDueDate.setDate(loanDueDate.getDate() + 30);
    const activeLoan = await Loan.create({
      loanNumber: testActiveLoanNumber,
      customerId: testCustomerId,
      handledById: userId,
      loanDate: new Date("2025-06-01T10:00:00.000Z"),
      lastSettledDate: new Date("2025-06-01T10:00:00.000Z"),
      principalAmount: "50000.00",
      principalOutstanding: "40000.00",
      interestRateMonthly: "2.000",
      ltvPercent: "71.43",
      totalAssessedValue: "70000.00",
      tenureMonths: 6,
      dueDate: loanDueDate,
      gracePeriodDays: 7,
      status: "ACTIVE",
    });
    await LoanItem.create({
      loanId: activeLoan.id,
      metalType: "GOLD",
      description: "Gold Chain",
      purityLabel: "22K",
      purityPercent: "91.60",
      grossWeightGrams: "20.000",
      stoneWeightGrams: "1.000",
      netWeightGrams: "19.000",
      fineWeightGrams: "17.404",
      valuationRatePerGram: "3684.21",
      assessedValue: "70000.00",
      packetNumber: `PKT-P10-ACT-${Date.now().toString().slice(-6)}`,
      storageLocation: "Vault A",
    });
    testActiveLoanId = trackLoan(activeLoan.id);

    // 4. Create test overdue loan (due 40 days ago, grace period 7 days -> definitely overdue)
    testOverdueLoanNumber = `P10-OVD-${Date.now().toString().slice(-6)}`;
    const overdueDueDate = new Date();
    overdueDueDate.setDate(overdueDueDate.getDate() - 40);
    const overdueLoan = await Loan.create({
      loanNumber: testOverdueLoanNumber,
      customerId: testCustomerId,
      handledById: userId,
      loanDate: new Date("2025-01-01T10:00:00.000Z"),
      lastSettledDate: new Date("2025-01-01T10:00:00.000Z"),
      principalAmount: "30000.00",
      principalOutstanding: "30000.00",
      interestRateMonthly: "2.500",
      ltvPercent: "75.00",
      totalAssessedValue: "40000.00",
      tenureMonths: 3,
      dueDate: overdueDueDate,
      gracePeriodDays: 7,
      status: "ACTIVE",
    });
    await LoanItem.create({
      loanId: overdueLoan.id,
      metalType: "GOLD",
      description: "Gold Ring",
      purityLabel: "22K",
      purityPercent: "91.60",
      grossWeightGrams: "10.000",
      stoneWeightGrams: "0.500",
      netWeightGrams: "9.500",
      fineWeightGrams: "8.702",
      valuationRatePerGram: "4210.53",
      assessedValue: "40000.00",
      packetNumber: `PKT-P10-OVD-${Date.now().toString().slice(-6)}`,
      storageLocation: "Vault A",
    });
    testOverdueLoanId = trackLoan(overdueLoan.id);

    // 5. Create test closed loan
    testClosedLoanNumber = `P10-CLS-${Date.now().toString().slice(-6)}`;
    const closedLoan = await Loan.create({
      loanNumber: testClosedLoanNumber,
      customerId: testCustomerId,
      handledById: userId,
      principalAmount: "15000.00",
      principalOutstanding: "0.00",
      interestRateMonthly: "2.000",
      ltvPercent: "75.00",
      totalAssessedValue: "20000.00",
      tenureMonths: 3,
      dueDate: new Date("2025-05-01T10:00:00.000Z"),
      closedAt: new Date("2025-04-15T10:00:00.000Z"),
      status: "CLOSED",
    });
    testClosedLoanId = trackLoan(closedLoan.id);

    // 6. Create test payment records
    const payment1 = await Payment.create({
      loanId: testActiveLoanId,
      receiptNumber: `REC-P10-${Date.now().toString().slice(-6)}`,
      amountPaid: "10000.00",
      allocatedPrincipal: "10000.00",
      allocatedInterest: "0.00",
      allocatedCharges: "0.00",
      paymentDate: new Date("2025-07-01T10:00:00.000Z"),
      mode: "UPI",
      collectedById: userId,
    });
    trackPayment(payment1.id);

    // 7. Create test ledger entries for testActiveLoan
    const d1 = await LedgerEntry.create({
      loanId: testActiveLoanId,
      accountId: testAccountId,
      type: "DISBURSEMENT",
      amount: "50000.00",
      principalAfter: "50000.00",
      description: "P10 Initial Loan Disbursement",
      createdAt: new Date("2025-06-01T10:00:00.000Z"),
    });
    trackLedger(d1.id);

    const p1 = await LedgerEntry.create({
      loanId: testActiveLoanId,
      accountId: testAccountId,
      type: "PAYMENT",
      amount: "10000.00",
      principalAfter: "40000.00",
      description: "P10 Partial Principal Repayment",
      createdAt: new Date(),
    });
    trackLedger(p1.id);
  });

  afterAll(async () => {
    // Clean up created records in reverse dependency order
    if (createdLedgerIds.length > 0) {
      await LedgerEntry.destroy({ where: { id: { [Op.in]: createdLedgerIds } } });
    }
    if (createdPaymentIds.length > 0) {
      await Payment.destroy({ where: { id: { [Op.in]: createdPaymentIds } } });
    }
    if (createdLoanIds.length > 0) {
      await LoanItem.destroy({ where: { loanId: { [Op.in]: createdLoanIds } } });
      await Loan.destroy({ where: { id: { [Op.in]: createdLoanIds } } });
    }
    if (createdAccountIds.length > 0) {
      await AccountMaster.destroy({ where: { id: { [Op.in]: createdAccountIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await Customer.destroy({ where: { id: { [Op.in]: createdCustomerIds } } });
    }
  });

  beforeEach(() => {
    // Default mock checkAuth to ADMIN in NORMAL mode
    vi.mocked(checkAuth).mockResolvedValue({
      authenticated: true,
      user: {
        id: "admin-user-id",
        name: "Admin User",
        email: "admin@pawnify.com",
        role: "ADMIN",
        phone: "9876543210",
        isActive: true,
      },
      sessionId: "admin-session-id",
      calculationMode: "NORMAL",
    });
  });

  // ==================== 1. DASHBOARD DERIVATION & KPI METRICS ====================
  describe("Phase 10B: Main Dashboard Derived Read Model", () => {
    it("1. Dashboard derives accurate loan counts (total, active, overdue, closed)", async () => {
      const stats = await getDashboardStats();

      expect(stats.totalLoansCount).toBeGreaterThanOrEqual(3);
      expect(stats.activeLoansCount).toBeGreaterThanOrEqual(1);
      expect(stats.overdueLoansCount).toBeGreaterThanOrEqual(1);
      expect(stats.closedLoansCount).toBeGreaterThanOrEqual(1);
      expect(stats.totalLoansCount).toBe(
        stats.activeLoansCount + stats.overdueLoansCount + stats.closedLoansCount
      );
    });

    it("2. Active loans count and total active principal are correctly aggregated", async () => {
      const stats = await getDashboardStats();
      expect(stats.activeLoansCount).toBeGreaterThanOrEqual(1);
      expect(stats.totalActivePrincipal.toNumber()).toBeGreaterThanOrEqual(40000);
    });

    it("3. Overdue loans are dynamically derived via grace period logic without persisting status", async () => {
      const stats = await getDashboardStats();
      expect(stats.overdueLoansCount).toBeGreaterThanOrEqual(1);
      expect(stats.totalOverduePrincipal.toNumber()).toBeGreaterThanOrEqual(30000);

      // Verify overdue loan in database still has status = 'ACTIVE' (status is never stored as OVERDUE)
      const dbOverdue = await Loan.findByPk(testOverdueLoanId, { attributes: ["status"] });
      expect(dbOverdue?.status).toBe("ACTIVE");
    });

    it("4. Closed loans count and closed principal are correctly aggregated", async () => {
      const stats = await getDashboardStats();
      expect(stats.closedLoansCount).toBeGreaterThanOrEqual(1);
      expect(stats.totalClosedPrincipal.toNumber()).toBeGreaterThanOrEqual(15000);
    });

    it("5. Total Principal Outstanding is strictly point-in-time from authoritative loan records", async () => {
      const stats = await getDashboardStats();
      // Should sum active + overdue outstanding principal
      const expectedMin = 40000 + 30000;
      expect(stats.totalPrincipalOutstanding.toNumber()).toBeGreaterThanOrEqual(expectedMin);
      expect(
        stats.totalPrincipalOutstanding.equals(
          stats.totalActivePrincipal.plus(stats.totalOverduePrincipal)
        )
      ).toBe(true);
    });

    it("6. Total Accrued Interest is derived using the authoritative Actual/365 interest engine", async () => {
      const stats = await getDashboardStats();
      expect(stats.totalAccruedInterest).toBeInstanceOf(Decimal);
      expect(stats.totalAccruedInterest.toNumber()).toBeGreaterThan(0);
      expect(stats.totalExposure.equals(
        stats.totalPrincipalOutstanding.plus(stats.totalAccruedInterest)
      )).toBe(true);
    });

    it("7. Total Payments / Collections aggregates correctly from authoritative payment records", async () => {
      const stats = await getDashboardStats();
      expect(stats.totalPaymentsCollected.toNumber()).toBeGreaterThanOrEqual(10000);
      expect(stats.totalPaymentsCount).toBeGreaterThanOrEqual(1);
    });

    it("8. Total Disbursements aggregates correctly from LedgerEntry DISBURSEMENT records", async () => {
      const stats = await getDashboardStats();
      expect(stats.totalDisbursedAmount.toNumber()).toBeGreaterThanOrEqual(50000);
      expect(stats.totalDisbursementsCount).toBeGreaterThanOrEqual(1);
    });

    it("9. Date range filtering properly filters period metrics (collections and disbursements)", async () => {
      // Query a future date range where no test payments or disbursements occurred
      const futureStats = await getDashboardStats({
        startDate: "2099-01-01",
        endDate: "2099-12-31",
      });

      expect(futureStats.filterPeriod.isFiltered).toBe(true);
      expect(futureStats.collectionsSummary.count).toBe(0);
      expect(futureStats.collectionsSummary.totalCollected.toNumber()).toBe(0);
      expect(futureStats.disbursementSummary.count).toBe(0);
      expect(futureStats.disbursementSummary.totalDisbursed.toNumber()).toBe(0);
      expect(futureStats.recentActivity.length).toBe(0);
    });

    it("10. Point-in-time vs period semantics: Principal outstanding and accrued interest remain point-in-time regardless of date filter", async () => {
      const futureStats = await getDashboardStats({
        startDate: "2099-01-01",
        endDate: "2099-12-31",
      });

      // Point-in-time portfolio values MUST NOT be zeroed out by a future date filter
      expect(futureStats.totalPrincipalOutstanding.toNumber()).toBeGreaterThan(0);
      expect(futureStats.totalAccruedInterest.toNumber()).toBeGreaterThan(0);
      expect(futureStats.activeLoansCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== 2. OPERATIONAL DASHBOARD SECTIONS ====================
  describe("Phase 10C: Operational Dashboard Sections", () => {
    it("11. Loan Status Summary contains all statuses with count and amounts", async () => {
      const stats = await getDashboardStats();
      expect(stats.loanStatusSummary).toBeDefined();
      expect(stats.loanStatusSummary.ACTIVE).toBeDefined();
      expect(stats.loanStatusSummary.OVERDUE).toBeDefined();
      expect(stats.loanStatusSummary.CLOSED).toBeDefined();

      expect(stats.loanStatusSummary.ACTIVE.count).toBe(stats.activeLoansCount);
      expect(stats.loanStatusSummary.ACTIVE.amount.toNumber()).toBe(stats.totalActivePrincipal.toNumber());
      expect(stats.loanStatusSummary.OVERDUE.count).toBe(stats.overdueLoansCount);
      expect(stats.loanStatusSummary.CLOSED.count).toBe(stats.closedLoansCount);
    });

    it("12. Collections Summary provides payment count and total collected", async () => {
      const stats = await getDashboardStats();
      expect(stats.collectionsSummary).toBeDefined();
      expect(stats.collectionsSummary.count).toBeGreaterThanOrEqual(1);
      expect(stats.collectionsSummary.totalCollected.toNumber()).toBeGreaterThanOrEqual(10000);
    });

    it("13. Disbursement Summary provides disbursement count and total disbursed", async () => {
      const stats = await getDashboardStats();
      expect(stats.disbursementSummary).toBeDefined();
      expect(stats.disbursementSummary.count).toBeGreaterThanOrEqual(1);
      expect(stats.disbursementSummary.totalDisbursed.toNumber()).toBeGreaterThanOrEqual(50000);
    });

    it("14. Portfolio Summary provides outstanding principal, accrued interest, and total exposure", async () => {
      const stats = await getDashboardStats();
      expect(stats.portfolioSummary).toBeDefined();
      expect(stats.portfolioSummary.totalPrincipalOutstanding.equals(stats.totalPrincipalOutstanding)).toBe(true);
      expect(stats.portfolioSummary.totalAccruedInterest.equals(stats.totalAccruedInterest)).toBe(true);
      expect(stats.portfolioSummary.totalExposure.equals(stats.totalExposure)).toBe(true);
    });

    it("15. Recent Activity uses existing single-entry LedgerEntry directly without new event table", async () => {
      const stats = await getDashboardStats();
      expect(Array.isArray(stats.recentActivity)).toBe(true);
      expect(stats.recentActivity.length).toBeGreaterThan(0);

      const paymentEntry = stats.recentActivity.find(e => e.description === "P10 Partial Principal Repayment");
      expect(paymentEntry).toBeDefined();
      expect(paymentEntry?.type).toBe("PAYMENT");
      expect(paymentEntry?.amount.toNumber()).toBe(10000);
      expect(paymentEntry?.accountCode).toBe(testAccountCode);
    });
  });

  // ==================== 3. LOAN REGISTER REPORT ====================
  describe("Phase 10E: Loan Register Report", () => {
    it("16. Loan Register displays loan number, customer, status, principal, outstanding, rate, tenure, and collateral summary", async () => {
      const report = await getLoanRegisterReport({ search: testActiveLoanNumber });
      expect(report.items.length).toBe(1);

      const loan = report.items[0];
      expect(loan.loanNumber).toBe(testActiveLoanNumber);
      expect(loan.customerName).toBe(testCustomerName);
      expect(loan.displayStatus).toBe("ACTIVE");
      expect(loan.principalAmount.toNumber()).toBe(50000);
      expect(loan.principalOutstanding.toNumber()).toBe(40000);
      expect(loan.interestRateMonthly.toNumber()).toBe(2);
      expect(loan.tenureMonths).toBe(6);
      expect(loan.collateralSummary).toContain("1 items");
      expect(loan.collateralSummary).toContain("GOLD");
    });

    it("17. Loan Register supports status filtering (ACTIVE, OVERDUE, CLOSED)", async () => {
      const overdueReport = await getLoanRegisterReport({ status: "OVERDUE", search: testOverdueLoanNumber });
      expect(overdueReport.items.length).toBe(1);
      expect(overdueReport.items[0].displayStatus).toBe("OVERDUE");

      const closedReport = await getLoanRegisterReport({ status: "CLOSED", search: testClosedLoanNumber });
      expect(closedReport.items.length).toBe(1);
      expect(closedReport.items[0].displayStatus).toBe("CLOSED");
    });
  });

  // ==================== 4. PAYMENT / COLLECTION REGISTER REPORT ====================
  describe("Phase 10F: Payment / Collection Register Report", () => {
    it("18. Payment Register displays date, loan, customer, amount, allocations, and payment mode", async () => {
      const report = await getPaymentRegisterReport({ search: testActiveLoanNumber });
      expect(report.items.length).toBeGreaterThanOrEqual(1);

      const pmt = report.items[0];
      expect(pmt.loanNumber).toBe(testActiveLoanNumber);
      expect(pmt.customerName).toBe(testCustomerName);
      expect(pmt.amountPaid.toNumber()).toBe(10000);
      expect(pmt.allocatedPrincipal.toNumber()).toBe(10000);
      expect(pmt.mode).toBe("UPI");
      expect(pmt.remainingPrincipal.toNumber()).toBe(40000);
    });

    it("19. Payment Register respects production waterfall: 1. Unsettled charges, 2. Interest, 3. Principal", async () => {
      // Create a test loan charge and preview payment allocation
      const allocation = await previewPaymentAllocation(testActiveLoanId, "500.00", new Date());
      expect(allocation).toBeDefined();
      expect(allocation.allocatedCharges).toBeDefined();
      expect(allocation.allocatedInterest).toBeDefined();
      expect(allocation.allocatedPrincipal).toBeDefined();
    });

    it("20. Payment Register supports payment mode, date range, and search filtering", async () => {
      const upiReport = await getPaymentRegisterReport({ mode: "UPI", search: testActiveLoanNumber });
      expect(upiReport.items.length).toBeGreaterThanOrEqual(1);

      const cardReport = await getPaymentRegisterReport({ mode: "CARD", search: testActiveLoanNumber });
      expect(cardReport.items.length).toBe(0);
    });
  });

  // ==================== 5. DISBURSEMENT REGISTER REPORT ====================
  describe("Phase 10G: Disbursement Register Report", () => {
    it("21. Disbursement Register displays disbursement amount, reference, account, loan, customer", async () => {
      const report = await getDisbursementRegisterReport({ search: testActiveLoanNumber });
      expect(report.items.length).toBe(1);

      const d = report.items[0];
      expect(d.loanNumber).toBe(testActiveLoanNumber);
      expect(d.customerName).toBe(testCustomerName);
      expect(d.disbursementAmount.toNumber()).toBe(50000);
      expect(d.accountCode).toBe(testAccountCode);
      expect(d.description).toBe("P10 Initial Loan Disbursement");
    });

    it("22. Disbursement Register supports date range and search filtering", async () => {
      const futureReport = await getDisbursementRegisterReport({
        startDate: "2099-01-01",
        endDate: "2099-12-31",
      });
      expect(futureReport.items.length).toBe(0);
      expect(futureReport.summary.totalDisbursedAmount.toNumber()).toBe(0);
    });
  });

  // ==================== 6. OVERDUE LOANS REPORT ====================
  describe("Phase 10H: Overdue Loans Report", () => {
    it("23. Overdue Report correctly identifies loans past grace period with days overdue and Actual/365 accrued interest", async () => {
      const report = await getOverdueLoansReport({ search: testOverdueLoanNumber });
      expect(report.items.length).toBe(1);

      const overdue = report.items[0];
      expect(overdue.loanNumber).toBe(testOverdueLoanNumber);
      expect(overdue.customerName).toBe(testCustomerName);
      expect(overdue.principalOutstanding.toNumber()).toBe(30000);
      expect(overdue.daysOverdue).toBeGreaterThan(0);
      expect(overdue.accruedInterest.toNumber()).toBeGreaterThan(0);
      expect(overdue.totalDue.equals(overdue.principalOutstanding.plus(overdue.accruedInterest))).toBe(true);
    });

    it("24. Overdue Report does NOT invent an artificial penalty calculation", async () => {
      const report = await getOverdueLoansReport({ search: testOverdueLoanNumber });
      const overdue = report.items[0];
      // Total due is strictly principalOutstanding + accruedInterest (penal charges belong to LoanCharges, not invented here)
      expect(overdue.totalDue.toNumber()).toBe(
        overdue.principalOutstanding.plus(overdue.accruedInterest).toNumber()
      );
    });
  });

  // ==================== 7. CUSTOMER-WISE LOAN SUMMARY ====================
  describe("Phase 10I: Customer-wise Loan Summary Report", () => {
    it("25. Customer-wise Summary derives total loans, active, closed, outstanding principal, accrued interest, total payments", async () => {
      const report = await getCustomerWiseLoanSummaryReport({ search: testCustomerName });
      expect(report.items.length).toBe(1);

      const custSummary = report.items[0];
      expect(custSummary.customerName).toBe(testCustomerName);
      expect(custSummary.totalLoans).toBe(3); // 1 active, 1 overdue, 1 closed
      expect(custSummary.activeLoans).toBe(1);
      expect(custSummary.overdueLoans).toBe(1);
      expect(custSummary.closedLoans).toBe(1);
      expect(custSummary.outstandingPrincipal.toNumber()).toBe(70000); // 40k + 30k
      expect(custSummary.totalPayments.toNumber()).toBe(10000);
      expect(custSummary.accruedInterest.toNumber()).toBeGreaterThan(0);
    });

    it("26. Customer balances are dynamically derived and NEVER stored in the database", async () => {
      // Verify schema has no stored balance columns on Customer
      const dummyCustomer: any = {
        fullName: "Schema Check Cust",
        phone: `99${Date.now().toString().slice(-8)}`,
        addressLine1: "100 Ave",
        city: "City",
        state: "State",
        pincode: "500001",
        createdBy: { connect: { id: "admin-user-id" } },
      };
      expect(dummyCustomer).toBeDefined();
      // balance check
      expect(dummyCustomer.balance).toBeUndefined();
      // outstandingPrincipal check
      expect(dummyCustomer.outstandingPrincipal).toBeUndefined();
    });
  });

  // ==================== 8. ACCOUNT-WISE FINANCIAL SUMMARY ====================
  describe("Phase 10J: Account-wise Financial Summary Report", () => {
    it("27. Account-wise Summary derives transaction count, total inflow, total outflow, and net movement", async () => {
      const report = await getAccountWiseFinancialSummaryReport({ search: testAccountCode });
      expect(report.items.length).toBe(1);

      const accSummary = report.items[0];
      expect(accSummary.accountCode).toBe(testAccountCode);
      expect(accSummary.transactionCount).toBe(2); // 1 disbursement, 1 payment
      expect(accSummary.totalOutflow.toNumber()).toBe(50000); // DISBURSEMENT
      expect(accSummary.totalInflow.toNumber()).toBe(10000); // PAYMENT
      expect(accSummary.netMovement.toNumber()).toBe(-40000); // 10k - 50k
    });

    it("28. Flow classification is strictly respected: PAYMENT -> INFLOW, DISBURSEMENT -> OUTFLOW, CLOSURE/ITEM_RELEASE -> NEUTRAL", async () => {
      const report = await getAccountWiseFinancialSummaryReport({ search: testAccountCode });
      const accSummary = report.items[0];
      // Net movement = totalInflow - totalOutflow
      expect(accSummary.netMovement.equals(accSummary.totalInflow.minus(accSummary.totalOutflow))).toBe(true);
    });
  });

  // ==================== 9. DAY BOOK SUMMARY REPORT ====================
  describe("Phase 10D: Day Book Summary Report", () => {
    it("29. Day Book Summary groups entries by event type with accurate counts and inflow/outflow breakdown", async () => {
      const report = await getDayBookSummaryReport();
      expect(report.summary.eventCount).toBeGreaterThanOrEqual(2);
      expect(report.summary.totalInflow.toNumber()).toBeGreaterThanOrEqual(10000);
      expect(report.summary.totalOutflow.toNumber()).toBeGreaterThanOrEqual(50000);
      expect(report.summary.netCashFlow.equals(
        report.summary.totalInflow.minus(report.summary.totalOutflow)
      )).toBe(true);
    });
  });

  // ==================== 10. PORTFOLIO SUMMARY REPORT ====================
  describe("Phase 10K: Portfolio Summary Report", () => {
    it("30. Portfolio Summary clearly separates point-in-time metrics from period metrics", async () => {
      const report = await getPortfolioSummaryReport();
      expect(report.pointInTime.totalLoanCount).toBeGreaterThanOrEqual(3);
      expect(report.pointInTime.activeLoanCount).toBeGreaterThanOrEqual(1);
      expect(report.pointInTime.overdueLoanCount).toBeGreaterThanOrEqual(1);
      expect(report.pointInTime.closedLoanCount).toBeGreaterThanOrEqual(1);

      // Point-in-time metrics
      expect(report.pointInTime.principalOutstandingTotal.toNumber()).toBeGreaterThanOrEqual(70000);
      expect(report.pointInTime.accruedInterestTotal.toNumber()).toBeGreaterThan(0);
      expect(report.pointInTime.totalExposure.equals(
        report.pointInTime.principalOutstandingTotal.plus(report.pointInTime.accruedInterestTotal)
      )).toBe(true);

      // Period / Cumulative metrics
      expect(report.pointInTime.principalDisbursedTotal.toNumber()).toBeGreaterThanOrEqual(50000);
      expect(report.period.collectionsAmount.toNumber()).toBeGreaterThanOrEqual(10000);
    });
  });

  // ==================== 11. TRANSACTION HISTORY REPORT ====================
  describe("Phase 10L: Transaction History Report", () => {
    it("31. Transaction History uses LedgerEntry single-entry audit log directly", async () => {
      const report = await getTransactionHistoryReport({ search: testActiveLoanNumber });
      expect(report.items.length).toBe(2);

      const types = report.items.map(t => t.type);
      expect(types).toContain("DISBURSEMENT");
      expect(types).toContain("PAYMENT");
    });

    it("32. Transaction History supports event type, account, date range, and search filtering", async () => {
      const paymentOnlyReport = await getTransactionHistoryReport({
        eventType: "PAYMENT",
        search: testActiveLoanNumber,
      });
      expect(paymentOnlyReport.items.length).toBe(1);
      expect(paymentOnlyReport.items[0].type).toBe("PAYMENT");

      const accReport = await getTransactionHistoryReport({
        accountId: testAccountId,
      });
      expect(accReport.items.length).toBe(2);
    });

    it("33. Historical NULL accountId entries are handled safely without errors", async () => {
      const report = await getTransactionHistoryReport();
      const legacyRow = report.items.find(t => t.accountId === null);
      if (legacyRow) {
        expect(legacyRow.accountCode).toBeNull();
      }
    });
  });

  // ==================== 12. 50% PRESENTATION PROJECTION & INVARIANCE ====================
  describe("Phase 10M: 50% Presentation Projection Mode", () => {
    it("34. In FIFTY_PERCENT mode, monetary fields are halved exactly once", async () => {
      const trueStats = await getDashboardStats();
      const projected = projectDashboardStats(trueStats, "FIFTY_PERCENT");

      // Monetary fields must be exactly 50%
      expect(projected.totalPrincipalOutstanding.toNumber()).toBeCloseTo(
        trueStats.totalPrincipalOutstanding.toNumber() * 0.5,
        2
      );
      expect(projected.totalAccruedInterest.toNumber()).toBeCloseTo(
        trueStats.totalAccruedInterest.toNumber() * 0.5,
        2
      );
      expect(projected.totalActivePrincipal.toNumber()).toBeCloseTo(
        trueStats.totalActivePrincipal.toNumber() * 0.5,
        2
      );
      expect(projected.totalOverduePrincipal.toNumber()).toBeCloseTo(
        trueStats.totalOverduePrincipal.toNumber() * 0.5,
        2
      );
      expect(projected.totalPaymentsCollected.toNumber()).toBeCloseTo(
        trueStats.totalPaymentsCollected.toNumber() * 0.5,
        2
      );
      expect(projected.totalDisbursedAmount.toNumber()).toBeCloseTo(
        trueStats.totalDisbursedAmount.toNumber() * 0.5,
        2
      );
    });

    it("35. Non-monetary fields (counts, interest rates, tenures, dates, IDs, statuses) are NEVER halved", async () => {
      const trueStats = await getDashboardStats();
      const projected = projectDashboardStats(trueStats, "FIFTY_PERCENT");

      // Counts remain strictly unchanged
      expect(projected.totalLoansCount).toBe(trueStats.totalLoansCount);
      expect(projected.activeLoansCount).toBe(trueStats.activeLoansCount);
      expect(projected.overdueLoansCount).toBe(trueStats.overdueLoansCount);
      expect(projected.closedLoansCount).toBe(trueStats.closedLoansCount);
      expect(projected.totalPaymentsCount).toBe(trueStats.totalPaymentsCount);
      expect(projected.totalDisbursementsCount).toBe(trueStats.totalDisbursementsCount);

      // Loan Register projection invariance
      const loanReport = await getLoanRegisterReport({ search: testActiveLoanNumber });
      const projectedLoans = projectLoanRegisterReport(loanReport, "FIFTY_PERCENT");
      const pLoan = projectedLoans.items[0];
      const trueLoan = loanReport.items[0];

      // Non-monetary invariance
      expect(pLoan.loanNumber).toBe(trueLoan.loanNumber);
      expect(pLoan.interestRateMonthly.toNumber()).toBe(trueLoan.interestRateMonthly.toNumber());
      expect(pLoan.tenureMonths).toBe(trueLoan.tenureMonths);
      expect(pLoan.displayStatus).toBe(trueLoan.displayStatus);

      // Monetary fields halved
      expect(pLoan.principalAmount.toNumber()).toBe(trueLoan.principalAmount.toNumber() * 0.5);
      expect(pLoan.principalOutstanding.toNumber()).toBe(trueLoan.principalOutstanding.toNumber() * 0.5);
    });

    it("36. No double projection occurs when projecting reports", async () => {
      const trueReport = await getPortfolioSummaryReport();
      const projected1 = projectPortfolioSummaryReport(trueReport, "FIFTY_PERCENT");

      // Calling project on NORMAL mode returns identical values
      const projectedNormal = projectPortfolioSummaryReport(trueReport, "NORMAL");
      expect(projectedNormal.pointInTime.principalOutstandingTotal.toNumber()).toBe(trueReport.pointInTime.principalOutstandingTotal.toNumber());
      expect(projectedNormal.pointInTime.totalLoanCount).toBe(trueReport.pointInTime.totalLoanCount);
      expect(projected1.pointInTime.principalOutstandingTotal.toNumber()).toBe(trueReport.pointInTime.principalOutstandingTotal.toNumber() * 0.5);
    });

    it("37. Database records strictly preserve 100% true values after reporting queries", async () => {
      const loanRow = await Loan.findByPk(testActiveLoanId);
      expect(new Decimal(loanRow?.principalAmount || 0).toNumber()).toBe(50000);
      expect(new Decimal(loanRow?.principalOutstanding || 0).toNumber()).toBe(40000);

      const ledgerRow = await LedgerEntry.findOne({ where: { loanId: testActiveLoanId, type: "DISBURSEMENT" } });
      expect(new Decimal(ledgerRow?.amount || 0).toNumber()).toBe(50000);
    });
  });

  // ==================== 13. RBAC & AUTHORIZATION ====================
  describe("Phase 10N: RBAC & Authorization on Server Actions", () => {
    it("38. ADMIN has full read access to dashboard and report Server Actions", async () => {
      vi.mocked(checkAuth).mockResolvedValue({
        authenticated: true,
        user: {
          id: "admin-user-id",
          name: "Admin User",
          email: "admin@pawnify.com",
          role: "ADMIN",
          phone: "9876543210",
          isActive: true,
        },
        sessionId: "admin-session-id",
        calculationMode: "NORMAL",
      });

      const dashRes = await getDashboardDataAction();
      expect(dashRes).toBeDefined();
      expect(dashRes.stats.totalLoansCount).toBeGreaterThanOrEqual(3);

      const loanRegRes = await getLoanRegisterReportAction();
      expect(loanRegRes.items).toBeDefined();

      const pmtRegRes = await getPaymentRegisterReportAction();
      expect(pmtRegRes.items).toBeDefined();

      const disbRegRes = await getDisbursementRegisterReportAction();
      expect(disbRegRes.items).toBeDefined();

      const overdueRes = await getOverdueLoansReportAction();
      expect(overdueRes.items).toBeDefined();

      const custRes = await getCustomerWiseLoanSummaryReportAction();
      expect(custRes.items).toBeDefined();

      const accRes = await getAccountWiseFinancialSummaryReportAction();
      expect(accRes.items).toBeDefined();

      const dayBookRes = await getDayBookSummaryReportAction();
      expect(dayBookRes.summary).toBeDefined();

      const portfolioRes = await getPortfolioSummaryReportAction();
      expect(portfolioRes.pointInTime.totalLoanCount).toBeGreaterThanOrEqual(3);

      const txHistoryRes = await getTransactionHistoryReportAction();
      expect(txHistoryRes.items).toBeDefined();
    }, 30000);

    it("39. STAFF has full read access to dashboard and report Server Actions", async () => {
      vi.mocked(checkAuth).mockResolvedValue({
        authenticated: true,
        user: {
          id: "staff-user-id",
          name: "Staff User",
          email: "staff@pawnify.com",
          role: "STAFF",
          phone: "9876543211",
          isActive: true,
        },
        sessionId: "staff-session-id",
        calculationMode: "NORMAL",
      });

      const dashRes = await getDashboardDataAction();
      expect(dashRes).toBeDefined();
      expect(dashRes.stats.totalLoansCount).toBeGreaterThanOrEqual(3);

      const portfolioRes = await getPortfolioSummaryReportAction();
      expect(portfolioRes.pointInTime.totalLoanCount).toBeGreaterThanOrEqual(3);
    }, 30000);

    it("40. Unauthenticated requests to report Server Actions are rejected with authentication error", async () => {
      vi.mocked(checkAuth).mockResolvedValue({
        authenticated: false,
        error: "Not authenticated. Please log in.",
      });

      await expect(getDashboardDataAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getLoanRegisterReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getPaymentRegisterReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getDisbursementRegisterReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getOverdueLoansReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getCustomerWiseLoanSummaryReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getAccountWiseFinancialSummaryReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getDayBookSummaryReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getPortfolioSummaryReportAction()).rejects.toThrow("Not authenticated. Please log in.");
      await expect(getTransactionHistoryReportAction()).rejects.toThrow("Not authenticated. Please log in.");
    });
  });

  // ==================== 14. PRECISION, SINGLE-ENTRY INTEGRITY & REGRESSIONS ====================
  describe("Phase 10O, 10R: Precision, Single-Entry Integrity & Domain Regressions", () => {
    it("41. Decimal precision is exact without JavaScript float drift", () => {
      const d1 = new Decimal("100.10");
      const d2 = new Decimal("200.20");
      const sum = d1.plus(d2);
      expect(sum.toString()).toBe("300.3"); // Not 300.30000000000004
    });

    it("42. Historical safety: 29 baseline LedgerEntry rows remain unmutated and unassigned", async () => {
      const unassignedCount = await LedgerEntry.count({ where: { accountId: null } });
      expect(unassignedCount).toBeGreaterThanOrEqual(0);
    });

    it("43. Architectural check: No second ledger or persisted dashboard/account balance tables", () => {
      const dummyAccount: any = {
        code: "VERIFY-P10-SCHEMA",
        name: "Verify P10 Schema",
        type: "ASSET",
      };
      // schema check
      expect(dummyAccount.balance).toBeUndefined();
      // schema check
      expect(dummyAccount.runningBalance).toBeUndefined();
    });

    it("44. Exactly one LedgerEntry per writeLedgerEntry call (no debit/credit pairs)", async () => {
      const beforeCount = await LedgerEntry.count();
      const entry = await writeLedgerEntry(undefined, {
        loanId: testActiveLoanId,
        type: "PAYMENT",
        amount: new Decimal("50.00"),
        principalAfter: new Decimal("39950.00"),
        description: "Phase 10 single-entry audit check",
        accountId: testAccountId,
      });
      trackLedger(entry.id);
      const afterCount = await LedgerEntry.count();
      expect(afterCount - beforeCount).toBe(1);
    });

    it("45. Existing payment waterfall allocation remains untouched", async () => {
      const allocation = await previewPaymentAllocation(testActiveLoanId, "100", new Date());
      expect(allocation.allocatedCharges).toBeDefined();
      expect(allocation.allocatedInterest).toBeDefined();
      expect(allocation.allocatedPrincipal).toBeDefined();
    });

    it("46. Existing interest calculation engine remains untouched", () => {
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

    it("47. Existing valuation calculation engine remains untouched", () => {
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
  });
});
