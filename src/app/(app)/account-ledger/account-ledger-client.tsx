"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import {
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  Minus,
  Calendar,
  Filter,
  RefreshCw,
  Loader2,
  Phone,
  Search,
  BookOpen,
  AlertCircle,
  AlertTriangle,
  Scale,
  Wallet,
} from "lucide-react";
import { getAccountLedgerAction, listAccountsForLedgerSelectorAction } from "./actions";

interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  description?: string | null;
}

interface AccountLedgerEntry {
  id: string;
  createdAt: string;
  type: "DISBURSEMENT" | "PAYMENT" | "CLOSURE" | "ITEM_RELEASE";
  flow: "INFLOW" | "OUTFLOW" | "NEUTRAL";
  amount: string;
  principalAfter: string;
  runningBalance: string;
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

interface AccountLedgerSummary {
  openingBalance: string;
  totalInflow: string;
  totalOutflow: string;
  netMovement: string;
  closingBalance: string;
  transactionCount: number;
  paymentCount: number;
  disbursementCount: number;
  closureCount: number;
  itemReleaseCount: number;
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

const formatDate = (isoString: string) => {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "---";
  }
};

const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthStartStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

const getLast30DaysStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function AccountLedgerClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialAccountId = searchParams.get("accountId") || "";

  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId);
  const [selectedAccount, setSelectedAccount] = useState<LedgerAccount | null>(null);

  const [datePreset, setDatePreset] = useState<"ALL_TIME" | "TODAY" | "THIS_MONTH" | "LAST_30" | "CUSTOM">("ALL_TIME");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [eventType, setEventType] = useState<"ALL" | "PAYMENT" | "DISBURSEMENT" | "CLOSURE" | "ITEM_RELEASE">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [entries, setEntries] = useState<AccountLedgerEntry[]>([]);
  const [summary, setSummary] = useState<AccountLedgerSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  // Load account list
  useEffect(() => {
    let isMounted = true;
    listAccountsForLedgerSelectorAction()
      .then((accs) => {
        if (!isMounted) return;
        setAccounts(accs as LedgerAccount[]);
        if (!selectedAccountId && accs.length > 0) {
          const defaultAcc = accs.find((a: LedgerAccount) => /cash|counter/i.test(`${a.code} ${a.name}`)) || accs[0];
          setSelectedAccountId(defaultAcc.id);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Failed to load accounts.");
      });
    return () => {
      isMounted = false;
    };
  }, [selectedAccountId]);

  // Fetch ledger data
  const fetchLedger = useCallback(
    async (accId: string, sDate: string, eDate: string, eType: typeof eventType, q: string) => {
      if (!accId) return;
      setLoading(true);
      setError(null);

      try {
        const res = await getAccountLedgerAction({
          accountId: accId,
          startDate: sDate || null,
          endDate: eDate || null,
          eventType: eType,
          search: q || undefined,
          sortOrder: "asc",
        });

        startTransition(() => {
          setSelectedAccount(res.account as LedgerAccount);
          setEntries(res.entries as AccountLedgerEntry[]);
          setSummary(res.summary as AccountLedgerSummary);
          setLoading(false);
        });
      } catch (err: unknown) {
        startTransition(() => {
          setError(err instanceof Error ? err.message : "Failed to load Account Ledger data.");
          setLoading(false);
        });
      }
    },
    []
  );

  // Trigger fetch when parameters change
  useEffect(() => {
    if (selectedAccountId) {
      fetchLedger(selectedAccountId, startDate, endDate, eventType, searchQuery);
    }
  }, [selectedAccountId, startDate, endDate, eventType, searchQuery, fetchLedger]);

  const handleAccountChange = (newAccId: string) => {
    setSelectedAccountId(newAccId);
    router.replace(`/account-ledger?accountId=${newAccId}`);
  };

  const handleDatePreset = (preset: typeof datePreset) => {
    setDatePreset(preset);
    if (preset === "ALL_TIME") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "TODAY") {
      const today = getTodayStr();
      setStartDate(today);
      setEndDate(today);
    } else if (preset === "THIS_MONTH") {
      setStartDate(getMonthStartStr());
      setEndDate(getTodayStr());
    } else if (preset === "LAST_30") {
      setStartDate(getLast30DaysStr());
      setEndDate(getTodayStr());
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <PageHeader
        title="Account Ledger"
        description="Chronological transaction journal, dynamic running balances, and cash flows for master accounts."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/day-book"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer hover:bg-(--bg-tertiary)"
              style={{
                borderColor: "var(--border-primary)",
                color: "var(--text-secondary)",
                background: "var(--bg-card)",
              }}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Day Book</span>
            </Link>

            <Link
              href="/admin/accounts"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer hover:bg-(--bg-tertiary)"
              style={{
                borderColor: "var(--border-primary)",
                color: "var(--text-secondary)",
                background: "var(--bg-card)",
              }}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Accounts</span>
            </Link>

            <button
              onClick={() => fetchLedger(selectedAccountId, startDate, endDate, eventType, searchQuery)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer hover:bg-(--bg-tertiary) disabled:opacity-50"
              style={{
                borderColor: "var(--border-primary)",
                color: "var(--text-secondary)",
                background: "var(--bg-card)",
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Account Selector & Filter Card */}
      <div
        className="rounded-2xl p-5 shadow-sm space-y-4"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Account Selector */}
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Select Account
            </label>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                disabled={loading && accounts.length === 0}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-medium border appearance-none transition-all cursor-pointer"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} — {acc.name} ({acc.type}) {!acc.isActive ? "[INACTIVE]" : ""}
                  </option>
                ))}
              </select>
              <Landmark
                className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          </div>

          {/* Date Presets */}
          <div className="md:col-span-5 space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Date Range
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "All Time", value: "ALL_TIME" },
                { label: "Today", value: "TODAY" },
                { label: "This Month", value: "THIS_MONTH" },
                { label: "Last 30 Days", value: "LAST_30" },
                { label: "Custom", value: "CUSTOM" },
              ].map((btn) => (
                <button
                  key={btn.value}
                  type="button"
                  onClick={() => handleDatePreset(btn.value as typeof datePreset)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
                  style={{
                    background:
                      datePreset === btn.value
                        ? "var(--accent)"
                        : "var(--bg-tertiary)",
                    color:
                      datePreset === btn.value
                        ? "var(--text-inverse)"
                        : "var(--text-secondary)",
                    border: `1px solid ${
                      datePreset === btn.value
                        ? "var(--accent)"
                        : "var(--border-primary)"
                    }`,
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Query */}
          <div className="md:col-span-3 space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Search Transactions
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Loan, customer, ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl text-sm border transition-all"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          </div>
        </div>

        {/* Custom Date Pickers (if CUSTOM preset active) */}
        {datePreset === "CUSTOM" && (
          <div
            className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-(--text-muted) w-16">Start Date:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs border flex-1"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-(--text-muted) w-16">End Date:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs border flex-1"
                style={{
                  background: "var(--bg-input)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
        )}

        {/* Event Type Filter Pills */}
        <div
          className="pt-3 border-t flex flex-wrap items-center gap-2"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <span
            className="text-xs font-semibold mr-1 flex items-center gap-1"
            style={{ color: "var(--text-muted)" }}
          >
            <Filter className="w-3 h-3" /> Event:
          </span>
          {[
            { label: "All Events", value: "ALL" },
            { label: "Payments (Inflows)", value: "PAYMENT" },
            { label: "Disbursements (Outflows)", value: "DISBURSEMENT" },
            { label: "Closures", value: "CLOSURE" },
            { label: "Item Releases", value: "ITEM_RELEASE" },
          ].map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => setEventType(pill.value as typeof eventType)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer"
              style={{
                background:
                  eventType === pill.value
                    ? "var(--accent-bg)"
                    : "transparent",
                color:
                  eventType === pill.value
                    ? "var(--accent-text)"
                    : "var(--text-tertiary)",
                border: `1px solid ${
                  eventType === pill.value
                    ? "var(--accent-border)"
                    : "var(--border-primary)"
                }`,
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inactive Account Warning Banner */}
      {selectedAccount && !selectedAccount.isActive && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-600 dark:text-amber-400 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">Account Inactive (Historical Mode)</div>
            <p className="mt-0.5 text-xs opacity-90">
              Account <strong>{selectedAccount.name}</strong> ({selectedAccount.code}) is deactivated.
              Its historical transactions and balances remain fully viewable, but new postings cannot be made to this account.
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-500 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards: Dynamic Balance Derivations */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Opening Balance */}
          <div
            className="p-4 rounded-2xl border transition-all"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between text-xs font-medium text-(--text-muted) mb-1.5">
              <span>Opening Balance</span>
              <Scale className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-bold font-mono tracking-tight" style={{ color: "var(--text-primary)" }}>
              {formatINR(summary.openingBalance)}
            </div>
            <p className="text-[10px] text-(--text-muted) mt-1 truncate">
              {startDate ? `Prior to ${formatDate(startDate)}` : "Initial state"}
            </p>
          </div>

          {/* Period Inflow */}
          <div
            className="p-4 rounded-2xl border transition-all bg-emerald-500/5 border-emerald-500/20"
          >
            <div className="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">
              <span>Total Inflow (+)</span>
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
              +{formatINR(summary.totalInflow)}
            </div>
            <p className="text-[10px] text-(--text-muted) mt-1">
              {summary.paymentCount} payments
            </p>
          </div>

          {/* Period Outflow */}
          <div
            className="p-4 rounded-2xl border transition-all bg-rose-500/5 border-rose-500/20"
          >
            <div className="flex items-center justify-between text-xs font-medium text-rose-600 dark:text-rose-400 mb-1.5">
              <span>Total Outflow (-)</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-bold font-mono tracking-tight text-rose-600 dark:text-rose-400">
              -{formatINR(summary.totalOutflow)}
            </div>
            <p className="text-[10px] text-(--text-muted) mt-1">
              {summary.disbursementCount} disbursements
            </p>
          </div>

          {/* Net Movement */}
          <div
            className="p-4 rounded-2xl border transition-all"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between text-xs font-medium text-(--text-muted) mb-1.5">
              <span>Net Movement</span>
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <div
              className={`text-lg font-bold font-mono tracking-tight ${
                parseFloat(summary.netMovement) > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : parseFloat(summary.netMovement) < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : ""
              }`}
            >
              {parseFloat(summary.netMovement) > 0 ? "+" : ""}
              {formatINR(summary.netMovement)}
            </div>
            <p className="text-[10px] text-(--text-muted) mt-1">
              Inflows minus outflows
            </p>
          </div>

          {/* Closing Balance */}
          <div
            className="p-4 rounded-2xl border transition-all bg-(--accent-bg) border-(--accent-border)"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-(--accent-text) mb-1.5">
              <span>Closing Balance</span>
              <Landmark className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-bold font-mono tracking-tight text-(--accent-text)">
              {formatINR(summary.closingBalance)}
            </div>
            <p className="text-[10px] text-(--text-muted) mt-1">
              Opening + Net
            </p>
          </div>

          {/* Transaction Count */}
          <div
            className="p-4 rounded-2xl border transition-all"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between text-xs font-medium text-(--text-muted) mb-1.5">
              <span>Transactions</span>
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-bold font-mono tracking-tight" style={{ color: "var(--text-primary)" }}>
              {summary.transactionCount}
            </div>
            <p className="text-[10px] text-(--text-muted) mt-1">
              In period
            </p>
          </div>
        </div>
      )}

      {/* Transactions Table Card */}
      <div
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <div>
            <h2 className="text-sm font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Chronological Ledger Journal
            </h2>
            <p className="text-xs mt-0.5 text-(--text-muted)">
              {selectedAccount
                ? `${selectedAccount.code} — ${selectedAccount.name} (${selectedAccount.type})`
                : "Select an account to view transactions"}
            </p>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-(--accent)" />
              <span>Calculating balances...</span>
            </div>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead
              className="text-[11px] font-semibold uppercase tracking-wider border-b select-none"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border-primary)",
                color: "var(--text-muted)",
              }}
            >
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-3">Event</th>
                <th className="py-3 px-3">Flow</th>
                <th className="py-3 px-4">Loan & Customer</th>
                <th className="py-3 px-4">Description / Reference</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Principal After</th>
                <th className="py-3 px-4 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody
              className="divide-y"
              style={{ borderColor: "var(--border-primary)" }}
            >
              {entries.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-(--text-muted)">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Scale className="w-8 h-8 mx-auto opacity-30" />
                      <p className="font-semibold text-sm">No transactions found</p>
                      <p className="text-xs">
                        There are no ledger entries matching the selected account and filter criteria.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-(--bg-tertiary) transition-colors"
                  >
                    {/* Date & Time */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {formatDate(entry.createdAt)}
                      </div>
                      <div className="text-[10px] font-mono text-(--text-muted)">
                        {formatTime(entry.createdAt)}
                      </div>
                    </td>

                    {/* Event Type Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold"
                        style={{
                          background:
                            entry.type === "PAYMENT"
                              ? "rgba(16, 185, 129, 0.12)"
                              : entry.type === "DISBURSEMENT"
                              ? "rgba(244, 63, 94, 0.12)"
                              : "rgba(100, 116, 139, 0.12)",
                          color:
                            entry.type === "PAYMENT"
                              ? "#10b981"
                              : entry.type === "DISBURSEMENT"
                              ? "#f43f5e"
                              : "#64748b",
                        }}
                      >
                        {entry.type}
                      </span>
                    </td>

                    {/* Flow Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          background:
                            entry.flow === "INFLOW"
                              ? "rgba(16, 185, 129, 0.1)"
                              : entry.flow === "OUTFLOW"
                              ? "rgba(244, 63, 94, 0.1)"
                              : "rgba(148, 163, 184, 0.1)",
                          color:
                            entry.flow === "INFLOW"
                              ? "#10b981"
                              : entry.flow === "OUTFLOW"
                              ? "#f43f5e"
                              : "#94a3b8",
                        }}
                      >
                        {entry.flow === "INFLOW" && <ArrowDownLeft className="w-3 h-3" />}
                        {entry.flow === "OUTFLOW" && <ArrowUpRight className="w-3 h-3" />}
                        {entry.flow === "NEUTRAL" && <Minus className="w-3 h-3" />}
                        {entry.flow}
                      </span>
                    </td>

                    {/* Loan & Customer */}
                    <td className="py-3 px-4">
                      <Link
                        href={`/loans/${entry.loanId}`}
                        className="font-mono font-semibold hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        {entry.loanNumber}
                      </Link>
                      <div className="flex items-center gap-1.5 text-[11px] text-(--text-muted) mt-0.5">
                        <span className="truncate max-w-[140px] font-medium" style={{ color: "var(--text-secondary)" }}>
                          {entry.customerName}
                        </span>
                        {entry.customerPhone && (
                          <span className="flex items-center gap-0.5 text-[10px] font-mono">
                            <Phone className="w-2.5 h-2.5" />
                            {entry.customerPhone.slice(-4)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Description / Reference */}
                    <td className="py-3 px-4 max-w-xs">
                      <div className="truncate" style={{ color: "var(--text-secondary)" }}>
                        {entry.description}
                      </div>
                      {entry.referenceId && (
                        <div className="text-[10px] font-mono text-(--text-muted) truncate mt-0.5">
                          Ref: {entry.referenceId}
                        </div>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 text-right font-mono font-semibold whitespace-nowrap">
                      {parseFloat(entry.amount) > 0 ? (
                        <span
                          className={
                            entry.flow === "INFLOW"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }
                        >
                          {entry.flow === "INFLOW" ? "+" : "-"}
                          {formatINR(entry.amount)}
                        </span>
                      ) : (
                        <span className="text-(--text-muted)">₹0.00</span>
                      )}
                    </td>

                    {/* Principal After */}
                    <td className="py-3 px-4 text-right font-mono text-(--text-secondary) whitespace-nowrap">
                      {formatINR(entry.principalAfter)}
                    </td>

                    {/* Running Balance */}
                    <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                      <span
                        className="px-2 py-1 rounded-md text-[11px]"
                        style={{
                          background: "var(--bg-tertiary)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        {formatINR(entry.runningBalance)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
