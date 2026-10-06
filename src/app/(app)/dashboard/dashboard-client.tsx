"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useGetDashboardDataQuery } from "@/lib/redux/api/dashboardApi";
import {
  Coins,
  TrendingUp,
  Plus,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Scale,
  Loader2,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";

const formatINR = (val: string | number | undefined | null) => {
  if (val === undefined || val === null) return "₹0";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
};

const formatDate = (dateString: Date | string) => {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
};

const formatDateTime = (dateString: Date | string) => {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
};

type PresetRange = "ALL" | "TODAY" | "WEEK" | "MONTH" | "CUSTOM";

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

function SvgDonut({
  slices,
  size = 110,
  strokeWidth = 14,
  centerLabel,
  centerSublabel,
}: {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string | number;
  centerSublabel?: string;
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="var(--bg-secondary)"
          strokeWidth={strokeWidth}
        />
        {total > 0 &&
          slices.map((slice, i) => {
            if (slice.value <= 0) return null;
            const slicePercent = slice.value / total;
            const strokeDasharray = `${slicePercent * circumference} ${circumference}`;
            const strokeDashoffset = -accumulatedPercent * circumference;
            accumulatedPercent += slicePercent;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
                className="transition-all duration-500 ease-out"
              />
            );
          })}
      </svg>
      {(centerLabel !== undefined || centerSublabel !== undefined) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {centerLabel !== undefined && (
            <span className="text-base font-extrabold leading-none" style={{ color: "var(--text-primary)" }}>
              {centerLabel}
            </span>
          )}
          {centerSublabel && (
            <span className="text-[10px] font-semibold mt-0.5 leading-none" style={{ color: "var(--text-muted)" }}>
              {centerSublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardClient() {
  const [preset, setPreset] = useState<PresetRange>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const filter = useMemo(() => {
    const now = new Date();
    if (preset === "TODAY") {
      const todayStr = now.toISOString().slice(0, 10);
      return { startDate: todayStr, endDate: todayStr };
    }
    if (preset === "WEEK") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        startDate: weekAgo.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      };
    }
    if (preset === "MONTH") {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return {
        startDate: monthAgo.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      };
    }
    if (preset === "CUSTOM") {
      return {
        startDate: customStart || null,
        endDate: customEnd || null,
      };
    }
    return undefined;
  }, [preset, customStart, customEnd]);

  const { data, isLoading, isError } = useGetDashboardDataQuery(filter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-(--accent)" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-sm text-(--text-muted)">
        Failed to load dashboard data.
      </div>
    );
  }

  const { stats, chartData } = data;

  // Metal Breakdown
  const goldItem = chartData?.metalBreakdown?.find((m) => m.name.toLowerCase().includes("gold"));
  const silverItem = chartData?.metalBreakdown?.find((m) => m.name.toLowerCase().includes("silver"));
  const goldCount = goldItem?.count ?? 0;
  const silverCount = silverItem?.count ?? 0;
  const goldValue = goldItem?.value ?? 0;
  const silverValue = silverItem?.value ?? 0;
  const totalMetalLoans = goldCount + silverCount;

  // Loan Status Breakdown
  const activeCount = stats.loanStatusSummary?.active?.count ?? stats.activeCount ?? 0;
  const overdueCount = stats.loanStatusSummary?.overdue?.count ?? stats.overdueCount ?? 0;
  const closedCount = stats.loanStatusSummary?.closed?.count ?? stats.closedCount ?? 0;
  const totalStatusLoans = activeCount + overdueCount + closedCount;

  const statusDonutSlices: DonutSlice[] = [
    { label: "Active", value: activeCount, color: "#10b981" },
    { label: "Overdue", value: overdueCount, color: "#ef4444" },
    { label: "Closed", value: closedCount, color: "#94a3b8" },
  ];

  const metalDonutSlices: DonutSlice[] = [
    { label: "Gold", value: goldCount, color: "#B38646" },
    { label: "Silver", value: silverCount, color: "#94a3b8" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Greeting & Action Controls (Octis Style) */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Good day, Administrator
          </h1>
          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <Calendar className="w-3.5 h-3.5 text-[#B38646]" />
            <span>Today · Main Branch</span>
          </div>
        </div>

        {/* Date Filter & Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset Buttons */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {(
              [
                { id: "TODAY", label: "Today" },
                { id: "WEEK", label: "This Week" },
                { id: "MONTH", label: "This Month" },
                { id: "ALL", label: "All Time" },
                { id: "CUSTOM", label: "Date Range" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setPreset(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  preset === item.id
                    ? "bg-[#B38646] text-white shadow-xs"
                    : "text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--bg-secondary)"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Link
            href="/loans/new"
            className="btn-primary text-xs px-3.5 py-2 inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Loan</span>
          </Link>
        </div>
      </div>

      {/* Custom Date Selector if active */}
      {preset === "CUSTOM" && (
        <div
          className="glass-card p-3 flex items-center gap-3 text-xs"
          style={{ borderColor: "var(--border-card)" }}
        >
          <Filter className="w-4 h-4 text-[#B38646]" />
          <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>
            Select Range:
          </span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="input-field text-xs py-1 px-2.5 rounded-lg max-w-[160px]"
            placeholder="Start Date"
          />
          <span style={{ color: "var(--text-muted)" }}>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="input-field text-xs py-1 px-2.5 rounded-lg max-w-[160px]"
            placeholder="End Date"
          />
        </div>
      )}

      {/* Primary KPIs Grid (Octis 4-Card Luxury Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: NET LOAN DISBURSEMENTS */}
        <div className="glass-card p-5 space-y-3 relative group overflow-hidden">
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              NET DISBURSEMENTS
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#C59A58]/15 text-[#966727] dark:text-[#E4BE85] flex items-center justify-center font-bold text-xs">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div
              className="text-2xl sm:text-3xl font-extrabold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {formatINR(stats.disbursementSummary?.totalDisbursed ?? stats.disbursedPeriod?.amount)}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              <span>{stats.disbursementSummary?.count ?? stats.disbursedPeriod?.count ?? 0} loans</span>
              <span className="mx-1">·</span>
              <span>disbursed in period</span>
            </div>
          </div>
          <div
            className="pt-2.5 border-t text-[11px] flex items-center justify-between"
            style={{ borderColor: "var(--border-secondary)", color: "var(--text-tertiary)" }}
          >
            <span>Lifetime Disbursed</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {formatINR(stats.portfolioSummary?.totalPrincipalDisbursed)}
            </span>
          </div>
        </div>

        {/* Card 2: ACCRUED INTEREST */}
        <div className="glass-card p-5 space-y-3 relative group overflow-hidden">
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              ACCRUED INTEREST
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              Actual/365
            </span>
          </div>
          <div>
            <div
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400"
            >
              {formatINR(stats.totalAccruedInterest ?? 0)}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              <span>Total Exposure: </span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatINR(stats.totalExposure ?? stats.totalAUM)}
              </span>
            </div>
          </div>
          <div
            className="pt-2.5 border-t text-[11px] flex items-center justify-between"
            style={{ borderColor: "var(--border-secondary)", color: "var(--text-tertiary)" }}
          >
            <span>Interest Realized</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {formatINR(stats.collectionsSummary?.interestCollected)}
            </span>
          </div>
        </div>

        {/* Card 3: CASH & BANK COLLECTED */}
        <div className="glass-card p-5 space-y-3 relative group overflow-hidden">
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              CASH & BANK COLLECTED
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400"
            >
              {formatINR(stats.collectionsSummary?.totalCollected ?? stats.collectionsToday.amount)}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              <span>{stats.collectionsPeriod?.count ?? stats.collectionsToday.count} receipts</span>
              <span className="mx-1">·</span>
              <span>net of principal & interest</span>
            </div>
          </div>
          <div
            className="pt-2.5 border-t text-[11px] flex items-center justify-between"
            style={{ borderColor: "var(--border-secondary)", color: "var(--text-tertiary)" }}
          >
            <span>Principal Realized</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {formatINR(stats.collectionsSummary?.principalCollected)}
            </span>
          </div>
        </div>

        {/* Card 4: OUTSTANDING RECEIVABLE */}
        <div className="glass-card p-5 space-y-3 relative group overflow-hidden">
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              OUTSTANDING RECEIVABLE
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div
              className="text-2xl sm:text-3xl font-extrabold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {formatINR(stats.totalPrincipalOutstanding ?? stats.totalAUM)}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              <span>{stats.activeCount} active loans</span>
              <span className="mx-1">·</span>
              <span className="text-red-600 font-semibold">{stats.overdueCount} overdue</span>
            </div>
          </div>
          <div
            className="pt-2.5 border-t text-[11px] flex items-center justify-between"
            style={{ borderColor: "var(--border-secondary)", color: "var(--text-tertiary)" }}
          >
            <span className="text-red-600">Overdue past grace</span>
            <span className="font-bold text-red-600">
              {formatINR(stats.overdueAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Operational 3-Card Summary Grid (Loan Status, Collections, Metal Loan Distribution) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Card 1: Loan Status Summary with Inline SVG Donut Chart */}
        <div className="glass-card p-5 flex flex-col justify-between" style={{ borderColor: "var(--border-card)" }}>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Loan Status Summary
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-(--bg-secondary) border border-(--border-primary)" style={{ color: "var(--accent-text)" }}>
                {totalStatusLoans} Total
              </span>
            </div>

            {/* Donut Chart & Legend */}
            <div className="flex items-center gap-4 py-4">
              <SvgDonut
                slices={statusDonutSlices}
                size={110}
                strokeWidth={14}
                centerLabel={totalStatusLoans}
                centerSublabel="Loans"
              />

              <div className="flex-1 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>Active</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold">{activeCount}</span>
                    <span className="text-[10px] text-(--text-muted) ml-1.5">
                      ({formatINR(stats.loanStatusSummary?.active?.amount)})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    <span className="font-medium text-red-500">Overdue</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-red-500">{overdueCount}</span>
                    <span className="text-[10px] text-red-400 ml-1.5">
                      ({formatINR(stats.loanStatusSummary?.overdue?.amount ?? stats.overdueAmount)})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                    <span className="font-medium" style={{ color: "var(--text-muted)" }}>Closed</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold">{closedCount}</span>
                    <span className="text-[10px] text-(--text-muted) ml-1.5">
                      ({formatINR(stats.loanStatusSummary?.closed?.amount)})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-(--border-secondary) flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Portfolio Quality</span>
            <span className="font-semibold text-emerald-600">
              {totalStatusLoans > 0 ? ((activeCount / totalStatusLoans) * 100).toFixed(0) : 0}% Active Rate
            </span>
          </div>
        </div>

        {/* Card 2: Collections Summary */}
        <div className="glass-card p-5 flex flex-col justify-between" style={{ borderColor: "var(--border-card)" }}>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Collections Summary
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                {stats.collectionsPeriod?.count ?? 0} Receipts
              </span>
            </div>

            <div className="space-y-3 py-3 text-xs">
              <div className="flex items-center justify-between py-0.5">
                <span style={{ color: "var(--text-muted)" }}>Principal Realized</span>
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {formatINR(stats.collectionsSummary?.principalCollected)}
                </span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span style={{ color: "var(--text-muted)" }}>Interest Realized</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatINR(stats.collectionsSummary?.interestCollected)}
                </span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span style={{ color: "var(--text-muted)" }}>Charges Realized</span>
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {formatINR(stats.collectionsSummary?.chargesCollected)}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-(--border-secondary) flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Total Inflow
            </span>
            <span className="text-base font-extrabold text-[#B38646]">
              {formatINR(stats.collectionsSummary?.totalCollected ?? stats.collectionsToday.amount)}
            </span>
          </div>
        </div>

        {/* Card 3: Metal Loan Summary (Gold / Silver Distribution with Inline SVG Donut) */}
        <div className="glass-card p-5 flex flex-col justify-between" style={{ borderColor: "var(--border-card)" }}>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Metal Loan Summary
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                {totalMetalLoans} Pledges
              </span>
            </div>

            {/* Donut Chart & Legend */}
            <div className="flex items-center gap-4 py-4">
              <SvgDonut
                slices={metalDonutSlices}
                size={110}
                strokeWidth={14}
                centerLabel={totalMetalLoans}
                centerSublabel="Items"
              />

              <div className="flex-1 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#B38646] shrink-0" />
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>Gold Loans</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-[#B38646]">{goldCount}</span>
                    <span className="text-[10px] text-(--text-muted) ml-1.5">
                      ({formatINR(goldValue)})
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                    <span className="font-medium" style={{ color: "var(--text-secondary)" }}>Silver Loans</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold">{silverCount}</span>
                    <span className="text-[10px] text-(--text-muted) ml-1.5">
                      ({formatINR(silverValue)})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-(--border-secondary) flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Total Assessed Collateral</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {formatINR(goldValue + silverValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Overdue Attention Table (Left 2 cols) + Recent Disbursals (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Left 2 Cols: Overdue Loans requiring immediate attention */}
        <div className="lg:col-span-2 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span>Action Required: Overdue Accounts</span>
              </h2>
            </div>
            <Link
              href="/loans?status=OVERDUE"
              className="text-xs font-medium flex items-center gap-1 transition-colors hover:underline"
              style={{ color: "var(--accent-text)" }}
            >
              <span>View all ({stats.overdueCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div
            className="glass-card flex-1 flex flex-col overflow-hidden max-h-[380px]"
            style={{ borderColor: "var(--border-card)" }}
          >
            {stats.overdueLoans.length === 0 ? (
              <div
                className="p-12 text-center text-sm flex flex-col items-center justify-center gap-2 h-full"
                style={{ color: "var(--text-muted)" }}
              >
                <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
                <span>No overdue loans currently. All accounts are in good standing!</span>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto flex-1">
                <table className="data-table w-full">
                  <thead className="sticky top-0 z-10 bg-(--bg-card) border-b border-(--border-secondary)">
                    <tr>
                      <th>Loan No.</th>
                      <th>Customer</th>
                      <th>Principal Due</th>
                      <th>Due Date</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.overdueLoans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-red-500/5 transition-colors">
                        <td className="font-mono text-xs font-medium">
                          <Link
                            href={`/loans/${loan.id}`}
                            className="hover:underline font-bold"
                            style={{ color: "var(--accent-text)" }}
                          >
                            {loan.loanNumber}
                          </Link>
                        </td>
                        <td>
                          <div className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                            {loan.customer.fullName}
                          </div>
                          <div className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
                            {loan.customer.phone}
                          </div>
                        </td>
                        <td className="font-semibold text-xs text-red-500">
                          {formatINR(loan.principalOutstanding.toString())}
                        </td>
                        <td className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {formatDate(loan.dueDate)}
                          <div className="text-[10px] text-red-500 font-medium">
                            +{loan.gracePeriodDays}d grace passed
                          </div>
                        </td>
                        <td className="text-right">
                          <Link
                            href={`/loans/${loan.id}`}
                            className="btn-secondary text-xs px-2.5 py-1"
                          >
                            Collect
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Recent Disbursals */}
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Recent Disbursals
            </h2>
            <Link
              href="/loans"
              className="text-xs font-medium flex items-center gap-1 transition-colors hover:underline"
              style={{ color: "var(--accent-text)" }}
            >
              <span>All Loans</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div
            className="glass-card flex-1 flex flex-col overflow-hidden max-h-[380px]"
            style={{ borderColor: "var(--border-card)" }}
          >
            {stats.recentLoans.length === 0 ? (
              <div className="p-8 text-center text-sm text-(--text-muted) flex items-center justify-center h-full">
                No recent loan disbursals found.
              </div>
            ) : (
              <div className="overflow-y-auto divide-y divide-(--border-secondary) flex-1">
                {stats.recentLoans.map((loan) => (
                  <Link
                    key={loan.id}
                    href={`/loans/${loan.id}`}
                    className="block p-3.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="font-mono text-xs font-bold"
                        style={{ color: "var(--accent-text)" }}
                      >
                        {loan.loanNumber}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                          loan.displayStatus === "ACTIVE"
                            ? "badge-active"
                            : loan.displayStatus === "OVERDUE"
                              ? "badge-overdue"
                              : "badge-closed"
                        }`}
                      >
                        {loan.displayStatus}
                      </span>
                    </div>
                    <div
                      className="font-medium text-xs truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {loan.customer.fullName}
                    </div>
                    <div
                      className="flex items-center justify-between mt-1.5 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span className="text-[11px]">{formatDate(loan.loanDate)}</span>
                      <span className="font-bold text-xs" style={{ color: "var(--text-primary)" }}>
                        {formatINR(loan.principalAmount.toString())}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Operational Section: Recent Financial Activity (Single-Entry Audit Log) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Recent Financial Activity (Single-Entry Audit Log)
            </h2>
          </div>
          <Link
            href="/reports?tab=transactions"
            className="text-xs font-medium flex items-center gap-1 transition-colors hover:underline"
            style={{ color: "var(--accent-text)" }}
          >
            <span>Full Transaction History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="glass-card overflow-hidden" style={{ borderColor: "var(--border-card)" }}>
          {(!stats.recentActivity || stats.recentActivity.length === 0) ? (
            <div className="p-8 text-center text-sm text-(--text-muted)">
              No financial activity recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="data-table w-full">
                <thead className="sticky top-0 z-10 bg-(--bg-card) border-b border-(--border-secondary)">
                  <tr>
                    <th>Date & Time</th>
                    <th>Type</th>
                    <th>Flow</th>
                    <th>Amount</th>
                    <th>Principal After</th>
                    <th>Loan No.</th>
                    <th>Customer</th>
                    <th>Account</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentActivity.map((act) => (
                    <tr key={act.id}>
                      <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatDateTime(act.createdAt)}
                      </td>
                      <td className="font-mono text-xs font-semibold">
                        {act.type}
                      </td>
                      <td>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1 ${
                            act.flow === "INFLOW"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : act.flow === "OUTFLOW"
                                ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                : "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                          }`}
                        >
                          {act.flow === "INFLOW" && <ArrowDownLeft className="w-3 h-3" />}
                          {act.flow === "OUTFLOW" && <ArrowUpRight className="w-3 h-3" />}
                          {act.flow}
                        </span>
                      </td>
                      <td className="font-bold text-xs" style={{ color: "var(--text-primary)" }}>
                        {formatINR(act.amount)}
                      </td>
                      <td className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {formatINR(act.principalAfter)}
                      </td>
                      <td className="font-mono text-xs font-medium">
                        <Link
                          href={`/loans/${(act as any).loanId || act.loanNumber}`}
                          className="hover:underline font-bold"
                          style={{ color: "var(--accent-text)" }}
                        >
                          {act.loanNumber}
                        </Link>
                      </td>
                      <td>
                        <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                          {act.customerName}
                        </div>
                      </td>
                      <td className="text-xs">
                        {act.accountCode ? (
                          <span className="font-mono font-medium text-[11px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5">
                            {act.accountCode} - {act.accountName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-(--text-muted) italic">
                            Unassigned
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
