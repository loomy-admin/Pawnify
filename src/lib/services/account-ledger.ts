/**
 * Account Ledger Service — Phase 9
 *
 * Dedicated server-side service for deriving an Account Ledger view on top
 * of the existing single-entry LedgerEntry system.
 */

import Decimal from "decimal.js";
import { LedgerEntry, Loan, Customer, AccountMaster, Op, TransactionType } from "@/lib/db";
import { CalculationMode } from "@/lib/auth/session";
import { projectMonetaryDecimal } from "@/lib/projection";
import { classifyFlow, CashFlowDirection } from "@/lib/services/day-book";

export interface AccountLedgerFilter {
  /** AccountMaster ID (Required) */
  accountId: string;
  /** Start date filter (inclusive) */
  startDate?: Date | string | null;
  /** End date filter (inclusive) */
  endDate?: Date | string | null;
  /** Filter by event type: "ALL" or specific TransactionType */
  eventType?: "ALL" | TransactionType;
  /** Optional search query (matches loan number, customer name, reference, or description) */
  search?: string;
  /** Sort order (defaults to "asc" chronological) */
  sortOrder?: "asc" | "desc";
}

export interface AccountLedgerItem {
  id: string;
  createdAt: Date;
  type: TransactionType;
  flow: CashFlowDirection;
  amount: Decimal;
  principalAfter: Decimal;
  runningBalance: Decimal;
  loanId: string;
  loanNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  referenceId: string | null;
  description: string;
}

export interface AccountLedgerSummary {
  openingBalance: Decimal;
  totalInflow: Decimal;
  totalOutflow: Decimal;
  netMovement: Decimal;
  closingBalance: Decimal;
  transactionCount: number;
  paymentCount: number;
  disbursementCount: number;
  closureCount: number;
  itemReleaseCount: number;
}

export interface AccountLedgerResult {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
    isActive: boolean;
    description: string | null;
  };
  startDate: string | null;
  endDate: string | null;
  entries: AccountLedgerItem[];
  summary: AccountLedgerSummary;
  calculationMode: CalculationMode;
}

/**
 * Normalizes optional start and end date bounds.
 */
export function normalizeDateBounds(
  startDate?: Date | string | null,
  endDate?: Date | string | null
): { start: Date | null; end: Date | null; startStr: string | null; endStr: string | null } {
  let start: Date | null = null;
  let startStr: string | null = null;
  if (startDate) {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) {
      throw new Error("Invalid start date provided to Account Ledger query.");
    }
    d.setHours(0, 0, 0, 0);
    start = d;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    startStr = `${y}-${m}-${day}`;
  }

  let end: Date | null = null;
  let endStr: string | null = null;
  if (endDate) {
    const d = new Date(endDate);
    if (isNaN(d.getTime())) {
      throw new Error("Invalid end date provided to Account Ledger query.");
    }
    d.setHours(23, 59, 59, 999);
    end = d;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    endStr = `${y}-${m}-${day}`;
  }

  return { start, end, startStr, endStr };
}

/**
 * Derives the opening balance for an account prior to the given start date.
 */
export async function calculateOpeningBalance(
  accountId: string,
  startDate: Date | null
): Promise<Decimal> {
  if (!startDate) {
    return new Decimal(0);
  }

  const [inflowSum, outflowSum] = await Promise.all([
    LedgerEntry.sum("amount", {
      where: {
        accountId,
        type: { [Op.in]: ["PAYMENT", "CAPITAL_INTRO"] },
        createdAt: { [Op.lt]: startDate },
      },
    }),
    LedgerEntry.sum("amount", {
      where: {
        accountId,
        type: { [Op.in]: ["DISBURSEMENT"] },
        createdAt: { [Op.lt]: startDate },
      },
    }),
  ]);

  const priorInflow = new Decimal(inflowSum || 0);
  const priorOutflow = new Decimal(outflowSum || 0);

  return priorInflow.minus(priorOutflow);
}

/**
 * Queries the Account Ledger for a specific AccountMaster account.
 */
export async function getAccountLedger(
  filter: AccountLedgerFilter,
  mode: CalculationMode = "NORMAL"
): Promise<AccountLedgerResult> {
  if (!filter.accountId || typeof filter.accountId !== "string" || !filter.accountId.trim()) {
    throw new Error("An account ID must be provided to query the Account Ledger.");
  }

  const accountId = filter.accountId.trim();

  // 1. Verify account exists in AccountMaster
  const account = await AccountMaster.findByPk(accountId, {
    attributes: ["id", "code", "name", "type", "isActive", "description"],
  });

  if (!account) {
    throw new Error(`Account not found with ID "${accountId}".`);
  }

  // 2. Normalize date range bounds
  const { start, end, startStr, endStr } = normalizeDateBounds(filter.startDate, filter.endDate);

  // 3. Compute Opening Balance (prior to start date)
  const openingBalance = await calculateOpeningBalance(accountId, start);

  // 4. Build query for period entries
  const where: any = {
    accountId,
  };

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

  if (filter.search && filter.search.trim()) {
    const q = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { "$loan.loanNumber$": { [Op.like]: q } },
      { "$loan.customer.fullName$": { [Op.like]: q } },
      { referenceId: { [Op.like]: q } },
      { description: { [Op.like]: q } },
    ];
  }

  const rawEntries = await LedgerEntry.findAll({
    where,
    order: [["createdAt", "ASC"]],
    include: [
      {
        model: Loan,
        as: "loan",
        attributes: ["id", "loanNumber", "customerId"],
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
  });

  let currentBalance = new Decimal(openingBalance);
  let totalInflow = new Decimal(0);
  let totalOutflow = new Decimal(0);
  let paymentCount = 0;
  let disbursementCount = 0;
  let closureCount = 0;
  let itemReleaseCount = 0;

  const entries: AccountLedgerItem[] = rawEntries.map((item) => {
    const row = item.toJSON() as any;
    const amountDec = new Decimal(row.amount ?? 0);
    const principalAfterDec = new Decimal(row.principalAfter ?? 0);
    const flow = classifyFlow(row.type);

    if (row.type === "PAYMENT" || row.type === "CAPITAL_INTRO") {
      totalInflow = totalInflow.plus(amountDec);
      currentBalance = currentBalance.plus(amountDec);
      if (row.type === "PAYMENT") paymentCount++;
    } else if (row.type === "DISBURSEMENT") {
      totalOutflow = totalOutflow.plus(amountDec);
      currentBalance = currentBalance.minus(amountDec);
      disbursementCount++;
    } else if (row.type === "REVERSAL") {
      if (flow === "OUTFLOW") {
        totalOutflow = totalOutflow.plus(amountDec);
        currentBalance = currentBalance.minus(amountDec);
      } else {
        totalInflow = totalInflow.plus(amountDec);
        currentBalance = currentBalance.plus(amountDec);
      }
    } else if (row.type === "CLOSURE") {
      closureCount++;
    } else if (row.type === "ITEM_RELEASE") {
      itemReleaseCount++;
    }

    const runningBalance = currentBalance;

    const displayAmount =
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(amountDec, mode) : amountDec;
    const displayPrincipalAfter =
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(principalAfterDec, mode) : principalAfterDec;
    const displayRunningBalance =
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(runningBalance, mode) : runningBalance;

    return {
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      flow,
      amount: displayAmount,
      principalAfter: displayPrincipalAfter,
      runningBalance: displayRunningBalance,
      loanId: row.loanId ?? "",
      loanNumber: row.loan?.loanNumber ?? "",
      customerId: row.loan?.customerId ?? "",
      customerName: row.loan?.customer?.fullName ?? "",
      customerPhone: row.loan?.customer?.phone ?? "",
      accountId: row.accountId!,
      accountCode: row.account?.code ?? account.code,
      accountName: row.account?.name ?? account.name,
      accountType: row.account?.type ?? account.type,
      referenceId: row.referenceId ?? null,
      description: row.description,
    };
  });

  if (filter.sortOrder === "desc") {
    entries.reverse();
  }

  const netMovement = totalInflow.minus(totalOutflow);
  const closingBalance = openingBalance.plus(netMovement);

  const summary: AccountLedgerSummary = {
    openingBalance:
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(openingBalance, mode) : openingBalance,
    totalInflow:
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(totalInflow, mode) : totalInflow,
    totalOutflow:
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(totalOutflow, mode) : totalOutflow,
    netMovement:
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(netMovement, mode) : netMovement,
    closingBalance:
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(closingBalance, mode) : closingBalance,
    transactionCount: entries.length,
    paymentCount,
    disbursementCount,
    closureCount,
    itemReleaseCount,
  };

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      isActive: account.isActive,
      description: account.description,
    },
    startDate: startStr,
    endDate: endStr,
    entries,
    summary,
    calculationMode: mode,
  };
}
