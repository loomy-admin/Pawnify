/**
 * Reporting Service — Phase 10
 *
 * Provides authoritative read-only derived reports over the existing Pawnify
 * single-entry financial ledger and domain models.
 */

import Decimal from "decimal.js";
import {
  Loan,
  LoanItem,
  Payment,
  LedgerEntry,
  Customer,
  AccountMaster,
  Op,
  PaymentMode,
  TransactionType,
  AccountType,
  LoanStatus,
} from "@/lib/db";
import { deriveLoanDisplayStatus, LoanDisplayStatus } from "@/lib/services/loans";
import { computeAccruedInterest } from "@/lib/services/interest";
import { classifyFlow, CashFlowDirection } from "@/lib/services/day-book";

export interface BaseReportFilter {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export function parseDateBounds(
  startDate?: Date | string | null,
  endDate?: Date | string | null
): { start: Date | null; end: Date | null } {
  let start: Date | null = null;
  let end: Date | null = null;

  if (startDate) {
    const s = new Date(startDate);
    if (!isNaN(s.getTime())) {
      start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    }
  }

  if (endDate) {
    const e = new Date(endDate);
    if (!isNaN(e.getTime())) {
      end = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
    }
  }

  return { start, end };
}

// ==================== 1. LOAN REGISTER ====================

export interface LoanRegisterFilter extends BaseReportFilter {
  status?: "ALL" | "ACTIVE" | "OVERDUE" | "CLOSED";
}

export interface LoanRegisterItem {
  id: string;
  loanNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  loanDate: Date;
  dueDate: Date;
  status: LoanStatus;
  displayStatus: LoanDisplayStatus;
  principalAmount: Decimal;
  principalOutstanding: Decimal;
  interestRateMonthly: Decimal;
  tenureMonths: number;
  gracePeriodDays: number;
  collateralCount: number;
  collateralSummary: string;
  totalAssessedValue: Decimal;
  createdAt: Date;
}

export interface LoanRegisterResult {
  items: LoanRegisterItem[];
  summary: {
    totalLoans: number;
    totalPrincipalAmount: Decimal;
    totalPrincipalOutstanding: Decimal;
    activeCount: number;
    overdueCount: number;
    closedCount: number;
  };
}

export async function getLoanRegisterReport(
  filter: LoanRegisterFilter = {}
): Promise<LoanRegisterResult> {
  const { start, end } = parseDateBounds(filter.startDate, filter.endDate);

  const where: any = {};

  if (start && end) {
    where.loanDate = { [Op.gte]: start, [Op.lte]: end };
  } else if (start) {
    where.loanDate = { [Op.gte]: start };
  } else if (end) {
    where.loanDate = { [Op.lte]: end };
  }

  if (filter.status === "CLOSED") {
    where.status = "CLOSED";
  } else if (filter.status === "ACTIVE" || filter.status === "OVERDUE") {
    where.status = "ACTIVE";
  }

  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { loanNumber: { [Op.like]: s } },
      { "$customer.fullName$": { [Op.like]: s } },
      { "$customer.phone$": { [Op.like]: s } },
    ];
  }

  const rawLoans = await Loan.findAll({
    where,
    include: [
      { model: Customer, as: "customer", attributes: ["id", "fullName", "phone"] },
      {
        model: LoanItem,
        as: "items",
        attributes: ["id", "metalType", "grossWeightGrams", "netWeightGrams", "description"],
      },
    ],
    order: [["loanDate", "DESC"]],
  });

  let totalPrincipalAmount = new Decimal(0);
  let totalPrincipalOutstanding = new Decimal(0);
  let activeCount = 0;
  let overdueCount = 0;
  let closedCount = 0;

  const items: LoanRegisterItem[] = [];

  for (const rawL of rawLoans) {
    const l = rawL.toJSON() as any;
    const loanObj = {
      ...l,
      principalAmount: new Decimal(l.principalAmount ?? 0),
      principalOutstanding: new Decimal(l.principalOutstanding ?? 0),
      interestRateMonthly: new Decimal(l.interestRateMonthly ?? 0),
      totalAssessedValue: new Decimal(l.totalAssessedValue ?? 0),
      dueDate: new Date(l.dueDate),
      loanDate: new Date(l.loanDate),
      createdAt: new Date(l.createdAt),
    };

    const displayStatus = deriveLoanDisplayStatus(loanObj);

    if (filter.status === "ACTIVE" && displayStatus !== "ACTIVE") continue;
    if (filter.status === "OVERDUE" && displayStatus !== "OVERDUE") continue;

    if (displayStatus === "OVERDUE") overdueCount++;
    else if (displayStatus === "ACTIVE") activeCount++;
    else if (displayStatus === "CLOSED") closedCount++;

    totalPrincipalAmount = totalPrincipalAmount.plus(loanObj.principalAmount);
    totalPrincipalOutstanding = totalPrincipalOutstanding.plus(loanObj.principalOutstanding);

    const metalCounts: Record<string, number> = {};
    for (const it of l.items || []) {
      metalCounts[it.metalType] = (metalCounts[it.metalType] || 0) + 1;
    }
    const metalStr = Object.entries(metalCounts)
      .map(([m, c]) => `${c} ${m}`)
      .join(", ");
    const collateralSummary = `${(l.items || []).length} items${metalStr ? ` (${metalStr})` : ""}`;

    items.push({
      id: loanObj.id,
      loanNumber: loanObj.loanNumber,
      customerId: loanObj.customer?.id ?? "",
      customerName: loanObj.customer?.fullName ?? "",
      customerPhone: loanObj.customer?.phone ?? "",
      loanDate: loanObj.loanDate,
      dueDate: loanObj.dueDate,
      status: loanObj.status,
      displayStatus,
      principalAmount: loanObj.principalAmount,
      principalOutstanding: loanObj.principalOutstanding,
      interestRateMonthly: loanObj.interestRateMonthly,
      tenureMonths: loanObj.tenureMonths,
      gracePeriodDays: loanObj.gracePeriodDays,
      collateralCount: (l.items || []).length,
      collateralSummary,
      totalAssessedValue: loanObj.totalAssessedValue,
      createdAt: loanObj.createdAt,
    });
  }

  return {
    items,
    summary: {
      totalLoans: items.length,
      totalPrincipalAmount,
      totalPrincipalOutstanding,
      activeCount,
      overdueCount,
      closedCount,
    },
  };
}

// ==================== 2. PAYMENT REGISTER ====================

export interface PaymentRegisterFilter extends BaseReportFilter {
  mode?: "ALL" | PaymentMode;
}

export interface PaymentRegisterItem {
  id: string;
  paymentDate: Date;
  receiptNumber: string;
  loanId: string;
  loanNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  amountPaid: Decimal;
  allocatedCharges: Decimal;
  allocatedInterest: Decimal;
  allocatedPrincipal: Decimal;
  remainingPrincipal: Decimal;
  mode: PaymentMode;
  collectedByName: string;
  notes: string | null;
}

export interface PaymentRegisterResult {
  items: PaymentRegisterItem[];
  summary: {
    totalPayments: number;
    totalAmountPaid: Decimal;
    totalAllocatedPrincipal: Decimal;
    totalAllocatedInterest: Decimal;
    totalAllocatedCharges: Decimal;
  };
}

export async function getPaymentRegisterReport(
  filter: PaymentRegisterFilter = {}
): Promise<PaymentRegisterResult> {
  const { start, end } = parseDateBounds(filter.startDate, filter.endDate);

  const where: any = {};

  if (start && end) {
    where.paymentDate = { [Op.gte]: start, [Op.lte]: end };
  } else if (start) {
    where.paymentDate = { [Op.gte]: start };
  } else if (end) {
    where.paymentDate = { [Op.lte]: end };
  }

  if (filter.mode && filter.mode !== "ALL") {
    where.mode = filter.mode;
  }

  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { receiptNumber: { [Op.like]: s } },
      { "$loan.loanNumber$": { [Op.like]: s } },
      { "$loan.customer.fullName$": { [Op.like]: s } },
      { "$loan.customer.phone$": { [Op.like]: s } },
    ];
  }

  const rawPayments = await Payment.findAll({
    where,
    include: [
      {
        model: Loan,
        as: "loan",
        attributes: ["id", "loanNumber", "principalOutstanding"],
        include: [
          {
            model: Customer,
            as: "customer",
            attributes: ["id", "fullName", "phone"],
          },
        ],
      },
      {
        model: Payment.associations.collectedBy.target,
        as: "collectedBy",
        attributes: ["id", "name"],
      },
    ],
    order: [["paymentDate", "DESC"]],
  });

  let totalAmountPaid = new Decimal(0);
  let totalAllocatedPrincipal = new Decimal(0);
  let totalAllocatedInterest = new Decimal(0);
  let totalAllocatedCharges = new Decimal(0);

  const items: PaymentRegisterItem[] = rawPayments.map((rawP) => {
    const p = rawP.toJSON() as any;
    const amountPaid = new Decimal(p.amountPaid ?? 0);
    const allocatedPrincipal = new Decimal(p.allocatedPrincipal ?? 0);
    const allocatedInterest = new Decimal(p.allocatedInterest ?? 0);
    const allocatedCharges = new Decimal(p.allocatedCharges ?? 0);
    const remainingPrincipal = new Decimal(p.loan?.principalOutstanding ?? 0);

    totalAmountPaid = totalAmountPaid.plus(amountPaid);
    totalAllocatedPrincipal = totalAllocatedPrincipal.plus(allocatedPrincipal);
    totalAllocatedInterest = totalAllocatedInterest.plus(allocatedInterest);
    totalAllocatedCharges = totalAllocatedCharges.plus(allocatedCharges);

    return {
      id: p.id,
      paymentDate: new Date(p.paymentDate),
      receiptNumber: p.receiptNumber,
      loanId: p.loan?.id ?? "",
      loanNumber: p.loan?.loanNumber ?? "",
      customerId: p.loan?.customer?.id ?? "",
      customerName: p.loan?.customer?.fullName ?? "",
      customerPhone: p.loan?.customer?.phone ?? "",
      amountPaid,
      allocatedCharges,
      allocatedInterest,
      allocatedPrincipal,
      remainingPrincipal,
      mode: p.mode,
      collectedByName: p.collectedBy?.name ?? "",
      notes: p.notes,
    };
  });

  return {
    items,
    summary: {
      totalPayments: items.length,
      totalAmountPaid,
      totalAllocatedPrincipal,
      totalAllocatedInterest,
      totalAllocatedCharges,
    },
  };
}

// ==================== 3. DISBURSEMENT REGISTER ====================

export interface DisbursementRegisterFilter extends BaseReportFilter {
  accountId?: string | "ALL" | "UNASSIGNED";
}

export interface DisbursementRegisterItem {
  id: string;
  disbursementDate: Date;
  loanId: string;
  loanNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  disbursementAmount: Decimal;
  referenceId: string | null;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  interestRateMonthly: Decimal;
  tenureMonths: number;
  description: string;
}

export interface DisbursementRegisterResult {
  items: DisbursementRegisterItem[];
  summary: {
    totalDisbursements: number;
    totalDisbursedAmount: Decimal;
  };
}

export async function getDisbursementRegisterReport(
  filter: DisbursementRegisterFilter = {}
): Promise<DisbursementRegisterResult> {
  const { start, end } = parseDateBounds(filter.startDate, filter.endDate);

  const where: any = {
    type: "DISBURSEMENT",
  };

  if (start && end) {
    where.createdAt = { [Op.gte]: start, [Op.lte]: end };
  } else if (start) {
    where.createdAt = { [Op.gte]: start };
  } else if (end) {
    where.createdAt = { [Op.lte]: end };
  }

  if (filter.accountId === "UNASSIGNED") {
    where.accountId = null;
  } else if (filter.accountId && filter.accountId !== "ALL") {
    where.accountId = filter.accountId;
  }

  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { "$loan.loanNumber$": { [Op.like]: s } },
      { "$loan.customer.fullName$": { [Op.like]: s } },
      { referenceId: { [Op.like]: s } },
      { description: { [Op.like]: s } },
    ];
  }

  const rawEntries = await LedgerEntry.findAll({
    where,
    include: [
      {
        model: Loan,
        as: "loan",
        attributes: ["id", "loanNumber", "interestRateMonthly", "tenureMonths"],
        include: [
          {
            model: Customer,
            as: "customer",
            attributes: ["id", "fullName", "phone"],
          },
        ],
      },
      {
        model: AccountMaster,
        as: "account",
        attributes: ["id", "code", "name", "type"],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  let totalDisbursedAmount = new Decimal(0);

  const items: DisbursementRegisterItem[] = rawEntries.map((rawE) => {
    const e = rawE.toJSON() as any;
    const amount = new Decimal(e.amount ?? 0);
    totalDisbursedAmount = totalDisbursedAmount.plus(amount);

    return {
      id: e.id,
      disbursementDate: new Date(e.createdAt),
      loanId: e.loan?.id ?? "",
      loanNumber: e.loan?.loanNumber ?? "",
      customerId: e.loan?.customer?.id ?? "",
      customerName: e.loan?.customer?.fullName ?? "",
      customerPhone: e.loan?.customer?.phone ?? "",
      disbursementAmount: amount,
      referenceId: e.referenceId ?? null,
      accountId: e.accountId ?? null,
      accountCode: e.account?.code ?? null,
      accountName: e.account?.name ?? null,
      interestRateMonthly: new Decimal(e.loan?.interestRateMonthly ?? 0),
      tenureMonths: e.loan?.tenureMonths ?? 0,
      description: e.description,
    };
  });

  return {
    items,
    summary: {
      totalDisbursements: items.length,
      totalDisbursedAmount,
    },
  };
}

// ==================== 4. OVERDUE LOANS REPORT ====================

export interface OverdueLoansFilter {
  search?: string | null;
}

export interface OverdueLoanItem {
  id: string;
  loanNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  loanDate: Date;
  dueDate: Date;
  gracePeriodDays: number;
  daysOverdue: number;
  interestRateMonthly: Decimal;
  principalAmount: Decimal;
  principalOutstanding: Decimal;
  accruedInterest: Decimal;
  totalDue: Decimal;
}

export interface OverdueLoansResult {
  items: OverdueLoanItem[];
  summary: {
    totalOverdueLoans: number;
    totalPrincipalOutstanding: Decimal;
    totalAccruedInterest: Decimal;
    totalDue: Decimal;
  };
}

export async function getOverdueLoansReport(
  filter: OverdueLoansFilter = {}
): Promise<OverdueLoansResult> {
  const now = new Date();

  const where: any = {
    status: "ACTIVE",
  };

  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { loanNumber: { [Op.like]: s } },
      { "$customer.fullName$": { [Op.like]: s } },
      { "$customer.phone$": { [Op.like]: s } },
    ];
  }

  const rawActiveLoans = await Loan.findAll({
    where,
    include: [
      { model: Customer, as: "customer", attributes: ["id", "fullName", "phone"] },
    ],
    order: [["dueDate", "ASC"]],
  });

  let totalPrincipalOutstanding = new Decimal(0);
  let totalAccruedInterest = new Decimal(0);
  let totalDue = new Decimal(0);

  const items: OverdueLoanItem[] = [];

  for (const rawL of rawActiveLoans) {
    const l = rawL.toJSON() as any;
    const loanObj = {
      ...l,
      principalAmount: new Decimal(l.principalAmount ?? 0),
      principalOutstanding: new Decimal(l.principalOutstanding ?? 0),
      interestRateMonthly: new Decimal(l.interestRateMonthly ?? 0),
      dueDate: new Date(l.dueDate),
      loanDate: new Date(l.loanDate),
      lastSettledDate: new Date(l.lastSettledDate),
    };

    if (deriveLoanDisplayStatus(loanObj) !== "OVERDUE") continue;

    const graceDueDate = new Date(loanObj.dueDate);
    graceDueDate.setDate(graceDueDate.getDate() + loanObj.gracePeriodDays);
    const diffMs = now.getTime() - graceDueDate.getTime();
    const daysOverdue = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    const accrued = computeAccruedInterest(
      {
        principalOutstanding: loanObj.principalOutstanding,
        interestRateMonthly: loanObj.interestRateMonthly,
        lastSettledDate: loanObj.lastSettledDate,
      },
      now
    );

    const loanTotalDue = loanObj.principalOutstanding.plus(accrued);

    totalPrincipalOutstanding = totalPrincipalOutstanding.plus(loanObj.principalOutstanding);
    totalAccruedInterest = totalAccruedInterest.plus(accrued);
    totalDue = totalDue.plus(loanTotalDue);

    items.push({
      id: loanObj.id,
      loanNumber: loanObj.loanNumber,
      customerId: loanObj.customer?.id ?? "",
      customerName: loanObj.customer?.fullName ?? "",
      customerPhone: loanObj.customer?.phone ?? "",
      loanDate: loanObj.loanDate,
      dueDate: loanObj.dueDate,
      gracePeriodDays: loanObj.gracePeriodDays,
      daysOverdue,
      interestRateMonthly: loanObj.interestRateMonthly,
      principalAmount: loanObj.principalAmount,
      principalOutstanding: loanObj.principalOutstanding,
      accruedInterest: accrued,
      totalDue: loanTotalDue,
    });
  }

  return {
    items,
    summary: {
      totalOverdueLoans: items.length,
      totalPrincipalOutstanding,
      totalAccruedInterest,
      totalDue,
    },
  };
}

// ==================== 5. CUSTOMER-WISE LOAN SUMMARY ====================

export interface CustomerWiseSummaryFilter {
  search?: string | null;
}

export interface CustomerWiseSummaryItem {
  customerId: string;
  customerName: string;
  phone: string;
  email: string | null;
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  closedLoans: number;
  outstandingPrincipal: Decimal;
  accruedInterest: Decimal;
  totalPayments: Decimal;
}

export interface CustomerWiseSummaryResult {
  items: CustomerWiseSummaryItem[];
  summary: {
    totalCustomers: number;
    totalLoans: number;
    totalOutstandingPrincipal: Decimal;
    totalAccruedInterest: Decimal;
    totalPayments: Decimal;
  };
}

export async function getCustomerWiseLoanSummaryReport(
  filter: CustomerWiseSummaryFilter = {}
): Promise<CustomerWiseSummaryResult> {
  const now = new Date();

  const where: any = {};

  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { fullName: { [Op.like]: s } },
      { phone: { [Op.like]: s } },
      { email: { [Op.like]: s } },
    ];
  }

  const rawCustomers = await Customer.findAll({
    where,
    include: [
      {
        model: Loan,
        as: "loans",
        attributes: [
          "id",
          "status",
          "dueDate",
          "gracePeriodDays",
          "principalOutstanding",
          "interestRateMonthly",
          "lastSettledDate",
        ],
        include: [
          {
            model: Payment,
            as: "payments",
            attributes: ["amountPaid"],
          },
        ],
      },
    ],
    order: [["fullName", "ASC"]],
  });

  let grandLoans = 0;
  let grandOutstanding = new Decimal(0);
  let grandAccruedInterest = new Decimal(0);
  let grandPayments = new Decimal(0);

  const items: CustomerWiseSummaryItem[] = [];

  for (const rawC of rawCustomers) {
    const c = rawC.toJSON() as any;
    let activeLoans = 0;
    let overdueLoans = 0;
    let closedLoans = 0;
    let outstandingPrincipal = new Decimal(0);
    let accruedInterest = new Decimal(0);
    let totalPayments = new Decimal(0);

    for (const rawL of c.loans || []) {
      const l = {
        ...rawL,
        principalOutstanding: new Decimal(rawL.principalOutstanding ?? 0),
        interestRateMonthly: new Decimal(rawL.interestRateMonthly ?? 0),
        dueDate: new Date(rawL.dueDate),
        lastSettledDate: new Date(rawL.lastSettledDate),
      };

      const displayStatus = deriveLoanDisplayStatus(l);
      if (displayStatus === "OVERDUE") {
        overdueLoans++;
        outstandingPrincipal = outstandingPrincipal.plus(l.principalOutstanding);
        accruedInterest = accruedInterest.plus(
          computeAccruedInterest(
            {
              principalOutstanding: l.principalOutstanding,
              interestRateMonthly: l.interestRateMonthly,
              lastSettledDate: l.lastSettledDate,
            },
            now
          )
        );
      } else if (displayStatus === "ACTIVE") {
        activeLoans++;
        outstandingPrincipal = outstandingPrincipal.plus(l.principalOutstanding);
        accruedInterest = accruedInterest.plus(
          computeAccruedInterest(
            {
              principalOutstanding: l.principalOutstanding,
              interestRateMonthly: l.interestRateMonthly,
              lastSettledDate: l.lastSettledDate,
            },
            now
          )
        );
      } else {
        closedLoans++;
      }

      for (const p of rawL.payments || []) {
        totalPayments = totalPayments.plus(new Decimal(p.amountPaid ?? 0));
      }
    }

    grandLoans += (c.loans || []).length;
    grandOutstanding = grandOutstanding.plus(outstandingPrincipal);
    grandAccruedInterest = grandAccruedInterest.plus(accruedInterest);
    grandPayments = grandPayments.plus(totalPayments);

    items.push({
      customerId: c.id,
      customerName: c.fullName,
      phone: c.phone,
      email: c.email,
      totalLoans: (c.loans || []).length,
      activeLoans,
      overdueLoans,
      closedLoans,
      outstandingPrincipal,
      accruedInterest,
      totalPayments,
    });
  }

  return {
    items,
    summary: {
      totalCustomers: items.length,
      totalLoans: grandLoans,
      totalOutstandingPrincipal: grandOutstanding,
      totalAccruedInterest: grandAccruedInterest,
      totalPayments: grandPayments,
    },
  };
}

// ==================== 6. ACCOUNT-WISE FINANCIAL SUMMARY ====================

export interface AccountWiseSummaryFilter extends BaseReportFilter {
  type?: "ALL" | AccountType;
}

export interface AccountWiseSummaryItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  isActive: boolean;
  transactionCount: number;
  totalInflow: Decimal;
  totalOutflow: Decimal;
  netMovement: Decimal;
}

export interface AccountWiseSummaryResult {
  items: AccountWiseSummaryItem[];
  summary: {
    totalAccounts: number;
    totalInflowAllAccounts: Decimal;
    totalOutflowAllAccounts: Decimal;
    netMovementAllAccounts: Decimal;
  };
}

export async function getAccountWiseFinancialSummaryReport(
  filter: AccountWiseSummaryFilter = {}
): Promise<AccountWiseSummaryResult> {
  const { start, end } = parseDateBounds(filter.startDate, filter.endDate);

  const accountWhere: any = {};
  if (filter.type && filter.type !== "ALL") {
    accountWhere.type = filter.type;
  }
  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim()}%`;
    accountWhere[Op.or] = [
      { code: { [Op.like]: s } },
      { name: { [Op.like]: s } },
    ];
  }

  const accounts = await AccountMaster.findAll({
    where: accountWhere,
    order: [["code", "ASC"]],
  });

  const entryWhere: any = {};
  if (start && end) {
    entryWhere.createdAt = { [Op.gte]: start, [Op.lte]: end };
  } else if (start) {
    entryWhere.createdAt = { [Op.gte]: start };
  } else if (end) {
    entryWhere.createdAt = { [Op.lte]: end };
  }

  let grandInflow = new Decimal(0);
  let grandOutflow = new Decimal(0);

  const items: AccountWiseSummaryItem[] = [];

  for (const acc of accounts) {
    const entries = await LedgerEntry.findAll({
      where: {
        ...entryWhere,
        accountId: acc.id,
      },
      attributes: ["type", "amount"],
    });

    let totalInflow = new Decimal(0);
    let totalOutflow = new Decimal(0);

    for (const rawE of entries) {
      const e = rawE.toJSON() as any;
      const amt = new Decimal(e.amount ?? 0);
      const flow = classifyFlow(e.type);
      if (flow === "INFLOW") {
        totalInflow = totalInflow.plus(amt);
      } else if (flow === "OUTFLOW") {
        totalOutflow = totalOutflow.plus(amt);
      }
    }

    const netMovement = totalInflow.minus(totalOutflow);
    grandInflow = grandInflow.plus(totalInflow);
    grandOutflow = grandOutflow.plus(totalOutflow);

    items.push({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      accountType: acc.type as AccountType,
      isActive: acc.isActive,
      transactionCount: entries.length,
      totalInflow,
      totalOutflow,
      netMovement,
    });
  }

  return {
    items,
    summary: {
      totalAccounts: items.length,
      totalInflowAllAccounts: grandInflow,
      totalOutflowAllAccounts: grandOutflow,
      netMovementAllAccounts: grandInflow.minus(grandOutflow),
    },
  };
}

// ==================== 7. DAY BOOK SUMMARY ====================

export interface DayBookSummaryFilter extends BaseReportFilter {
  eventType?: "ALL" | TransactionType;
  accountId?: string | "ALL" | "UNASSIGNED";
}

export interface DayBookSummaryReportResult {
  summary: {
    totalInflow: Decimal;
    totalOutflow: Decimal;
    netCashFlow: Decimal;
    eventCount: number;
    paymentCount: number;
    disbursementCount: number;
    closureCount: number;
    itemReleaseCount: number;
  };
  startDate: string | null;
  endDate: string | null;
}

export async function getDayBookSummaryReport(
  filter: DayBookSummaryFilter = {}
): Promise<DayBookSummaryReportResult> {
  const { start, end } = parseDateBounds(filter.startDate, filter.endDate);

  const where: any = {};
  if (start && end) {
    where.createdAt = { [Op.gte]: start, [Op.lte]: end };
  } else if (start) {
    where.createdAt = { [Op.gte]: start };
  } else if (end) {
    where.createdAt = { [Op.lte]: end };
  }

  if (filter.eventType && filter.eventType !== "ALL") {
    where.type = filter.eventType;
  }

  if (filter.accountId === "UNASSIGNED") {
    where.accountId = null;
  } else if (filter.accountId && filter.accountId !== "ALL") {
    where.accountId = filter.accountId;
  }

  const entries = await LedgerEntry.findAll({
    where,
    attributes: ["type", "amount"],
  });

  let totalInflow = new Decimal(0);
  let totalOutflow = new Decimal(0);
  let paymentCount = 0;
  let disbursementCount = 0;
  let closureCount = 0;
  let itemReleaseCount = 0;

  for (const rawE of entries) {
    const e = rawE.toJSON() as any;
    const amt = new Decimal(e.amount ?? 0);
    const flow = classifyFlow(e.type);
    if (flow === "INFLOW") {
      totalInflow = totalInflow.plus(amt);
    } else if (flow === "OUTFLOW") {
      totalOutflow = totalOutflow.plus(amt);
    }

    if (e.type === "PAYMENT") paymentCount++;
    else if (e.type === "DISBURSEMENT") disbursementCount++;
    else if (e.type === "CLOSURE") closureCount++;
    else if (e.type === "ITEM_RELEASE") itemReleaseCount++;
  }

  return {
    summary: {
      totalInflow,
      totalOutflow,
      netCashFlow: totalInflow.minus(totalOutflow),
      eventCount: entries.length,
      paymentCount,
      disbursementCount,
      closureCount,
      itemReleaseCount,
    },
    startDate: start ? start.toISOString() : null,
    endDate: end ? end.toISOString() : null,
  };
}

// ==================== 8. PORTFOLIO SUMMARY ====================

export interface PortfolioSummaryFilter {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export interface PortfolioSummaryResult {
  pointInTime: {
    totalLoanCount: number;
    activeLoanCount: number;
    overdueLoanCount: number;
    closedLoanCount: number;
    principalDisbursedTotal: Decimal;
    principalOutstandingTotal: Decimal;
    accruedInterestTotal: Decimal;
    totalExposure: Decimal;
    goldLoansCount: number;
    silverLoansCount: number;
    goldAssessedValue: Decimal;
    silverAssessedValue: Decimal;
  };
  period: {
    startDate: string | null;
    endDate: string | null;
    disbursementsCount: number;
    disbursementsAmount: Decimal;
    collectionsCount: number;
    collectionsAmount: Decimal;
    principalCollected: Decimal;
    interestCollected: Decimal;
    chargesCollected: Decimal;
  };
}

export async function getPortfolioSummaryReport(
  filter: PortfolioSummaryFilter = {}
): Promise<PortfolioSummaryResult> {
  const now = new Date();
  const { start, end } = parseDateBounds(filter.startDate, filter.endDate);

  const allLoans = await Loan.findAll({
    include: [
      {
        model: LoanItem,
        as: "items",
        attributes: ["metalType", "assessedValue"],
      },
    ],
  });

  let activeLoanCount = 0;
  let overdueLoanCount = 0;
  let closedLoanCount = 0;
  let principalDisbursedTotal = new Decimal(0);
  let principalOutstandingTotal = new Decimal(0);
  let accruedInterestTotal = new Decimal(0);

  let goldLoansCount = 0;
  let silverLoansCount = 0;
  let goldAssessedValue = new Decimal(0);
  let silverAssessedValue = new Decimal(0);

  for (const rawL of allLoans) {
    const l = rawL.toJSON() as any;
    const loanObj = {
      ...l,
      principalAmount: new Decimal(l.principalAmount ?? 0),
      principalOutstanding: new Decimal(l.principalOutstanding ?? 0),
      totalAssessedValue: new Decimal(l.totalAssessedValue ?? 0),
      interestRateMonthly: new Decimal(l.interestRateMonthly ?? 0),
      dueDate: new Date(l.dueDate),
      lastSettledDate: new Date(l.lastSettledDate),
    };

    principalDisbursedTotal = principalDisbursedTotal.plus(loanObj.principalAmount);
    const displayStatus = deriveLoanDisplayStatus(loanObj);

    if (displayStatus === "CLOSED") {
      closedLoanCount++;
    } else {
      principalOutstandingTotal = principalOutstandingTotal.plus(loanObj.principalOutstanding);
      const accrued = computeAccruedInterest(
        {
          principalOutstanding: loanObj.principalOutstanding,
          interestRateMonthly: loanObj.interestRateMonthly,
          lastSettledDate: loanObj.lastSettledDate,
        },
        now
      );
      accruedInterestTotal = accruedInterestTotal.plus(accrued);

      if (displayStatus === "OVERDUE") {
        overdueLoanCount++;
      } else {
        activeLoanCount++;
      }
    }

    const items: any[] = l.items || [];
    const hasGold = items.some((i) => i.metalType === "GOLD");
    const hasSilver = items.some((i) => i.metalType === "SILVER");

    if (hasGold) {
      goldLoansCount++;
      goldAssessedValue = goldAssessedValue.plus(loanObj.totalAssessedValue);
    }
    if (hasSilver && !hasGold) {
      silverLoansCount++;
      silverAssessedValue = silverAssessedValue.plus(loanObj.totalAssessedValue);
    }
  }

  // 2. Period metrics
  const disbursementWhere: any = {};
  if (start && end) disbursementWhere.loanDate = { [Op.gte]: start, [Op.lte]: end };
  else if (start) disbursementWhere.loanDate = { [Op.gte]: start };
  else if (end) disbursementWhere.loanDate = { [Op.lte]: end };

  const paymentWhere: any = {};
  if (start && end) paymentWhere.paymentDate = { [Op.gte]: start, [Op.lte]: end };
  else if (start) paymentWhere.paymentDate = { [Op.gte]: start };
  else if (end) paymentWhere.paymentDate = { [Op.lte]: end };

  const [disbSum, disbCount, payCount, payTotal, payPrincipal, payInterest, payCharges] =
    await Promise.all([
      Loan.sum("principalAmount", { where: disbursementWhere }),
      Loan.count({ where: disbursementWhere }),
      Payment.count({ where: paymentWhere }),
      Payment.sum("amountPaid", { where: paymentWhere }),
      Payment.sum("allocatedPrincipal", { where: paymentWhere }),
      Payment.sum("allocatedInterest", { where: paymentWhere }),
      Payment.sum("allocatedCharges", { where: paymentWhere }),
    ]);

  return {
    pointInTime: {
      totalLoanCount: allLoans.length,
      activeLoanCount,
      overdueLoanCount,
      closedLoanCount,
      principalDisbursedTotal,
      principalOutstandingTotal,
      accruedInterestTotal,
      totalExposure: principalOutstandingTotal.plus(accruedInterestTotal),
      goldLoansCount,
      silverLoansCount,
      goldAssessedValue,
      silverAssessedValue,
    },
    period: {
      startDate: start ? start.toISOString() : null,
      endDate: end ? end.toISOString() : null,
      disbursementsCount: disbCount,
      disbursementsAmount: new Decimal(disbSum || 0),
      collectionsCount: payCount,
      collectionsAmount: new Decimal(payTotal || 0),
      principalCollected: new Decimal(payPrincipal || 0),
      interestCollected: new Decimal(payInterest || 0),
      chargesCollected: new Decimal(payCharges || 0),
    },
  };
}

// ==================== 9. TRANSACTION HISTORY ====================

export interface TransactionHistoryFilter extends BaseReportFilter {
  type?: "ALL" | TransactionType;
  eventType?: "ALL" | TransactionType;
  accountId?: string | "ALL" | "UNASSIGNED";
}

export interface TransactionHistoryItem {
  id: string;
  createdAt: Date;
  type: TransactionType;
  flow: CashFlowDirection;
  amount: Decimal;
  principalAfter: Decimal;
  loanId: string;
  loanNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  referenceId: string | null;
  description: string;
}

export interface TransactionHistoryResult {
  items: TransactionHistoryItem[];
  summary: {
    totalTransactions: number;
    totalInflow: Decimal;
    totalOutflow: Decimal;
    netMovement: Decimal;
  };
}

export async function getTransactionHistoryReport(
  filter: TransactionHistoryFilter = {}
): Promise<TransactionHistoryResult> {
  const { start, end } = parseDateBounds(filter.startDate, filter.endDate);

  const where: any = {};

  if (start && end) {
    where.createdAt = { [Op.gte]: start, [Op.lte]: end };
  } else if (start) {
    where.createdAt = { [Op.gte]: start };
  } else if (end) {
    where.createdAt = { [Op.lte]: end };
  }

  const selectedType = filter.type ?? filter.eventType;
  if (selectedType && selectedType !== "ALL") {
    where.type = selectedType;
  }

  if (filter.accountId === "UNASSIGNED") {
    where.accountId = null;
  } else if (filter.accountId && filter.accountId !== "ALL") {
    where.accountId = filter.accountId;
  }

  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { "$loan.loanNumber$": { [Op.like]: s } },
      { "$loan.customer.fullName$": { [Op.like]: s } },
      { referenceId: { [Op.like]: s } },
      { description: { [Op.like]: s } },
    ];
  }

  const rawEntries = await LedgerEntry.findAll({
    where,
    include: [
      {
        model: Loan,
        as: "loan",
        attributes: ["id", "loanNumber"],
        include: [
          {
            model: Customer,
            as: "customer",
            attributes: ["id", "fullName", "phone"],
          },
        ],
      },
      {
        model: AccountMaster,
        as: "account",
        attributes: ["id", "code", "name", "type"],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  let totalInflow = new Decimal(0);
  let totalOutflow = new Decimal(0);

  const items: TransactionHistoryItem[] = rawEntries.map((rawE) => {
    const e = rawE.toJSON() as any;
    const amount = new Decimal(e.amount ?? 0);
    const principalAfter = new Decimal(e.principalAfter ?? 0);
    const flow = classifyFlow(e.type);
    if (flow === "INFLOW") totalInflow = totalInflow.plus(amount);
    else if (flow === "OUTFLOW") totalOutflow = totalOutflow.plus(amount);

    return {
      id: e.id,
      createdAt: new Date(e.createdAt),
      type: e.type,
      flow,
      amount,
      principalAfter,
      loanId: e.loan?.id ?? "",
      loanNumber: e.loan?.loanNumber ?? "",
      customerId: e.loan?.customer?.id ?? "",
      customerName: e.loan?.customer?.fullName ?? "",
      customerPhone: e.loan?.customer?.phone ?? "",
      accountId: e.accountId ?? null,
      accountCode: e.account?.code ?? null,
      accountName: e.account?.name ?? null,
      referenceId: e.referenceId ?? null,
      description: e.description,
    };
  });

  return {
    items,
    summary: {
      totalTransactions: items.length,
      totalInflow,
      totalOutflow,
      netMovement: totalInflow.minus(totalOutflow),
    },
  };
}
