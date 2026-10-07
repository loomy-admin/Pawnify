"use client";

import React, { useState } from "react";
import confetti from "canvas-confetti";
import {
  useRecordPaymentMutation,
  useCloseLoanMutation,
  useReleaseItemsMutation,
  useApproveLoanMutation,
  useDisburseLoanMutation,
  useCancelDraftLoanMutation,
} from "@/lib/redux/api/loansApi";
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Unlock,
  Printer,
  X,
  TrendingDown,
  Coins,
  ShieldCheck,
  Calendar,
  FileText,
  Receipt,
  Layers,
  Ban,
  RotateCcw,
} from "lucide-react";
import { reversePaymentAction } from "./actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PaymentReceiptModal, PaymentReceiptData } from "@/components/payment-receipt-modal";
import { PawnTicketModal } from "@/components/pawn-ticket-modal";

interface PaymentModalProps {
  loanId: string;
  loanNumber?: string;
  customerName?: string;
  customerPhone?: string;
  principalOutstanding: number;
  accruedInterest: number;
  unsettledCharges: number;
  totalDue: number;
}

export function RecordPaymentModal({
  loanId,
  loanNumber = "PWN-LOAN",
  customerName = "Customer",
  customerPhone = "--",
  principalOutstanding,
  accruedInterest,
  unsettledCharges,
  totalDue,
}: PaymentModalProps) {
  const [recordPayment, { isLoading: loading }] = useRecordPaymentMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Payment Mode & Split Inputs
  const [isSplit, setIsSplit] = useState(false);
  const [cashAmount, setCashAmount] = useState<number | "">("");
  const [bankAmount, setBankAmount] = useState<number | "">("");
  const [amountPaid, setAmountPaid] = useState<number>(
    Math.ceil(accruedInterest + unsettledCharges)
  );
  const [mode, setMode] = useState<"CASH" | "UPI" | "BANK_TRANSFER" | "CARD">("CASH");
  const [paymentType, setPaymentType] = useState<
    "STANDARD" | "INTEREST_ONLY" | "PRINCIPAL_ONLY" | "CHARGES_ONLY" | "ADVANCE"
  >("STANDARD");
  const [notes, setNotes] = useState("");

  // Receipt Modal State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<PaymentReceiptData | null>(null);

  const handleOpen = () => {
    const due = Math.ceil(totalDue > 0 ? totalDue : 100);
    setAmountPaid(due);
    setCashAmount(due);
    setBankAmount("");
    setIsSplit(false);
    setPaymentType("STANDARD");
    setError(null);
    setSuccessMsg(null);
    setOpen(true);
  };

  const handleSplitCashChange = (val: number | "") => {
    setCashAmount(val);
    const c = typeof val === "number" ? val : 0;
    const b = typeof bankAmount === "number" ? bankAmount : 0;
    setAmountPaid(c + b);
  };

  const handleSplitBankChange = (val: number | "") => {
    setBankAmount(val);
    const c = typeof cashAmount === "number" ? cashAmount : 0;
    const b = typeof val === "number" ? val : 0;
    setAmountPaid(c + b);
  };

  const handleSingleAmountChange = (val: number) => {
    setAmountPaid(val);
    if (mode === "CASH") {
      setCashAmount(val);
      setBankAmount(0);
    } else {
      setBankAmount(val);
      setCashAmount(0);
    }
  };

  const calculatePreview = (paid: number, type: string) => {
    let rem = paid;
    let allocCharges = 0;
    let allocInterest = 0;
    let allocPrincipal = 0;

    if (type === "CHARGES_ONLY") {
      allocCharges = Math.min(rem, unsettledCharges);
    } else if (type === "INTEREST_ONLY") {
      allocCharges = Math.min(rem, unsettledCharges);
      rem -= allocCharges;
      allocInterest = Math.min(rem, accruedInterest);
    } else if (type === "PRINCIPAL_ONLY") {
      allocPrincipal = Math.min(rem, principalOutstanding);
    } else {
      // STANDARD / ADVANCE Waterfall
      allocCharges = Math.min(rem, unsettledCharges);
      rem -= allocCharges;
      allocInterest = Math.min(rem, accruedInterest);
      rem -= allocInterest;
      allocPrincipal = Math.min(rem, principalOutstanding);
    }

    return { allocCharges, allocInterest, allocPrincipal };
  };

  const preview = calculatePreview(amountPaid || 0, paymentType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountPaid <= 0) {
      setError("Payment amount must be greater than zero");
      return;
    }
    setError(null);

    const cAmount = typeof cashAmount === "number" ? cashAmount : isSplit ? 0 : mode === "CASH" ? amountPaid : 0;
    const bAmount = typeof bankAmount === "number" ? bankAmount : isSplit ? 0 : mode !== "CASH" ? amountPaid : 0;

    const res = await recordPayment({
      loanId,
      amountPaid,
      cashAmount: cAmount,
      bankAmount: bAmount,
      mode: isSplit ? "SPLIT" : mode,
      paymentType,
      notes,
    });

    if ("error" in res) {
      setError((res.error as { message?: string })?.message || "Payment recording failed");
    } else {
      const generatedReceipt = (res.data as any)?.receiptNumber || `REC-${Date.now()}`;
      setSuccessMsg("Payment Recorded Successfully!");

      const receipt: PaymentReceiptData = {
        receiptNumber: generatedReceipt,
        paymentDate: new Date(),
        loanNumber,
        customerName,
        customerPhone,
        amountPaid,
        cashAmount: cAmount,
        bankAmount: bAmount,
        paymentType,
        allocatedCharges: preview.allocCharges,
        allocatedInterest: preview.allocInterest,
        allocatedPrincipal: preview.allocPrincipal,
        remainingPrincipal: Math.max(0, principalOutstanding - preview.allocPrincipal),
        notes,
      };

      setReceiptData(receipt);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10B981", "#34D399", "#059669"],
      });

      // Automatically open receipt dialog
      setTimeout(() => {
        setOpen(false);
        setReceiptModalOpen(true);
      }, 900);
    }
  };

  const formatINR = (num: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button onClick={handleOpen} className="shadow-md shadow-amber-500/10">
            <Wallet className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg border-(--accent-border) max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-(--accent-bg) text-(--accent) flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
              <span>Record Loan Repayment</span>
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-(--accent-text) text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-(--accent) shrink-0" />
                <span className="font-semibold">{successMsg}</span>
              </div>
              {receiptData && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setReceiptModalOpen(true);
                  }}
                  className="font-bold underline text-xs cursor-pointer"
                >
                  Print Receipt Slip
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Outstanding Summary */}
            <div className="p-3.5 rounded-xl bg-(--bg-tertiary) border border-(--border-primary) space-y-1.5 text-xs">
              <div className="font-semibold text-(--text-secondary) uppercase tracking-wider text-[11px] mb-1">
                Current Outstanding Breakdown
              </div>
              <div className="flex justify-between text-(--text-secondary)">
                <span>Unsettled Fees/Charges:</span>
                <span className="font-mono text-(--text-primary)">{formatINR(unsettledCharges)}</span>
              </div>
              <div className="flex justify-between text-(--text-secondary)">
                <span>Accrued Monthly Interest:</span>
                <span className="font-mono text-(--accent) font-semibold">
                  {formatINR(accruedInterest)}
                </span>
              </div>
              <div className="flex justify-between text-(--text-secondary)">
                <span>Principal Balance:</span>
                <span className="font-mono text-(--text-primary)">
                  {formatINR(principalOutstanding)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-(--border-primary) text-sm font-bold text-(--text-primary)">
                <span>Total Due:</span>
                <span className="font-mono text-(--accent)">{formatINR(totalDue)}</span>
              </div>
            </div>

            {/* Payment Type Selection (Point 9) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Allocation Type</Label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {[
                  { id: "STANDARD", label: "Waterfall (All)" },
                  { id: "INTEREST_ONLY", label: "Interest Only" },
                  { id: "PRINCIPAL_ONLY", label: "Principal Only" },
                  { id: "ADVANCE", label: "Advance Installment" },
                  { id: "CHARGES_ONLY", label: "Charges Only" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPaymentType(item.id as any)}
                    className={`p-2 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer text-center ${paymentType === item.id
                        ? "bg-[#B38646] text-white border-[#B38646] shadow-xs"
                        : "bg-(--bg-card) border-(--border-primary) text-(--text-secondary) hover:text-(--text-primary)"
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Mode Switcher (Point 9) */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-(--bg-card) border border-(--border-primary)">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#B38646]" />
                <span className="text-xs font-semibold text-(--text-primary)">
                  Split Payment Mode (Cash + Bank at same time)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !isSplit;
                  setIsSplit(next);
                  if (next) {
                    setCashAmount(amountPaid);
                    setBankAmount(0);
                  }
                }}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${isSplit
                    ? "bg-[#B38646] text-white border-[#B38646]"
                    : "bg-(--bg-secondary) border-(--border-primary) text-(--text-secondary)"
                  }`}
              >
                {isSplit ? "Enabled" : "Enable Split"}
              </button>
            </div>

            {/* Split Inputs OR Single Input */}
            {isSplit ? (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-(--bg-secondary) border border-(--border-primary)">
                <div className="space-y-1">
                  <Label className="text-xs">Cash at Counter (₹)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={cashAmount}
                    onChange={(e) =>
                      handleSplitCashChange(e.target.value === "" ? "" : parseFloat(e.target.value))
                    }
                    placeholder="0.00"
                    className="font-mono text-sm font-bold text-[#B38646]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bank / Online UPI (₹)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={bankAmount}
                    onChange={(e) =>
                      handleSplitBankChange(e.target.value === "" ? "" : parseFloat(e.target.value))
                    }
                    placeholder="0.00"
                    className="font-mono text-sm font-bold text-(--text-primary)"
                  />
                </div>
                <div className="col-span-2 pt-1 border-t border-(--border-secondary) flex justify-between text-xs font-bold text-(--text-primary)">
                  <span>Total Amount Paid:</span>
                  <span className="font-mono text-[#B38646]">{formatINR(amountPaid)}</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="amount" className="text-xs">Amount Paying *</Label>
                    <button
                      type="button"
                      onClick={() => handleSingleAmountChange(Math.ceil(totalDue))}
                      className="text-[10px] text-[#B38646] font-semibold hover:underline cursor-pointer"
                    >
                      Pay Full (₹{Math.ceil(totalDue)})
                    </button>
                  </div>
                  <Input
                    id="amount"
                    type="number"
                    step="any"
                    min="0.01"
                    value={amountPaid}
                    onChange={(e) => handleSingleAmountChange(Number(e.target.value))}
                    className="font-mono text-lg font-bold text-(--accent) py-2.5 h-10"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Mode *</Label>
                  <select
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as "CASH" | "UPI" | "BANK_TRANSFER" | "CARD")
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-(--bg-input) px-3 py-2 text-xs"
                  >
                    <option value="CASH">Counter Cash</option>
                    <option value="UPI">UPI / Instant Online</option>
                    <option value="BANK_TRANSFER">Bank NEFT / RTGS</option>
                    <option value="CARD">Debit / Credit Card</option>
                  </select>
                </div>
              </div>
            )}

            {/* Allocation Preview */}
            <div className="p-3 rounded-xl bg-(--bg-tertiary) border border-(--border-primary) space-y-1 text-xs">
              <div className="text-[11px] font-semibold text-(--text-secondary) uppercase tracking-wider flex items-center gap-1.5 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-[#B38646]" />
                <span>Payment Settlement Breakdown</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                <div className="p-2 rounded bg-(--bg-card) border border-(--border-primary)">
                  <div className="text-[10px] text-(--text-muted) font-sans">1. Charges</div>
                  <div className="font-semibold text-(--text-primary)">
                    {formatINR(preview.allocCharges)}
                  </div>
                </div>
                <div className="p-2 rounded bg-(--bg-card) border border-(--border-primary)">
                  <div className="text-[10px] text-(--text-muted) font-sans">2. Interest</div>
                  <div className="font-semibold text-[#B38646]">
                    {formatINR(preview.allocInterest)}
                  </div>
                </div>
                <div className="p-2 rounded bg-(--bg-card) border border-(--border-primary)">
                  <div className="text-[10px] text-(--text-muted) font-sans">3. Principal</div>
                  <div className="font-semibold text-(--text-primary)">
                    {formatINR(preview.allocPrincipal)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes" className="text-xs">Reference / Notes (Optional)</Label>
              <Input
                id="notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. UPI Ref: 318920481234, Voucher note..."
                className="text-xs"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-(--border-primary)">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || amountPaid <= 0}
                className="bg-[#B38646] hover:bg-[#966727] text-white text-xs font-bold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Recording...
                  </>
                ) : (
                  "Record & Print Receipt"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Modal for instant print */}
      <PaymentReceiptModal
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        data={receiptData}
      />
    </>
  );
}

export function PrintPaymentReceiptButton({
  payment,
  loan,
}: {
  payment: any;
  loan: any;
}) {
  const [open, setOpen] = useState(false);

  const receiptData: PaymentReceiptData = {
    receiptNumber: payment.receiptNumber,
    paymentDate: payment.paymentDate,
    loanNumber: loan.loanNumber,
    customerName: loan.customer.fullName,
    customerPhone: loan.customer.phone,
    amountPaid: parseFloat(payment.amountPaid.toString()),
    allocatedCharges: parseFloat(payment.allocatedCharges?.toString() || "0"),
    allocatedInterest: parseFloat(payment.allocatedInterest?.toString() || "0"),
    allocatedPrincipal: parseFloat(payment.allocatedPrincipal?.toString() || "0"),
    notes: payment.notes,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1 rounded-md text-(--text-muted) hover:text-(--text-primary) hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        title="Print Installment Receipt Slip"
      >
        <Printer className="w-3.5 h-3.5" />
      </button>

      <PaymentReceiptModal open={open} onOpenChange={setOpen} data={receiptData} />
    </>
  );
}

interface CloseLoanProps {
  loanId: string;
  canClose: boolean;
  reason?: string;
}

export function CloseLoanButton({ loanId, canClose, reason }: CloseLoanProps) {
  const [closeLoan, { isLoading: loading }] = useCloseLoanMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = async () => {
    setError(null);
    const res = await closeLoan(loanId);
    if ("error" in res) {
      setError((res.error as { message?: string })?.message || "Loan closure failed");
    } else {
      setOpen(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        disabled={!canClose || loading}
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        title={!canClose ? reason : "Close loan contract permanently"}
        className="text-xs"
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            Closing...
          </>
        ) : (
          "Close Loan Contract"
        )}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-(--accent-border)">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">
              Confirm Permanent Loan Closure
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close this loan? All obligations have been met. This action
              updates the loan status to CLOSED.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <div className="text-red-400 text-xs px-6">{error}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handleClose}
              disabled={loading}
              className="font-bold flex items-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Closure
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface ReleaseItemsProps {
  loanId: string;
  isReleased: boolean;
  loanStatus?: string;
  isClosed?: boolean;
}

export function ReleaseItemsButton({ loanId, isReleased, loanStatus, isClosed }: ReleaseItemsProps) {
  const [releaseItems, { isLoading: loading }] = useReleaseItemsMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRelease = (loanStatus === "CLOSED" || isClosed || loanStatus === "ACTIVE") && !isReleased;

  const handleRelease = async () => {
    setError(null);
    const res = await releaseItems(loanId);
    if ("error" in res) {
      setError((res.error as { message?: string })?.message || "Item release failed");
    } else {
      setOpen(false);
    }
  };

  if (isReleased) {
    return (
      <span className="text-xs px-2.5 py-1 rounded bg-(--bg-tertiary) text-(--text-muted) border border-(--border-primary) flex items-center gap-1 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        Collateral Released
      </span>
    );
  }

  if (!canRelease) {
    return null;
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        disabled={loading}
        className="bg-[#B38646] hover:opacity-90 text-white shadow-xs text-xs"
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            Releasing...
          </>
        ) : (
          <>
            <Unlock className="w-3.5 h-3.5 mr-1.5" />
            Release Collateral Items
          </>
        )}
      </Button>
      {error && <div className="text-red-400 text-[11px] mt-1">{error}</div>}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-(--accent-border)">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-(--accent)">
              <Unlock className="w-5 h-5" />
              <span>Confirm Collateral Hand-back</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              Confirm physical hand-back of all pledged collateral items to the customer? This marks
              the collateral as officially returned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={handleRelease}
              disabled={loading}
              className="bg-[#B38646] hover:opacity-90 text-white font-bold flex items-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Release
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function PawnTicketPrintButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => window.print()}
      title="Print Pawn Ticket / Loan Summary"
      className="text-xs"
    >
      <Printer className="w-3.5 h-3.5 text-(--text-secondary) mr-1.5" />
      Print Pawn Ticket
    </Button>
  );
}

export function ItemPhotoPreview({
  photoUrl,
  description,
}: {
  photoUrl?: string | null;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  if (!photoUrl) return <span className="text-[10px] text-(--text-muted) font-mono">No photo</span>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-(--accent-bg) border border-(--accent-border) text-(--accent) hover:bg-(--accent-bg-hover) transition-all text-xs cursor-pointer font-medium"
        >
          <FileText className="w-3.5 h-3.5" />
          View Photo
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl border-(--accent-border) p-4">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-(--text-primary)">
            {description} - Collateral Photo
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-center max-h-[70vh] overflow-hidden rounded-xl bg-black">
          <img src={photoUrl} alt={description} className="object-contain max-h-[70vh] w-auto" />
        </div>
        <div className="flex justify-end pt-1">
          <a
            href={photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Open Full Resolution
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ApproveLoanButtonProps {
  loanId: string;
  canApprove: boolean;
}

export function ApproveLoanButton({ loanId, canApprove }: ApproveLoanButtonProps) {
  const [approveLoan, { isLoading }] = useApproveLoanMutation();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setError(null);
    try {
      const res = await approveLoan({ loanId, notes });
      if ("error" in res) {
        setError((res.error as any)?.message || "Failed to approve loan");
      } else {
        setOpen(false);
      }
    } catch (e: any) {
      setError(e.message || "Failed to approve loan");
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!canApprove}
        className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
        title={canApprove ? "Manager Approval" : "Requires Manager or Admin role"}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Approve Loan</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-500">
              <ShieldCheck className="w-5 h-5" />
              <span>Approve Loan Application</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-(--text-secondary)">
              By approving this draft, you authorize this loan for cash disbursal. The status will transition from <strong className="text-amber-500">DRAFT</strong> to <strong className="text-sky-400">APPROVED</strong>.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Approval Notes (Optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Approved per shop policy after physical assay"
                className="text-xs"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Confirm Approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface DisburseLoanButtonProps {
  loanId: string;
  principalAmount: number | string;
  canDisburse: boolean;
}

export function DisburseLoanButton({ loanId, principalAmount, canDisburse }: DisburseLoanButtonProps) {
  const [disburseLoan, { isLoading }] = useDisburseLoanMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDisburse = async () => {
    setError(null);
    try {
      const res = await disburseLoan(loanId);
      if ("error" in res) {
        setError((res.error as any)?.message || "Failed to disburse loan");
      } else {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        setOpen(false);
      }
    } catch (e: any) {
      setError(e.message || "Failed to disburse loan");
    }
  };

  const formattedAmount = Number(principalAmount).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!canDisburse}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-1.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
        title={canDisburse ? "Hand cash to customer & activate loan" : "Requires Manager or Admin role"}
      >
        <Coins className="w-3.5 h-3.5" />
        <span>Disburse Loan</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-500">
              <Coins className="w-5 h-5" />
              <span>Confirm Loan Disbursal</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-(--text-primary)">
              <div className="text-[11px] text-(--text-muted) uppercase font-bold tracking-wider">Amount to Hand to Borrower:</div>
              <div className="text-xl font-extrabold text-emerald-500 font-mono mt-0.5">
                {formattedAmount}
              </div>
            </div>

            <p className="text-xs text-(--text-secondary)">
              Confirming disbursal will:
            </p>
            <ul className="text-xs text-(--text-secondary) space-y-1 list-disc list-inside">
              <li>Debit <strong>{formattedAmount}</strong> from shop Counter Cash</li>
              <li>Transition status from <strong className="text-sky-400">APPROVED</strong> to <strong className="text-emerald-500">ACTIVE</strong></li>
              <li>Mark all collateral gold items as <strong className="text-amber-500">HELD</strong></li>
            </ul>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDisburse}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Disburse {formattedAmount}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface CancelDraftButtonProps {
  loanId: string;
  canCancel: boolean;
}

export function CancelDraftButton({ loanId, canCancel }: CancelDraftButtonProps) {
  const [cancelDraft, { isLoading }] = useCancelDraftLoanMutation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setError(null);
    try {
      const res = await cancelDraft({ loanId, reason });
      if ("error" in res) {
        setError((res.error as any)?.message || "Failed to cancel draft");
      } else {
        setOpen(false);
      }
    } catch (e: any) {
      setError(e.message || "Failed to cancel draft");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!canCancel}
        className="text-red-500 border-red-500/30 hover:bg-red-500/10 text-xs px-3 py-1.5 rounded-xl cursor-pointer"
        title="Abandon loan application"
      >
        <Ban className="w-3.5 h-3.5 mr-1" />
        <span>Cancel Draft</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-500">
              <Ban className="w-5 h-5" />
              <span>Cancel Loan Application</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-(--text-secondary)">
              Are you sure you want to cancel this loan application? This will mark it as <strong>CANCELLED</strong>. Zero funds have been disbursed.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cancellation Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Borrower changed mind, collateral assay rejected"
                className="text-xs"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isLoading}>
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Ban className="w-4 h-4 mr-1" />}
              Confirm Cancellation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ReversePaymentButtonProps {
  paymentId: string;
  loanId: string;
  receiptNumber: string;
  amount: string | number;
  isReversed?: boolean;
  canReverse: boolean;
}

export function ReversePaymentButton({
  paymentId,
  loanId,
  receiptNumber,
  amount,
  isReversed,
  canReverse,
}: ReversePaymentButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isReversed) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20">
        REVERSED
      </span>
    );
  }

  if (!canReverse) return null;

  const handleReverse = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for the reversal");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await reversePaymentAction(paymentId, loanId, reason);
      if (!res.success) {
        setError(res.error || "Failed to reverse payment");
      } else {
        setOpen(false);
      }
    } catch (e: any) {
      setError(e.message || "Failed to reverse payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-[11px] h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
        title="Admin only: Reverse this posted payment non-destructively"
      >
        <RotateCcw className="w-3.5 h-3.5 mr-1" />
        Reverse
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-500">
              <RotateCcw className="w-5 h-5" />
              <span>Reverse Posted Payment</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <strong>Golden Rule #5 Enforced:</strong> This transaction will NOT be deleted. A compensating single-entry <strong className="font-mono">REVERSAL</strong> will be posted to the ledger, adjusting shop counter cash and restoring loan principal.
            </div>

            <div className="text-xs text-(--text-secondary) space-y-1">
              <div>Receipt: <strong className="font-mono text-(--text-primary)">{receiptNumber}</strong></div>
              <div>Amount to Reverse: <strong className="font-mono text-red-400">₹{amount}</strong></div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reversal Reason *</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Wrong amount entered / cheque bounced / customer dispute"
                className="text-xs"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={handleReverse} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirm Reversal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
