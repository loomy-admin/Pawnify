"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import {
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Minus,
  Calendar,
  Filter,
  RefreshCw,
  Loader2,
  Phone,
  Landmark,
  Receipt,
  AlertCircle,
} from "lucide-react";
import { getDayBookAction, listAccountsForFilterAction } from "./actions";

interface DayBookEntry {
  id: string;
  createdAt: string;
  type: "DISBURSEMENT" | "PAYMENT" | "CLOSURE" | "ITEM_RELEASE";
  flow: "INFLOW" | "OUTFLOW" | "NEUTRAL";
  amount: string;
  principalAfter: string;
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

interface DayBookSummary {
  totalInflow: string;
  totalOutflow: string;
  netCashFlow: string;
  eventCount: number;
  paymentCount: number;
  disbursementCount: number;
  closureCount: number;
  itemReleaseCount: number;
}

interface FilterAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

const formatINR = (val: number | string) => {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatTime = (isoString: string) => {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "--:--";
  }
};

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getYesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function DayBookClient() {
  const searchParams = useSearchParams();
  const initialAccountId = searchParams.get("accountId") || "ALL";
  const initialDate = searchParams.get("date") || getTodayStr();

  const [date, setDate] = useState(initialDate);
  const [eventType, setEventType] = useState<"ALL" | "PAYMENT" | "DISBURSEMENT" | "CLOSURE" | "ITEM_RELEASE">("ALL");
  const [accountId, setAccountId] = useState(initialAccountId);

  const [entries, setEntries] = useState<DayBookEntry[]>([]);
  const [summary, setSummary] = useState<DayBookSummary | null>(null);
  const [accounts, setAccounts] = useState<FilterAccount[]>([]);
  const [calcMode, setCalcMode] = useState<string>("NORMAL");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Load account filters once
  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await listAccountsForFilterAction();
        setAccounts(res as FilterAccount[]);
      } catch (err) {
        console.error("Failed to load filter accounts:", err);
      }
    }
    loadAccounts();
  }, []);

  const loadData = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const res = await getDayBookAction({
          date,
          eventType: eventType === "ALL" ? undefined : eventType,
          accountId: accountId === "ALL" ? undefined : accountId,
          sortOrder: "asc",
        });

        setEntries((res.entries as unknown as DayBookEntry[]) || []);
        setSummary((res.summary as unknown as DayBookSummary) || null);
        setCalcMode(res.calculationMode);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load Day Book data";
        setError(msg);
      }
    });
  }, [date, eventType, accountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isToday = date === getTodayStr();
  const isYesterday = date === getYesterdayStr();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Day Book"
          description="Daily chronological audit journal of counter transactions and cash flows"
        />
        <div className="flex items-center gap-2">
          {calcMode === "FIFTY_PERCENT" && (
            <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
              50% Display Mode
            </span>
          )}
          <Link
            href="/vouchers"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-(--accent) text-white hover:opacity-90 transition-opacity"
          >
            <Receipt className="w-3.5 h-3.5" />
            Vouchers
          </Link>
          <button
            onClick={() => loadData()}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-(--bg-card) border border-(--border-primary) text-(--text-secondary) hover:text-(--text-primary) transition-colors cursor-pointer"
            title="Refresh Day Book"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div
        className="p-4 rounded-2xl space-y-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Date Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-(--text-muted) flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Date:
            </span>
            <button
              onClick={() => setDate(getTodayStr())}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                isToday
                  ? "bg-[#B38646] text-white shadow-xs"
                  : "bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) border border-(--border-primary)"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDate(getYesterdayStr())}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                isYesterday
                  ? "bg-[#B38646] text-white shadow-xs"
                  : "bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) border border-(--border-primary)"
              }`}
            >
              Yesterday
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-(--bg-tertiary) border border-(--border-primary) text-(--text-primary) focus:outline-none focus:border-(--accent)"
            />
          </div>

          {/* Filters: Event Type & Account */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Event Type */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-(--text-muted) flex items-center gap-1">
                <Filter className="w-3 h-3" />
                Type:
              </span>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as unknown as typeof eventType)}
                className="px-3 py-1.5 text-xs font-medium rounded-xl bg-(--bg-tertiary) border border-(--border-primary) text-(--text-primary) focus:outline-none focus:border-(--accent)"
              >
                <option value="ALL">All Events</option>
                <option value="PAYMENT">Payments (Inflow)</option>
                <option value="DISBURSEMENT">Disbursements (Outflow)</option>
                <option value="CLOSURE">Closures</option>
                <option value="ITEM_RELEASE">Item Releases</option>
              </select>
            </div>

            {/* Account Master Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-(--text-muted) flex items-center gap-1">
                <Landmark className="w-3 h-3" />
                Account:
              </span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium rounded-xl bg-(--bg-tertiary) border border-(--border-primary) text-(--text-primary) focus:outline-none focus:border-(--accent) max-w-[200px]"
              >
                <option value="ALL">All Accounts</option>
                <option value="UNASSIGNED">Unassigned / Legacy</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.code}] {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Summary Strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Inflow */}
          <div
            className="p-4 rounded-2xl space-y-1 relative overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--text-muted)">
              <span>Counter Inflow</span>
              <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-extrabold text-emerald-500 font-mono">
              {formatINR(summary.totalInflow)}
            </div>
            <div className="text-[11px] text-(--text-muted)">
              {summary.paymentCount} payment(s) collected
            </div>
          </div>

          {/* Total Outflow */}
          <div
            className="p-4 rounded-2xl space-y-1 relative overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--text-muted)">
              <span>Counter Outflow</span>
              <span className="p-1 rounded-lg bg-rose-500/10 text-rose-500">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-extrabold text-rose-500 font-mono">
              {formatINR(summary.totalOutflow)}
            </div>
            <div className="text-[11px] text-(--text-muted)">
              {summary.disbursementCount} loan disbursement(s)
            </div>
          </div>

          {/* Net Counter Cash Flow */}
          <div
            className="p-4 rounded-2xl space-y-1 relative overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--text-muted)">
              <span>Net Cash Flow</span>
              <span
                className={`p-1 rounded-lg ${
                  parseFloat(summary.netCashFlow) >= 0
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-rose-500/10 text-rose-500"
                }`}
              >
                {parseFloat(summary.netCashFlow) >= 0 ? (
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                ) : (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                )}
              </span>
            </div>
            <div
              className={`text-xl font-extrabold font-mono ${
                parseFloat(summary.netCashFlow) >= 0 ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              {formatINR(summary.netCashFlow)}
            </div>
            <div className="text-[11px] text-(--text-muted)">
              Inflow minus outflow
            </div>
          </div>

          {/* Total Events */}
          <div
            className="p-4 rounded-2xl space-y-1 relative overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-(--text-muted)">
              <span>Day Activity</span>
              <span className="p-1 rounded-lg bg-(--accent-bg) text-(--accent)">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="text-xl font-extrabold text-(--text-primary) font-mono">
              {summary.eventCount}
            </div>
            <div className="text-[11px] text-(--text-muted)">
              {summary.closureCount} closure(s), {summary.itemReleaseCount} item release(s)
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
          <button
            onClick={() => loadData()}
            className="px-3 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-xs font-bold text-rose-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Journal Table */}
      <div
        className="rounded-2xl overflow-hidden shadow-xl"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div className="p-4 border-b border-(--border-primary) flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-(--accent)" />
            <h3 className="font-bold text-sm text-(--text-primary)">
              Journal Transactions ({entries.length})
            </h3>
          </div>
          <span className="text-xs text-(--text-muted)">
            Date: <b className="text-(--text-secondary)">{date}</b>
          </span>
        </div>

        {isPending ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-(--accent)" />
            <p className="text-xs font-medium text-(--text-muted)">Loading journal entries...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Receipt className="w-10 h-10 mx-auto opacity-30 text-(--text-muted)" />
            <p className="text-sm font-semibold text-(--text-secondary)">
              No transactions recorded for this date.
            </p>
            <p className="text-xs text-(--text-muted)">
              Try selecting a different date or clearing the active filters above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr
                  className="border-b border-(--border-primary)"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted)">Time</th>
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted)">Event</th>
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted)">Flow</th>
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted)">Loan & Customer</th>
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted)">Account</th>
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted) text-right">Amount</th>
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted) text-right">Principal After</th>
                  <th className="py-3 px-4 font-bold uppercase text-[10px] text-(--text-muted)">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--border-primary)">
                {entries.map((entry) => {
                  const isPayment = entry.type === "PAYMENT";
                  const isDisb = entry.type === "DISBURSEMENT";
                  const isClosure = entry.type === "CLOSURE";

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-(--bg-tertiary) transition-colors"
                    >
                      {/* Time */}
                      <td className="py-3.5 px-4 font-mono font-medium text-(--text-secondary) whitespace-nowrap">
                        {formatTime(entry.createdAt)}
                      </td>

                      {/* Event Type Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider inline-flex items-center gap-1 ${
                            isPayment
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : isDisb
                              ? "bg-sky-500/10 text-sky-500 border border-sky-500/20"
                              : isClosure
                              ? "bg-purple-500/10 text-purple-500 border border-purple-500/20"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          }`}
                        >
                          {entry.type}
                        </span>
                      </td>

                      {/* Flow Classification */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-bold text-[11px]">
                        {entry.flow === "INFLOW" ? (
                          <span className="text-emerald-500 flex items-center gap-1">
                            <ArrowDownLeft className="w-3 h-3" />
                            + INFLOW
                          </span>
                        ) : entry.flow === "OUTFLOW" ? (
                          <span className="text-rose-500 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3" />
                            − OUTFLOW
                          </span>
                        ) : (
                          <span className="text-(--text-muted) flex items-center gap-1">
                            <Minus className="w-3 h-3" />
                            NEUTRAL
                          </span>
                        )}
                      </td>

                      {/* Loan & Customer */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <Link
                            href={`/loans/${entry.loanId}`}
                            className="font-mono font-bold text-xs text-(--accent) hover:underline"
                          >
                            {entry.loanNumber}
                          </Link>
                          <div className="font-medium text-xs text-(--text-primary)">
                            {entry.customerName}
                          </div>
                          {entry.customerPhone && (
                            <div className="flex items-center gap-1 text-[10px] text-(--text-muted)">
                              <Phone className="w-2.5 h-2.5" />
                              {entry.customerPhone}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Account */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {entry.accountCode && entry.accountId ? (
                          <Link
                            href={`/account-ledger?accountId=${entry.accountId}`}
                            className="group block space-y-0.5 hover:opacity-80 transition-opacity"
                            title="View Account Ledger"
                          >
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-(--accent-bg) text-(--accent) border border-(--accent-border) group-hover:underline">
                              {entry.accountCode}
                            </span>
                            <div className="text-[11px] font-medium text-(--text-secondary)">
                              {entry.accountName}
                            </div>
                          </Link>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-(--bg-tertiary) text-(--text-muted) border border-(--border-primary)">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-mono font-bold text-xs ${
                            isPayment
                              ? "text-emerald-500"
                              : isDisb
                              ? "text-rose-500"
                              : "text-(--text-muted)"
                          }`}
                        >
                          {isPayment ? "+" : isDisb ? "−" : ""}
                          {formatINR(entry.amount)}
                        </div>
                      </td>

                      {/* Principal After */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono text-xs text-(--text-secondary)">
                        {formatINR(entry.principalAfter)}
                      </td>

                      {/* Reference */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5 max-w-[220px]">
                          {entry.referenceId && (
                            <div className="font-mono text-[10px] font-bold text-(--text-secondary) truncate">
                              Ref: {entry.referenceId}
                            </div>
                          )}
                          <div className="text-[11px] text-(--text-muted) line-clamp-1" title={entry.description}>
                            {entry.description}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
