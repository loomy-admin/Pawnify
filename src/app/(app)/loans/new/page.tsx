"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ItemPhotosUploader } from "@/components/item-photos-uploader";
import { useCreateLoanMutation } from "@/lib/redux/api/loansApi";
import {
  Coins,
  Search,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  User,
  Scale,
  Calculator,
  Calendar,
  Percent,
  RotateCcw,
  Sparkles,
  FileText,
} from "lucide-react";

interface CustomerSearchResult {
  id: string;
  fullName: string;
  phone: string;
  city: string;
}

interface LoanItemForm {
  metalType: "GOLD" | "SILVER";
  description: string;
  purityLabel: string;
  purityPercent: number | "";
  isCustomPurity?: boolean;
  grossWeightGrams: number | "";
  stoneWeightGrams: number | "";
  valuationRatePerGram: number | "";
  packetNumber: string;
  storageLocation: string;
  photoUrls: string[];
}

const GOLD_PURITIES = [
  { label: "24K (99.9%)", value: 99.9, code: "24K" },
  { label: "22K (91.6%)", value: 91.6, code: "22K" },
  { label: "18K (75.0%)", value: 75.0, code: "18K" },
  { label: "14K (58.5%)", value: 58.5, code: "14K" },
];

const SILVER_PURITIES = [
  { label: "Fine Silver (99.9%)", value: 99.9, code: "999" },
  { label: "Sterling Silver (92.5%)", value: 92.5, code: "925" },
  { label: "Commercial Silver (80.0%)", value: 80.0, code: "800" },
];

function createBlankItem(metal: "GOLD" | "SILVER" = "GOLD", rate: number = 7850): LoanItemForm {
  return {
    metalType: metal,
    description: "",
    purityLabel: metal === "GOLD" ? "22K" : "Sterling Silver",
    purityPercent: metal === "GOLD" ? 91.6 : 92.5,
    isCustomPurity: false,
    grossWeightGrams: "",
    stoneWeightGrams: "",
    valuationRatePerGram: rate,
    packetNumber: "",
    storageLocation: "",
    photoUrls: [],
  };
}

function NewLoanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get("customerId") || "";

  const [createLoan, { isLoading: loading }] = useCreateLoanMutation();
  const [error, setError] = useState<string | null>(null);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  // ==================== Step 1: Customer State ====================
  const [customerQuery, setCustomerQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  // Initial Customer Fetch if URL param exists
  useEffect(() => {
    if (initialCustomerId && !selectedCustomer) {
      fetch(`/api/customers/search?q=${initialCustomerId}`)
        .then((res) => res.json())
        .then((data: CustomerSearchResult[]) => {
          if (data && data.length > 0) setSelectedCustomer(data[0]);
        })
        .catch(console.error);
    }
  }, [initialCustomerId, selectedCustomer]);

  // Customer Typeahead
  useEffect(() => {
    if (customerQuery.length < 2) {
      const t = setTimeout(() => setSearchResults([]), 0);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/customers/search?q=${encodeURIComponent(customerQuery)}`)
        .then((res) => res.json())
        .then((data) => {
          setSearchResults(Array.isArray(data) ? data : []);
          setSearching(false);
        })
        .catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  // Spot Rates Cache
  const [spotRates, setSpotRates] = useState<{
    gold: number;
    silver: number;
    ltvTier1Percent: number;
    ltvTier2Percent: number;
    ltvTier3Percent: number;
    ltvTier1Max: number;
    ltvTier2Max: number;
  }>({
    gold: 7850,
    silver: 98.5,
    ltvTier1Percent: 85,
    ltvTier2Percent: 80,
    ltvTier3Percent: 75,
    ltvTier1Max: 250000,
    ltvTier2Max: 500000,
  });

  // Loan Date & Terms
  const [loanDate, setLoanDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tenureMonths, setTenureMonths] = useState<number | "">(12);
  const [interestRateMonthly, setInterestRateMonthly] = useState<number | "">(1.5);
  const [principalAmount, setPrincipalAmount] = useState<number | "">("");
  const [processingFee, setProcessingFee] = useState<number | "">("");
  const [gracePeriodDays, setGracePeriodDays] = useState<number>(7);

  // Collateral Items State
  const [items, setItems] = useState<LoanItemForm[]>([createBlankItem("GOLD", 7850)]);

  // Fetch live market spot rates on mount
  useEffect(() => {
    fetch("/api/market-rates")
      .then((res) => res.json())
      .then((data) => {
        if (data?.rates) {
          const gold = data.rates.goldRatePerGram;
          const silver = data.rates.silverRatePerGram;
          const margin = data.rates.safetyMarginPercent || 0;
          const effGold = Number((gold * (1 - margin / 100)).toFixed(2));
          const effSilver = Number((silver * (1 - margin / 100)).toFixed(2));

          setSpotRates({
            gold: effGold,
            silver: effSilver,
            ltvTier1Percent: data.rates.ltvTier1Percent || 85,
            ltvTier2Percent: data.rates.ltvTier2Percent || 80,
            ltvTier3Percent: data.rates.ltvTier3Percent || 75,
            ltvTier1Max: data.rates.ltvTier1Max || 250000,
            ltvTier2Max: data.rates.ltvTier2Max || 500000,
          });

          if (data.rates.defaultInterestMonthly) {
            setInterestRateMonthly(data.rates.defaultInterestMonthly);
          }
          if (data.rates.defaultGraceDays) {
            setGracePeriodDays(data.rates.defaultGraceDays);
          }

          setItems((prev) =>
            prev.map((it) => ({
              ...it,
              valuationRatePerGram: it.metalType === "GOLD" ? effGold : effSilver,
            }))
          );
        }
      })
      .catch((err) => console.error("Failed to fetch market rates:", err));
  }, []);

  // Item field mutator
  const handleItemChange = (index: number, field: keyof LoanItemForm, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      if (field === "metalType") {
        const isGold = value === "GOLD";
        updated[index].valuationRatePerGram = isGold ? spotRates.gold : spotRates.silver;
        updated[index].purityLabel = isGold ? "22K" : "Sterling Silver";
        updated[index].purityPercent = isGold ? 91.6 : 92.5;
        updated[index].isCustomPurity = false;
      }
      return updated;
    });
  };

  const handlePuritySelect = (index: number, label: string, percent: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index].purityLabel = label;
      updated[index].purityPercent = percent;
      updated[index].isCustomPurity = false;
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, createBlankItem("GOLD", spotRates.gold)]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Independent Step Resets
  const handleResetStep1 = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setLoanDate(new Date().toISOString().slice(0, 10));
    setTenureMonths(12);
  };

  const handleResetStep2 = () => {
    setItems([createBlankItem("GOLD", spotRates.gold)]);
  };

  const handleResetStep3 = () => {
    setPrincipalAmount("");
    setProcessingFee("");
    setInterestRateMonthly(1.5);
    setGracePeriodDays(7);
  };

  // Aggregated Collateral Math
  const { totalGross, totalNet, totalFine, totalAssessedValue } = useMemo(() => {
    let gross = 0;
    let net = 0;
    let fine = 0;
    let assessed = 0;

    for (const item of items) {
      const g = typeof item.grossWeightGrams === "number" ? item.grossWeightGrams : 0;
      const s = typeof item.stoneWeightGrams === "number" ? item.stoneWeightGrams : 0;
      const p = typeof item.purityPercent === "number" ? item.purityPercent : 0;
      const rate = typeof item.valuationRatePerGram === "number" ? item.valuationRatePerGram : 0;

      const itemNet = Math.max(0, g - s);
      const itemFine = itemNet * (p / 100);
      const itemAssessed = itemFine * rate;

      gross += g;
      net += itemNet;
      fine += itemFine;
      assessed += itemAssessed;
    }

    return {
      totalGross: Number(gross.toFixed(3)),
      totalNet: Number(net.toFixed(3)),
      totalFine: Number(fine.toFixed(3)),
      totalAssessedValue: Math.round(assessed),
    };
  }, [items]);

  // Tiered Eligible Limit Calculation
  const { eligibleAmount, ltvPercent } = useMemo(() => {
    if (totalAssessedValue <= 0) return { eligibleAmount: 0, ltvPercent: 75 };

    let ltv = spotRates.ltvTier3Percent;
    if (totalAssessedValue <= spotRates.ltvTier1Max) {
      ltv = spotRates.ltvTier1Percent;
    } else if (totalAssessedValue <= spotRates.ltvTier2Max) {
      ltv = spotRates.ltvTier2Percent;
    }

    const eligible = Math.floor(totalAssessedValue * (ltv / 100));
    return { eligibleAmount: eligible, ltvPercent: ltv };
  }, [totalAssessedValue, spotRates]);

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent, asDraft = false) => {
    e.preventDefault();
    setSubmittingDraft(asDraft);
    setError(null);

    if (!selectedCustomer) {
      setError("Please select or add a customer to proceed.");
      return;
    }

    const principalNum = typeof principalAmount === "number" ? principalAmount : parseFloat(String(principalAmount));
    if (isNaN(principalNum) || principalNum <= 0) {
      setError("Please enter a valid loan principal amount.");
      return;
    }

    if (eligibleAmount > 0 && principalNum > eligibleAmount) {
      setError(`Principal amount ₹${principalNum.toLocaleString("en-IN")} exceeds eligible cap of ₹${eligibleAmount.toLocaleString("en-IN")} (${ltvPercent}% LTV).`);
      return;
    }

    // Format items
    const formattedItems = items.map((item, idx) => {
      const g = typeof item.grossWeightGrams === "number" ? item.grossWeightGrams : parseFloat(String(item.grossWeightGrams)) || 0;
      const s = typeof item.stoneWeightGrams === "number" ? item.stoneWeightGrams : parseFloat(String(item.stoneWeightGrams)) || 0;
      const p = typeof item.purityPercent === "number" ? item.purityPercent : parseFloat(String(item.purityPercent)) || 91.6;
      const r = typeof item.valuationRatePerGram === "number" ? item.valuationRatePerGram : parseFloat(String(item.valuationRatePerGram)) || (item.metalType === "GOLD" ? spotRates.gold : spotRates.silver);

      if (g <= 0) {
        throw new Error(`Item #${idx + 1} gross weight must be greater than zero.`);
      }

      return {
        metalType: item.metalType,
        description: item.description.trim() || `${item.metalType === "GOLD" ? "Gold" : "Silver"} Ornament`,
        purityLabel: item.purityLabel || (item.metalType === "GOLD" ? "22K" : "Sterling Silver"),
        purityPercent: p,
        grossWeightGrams: g,
        stoneWeightGrams: s,
        valuationRatePerGram: r,
        packetNumber: item.packetNumber.trim() || `PKT-${Date.now().toString().slice(-4)}`,
        storageLocation: item.storageLocation.trim() || "Main Safe",
        photoUrl: item.photoUrls && item.photoUrls.length > 0 ? item.photoUrls[0] : "",
      };
    });

    try {
      const tenure = typeof tenureMonths === "number" && tenureMonths > 0 ? tenureMonths : 12;
      const rate = typeof interestRateMonthly === "number" && interestRateMonthly > 0 ? interestRateMonthly : 1.5;
      const fee = typeof processingFee === "number" ? processingFee : parseFloat(String(processingFee)) || 0;

      const res = await createLoan({
        customerId: selectedCustomer.id,
        items: formattedItems,
        tenureMonths: tenure,
        interestRateMonthly: rate,
        principalAmount: principalNum,
        gracePeriodDays: gracePeriodDays || 7,
        processingFee: fee,
        loanType: "STANDARD",
        asDraft,
      });

      if ("error" in res) {
        const msg = (res.error as any)?.message || "Failed to create loan contract";
        setError(msg);
      } else if (res.data?.loanId) {
        router.push(`/loans/${res.data.loanId}`);
      } else {
        router.push("/loans");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disburse loan contract");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <PageHeader
          title="New Loan Disbursal"
          description="Indian style pledge ticket · Non-mandatory entries · Real-time bullion valuation"
        />
        <Link
          href="/loans"
          className="btn-secondary text-xs px-3 py-1.5 self-start sm:self-auto inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Loans</span>
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ==================== Step 1: Customer & Term Terms ==================== */}
        <div className="glass-card p-5 sm:p-6 space-y-5 rounded-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#C59A58]/20 flex items-center justify-center text-[#B38646]">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-(--text-primary)">
                  Step 1: Customer & Loan Details
                </h2>
                <p className="text-[11px] text-(--text-muted)">
                  Select existing customer or register new customer
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetStep1}
              className="text-[11px] font-semibold text-(--text-muted) hover:text-(--text-primary) flex items-center gap-1 cursor-pointer transition-colors"
              title="Reset Step 1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Customer Search / Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-(--text-secondary) flex items-center justify-between">
                <span>Customer Selection *</span>
                <Link
                  href="/customers/new"
                  target="_blank"
                  className="text-[11px] text-[#B38646] hover:underline font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ New Customer</span>
                </Link>
              </label>

              {selectedCustomer ? (
                <div className="p-3.5 rounded-xl bg-(--bg-secondary) border border-(--border-primary) flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#B38646]/20 text-[#B38646] font-bold text-xs flex items-center justify-center">
                      {selectedCustomer.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-(--text-primary)">
                        {selectedCustomer.fullName}
                      </div>
                      <div className="text-[11px] font-mono text-(--text-muted)">
                        {selectedCustomer.phone} {selectedCustomer.city && `· ${selectedCustomer.city}`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs text-red-500 hover:underline font-semibold cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    className="input-field w-full pl-9 pr-4 py-2.5 text-xs rounded-xl"
                    placeholder="Search customer by name or mobile number..."
                  />
                  {searching && (
                    <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                  )}

                  {/* Dropdown list */}
                  {searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-20 glass-card max-h-48 overflow-y-auto rounded-xl shadow-xl divide-y divide-(--border-secondary)">
                      {searchResults.map((cust) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(cust);
                            setSearchResults([]);
                            setCustomerQuery("");
                          }}
                          className="w-full text-left p-2.5 text-xs hover:bg-(--bg-secondary) transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-(--text-primary)">{cust.fullName}</div>
                            <div className="text-[11px] font-mono text-(--text-muted)">
                              {cust.phone} {cust.city && `· ${cust.city}`}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-[#B38646]">Select</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Loan Date & Flexible Tenure */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-(--text-secondary) flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-(--text-muted)" />
                  <span>Loan Date</span>
                </label>
                <input
                  type="date"
                  value={loanDate}
                  onChange={(e) => setLoanDate(e.target.value)}
                  className="input-field w-full text-xs py-2 px-3 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-(--text-secondary)">
                  Tenure (Months)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 12"
                  className="input-field w-full text-xs py-2 px-3 rounded-xl font-mono"
                />
                <div className="flex items-center gap-1 pt-1">
                  {[3, 6, 12, 24].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTenureMonths(m)}
                      className={`text-[10px] px-2 py-0.5 rounded-md border font-mono transition-all cursor-pointer ${
                        tenureMonths === m
                          ? "bg-[#B38646] text-white border-[#B38646]"
                          : "bg-(--bg-secondary) border-(--border-primary) text-(--text-secondary) hover:text-(--text-primary)"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== Step 2: Collateral Items ==================== */}
        <div className="glass-card p-5 sm:p-6 space-y-5 rounded-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#C59A58]/20 flex items-center justify-center text-[#B38646]">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-(--text-primary)">
                  Step 2: Collateral Items ({items.length})
                </h2>
                <p className="text-[11px] text-(--text-muted)">
                  Gross weight, deductions, purity, and valuation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetStep2}
                className="text-[11px] font-semibold text-(--text-muted) hover:text-(--text-primary) flex items-center gap-1 cursor-pointer transition-colors"
                title="Reset Step 2"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
              <button
                type="button"
                onClick={addItem}
                className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#B38646]" />
                <span>Add Item</span>
              </button>
            </div>
          </div>

          {/* Items Container */}
          <div className="space-y-6">
            {items.map((item, idx) => {
              const g = typeof item.grossWeightGrams === "number" ? item.grossWeightGrams : 0;
              const s = typeof item.stoneWeightGrams === "number" ? item.stoneWeightGrams : 0;
              const p = typeof item.purityPercent === "number" ? item.purityPercent : 0;
              const rate = typeof item.valuationRatePerGram === "number" ? item.valuationRatePerGram : 0;

              const net = Math.max(0, g - s);
              const fine = net * (p / 100);
              const assessed = Math.round(fine * rate);

              const purityPresets = item.metalType === "GOLD" ? GOLD_PURITIES : SILVER_PURITIES;

              return (
                <div
                  key={idx}
                  className="p-4 sm:p-5 rounded-2xl bg-(--bg-secondary) border border-(--border-primary) space-y-4 relative"
                >
                  {/* Item Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-(--border-secondary)">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-[#B38646]/20 text-[#B38646] font-bold text-xs flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-bold text-(--text-primary)">
                        {item.description || `${item.metalType === "GOLD" ? "Gold" : "Silver"} Item`}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-[#B38646]">
                        {item.purityLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[11px] text-(--text-muted) mr-1.5">Value:</span>
                        <span className="text-xs font-bold font-mono text-(--text-primary)">
                          ₹{assessed.toLocaleString("en-IN")}
                        </span>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1 rounded-md text-red-400 hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metal Type & Description */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-(--text-secondary) block mb-1">
                        Metal Type
                      </label>
                      <div className="flex rounded-xl p-1 bg-(--bg-card) border border-(--border-primary)">
                        <button
                          type="button"
                          onClick={() => handleItemChange(idx, "metalType", "GOLD")}
                          className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            item.metalType === "GOLD"
                              ? "bg-[#B38646] text-white shadow-xs"
                              : "text-(--text-tertiary) hover:text-(--text-primary)"
                          }`}
                        >
                          Gold
                        </button>
                        <button
                          type="button"
                          onClick={() => handleItemChange(idx, "metalType", "SILVER")}
                          className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            item.metalType === "SILVER"
                              ? "bg-slate-600 text-white shadow-xs"
                              : "text-(--text-tertiary) hover:text-(--text-primary)"
                          }`}
                        >
                          Silver
                        </button>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-(--text-secondary) block mb-1">
                        Item Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                        placeholder="e.g. 22K Gold Bangles, Men's Ring, Silver Plate..."
                        className="input-field w-full text-xs py-2 px-3 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Purity Selector with Custom Option */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-(--text-secondary)">
                        Purity / Karat
                      </label>
                      <button
                        type="button"
                        onClick={() => handleItemChange(idx, "isCustomPurity", !item.isCustomPurity)}
                        className="text-[11px] text-[#B38646] font-semibold hover:underline cursor-pointer"
                      >
                        {item.isCustomPurity ? "Use Standard Presets" : "+ Enter Custom Purity"}
                      </button>
                    </div>

                    {!item.isCustomPurity ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {purityPresets.map((pur) => (
                          <button
                            key={pur.code}
                            type="button"
                            onClick={() => handlePuritySelect(idx, pur.code, pur.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              item.purityPercent === pur.value
                                ? "bg-[#B38646] text-white border-[#B38646] shadow-xs"
                                : "bg-(--bg-card) border-(--border-primary) text-(--text-secondary) hover:text-(--text-primary)"
                            }`}
                          >
                            {pur.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-(--bg-card) border border-(--border-primary)">
                        <div>
                          <label className="text-[10px] font-semibold text-(--text-muted) block mb-1">
                            Custom Label
                          </label>
                          <input
                            type="text"
                            value={item.purityLabel}
                            onChange={(e) => handleItemChange(idx, "purityLabel", e.target.value)}
                            placeholder="e.g. 20K, 84.5%, Hallmarked"
                            className="input-field w-full text-xs py-1.5 px-2.5 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-(--text-muted) block mb-1">
                            Purity Percentage (%)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            max="100"
                            value={item.purityPercent}
                            onChange={(e) =>
                              handleItemChange(
                                idx,
                                "purityPercent",
                                e.target.value === "" ? "" : parseFloat(e.target.value)
                              )
                            }
                            placeholder="e.g. 84.50"
                            className="input-field w-full text-xs py-1.5 px-2.5 rounded-lg font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Weights & Calculation Progression */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-(--text-secondary)">
                        Gross Wt (g) *
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={item.grossWeightGrams}
                        onChange={(e) =>
                          handleItemChange(
                            idx,
                            "grossWeightGrams",
                            e.target.value === "" ? "" : parseFloat(e.target.value)
                          )
                        }
                        placeholder="0.000"
                        className="input-field w-full text-xs py-2 px-3 rounded-xl font-mono font-bold text-(--text-primary)"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-(--text-secondary)">
                        Stone / Wax Wt (g)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={item.stoneWeightGrams}
                        onChange={(e) =>
                          handleItemChange(
                            idx,
                            "stoneWeightGrams",
                            e.target.value === "" ? "" : parseFloat(e.target.value)
                          )
                        }
                        placeholder="0.000"
                        className="input-field w-full text-xs py-2 px-3 rounded-xl font-mono text-(--text-secondary)"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-(--text-muted)">
                        Net Wt (g)
                      </label>
                      <div className="input-field w-full text-xs py-2 px-3 rounded-xl font-mono bg-(--bg-card) border border-(--border-secondary) text-(--text-secondary) flex items-center">
                        {net.toFixed(3)}g
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-(--text-muted)">
                        Fine Wt (g)
                      </label>
                      <div className="input-field w-full text-xs py-2 px-3 rounded-xl font-mono bg-(--bg-card) border border-(--border-secondary) font-bold text-[#B38646] flex items-center">
                        {fine.toFixed(3)}g
                      </div>
                    </div>
                  </div>

                  {/* Valuation Rate & Storage Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-(--text-secondary)">
                        Valuation Rate (₹/g)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#B38646]">
                          ₹
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          value={item.valuationRatePerGram}
                          onChange={(e) =>
                            handleItemChange(
                              idx,
                              "valuationRatePerGram",
                              e.target.value === "" ? "" : parseFloat(e.target.value)
                            )
                          }
                          className="input-field w-full pl-7 pr-3 py-2 text-xs rounded-xl font-mono font-semibold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-(--text-secondary)">
                        Packet / Tag No. (Optional)
                      </label>
                      <input
                        type="text"
                        value={item.packetNumber}
                        onChange={(e) => handleItemChange(idx, "packetNumber", e.target.value)}
                        placeholder="Auto-generated if empty"
                        className="input-field w-full text-xs py-2 px-3 rounded-xl font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-(--text-secondary)">
                        Safe Location (Optional)
                      </label>
                      <input
                        type="text"
                        value={item.storageLocation}
                        onChange={(e) => handleItemChange(idx, "storageLocation", e.target.value)}
                        placeholder="e.g. Safe A / Shelf 2"
                        className="input-field w-full text-xs py-2 px-3 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Collateral Photo Uploader directly on item */}
                  <div className="pt-2 border-t border-(--border-secondary)">
                    <ItemPhotosUploader
                      photos={item.photoUrls}
                      onChange={(urls) => handleItemChange(idx, "photoUrls", urls)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ==================== Step 3: Valuation, Financials & Disbursal ==================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left 2 Cols: Loan Financial Terms */}
          <div className="lg:col-span-2 glass-card p-5 sm:p-6 space-y-5 rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#C59A58]/20 flex items-center justify-center text-[#B38646]">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-(--text-primary)">
                    Step 3: Disbursal & Financial Terms
                  </h2>
                  <p className="text-[11px] text-(--text-muted)">
                    Principal amount, Indian monthly interest rate, and fees
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetStep3}
                className="text-[11px] font-semibold text-(--text-muted) hover:text-(--text-primary) flex items-center gap-1 cursor-pointer transition-colors"
                title="Reset Step 3"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* Principal Amount Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-(--text-secondary)">
                    Principal Amount to Disburse (₹) *
                  </label>
                  {eligibleAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPrincipalAmount(eligibleAmount)}
                      className="text-xs font-bold text-[#B38646] hover:underline cursor-pointer"
                    >
                      Max Eligible (₹{eligibleAmount.toLocaleString("en-IN")})
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-extrabold text-[#B38646]">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    max={eligibleAmount > 0 ? eligibleAmount : undefined}
                    value={principalAmount}
                    onChange={(e) =>
                      setPrincipalAmount(e.target.value === "" ? "" : parseFloat(e.target.value))
                    }
                    placeholder="Enter principal amount"
                    className="input-field w-full pl-9 pr-4 py-3 text-lg font-bold font-mono text-(--text-primary) rounded-xl"
                    required
                  />
                </div>

                {eligibleAmount > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[0.25, 0.5, 0.75, 1].map((ratio) => {
                      const val = Math.round(eligibleAmount * ratio);
                      return (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setPrincipalAmount(val)}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-(--bg-secondary) border border-(--border-primary) text-(--text-secondary) hover:text-(--text-primary) hover:border-[#B38646] font-mono transition-all cursor-pointer"
                        >
                          {ratio * 100}% (₹{val.toLocaleString("en-IN")})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Monthly Interest Rate (Indian Style) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-(--text-secondary) flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5 text-[#B38646]" />
                      <span>Monthly Interest Rate</span>
                    </label>
                    <span className="text-[11px] font-mono text-(--text-muted)">
                      ₹{typeof interestRateMonthly === "number" ? interestRateMonthly.toFixed(2) : "0.00"} / ₹100 pm
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="10"
                      value={interestRateMonthly}
                      onChange={(e) =>
                        setInterestRateMonthly(e.target.value === "" ? "" : parseFloat(e.target.value))
                      }
                      placeholder="e.g. 1.50"
                      className="input-field w-full py-2.5 px-3 text-sm font-mono font-bold rounded-xl"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-(--text-muted)">
                      % pm
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    {[1.0, 1.25, 1.5, 2.0, 2.5, 3.0].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setInterestRateMonthly(rate)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-mono transition-all cursor-pointer ${
                          interestRateMonthly === rate
                            ? "bg-[#B38646] text-white border-[#B38646]"
                            : "bg-(--bg-secondary) border-(--border-primary) text-(--text-secondary) hover:text-(--text-primary)"
                        }`}
                      >
                        ₹{rate.toFixed(2)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Processing Fee */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-(--text-secondary)">
                    Processing Fee (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-(--text-muted)">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={processingFee}
                      onChange={(e) =>
                        setProcessingFee(e.target.value === "" ? "" : parseFloat(e.target.value))
                      }
                      placeholder="0"
                      className="input-field w-full pl-7 pr-3 py-2.5 text-sm font-mono rounded-xl"
                    />
                  </div>
                  <span className="text-[10px] text-(--text-muted) block pt-1">
                    Optional deduction or initial fee
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons: Cancel, Save Draft (Step 3 Flow), Disburse Loan (Instant) */}
            <div className="pt-4 border-t border-(--border-secondary) flex items-center justify-end gap-3 flex-wrap">
              <Link href="/loans" className="btn-secondary text-xs px-4 py-2.5">
                Cancel
              </Link>

              {/* Step 3: Save as Draft */}
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={loading || !selectedCustomer}
                className="bg-amber-600/15 border border-amber-600/40 text-amber-500 hover:bg-amber-600/25 text-xs px-5 py-2.5 inline-flex items-center gap-1.5 font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                title="Save as DRAFT without releasing funds"
              >
                {loading && submittingDraft ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Draft...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Save Draft (Awaiting Approval)</span>
                  </>
                )}
              </button>

              {/* Instant Counter Disbursal */}
              <button
                type="submit"
                onClick={() => setSubmittingDraft(false)}
                disabled={loading || !selectedCustomer}
                className="btn-primary text-xs px-6 py-2.5 inline-flex items-center gap-2 font-bold shadow-md disabled:opacity-50 cursor-pointer"
                title="Direct counter disbursal (marks ACTIVE immediately)"
              >
                {loading && !submittingDraft ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Disbursing Loan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Disburse Loan Contract</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right 1 Col: Valuation Summary Card */}
          <div className="glass-card p-5 space-y-4 rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-(--border-secondary)">
              <span className="text-xs font-bold uppercase tracking-wider text-(--text-muted)">
                Valuation Summary
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#B38646]/20 text-[#B38646]">
                {ltvPercent}% LTV Cap
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-(--text-muted)">Total Gross Weight</span>
                <span className="font-mono font-bold text-(--text-primary)">
                  {totalGross.toFixed(3)}g
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-(--text-muted)">Total Net Weight</span>
                <span className="font-mono font-bold text-(--text-primary)">
                  {totalNet.toFixed(3)}g
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-(--text-muted)">Pure / Fine Weight</span>
                <span className="font-mono font-extrabold text-[#B38646]">
                  {totalFine.toFixed(3)}g
                </span>
              </div>
              <div className="pt-2 border-t border-(--border-secondary) flex items-center justify-between">
                <span className="font-semibold text-(--text-secondary)">Total Assessed Value</span>
                <span className="text-sm font-extrabold font-mono text-(--text-primary)">
                  ₹{totalAssessedValue.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-(--text-secondary)">Max Eligible Loan</span>
                <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  ₹{eligibleAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-(--bg-secondary) border border-(--border-secondary) text-[11px] text-(--text-muted) space-y-1">
              <div className="font-semibold text-(--text-secondary)">Standard Indian Pawn Terms:</div>
              <div>• Simple interest Actual/365 convention</div>
              <div>• Grace period: {gracePeriodDays} days after maturity</div>
              <div>• Collateral safely insured in physical custody</div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewLoanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-(--accent)" />
        </div>
      }
    >
      <NewLoanForm />
    </Suspense>
  );
}
