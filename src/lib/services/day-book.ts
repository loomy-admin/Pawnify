/**
 * Day Book Query Service — Phase 8
 *
 * Dedicated server-side service for querying, summarizing, and presenting the daily
 * chronological journal of business events from the single-entry LedgerEntry system.
 */

import Decimal from "decimal.js";
import { LedgerEntry, Loan, Customer, AccountMaster, Op, TransactionType } from "@/lib/db";
import { CalculationMode } from "@/lib/auth/session";
import { projectMonetaryDecimal } from "@/lib/projection";

export type CashFlowDirection = "INFLOW" | "OUTFLOW" | "NEUTRAL";

export interface DayBookFilter {
  /** Target date (Date object or YYYY-MM-DD string). Defaults to today. */
  date?: Date | string;
  /** Filter by event type: "ALL" or specific TransactionType */
  eventType?: "ALL" | TransactionType;
  /** Filter by AccountMaster ID, or "UNASSIGNED" for legacy NULL account rows */
  accountId?: string;
  /** Sort order (defaults to "asc" chronological) */
  sortOrder?: "asc" | "desc";
}

export interface DayBookEntryItem {
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
  accountType: string | null;
  referenceId: string | null;
  description: string;
}

export interface DayBookSummary {
  totalInflow: Decimal;
  totalOutflow: Decimal;
  netCashFlow: Decimal;
  eventCount: number;
  paymentCount: number;
  disbursementCount: number;
  closureCount: number;
  itemReleaseCount: number;
}

export interface DayBookResult {
  date: string;
  entries: DayBookEntryItem[];
  summary: DayBookSummary;
  calculationMode: CalculationMode;
}

/**
 * Classifies flow direction strictly per Phase 8 Step 4 locked business rules.
 */
export function classifyFlow(type: TransactionType): CashFlowDirection {
  switch (type) {
    case "PAYMENT":
    case "CAPITAL_INTRO":
      return "INFLOW";
    case "DISBURSEMENT":
    case "REVERSAL":
      return "OUTFLOW";
    case "CLOSURE":
    case "ITEM_RELEASE":
    default:
      return "NEUTRAL";
  }
}

/**
 * Normalizes input date to start and end of day in local/UTC context.
 */
export function getDateRange(inputDate?: Date | string): { start: Date; end: Date; dateStr: string } {
  const d = inputDate ? new Date(inputDate) : new Date();
  if (isNaN(d.getTime())) {
    throw new Error("Invalid date provided to Day Book query.");
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  const start = new Date(d);
  start.setHours(0, 0, 0, 0);

  const end = new Date(d);
  end.setHours(23, 59, 59, 999);

  return { start, end, dateStr };
}

/**
 * Queries Day Book entries with full relational joins, flow classification,
 * KPI summary calculation, and optional 50% presentation projection.
 */
export async function getDayBookEntries(
  filter: DayBookFilter = {},
  mode: CalculationMode = "NORMAL"
): Promise<DayBookResult> {
  const { start, end, dateStr } = getDateRange(filter.date);

  const where: any = {
    createdAt: {
      [Op.gte]: start,
      [Op.lte]: end,
    },
  };

  if (filter.eventType && filter.eventType !== "ALL") {
    where.type = filter.eventType;
  }

  if (filter.accountId) {
    if (filter.accountId === "UNASSIGNED") {
      where.accountId = null;
    } else {
      where.accountId = filter.accountId;
    }
  }

  const rawEntries = await LedgerEntry.findAll({
    where,
    order: [["createdAt", (filter.sortOrder ?? "asc").toUpperCase()]],
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

  // Calculate 100% true KPIs
  let totalInflow = new Decimal(0);
  let totalOutflow = new Decimal(0);
  let paymentCount = 0;
  let disbursementCount = 0;
  let closureCount = 0;
  let itemReleaseCount = 0;

  const entries: DayBookEntryItem[] = rawEntries.map((item) => {
    const row = item.toJSON() as any;
    const amountDec = new Decimal(row.amount ?? 0);
    const principalAfterDec = new Decimal(row.principalAfter ?? 0);
    const flow = classifyFlow(row.type);

    if (row.type === "PAYMENT") {
      totalInflow = totalInflow.plus(amountDec);
      paymentCount++;
    } else if (row.type === "DISBURSEMENT") {
      totalOutflow = totalOutflow.plus(amountDec);
      disbursementCount++;
    } else if (row.type === "CLOSURE") {
      closureCount++;
    } else if (row.type === "ITEM_RELEASE") {
      itemReleaseCount++;
    }

    const displayAmount =
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(amountDec, mode) : amountDec;
    const displayPrincipalAfter =
      mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(principalAfterDec, mode) : principalAfterDec;

    return {
      id: row.id,
      createdAt: row.createdAt,
      type: row.type,
      flow,
      amount: displayAmount,
      principalAfter: displayPrincipalAfter,
      loanId: row.loanId ?? "",
      loanNumber: row.loan?.loanNumber ?? "",
      customerId: row.loan?.customerId ?? "",
      customerName: row.loan?.customer?.fullName ?? "",
      customerPhone: row.loan?.customer?.phone ?? "",
      accountId: row.accountId ?? null,
      accountCode: row.account?.code ?? null,
      accountName: row.account?.name ?? null,
      accountType: row.account?.type ?? null,
      referenceId: row.referenceId ?? null,
      description: row.description,
    };
  });

  const netCashFlow = totalInflow.minus(totalOutflow);

  const summary: DayBookSummary = {
    totalInflow: mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(totalInflow, mode) : totalInflow,
    totalOutflow: mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(totalOutflow, mode) : totalOutflow,
    netCashFlow: mode === "FIFTY_PERCENT" ? projectMonetaryDecimal(netCashFlow, mode) : netCashFlow,
    eventCount: entries.length,
    paymentCount,
    disbursementCount,
    closureCount,
    itemReleaseCount,
  };

  return {
    date: dateStr,
    entries,
    summary,
    calculationMode: mode,
  };
}
