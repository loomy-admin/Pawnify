"use client";

import React, { useState, useEffect, useTransition } from "react";
import { PageHeader } from "@/components/page-header";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Loader2,
  Calendar,
  Wallet,
  Receipt,
  Search,
  CheckCircle2,
  AlertCircle,
  Filter,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createVoucherAction,
  listVouchersAction,
  listAccountsForVouchersAction,
} from "./actions";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface VoucherItem {
  id: string;
  voucherNumber: string;
  voucherType: "RECEIPT" | "PAYMENT";
  amount: string | number;
  description: string;
  accountCode: string;
  accountName: string;
  createdAt: string;
}

export function VouchersClient() {
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Filter & Search
  const [filterType, setFilterType] = useState<"ALL" | "RECEIPT" | "PAYMENT">("ALL");
  const [search, setSearch] = useState("");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"RECEIPT" | "PAYMENT">("RECEIPT");
  const [amount, setAmount] = useState<number | "">("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [category, setCategory] = useState("CAPITAL_INTRO");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "BANK_TRANSFER" | "CARD">("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vchList, accList] = await Promise.all([
        listVouchersAction(),
        listAccountsForVouchersAction(),
      ]);
      setVouchers(vchList || []);
      setAccounts(accList || []);
      if (accList && accList.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accList[0].id);
      }
    } catch (err) {
      console.error("Failed to load vouchers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = (type: "RECEIPT" | "PAYMENT") => {
    setModalType(type);
    setAmount("");
    setPartyName("");
    setCategory(type === "RECEIPT" ? "CAPITAL_INTRO" : "EXPENSE");
    setPaymentMode("CASH");
    setReferenceNo("");
    setNotes("");
    setError(null);
    setSuccessMsg(null);
    setModalOpen(true);
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid amount greater than zero.");
      return;
    }
    if (!partyName.trim()) {
      setError(
        modalType === "RECEIPT"
          ? "Please specify who money was received from (Party / Owner)."
          : "Please specify who money was paid to (Payee / Purpose)."
      );
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await createVoucherAction({
        voucherType: modalType,
        amount: Number(amount),
        accountId: selectedAccountId || undefined,
        partyName: partyName.trim(),
        category,
        paymentMode,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to record voucher.");
      } else {
        setSuccessMsg("Voucher Recorded & Posted Successfully!");
        loadData();
        setTimeout(() => {
          setModalOpen(false);
        }, 1200);
      }
    });
  };

  const formatINR = (val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "₹0.00";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return dateString;
    }
  };

  const filteredVouchers = vouchers.filter((v) => {
    if (filterType !== "ALL" && v.voucherType !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        v.voucherNumber.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.accountName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <PageHeader
          title="Cash & Bank Vouchers (Jama / Kharcha)"
          description="Non-loan cash movements · Capital introductions · Operating expenses · Partner drawings"
        />

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={() => openCreateModal("RECEIPT")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-2 font-bold shadow-sm"
          >
            <ArrowDownLeft className="w-4 h-4 mr-1.5" />
            Receive Money (Jama)
          </Button>

          <Button
            onClick={() => openCreateModal("PAYMENT")}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs px-3.5 py-2 font-bold shadow-sm"
          >
            <ArrowUpRight className="w-4 h-4 mr-1.5" />
            Send Money (Kharcha)
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {(
            [
              { id: "ALL", label: "All Vouchers" },
              { id: "RECEIPT", label: "Receipts (Jama)" },
              { id: "PAYMENT", label: "Payments (Kharcha)" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterType(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterType === t.id
                  ? "bg-[#B38646] text-white shadow-xs"
                  : "bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary)"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voucher or party..."
            className="input-field w-full pl-8 pr-3 py-1.5 text-xs rounded-lg"
          />
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-(--accent)" />
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="p-12 text-center text-sm text-(--text-muted) space-y-2">
            <Receipt className="w-8 h-8 mx-auto text-(--text-muted)" />
            <p>No vouchers recorded matching your filter.</p>
            <p className="text-xs">Use "Receive Money" or "Send Money" to record a new transaction.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Voucher No.</th>
                  <th>Date & Time</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Account</th>
                  <th>Description / Particulars</th>
                </tr>
              </thead>
              <tbody>
                {filteredVouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="font-mono text-xs font-bold text-(--accent)">
                      {v.voucherNumber}
                    </td>
                    <td className="text-xs text-(--text-muted)">
                      {formatDate(v.createdAt)}
                    </td>
                    <td>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1 ${
                          v.voucherType === "RECEIPT"
                            ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-600 border border-rose-500/30"
                        }`}
                      >
                        {v.voucherType === "RECEIPT" ? (
                          <>
                            <ArrowDownLeft className="w-3 h-3" />
                            Jama (Receipt)
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="w-3 h-3" />
                            Kharcha (Payment)
                          </>
                        )}
                      </span>
                    </td>
                    <td
                      className={`font-mono text-sm font-extrabold ${
                        v.voucherType === "RECEIPT" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {v.voucherType === "RECEIPT" ? "+" : "-"}
                      {formatINR(v.amount)}
                    </td>
                    <td className="text-xs">
                      <span className="font-mono px-2 py-0.5 rounded bg-(--bg-secondary) border border-(--border-primary)">
                        {v.accountCode} - {v.accountName}
                      </span>
                    </td>
                    <td className="text-xs max-w-md truncate text-(--text-secondary)">
                      {v.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Voucher Entry Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg border-(--accent-border) max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white ${
                  modalType === "RECEIPT" ? "bg-emerald-600" : "bg-rose-600"
                }`}
              >
                {modalType === "RECEIPT" ? (
                  <ArrowDownLeft className="w-4 h-4" />
                ) : (
                  <ArrowUpRight className="w-4 h-4" />
                )}
              </div>
              <span>
                {modalType === "RECEIPT"
                  ? "Receive Money (Jama / Receipt Voucher)"
                  : "Send Money (Kharcha / Payment Voucher)"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleCreateVoucher} className="space-y-4">
            {/* Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Voucher Amount (₹) *</Label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-base text-[#B38646]">
                  ₹
                </span>
                <Input
                  type="number"
                  step="any"
                  min="1"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value === "" ? "" : parseFloat(e.target.value))
                  }
                  placeholder="0.00"
                  className="font-mono text-lg font-bold pl-8 py-2.5 h-11"
                  required
                />
              </div>
            </div>

            {/* Account Selector */}
            <div className="space-y-1">
              <Label className="text-xs">
                {modalType === "RECEIPT" ? "Receiving Account" : "Paying Out From Account"} *
              </Label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-(--bg-input) px-3 py-2 text-xs"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Category Selector */}
            <div className="space-y-1">
              <Label className="text-xs">Category / Reason *</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-(--bg-input) px-3 py-2 text-xs"
              >
                {modalType === "RECEIPT" ? (
                  <>
                    <option value="CAPITAL_INTRO">Capital Introduction (Owner / Partner)</option>
                    <option value="PARTNER_INVESTMENT">Partner / Investor Deposit</option>
                    <option value="COMMISSION_INCOME">Commission / Valuation Fee</option>
                    <option value="OTHER_RECEIPT">Other Miscellaneous Income</option>
                  </>
                ) : (
                  <>
                    <option value="EXPENSE">Shop Operating Expense (Rent/Tea/Power)</option>
                    <option value="DRAWING">Partner Drawings (Personal Withdrawal)</option>
                    <option value="SUPPLIER_PAYMENT">Vendor / Supplier Payout</option>
                    <option value="SALARY_WAGES">Staff Salary / Office Wages</option>
                    <option value="OTHER_PAYMENT">Other Miscellaneous Outflow</option>
                  </>
                )}
              </select>
            </div>

            {/* Party Name */}
            <div className="space-y-1">
              <Label className="text-xs">
                {modalType === "RECEIPT" ? "Received From (Party / Name) *" : "Paid To (Payee / Purpose) *"}
              </Label>
              <Input
                type="text"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder={
                  modalType === "RECEIPT"
                    ? "e.g. Rajesh (Owner), Sharma Bullion"
                    : "e.g. Landlord Sharma (Rent), Office Tea, Stationary"
                }
                className="text-xs"
                required
              />
            </div>

            {/* Payment Mode */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Mode of Payment</Label>
                <select
                  value={paymentMode}
                  onChange={(e) =>
                    setPaymentMode(e.target.value as "CASH" | "UPI" | "BANK_TRANSFER" | "CARD")
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-(--bg-input) px-3 py-2 text-xs"
                >
                  <option value="CASH">Counter Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="BANK_TRANSFER">Bank NEFT / RTGS</option>
                  <option value="CARD">Card Swipe</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Reference / Bill No.</Label>
                <Input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="e.g. Bill #104, UTR 29381"
                  className="text-xs"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs">Remarks / Notes (Optional)</Label>
              <Input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes for day book and ledger..."
                className="text-xs"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-(--border-primary)">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !amount}
                className={`text-xs font-bold text-white ${
                  modalType === "RECEIPT"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    Recording...
                  </>
                ) : modalType === "RECEIPT" ? (
                  "Post Receipt Voucher (Jama)"
                ) : (
                  "Post Payment Voucher (Kharcha)"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
