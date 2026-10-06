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
  Printer,
  Ban,
  Clock,
  Trash2,
  FolderPlus,
  Settings2,
  Send,
  X,
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
  postDraftVoucherAction,
  cancelVoucherAction,
  deleteDraftVoucherAction,
  listVouchersAction,
  listAccountsForVouchersAction,
  getVoucherCategoriesAction,
  createVoucherCategoryAction,
  createVoucherSubcategoryAction,
  deleteVoucherSubcategoryAction,
} from "./actions";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface VoucherCategory {
  id: string;
  type: "INCOME" | "EXPENSE";
  name: string;
  subcategories: string[];
}

interface VoucherItem {
  id: string;
  voucherNumber: string;
  voucherType: "RECEIPT" | "PAYMENT";
  status: "DRAFT" | "POSTED" | "CANCELLED";
  amount: string | number;
  partyName: string;
  category: string;
  subcategory: string;
  paymentMode: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  date: string;
  referenceNo?: string | null;
  notes: string;
  ledgerEntryId?: string | null;
  reversalEntryId?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
}

export function VouchersClient() {
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<VoucherCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Filters & Search
  const [filterType, setFilterType] = useState<"ALL" | "RECEIPT" | "PAYMENT">("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "DRAFT" | "POSTED" | "CANCELLED">("ALL");
  const [search, setSearch] = useState("");

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"RECEIPT" | "PAYMENT">("RECEIPT");
  const [formAccountId, setFormAccountId] = useState("");
  const [formPartyName, setFormPartyName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [formAmount, setFormAmount] = useState<number | "">("");
  const [formPaymentMode, setFormPaymentMode] = useState<"CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER">("CASH");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formReferenceNo, setFormReferenceNo] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Quick Add Category / Subcategory Modal
  const [addCatModalOpen, setAddCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"INCOME" | "EXPENSE">("EXPENSE");

  const [addSubcatModalOpen, setAddSubcatModalOpen] = useState(false);
  const [newSubcatName, setNewSubcatName] = useState("");

  // Category Manager Modal
  const [manageCatOpen, setManageCatOpen] = useState(false);

  // Cancellation Modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [targetVoucher, setTargetVoucher] = useState<VoucherItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Print Slip Modal
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printVoucher, setPrintVoucher] = useState<VoucherItem | null>(null);

  const loadData = () => {
    startTransition(async () => {
      setLoading(true);
      try {
        const [vList, accList, catList] = await Promise.all([
          listVouchersAction(),
          listAccountsForVouchersAction(),
          getVoucherCategoriesAction(),
        ]);
        setVouchers(vList as any);
        setAccounts(accList as any);
        setCategories(catList as any);

        if (accList && accList.length > 0 && !formAccountId) {
          const cashAcc = accList.find((a: any) => a.code === "CASH-01") || accList[0];
          setFormAccountId(cashAcc.id);
        }
      } catch (err) {
        console.error("Failed to load voucher data:", err);
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  // Set default category and subcategory when modal opens or type changes
  const openCreateModal = (type: "RECEIPT" | "PAYMENT") => {
    setModalType(type);
    setFormError(null);
    setFormPartyName("");
    setFormAmount("");
    setFormReferenceNo("");
    setFormNotes("");
    setFormDate(new Date().toISOString().slice(0, 10));

    // Filter categories relevant for this type
    const targetType = type === "RECEIPT" ? "INCOME" : "EXPENSE";
    const relevantCats = categories.filter((c) => c.type === targetType);
    const chosenCat = relevantCats[0] || categories[0];

    if (chosenCat) {
      setFormCategory(chosenCat.name);
      setFormSubcategory(chosenCat.subcategories[0] || "");
    } else {
      setFormCategory(type === "RECEIPT" ? "Income" : "Expense");
      setFormSubcategory(type === "RECEIPT" ? "Capital Introduction" : "Rent");
    }

    setCreateModalOpen(true);
  };

  // Handle Category selection change to auto-update available subcategories
  const handleCategoryChange = (catName: string) => {
    setFormCategory(catName);
    const found = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
    if (found && found.subcategories.length > 0) {
      setFormSubcategory(found.subcategories[0]);
    } else {
      setFormSubcategory("");
    }
  };

  // Save new category
  const handleCreateNewCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await createVoucherCategoryAction(newCatType, newCatName.trim());
      if (res.success && res.categories) {
        setCategories(res.categories);
        setFormCategory(newCatName.trim());
        setFormSubcategory("");
        setNewCatName("");
        setAddCatModalOpen(false);
      }
    } catch (e: any) {
      alert(e.message || "Failed to create category");
    }
  };

  // Save new subcategory
  const handleCreateNewSubcategory = async () => {
    if (!newSubcatName.trim() || !formCategory) return;
    try {
      const res = await createVoucherSubcategoryAction(formCategory, newSubcatName.trim());
      if (res.success && res.categories) {
        setCategories(res.categories);
        setFormSubcategory(newSubcatName.trim());
        setNewSubcatName("");
        setAddSubcatModalOpen(false);
      }
    } catch (e: any) {
      alert(e.message || "Failed to create subcategory");
    }
  };

  // Delete subcategory in Manager
  const handleDeleteSubcategory = async (categoryName: string, subcategoryName: string) => {
    if (!confirm(`Delete subcategory "${subcategoryName}"?`)) return;
    try {
      const res = await deleteVoucherSubcategoryAction(categoryName, subcategoryName);
      if (res.success && res.categories) {
        setCategories(res.categories);
      }
    } catch (e: any) {
      alert(e.message || "Failed to delete subcategory");
    }
  };

  // Submit Voucher (Draft or Posted)
  const handleSubmitVoucher = async (asDraft: boolean) => {
    setFormError(null);
    const num = typeof formAmount === "number" ? formAmount : parseFloat(String(formAmount));
    if (isNaN(num) || num <= 0) {
      setFormError("Please enter an amount greater than zero.");
      return;
    }
    if (!formPartyName.trim()) {
      setFormError(modalType === "RECEIPT" ? "Received From (Party) is required." : "Paid To (Payee) is required.");
      return;
    }
    if (!formCategory.trim()) {
      setFormError("Category is required.");
      return;
    }
    if (!formSubcategory.trim()) {
      setFormError("Subcategory is required.");
      return;
    }

    startTransition(async () => {
      const res = await createVoucherAction({
        voucherType: modalType,
        amount: num,
        partyName: formPartyName.trim(),
        category: formCategory.trim(),
        subcategory: formSubcategory.trim(),
        paymentMode: formPaymentMode,
        accountId: formAccountId || undefined,
        date: formDate,
        referenceNo: formReferenceNo.trim() || undefined,
        notes: formNotes.trim() || undefined,
        asDraft,
      });

      if (!res.success) {
        setFormError(res.error || "Failed to create voucher.");
      } else {
        setCreateModalOpen(false);
        loadData();
      }
    });
  };

  // Post a Draft Voucher
  const handlePostDraft = async (voucherId: string) => {
    startTransition(async () => {
      const res = await postDraftVoucherAction(voucherId);
      if (!res.success) {
        alert(res.error || "Failed to post voucher");
      } else {
        loadData();
      }
    });
  };

  // Delete an Unposted Draft
  const handleDeleteDraft = async (voucherId: string) => {
    if (!confirm("Delete this draft voucher? (Zero funds have moved)")) return;
    startTransition(async () => {
      const res = await deleteDraftVoucherAction(voucherId);
      if (!res.success) {
        alert(res.error || "Failed to delete draft");
      } else {
        loadData();
      }
    });
  };

  // Confirm Cancellation (Reversal)
  const handleConfirmCancellation = async () => {
    if (!targetVoucher) return;
    setCancelError(null);
    startTransition(async () => {
      const res = await cancelVoucherAction(targetVoucher.id, cancelReason);
      if (!res.success) {
        setCancelError(res.error || "Failed to cancel voucher.");
      } else {
        setCancelModalOpen(false);
        setTargetVoucher(null);
        setCancelReason("");
        loadData();
      }
    });
  };

  // Filtered Vouchers
  const filteredVouchers = vouchers.filter((v) => {
    if (filterType !== "ALL" && v.voucherType !== filterType) return false;
    if (filterStatus !== "ALL" && v.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        v.voucherNumber.toLowerCase().includes(q) ||
        v.partyName.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        v.subcategory.toLowerCase().includes(q) ||
        v.accountName.toLowerCase().includes(q) ||
        (v.notes && v.notes.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const activeCategoryObj = categories.find((c) => c.name.toLowerCase() === formCategory.toLowerCase());
  const availableSubcategories = activeCategoryObj?.subcategories || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <PageHeader
          title="Cash & Bank Vouchers"
          description="Record money received and paid with Category/Subcategory classification and automatic ledger posting"
        />

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageCatOpen(true)}
            className="text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Settings2 className="w-4 h-4 text-(--accent)" />
            <span>Categories</span>
          </Button>

          <Button
            onClick={() => openCreateModal("RECEIPT")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>+ Receive Money (Jama)</span>
          </Button>

          <Button
            onClick={() => openCreateModal("PAYMENT")}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>- Send Money (Kharcha)</span>
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="glass-card p-4 space-y-3 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-(--bg-card) border border-(--border-primary) text-xs font-semibold">
            {(["ALL", "DRAFT", "POSTED", "CANCELLED"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterStatus === st
                    ? "bg-[#B38646] text-white shadow-xs"
                    : "text-(--text-muted) hover:text-(--text-primary)"
                }`}
              >
                {st === "ALL" ? "All Statuses" : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Type Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-(--bg-card) border border-(--border-primary) text-xs font-semibold">
            {(["ALL", "RECEIPT", "PAYMENT"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterType === t
                    ? "bg-[#B38646] text-white shadow-xs"
                    : "text-(--text-muted) hover:text-(--text-primary)"
                }`}
              >
                {t === "ALL" ? "All Types" : t === "RECEIPT" ? "Received (Jama)" : "Paid (Kharcha)"}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text-muted)" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by party name, voucher number, category, subcategory..."
            className="input-field w-full pl-10 pr-4 py-2 text-xs rounded-xl"
          />
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="glass-card overflow-hidden rounded-2xl border border-(--border-secondary)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-(--bg-secondary) border-b border-(--border-secondary) text-(--text-muted) uppercase text-[10px] tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4">Voucher No</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Party / Account</th>
                <th className="py-3 px-4">Category ➔ Subcategory</th>
                <th className="py-3 px-4">Account & Mode</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-secondary)">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-(--text-muted)">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#B38646]" />
                    <span>Loading vouchers...</span>
                  </td>
                </tr>
              ) : filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-(--text-muted)">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">No vouchers found</p>
                    <p className="text-[11px] mt-0.5">Click "Receive Money" or "Send Money" to record a counter voucher.</p>
                  </td>
                </tr>
              ) : (
                filteredVouchers.map((v) => {
                  const isRec = v.voucherType === "RECEIPT";
                  return (
                    <tr key={v.id} className="hover:bg-(--bg-secondary)/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-(--text-primary)">
                        {v.voucherNumber}
                      </td>
                      <td className="py-3 px-4 text-(--text-secondary) font-mono">
                        {new Date(v.date || v.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isRec
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {isRec ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {isRec ? "Received" : "Paid"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            v.status === "DRAFT"
                              ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                              : v.status === "POSTED"
                              ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                              : "bg-red-500/15 text-red-500 border border-red-500/30 line-through"
                          }`}
                        >
                          {v.status === "DRAFT" && <Clock className="w-3 h-3" />}
                          {v.status === "POSTED" && <CheckCircle2 className="w-3 h-3" />}
                          {v.status === "CANCELLED" && <Ban className="w-3 h-3" />}
                          {v.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-(--text-primary)">
                        <div>{v.partyName}</div>
                        {v.notes && <div className="text-[10px] text-(--text-muted) truncate max-w-xs">{v.notes}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-(--text-secondary)">{v.category}</span>
                        <span className="text-(--text-muted) mx-1">➔</span>
                        <span className="font-mono text-[#B38646] font-bold">{v.subcategory}</span>
                      </td>
                      <td className="py-3 px-4 text-(--text-secondary)">
                        <div className="font-medium">{v.accountName}</div>
                        <div className="text-[10px] text-(--text-muted) font-mono">{v.paymentMode}</div>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                          isRec ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {isRec ? "+" : "-"}₹{Number(v.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* DRAFT Actions: Post or Delete */}
                          {v.status === "DRAFT" && (
                            <>
                              <button
                                onClick={() => handlePostDraft(v.id)}
                                title="Post to Financial Ledger"
                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteDraft(v.id)}
                                title="Delete Draft"
                                className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* POSTED Actions: Cancel (Reversal) & Print */}
                          {v.status === "POSTED" && (
                            <>
                              <button
                                onClick={() => {
                                  setPrintVoucher(v);
                                  setPrintModalOpen(true);
                                }}
                                title="Print Voucher Slip"
                                className="p-1.5 rounded-lg bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) transition-all cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setTargetVoucher(v);
                                  setCancelReason("");
                                  setCancelError(null);
                                  setCancelModalOpen(true);
                                }}
                                title="Cancel (Posts Audit Reversal)"
                                className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* CANCELLED Actions: Print with Cancelled Watermark */}
                          {v.status === "CANCELLED" && (
                            <button
                              onClick={() => {
                                setPrintVoucher(v);
                                setPrintModalOpen(true);
                              }}
                              title="Print Cancelled Voucher Slip"
                              className="p-1.5 rounded-lg bg-(--bg-secondary) text-(--text-secondary) hover:text-(--text-primary) transition-all cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== CREATE VOUCHER MODAL ==================== */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {modalType === "RECEIPT" ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                  <span>Receive Money (Jama Voucher)</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-500 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <span>Send Money (Kharcha Voucher)</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {formError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Row 1: Amount & Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Amount (₹) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-(--text-muted)">₹</span>
                  <Input
                    type="number"
                    step="any"
                    min="1"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="pl-7 font-mono font-bold text-sm"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Voucher Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Row 2: Category & Subcategory with [+ Add New] */}
            <div className="grid grid-cols-2 gap-3">
              {/* Category */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Category *</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCatType(modalType === "RECEIPT" ? "INCOME" : "EXPENSE");
                      setNewCatName("");
                      setAddCatModalOpen(true);
                    }}
                    className="text-[10px] font-bold text-[#B38646] hover:underline cursor-pointer"
                  >
                    + Add New
                  </button>
                </div>
                <select
                  value={formCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="input-field w-full py-2 text-xs rounded-xl"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Subcategory */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Subcategory *</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewSubcatName("");
                      setAddSubcatModalOpen(true);
                    }}
                    className="text-[10px] font-bold text-[#B38646] hover:underline cursor-pointer"
                  >
                    + Add New
                  </button>
                </div>
                <select
                  value={formSubcategory}
                  onChange={(e) => setFormSubcategory(e.target.value)}
                  className="input-field w-full py-2 text-xs rounded-xl"
                >
                  {availableSubcategories.length === 0 ? (
                    <option value="">No subcategories (Click + Add)</option>
                  ) : (
                    availableSubcategories.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Row 3: Party / Account Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {modalType === "RECEIPT" ? "Received From (Party / Customer Name) *" : "Paid To (Payee / Vendor / Party) *"}
              </Label>
              <Input
                value={formPartyName}
                onChange={(e) => setFormPartyName(e.target.value)}
                placeholder={modalType === "RECEIPT" ? "e.g. Ramesh Owner, Bullion Dealer" : "e.g. Office Landlord, Electricity Board, Staff Name"}
                className="text-xs"
              />
            </div>

            {/* Row 4: Target Cash/Bank Account & Payment Mode */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Deposit / Payment Account *</Label>
                <select
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  className="input-field w-full py-2 text-xs rounded-xl"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Mode</Label>
                <select
                  value={formPaymentMode}
                  onChange={(e) => setFormPaymentMode(e.target.value as any)}
                  className="input-field w-full py-2 text-xs rounded-xl"
                >
                  <option value="CASH">Cash in Hand</option>
                  <option value="UPI">UPI / QR Transfer</option>
                  <option value="BANK_TRANSFER">Bank IMPS / NEFT</option>
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            {/* Row 5: Reference / Remarks */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reference / Remarks (Optional)</Label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Bill number, cheque no, transaction UTR, or notes..."
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-(--border-secondary)">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>

            {/* Button 1: Save as Draft */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSubmitVoucher(true)}
              disabled={isPending}
              className="text-amber-500 font-bold border border-amber-500/30"
              title="Save as DRAFT (editable, no ledger posting)"
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              <span>Save as Draft</span>
            </Button>

            {/* Button 2: Post Voucher */}
            <Button
              size="sm"
              onClick={() => handleSubmitVoucher(false)}
              disabled={isPending}
              className={
                modalType === "RECEIPT"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  : "bg-rose-600 hover:bg-rose-700 text-white font-bold"
              }
              title="Post immediately to Financial Ledger"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              <span>Post Voucher</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== QUICK ADD CATEGORY MODAL ==================== */}
      <Dialog open={addCatModalOpen} onOpenChange={setAddCatModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-[#B38646]" />
              <span>Create New Category</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category Type</Label>
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as any)}
                className="input-field w-full py-1.5 text-xs rounded-xl"
              >
                <option value="EXPENSE">Expense (Kharcha)</option>
                <option value="INCOME">Income (Jama / Revenue)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category Name *</Label>
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Operating Expense, Partner Drawings"
                className="text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAddCatModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateNewCategory} className="bg-[#B38646] text-white font-bold">
              Add Category
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== QUICK ADD SUBCATEGORY MODAL ==================== */}
      <Dialog open={addSubcatModalOpen} onOpenChange={setAddSubcatModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#B38646]" />
              <span>Add Subcategory to "{formCategory}"</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Subcategory / Ledger Head *</Label>
              <Input
                value={newSubcatName}
                onChange={(e) => setNewSubcatName(e.target.value)}
                placeholder="e.g. Internet Bill, Tea & Refreshments, Audit Fee"
                className="text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAddSubcatModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateNewSubcategory} className="bg-[#B38646] text-white font-bold">
              Add Subcategory
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== CATEGORIES MANAGER MODAL ==================== */}
      <Dialog open={manageCatOpen} onOpenChange={setManageCatOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-[#B38646]" />
              <span>Voucher Category & Subcategory Master</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2 text-xs">
            <p className="text-(--text-muted)">
              Configure the income and expense ledger heads for voucher classification. These appear in the voucher creation dropdowns.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories.map((cat) => (
                <div key={cat.id} className="p-4 rounded-xl bg-(--bg-secondary) border border-(--border-secondary) space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-(--border-secondary)">
                    <div>
                      <span className="font-bold text-sm text-(--text-primary)">{cat.name}</span>
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-(--accent-bg) text-(--accent)">
                        {cat.type}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-(--text-muted)">Subcategories:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.subcategories.map((sub) => (
                        <span
                          key={sub}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-(--bg-card) border border-(--border-primary) text-[11px] text-(--text-secondary)"
                        >
                          <span>{sub}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubcategory(cat.name, sub)}
                            className="text-(--text-muted) hover:text-red-500 cursor-pointer ml-0.5"
                            title="Delete"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== CANCELLATION (REVERSAL) MODAL ==================== */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-500">
              <Ban className="w-5 h-5" />
              <span>Cancel Voucher (Audit Reversal)</span>
            </DialogTitle>
          </DialogHeader>

          {targetVoucher && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-(--text-primary)">
                <div className="font-mono font-bold text-red-500 text-sm">{targetVoucher.voucherNumber}</div>
                <div className="text-(--text-muted) mt-0.5">
                  ₹{Number(targetVoucher.amount).toLocaleString("en-IN")} · {targetVoucher.partyName} ({targetVoucher.category} ➔ {targetVoucher.subcategory})
                </div>
              </div>

              <p className="text-(--text-secondary)">
                <strong>Golden Rule #5 Enforced:</strong> This posted voucher will NOT be deleted. Instead, an automatic compensating <strong>REVERSAL</strong> will be written to the ledger to adjust your cash/bank balance.
              </p>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cancellation Reason *</Label>
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Duplicate entry, wrong amount entered, cheque bounced"
                  className="text-xs"
                  autoFocus
                />
              </div>

              {cancelError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCancelModalOpen(false)} disabled={isPending}>
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmCancellation}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Ban className="w-4 h-4 mr-1" />}
              Confirm Reversal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== PRINT SLIP MODAL ==================== */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Counter Voucher Slip</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 cursor-pointer print:hidden"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </DialogTitle>
          </DialogHeader>

          {printVoucher && (
            <div className="space-y-4 pt-2 font-mono text-xs text-black bg-white p-6 rounded-xl border border-gray-300">
              {/* Slip Header */}
              <div className="text-center pb-3 border-b-2 border-dashed border-gray-400">
                <div className="text-base font-extrabold tracking-wide">PAWNIFY JEWELLERS</div>
                <div className="text-[11px] text-gray-600">Main Branch · Licensed Pawnbrokers</div>
                <div className="text-sm font-bold mt-2 uppercase tracking-wider text-black">
                  {printVoucher.voucherType === "RECEIPT" ? "RECEIPT VOUCHER (JAMA)" : "PAYMENT VOUCHER (KHARCHA)"}
                </div>
                {printVoucher.status === "CANCELLED" && (
                  <div className="text-xs font-bold text-red-600 uppercase mt-1">*** CANCELLED / REVERSED ***</div>
                )}
              </div>

              {/* Voucher Meta */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pb-3 border-b border-gray-200">
                <div>
                  <span className="text-gray-500">Voucher No: </span>
                  <span className="font-bold">{printVoucher.voucherNumber}</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-500">Date: </span>
                  <span>
                    {new Date(printVoucher.date || printVoucher.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {/* Particulars */}
              <div className="space-y-2 py-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">{printVoucher.voucherType === "RECEIPT" ? "Received From:" : "Paid To:"}</span>
                  <span className="font-bold">{printVoucher.partyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Classification:</span>
                  <span>{printVoucher.category} ➔ {printVoucher.subcategory}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Account & Mode:</span>
                  <span>{printVoucher.accountName} ({printVoucher.paymentMode})</span>
                </div>
                {printVoucher.notes && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Remarks:</span>
                    <span>{printVoucher.notes}</span>
                  </div>
                )}
              </div>

              {/* Amount Box */}
              <div className="p-3 my-2 bg-gray-100 rounded-lg flex items-center justify-between border border-gray-300">
                <span className="font-bold text-sm uppercase">Amount:</span>
                <span className="text-base font-extrabold">
                  ₹{Number(printVoucher.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Signatures */}
              <div className="pt-8 flex justify-between text-[10px] text-gray-600">
                <div>
                  <div className="border-t border-gray-400 pt-1 w-24 text-center">Receiver / Payee</div>
                </div>
                <div>
                  <div className="border-t border-gray-400 pt-1 w-24 text-center">Authorized Signatory</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
