"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RefreshCw,
  Coins,
  Clock,
  MapPin,
  Users,
  BookOpen,
  BarChart3,
  Pencil,
  X,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { MarketRates } from "@/lib/services/market-rates";
import { useGetMarketRatesQuery, useUpdateMarketRatesMutation } from "@/lib/redux/api/marketRatesApi";
import { useSession } from "@/lib/auth-client";

const DEFAULT_RATES: MarketRates = {
  goldRatePerGram: 7850.0,
  silverRatePerGram: 98.5,
  lastUpdated: "Live",
  safetyMarginPercent: 0,
  source: "API",
  ltvTier1Percent: 85,
  ltvTier2Percent: 80,
  ltvTier3Percent: 75,
  ltvTier1Max: 250000,
  ltvTier2Max: 500000,
  defaultInterestMonthly: 1.5,
  defaultGraceDays: 7,
  panThreshold: 50000,
};

const getBreadcrumbTitle = (pathname: string) => {
  if (pathname === "/dashboard" || pathname === "/") return "Dashboard";
  if (pathname.startsWith("/loans")) return "Loans & Collateral";
  if (pathname.startsWith("/customers")) return "Customer Relations";
  if (pathname.startsWith("/day-book")) return "Day Book Register";
  if (pathname.startsWith("/account-ledger")) return "Account Ledger";
  if (pathname.startsWith("/reports")) return "Financial Reports";
  if (pathname.startsWith("/admin/accounts")) return "Account Master";
  if (pathname.startsWith("/admin/staff")) return "Staff Management";
  if (pathname.startsWith("/admin/settings")) return "System Settings";
  if (pathname.startsWith("/profile")) return "User Profile";
  if (pathname.startsWith("/followups")) return "Follow-up Reminders";
  return "Management";
};

export function LiveMarketTicker({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const session = useSession();
  const role = userRole || (session?.data?.user as unknown as { role?: string })?.role;
  const isAdmin = role === "ADMIN";

  const { data, refetch } = useGetMarketRatesQuery(undefined, {
    pollingInterval: 15 * 60 * 1000,
  });
  const [updateMarketRates] = useUpdateMarketRatesMutation();
  const rates: MarketRates = data ?? DEFAULT_RATES;

  const [loading, setLoading] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState("");

  // Rate Editing State (Admin Only)
  const [isEditing, setIsEditing] = useState(false);
  const [goldInput, setGoldInput] = useState("");
  const [silverInput, setSilverInput] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(now);
      setCurrentDateTime(formatted);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const triggerLiveUpdate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cron/update-rates", { method: "POST" });
      if (res.ok) {
        await refetch();
        setJustUpdated(true);
        setTimeout(() => setJustUpdated(false), 4000);
      }
    } catch (err) {
      console.error("Live update trigger error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = () => {
    setGoldInput(rates.goldRatePerGram.toString());
    setSilverInput(rates.silverRatePerGram.toString());
    setSaveError("");
    setIsEditing(true);
  };

  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    const g = parseFloat(goldInput.trim());
    const s = parseFloat(silverInput.trim());

    if (isNaN(g) || g <= 0) {
      setSaveError("Gold rate must be a valid positive number");
      return;
    }
    if (isNaN(s) || s <= 0) {
      setSaveError("Silver rate must be a valid positive number");
      return;
    }

    setIsSaving(true);
    setSaveError("");
    try {
      await updateMarketRates({ goldRate: g, silverRate: s }).unwrap();
      await refetch();
      setIsEditing(false);
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 4000);
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "Failed to update rates";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header
        className="w-full px-4 lg:px-6 py-2.5 text-xs flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors"
        style={{
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border-primary)",
          boxShadow: "0 1px 3px rgba(53, 29, 20, 0.03)",
        }}
      >
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-2 pl-10 lg:pl-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            <span className="text-[#B38646] font-bold text-sm">::</span>
            <span style={{ color: "var(--text-primary)" }}>{getBreadcrumbTitle(pathname)}</span>
          </div>
        </div>

        {/* Center: Quick Action Buttons (Octis style pill container) */}
        <div className="hidden xl:flex items-center gap-1.5 p-1 rounded-xl bg-(--bg-secondary) border border-(--border-primary)">
          <Link
            href="/loans/new"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all hover:bg-white dark:hover:bg-black/30 hover:shadow-xs"
            style={{ color: "var(--text-primary)" }}
          >
            <div className="w-5 h-5 rounded-md bg-[#C59A58]/20 flex items-center justify-center text-[#966727] dark:text-[#E4BE85]">
              <Coins className="w-3 h-3" />
            </div>
            <span>New Loan</span>
          </Link>
          <Link
            href="/customers/new"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all hover:bg-white dark:hover:bg-black/30 hover:shadow-xs"
            style={{ color: "var(--text-primary)" }}
          >
            <div className="w-5 h-5 rounded-md bg-stone-500/15 flex items-center justify-center text-(--text-secondary)">
              <Users className="w-3 h-3" />
            </div>
            <span>Customer</span>
          </Link>
          <Link
            href="/day-book"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all hover:bg-white dark:hover:bg-black/30 hover:shadow-xs"
            style={{ color: "var(--text-primary)" }}
          >
            <div className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center text-amber-700 dark:text-amber-400">
              <BookOpen className="w-3 h-3" />
            </div>
            <span>Day Book</span>
          </Link>
          <Link
            href="/reports"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all hover:bg-white dark:hover:bg-black/30 hover:shadow-xs"
            style={{ color: "var(--text-primary)" }}
          >
            <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <BarChart3 className="w-3 h-3" />
            </div>
            <span>Reports</span>
          </Link>
        </div>

        {/* Right Controls: Branch Tag, Spot Ticker, Rates Edit (Admin), Refresh, Clock */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Branch Selector Pill */}
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-secondary)",
            }}
          >
            <MapPin className="w-3 h-3 text-[#B38646]" />
            <span>Main Branch</span>
          </div>

          {/* Rates Container with Edit button for Admin */}
          <div className="flex items-center gap-1.5">
            {/* Live Gold Spot Pill (Octis Dark Badge Style) */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#241C16] text-white border border-[#482A1F] text-[11px] shadow-xs">
              <span className="text-[#C59A58] font-bold text-[10px] tracking-wider uppercase">999 GOLD</span>
              <span className="font-mono font-bold text-[#F9F6F0]">
                ₹{rates.goldRatePerGram.toLocaleString("en-IN")}/g
              </span>
            </div>

            {/* Live Silver Spot Pill */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-secondary)",
              }}
            >
              <span className="text-[10px] font-semibold text-(--text-muted) uppercase">Silver</span>
              <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                ₹{rates.silverRatePerGram.toLocaleString("en-IN")}/g
              </span>
            </div>

            {/* Admin Rates Edit Button */}
            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenEdit}
                className="p-1.5 rounded-lg border transition-all cursor-pointer hover:bg-[#B38646]/10 hover:border-[#B38646]/40"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-primary)",
                  color: "var(--accent)",
                }}
                title="Edit market spot rates (Admin only)"
                aria-label="Edit market spot rates"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Refresh Spot Button */}
          <button
            type="button"
            onClick={triggerLiveUpdate}
            disabled={loading}
            className="p-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-50"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-primary)",
              color: "var(--text-muted)",
            }}
            title={justUpdated ? "Market rates updated!" : "Refresh market spot rate"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#B38646]" : justUpdated ? "text-emerald-500" : ""}`} />
          </button>

          {/* Live Date/Time Display */}
          {currentDateTime && (
            <div
              className="hidden lg:flex items-center gap-1 text-[11px] font-medium pl-1"
              style={{ color: "var(--text-muted)" }}
            >
              <Clock className="w-3 h-3 text-(--text-muted)" />
              <span>{currentDateTime}</span>
            </div>
          )}
        </div>
      </header>

      {/* Admin Market Rates Edit Modal Dialog */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div
            className="glass-card w-full max-w-md p-6 space-y-5 rounded-2xl shadow-2xl relative"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-card)",
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#C59A58]/20 flex items-center justify-center text-[#B38646]">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                    Update Market Spot Rates
                  </h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Admin privileges · Persists across system
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="p-1 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {saveError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveRates} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  24K Gold Rate (₹ per gram)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-[#B38646]">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={goldInput}
                    onChange={(e) => setGoldInput(e.target.value)}
                    className="input-field w-full pl-8 pr-3 py-2 text-sm font-mono rounded-lg"
                    placeholder="e.g. 7850"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Fine Silver Rate (₹ per gram)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={silverInput}
                    onChange={(e) => setSilverInput(e.target.value)}
                    className="input-field w-full pl-8 pr-3 py-2 text-sm font-mono rounded-lg"
                    placeholder="e.g. 98.50"
                  />
                </div>
              </div>

              <div className="text-[11px] p-2.5 rounded-lg bg-(--bg-secondary) text-(--text-muted)">
                Note: Updating these rates affects valuation calculations for new appraisals. Market rates are independent of calculation mode (never halved).
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 shadow-sm"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Rates</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
