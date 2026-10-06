"use client";

import React from "react";
import Link from "next/link";
import { useGetLoanByIdQuery } from "@/lib/redux/api/loansApi";
import {
  RecordPaymentModal,
  CloseLoanButton,
  ReleaseItemsButton,
  PrintPaymentReceiptButton,
  ItemPhotoPreview,
  ApproveLoanButton,
  DisburseLoanButton,
  CancelDraftButton,
} from "./loan-actions-client";
import { PawnTicketModal } from "@/components/pawn-ticket-modal";
import { LoanCrudButtons } from "./loan-crud-buttons";
import {
  AlertTriangle,
  User,
  Scale,
  Wallet,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  FileText,
  TrendingDown,
  Lock,
  Loader2,
  Clock,
  Coins,
} from "lucide-react";

interface LoanDetailClientProps {
  id: string;
  isAdmin: boolean;
  isManager?: boolean;
}

export function LoanDetailClient({ id, isAdmin, isManager = false }: LoanDetailClientProps) {
  const { data: loan, isLoading, isError } = useGetLoanByIdQuery(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-(--accent)" />
      </div>
    );
  }

  if (isError || !loan) {
    return (
      <div className="p-8 text-center text-sm text-(--text-muted)">Loan contract not found.</div>
    );
  }

  const formatINR = (val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "₹0";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatDate = (dateString: Date | string) => {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateString));
  };

  const isReleased = (loan.items || []).every((i: any) => i.releasedAt !== null);
  const unsettledCharges = (loan.charges || [])
    .filter((c: any) => !c.isSettled)
    .reduce((acc: number, c: any) => acc + parseFloat(c.amount.toString()), 0);

  const principalOutstanding = parseFloat(loan.principalOutstanding.toString());
  const accruedInterest = parseFloat(loan.interestSummary.accruedInterest.toString());
  const totalDue = parseFloat(loan.totalDue.toString());

  const canClose =
    loan.status === "ACTIVE" &&
    principalOutstanding === 0 &&
    unsettledCharges === 0 &&
    accruedInterest < 0.1;
  let closeReason = "";
  if (principalOutstanding > 0)
    closeReason = `₹${principalOutstanding} principal still outstanding`;
  else if (unsettledCharges > 0) closeReason = `₹${unsettledCharges} unsettled charges remain`;
  else if (accruedInterest >= 0.1)
    closeReason = `₹${accruedInterest.toFixed(2)} accrued interest remaining`;

  return (
    <div>
      <div className="mb-4 print:hidden">
        <Link
          href="/loans"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-(--text-secondary) hover:text-(--accent) transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Loans Directory
        </Link>
      </div>

      {/* Header with Print & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-(--border-primary)">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-(--text-primary) flex items-center gap-2">
              {loan.loanNumber}
            </h1>
            <span
              className={`text-xs px-3 py-1 rounded-full font-bold uppercase inline-flex items-center gap-1 ${
                loan.displayStatus === "ACTIVE"
                  ? "badge-active"
                  : loan.displayStatus === "OVERDUE"
                    ? "badge-overdue"
                    : loan.displayStatus === "DRAFT"
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                      : loan.displayStatus === "APPROVED"
                        ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                        : "badge-closed"
              }`}
            >
              {loan.displayStatus === "DRAFT" && <Clock className="w-3.5 h-3.5" />}
              {loan.displayStatus === "APPROVED" && <ShieldCheck className="w-3.5 h-3.5" />}
              {loan.displayStatus === "OVERDUE" && <AlertTriangle className="w-3.5 h-3.5" />}
              {loan.displayStatus === "CLOSED" && <CheckCircle2 className="w-3.5 h-3.5" />}
              {loan.displayStatus}
            </span>
          </div>
          <p className="mt-1 text-sm text-(--text-secondary)">
            {loan.status === "DRAFT" ? (
              <span>Draft pledge created by {loan.handledBy.name} • <strong className="text-amber-500">Awaiting Manager Approval</strong></span>
            ) : loan.status === "APPROVED" ? (
              <span>Approved by manager • <strong className="text-sky-400">Ready for Cash Disbursal</strong></span>
            ) : loan.status === "CANCELLED" ? (
              <span className="text-red-400">Application cancelled before disbursal</span>
            ) : (
              <span>Disbursed on {formatDate(loan.disbursedAt || loan.loanDate)} by {loan.handledBy.name} • Maturity: {formatDate(loan.dueDate)}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden shrink-0">
          <LoanCrudButtons
            loanId={loan.id}
            loanNumber={loan.loanNumber}
            initialNotes={loan.notes || ""}
            canDelete={isAdmin}
          />
          <PawnTicketModal loan={loan as any} />

          {/* DRAFT STATE: Approve Loan & Cancel Draft */}
          {loan.status === "DRAFT" && (
            <>
              <ApproveLoanButton
                loanId={loan.id}
                canApprove={isAdmin || isManager}
              />
              <CancelDraftButton
                loanId={loan.id}
                canCancel={isAdmin || isManager}
              />
            </>
          )}

          {/* APPROVED STATE: Disburse Loan & Cancel Draft */}
          {loan.status === "APPROVED" && (
            <>
              <DisburseLoanButton
                loanId={loan.id}
                principalAmount={loan.principalAmount}
                canDisburse={isAdmin || isManager}
              />
              <CancelDraftButton
                loanId={loan.id}
                canCancel={isAdmin || isManager}
              />
            </>
          )}

          {/* CLOSED STATE: Release Collateral */}
          <ReleaseItemsButton
            loanId={loan.id}
            isClosed={loan.status === "CLOSED"}
            isReleased={isReleased}
          />

          {/* ACTIVE STATE: Close Loan & Record Payment */}
          {loan.status === "ACTIVE" && (
            <>
              <CloseLoanButton loanId={loan.id} canClose={canClose} reason={closeReason} />

              <RecordPaymentModal
                loanId={loan.id}
                loanNumber={loan.loanNumber}
                customerName={loan.customer.fullName}
                customerPhone={loan.customer.phone}
                principalOutstanding={principalOutstanding}
                accruedInterest={accruedInterest}
                unsettledCharges={unsettledCharges}
                totalDue={totalDue}
              />
            </>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Left 2 Cols: Customer Profile & Collateral Items */}
        <div className="lg:col-span-2 space-y-8">
          {/* Customer Summary Bar */}
          <div className="glass-card p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-(--accent-bg) border border-(--accent-border) flex items-center justify-center font-bold text-(--accent) text-base shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-(--text-secondary) uppercase tracking-wider">
                  Pledging Customer Profile
                </div>
                <Link
                  href={`/customers/${loan.customerId}`}
                  className="font-bold text-base text-(--text-primary) hover:text-(--accent) transition-colors"
                >
                  {loan.customer.fullName}
                </Link>
                <div className="text-xs text-(--text-muted) font-mono">{loan.customer.phone}</div>
              </div>
            </div>
            <Link
              href={`/customers/${loan.customerId}`}
              className="btn-secondary text-xs px-3.5 py-1.5 print:hidden"
            >
              View KYC & Profile
            </Link>
          </div>

          {/* Pledged Collateral Items Table */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-(--border-primary)">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-(--accent)" />
                <h2 className="text-base font-bold text-(--text-primary)">
                  Pledged Collateral Items ({loan.items.length})
                </h2>
              </div>
              <div className="text-xs font-semibold text-(--accent) bg-(--accent-bg) px-3 py-1 rounded-full border border-(--accent-border)">
                Total Assessed: {formatINR(loan.totalAssessedValue.toString())}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item & Tag</th>
                    <th>Photo</th>
                    <th>Purity</th>
                    <th>Gross / Net / Fine Wt.</th>
                    <th>Rate / g</th>
                    <th>Assessed Val</th>
                    <th>Storage Location</th>
                    <th>Release Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(loan.items || []).map((item: any) => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-semibold text-(--text-primary) text-sm">
                          {item.description}
                        </div>
                        <div className="font-mono text-xs text-(--accent) mt-0.5">
                          {item.packetNumber}
                        </div>
                      </td>
                      <td>
                        <ItemPhotoPreview photoUrl={item.photoUrl} description={item.description} />
                      </td>
                      <td>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-(--bg-tertiary) border border-(--border-primary) text-(--text-secondary)">
                          {item.purityLabel} ({item.purityPercent.toString()}%)
                        </span>
                      </td>
                      <td>
                        <div className="font-mono text-xs text-(--text-secondary)">
                          Gross: <b>{item.grossWeightGrams.toString()}g</b>
                        </div>
                        <div className="font-mono text-xs text-(--text-secondary)">
                          Net: {item.netWeightGrams.toString()}g | Fine:{" "}
                          <span className="text-(--accent) font-semibold">
                            {item.fineWeightGrams.toString()}g
                          </span>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-(--text-secondary)">
                        ₹{item.valuationRatePerGram.toString()}
                      </td>
                      <td className="font-bold text-sm text-(--accent)">
                        {formatINR(item.assessedValue.toString())}
                      </td>
                      <td className="text-xs text-(--text-secondary) font-sans max-w-[150px]">
                        {item.storageLocation}
                      </td>
                      <td>
                        {item.releasedAt ? (
                          <span className="badge-verified text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-semibold">
                            <ShieldCheck className="w-3 h-3" />
                            Released
                          </span>
                        ) : (
                          <span className="badge-pending text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium">
                            <Lock className="w-3 h-3" />
                            In Vault
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Repayment Receipts & Ledger History */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-(--border-primary)">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-(--accent)" />
                <h2 className="text-base font-bold text-(--text-primary)">
                  Repayment Receipts & Ledger History ({loan.payments.length})
                </h2>
              </div>
            </div>

            {loan.payments.length === 0 ? (
              <div className="p-8 text-center text-xs text-(--text-muted) bg-(--bg-tertiary) rounded-xl border border-dashed border-(--border-primary)">
                No repayments recorded yet for this loan contract.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Receipt No. & Date</th>
                      <th>Mode</th>
                      <th>Amount Paid</th>
                      <th>Alloc: Charges</th>
                      <th>Alloc: Interest</th>
                      <th>Alloc: Principal</th>
                      <th className="text-right">Slip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(loan.payments || []).map((pmt: any) => (
                      <tr key={pmt.id}>
                        <td>
                          <div className="font-mono font-bold text-xs text-(--accent)">
                            {pmt.receiptNumber}
                          </div>
                          <div className="text-[11px] text-(--text-muted)">
                            {formatDate(pmt.paymentDate)}
                          </div>
                        </td>
                        <td>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-(--bg-tertiary) border border-(--border-primary) font-semibold uppercase text-(--text-secondary)">
                            {pmt.mode}
                          </span>
                        </td>
                        <td className="font-bold text-sm text-(--accent)">
                          {formatINR(pmt.amountPaid.toString())}
                        </td>
                        <td className="font-mono text-xs text-(--text-secondary)">
                          {formatINR(pmt.allocatedCharges.toString())}
                        </td>
                        <td className="font-mono text-xs text-(--accent) font-semibold">
                          {formatINR(pmt.allocatedInterest.toString())}
                        </td>
                        <td className="font-mono text-xs text-(--accent) font-bold">
                          {formatINR(pmt.allocatedPrincipal.toString())}
                        </td>
                        <td className="text-right">
                          <PrintPaymentReceiptButton payment={pmt} loan={loan} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Financial Summary Card */}
        <div className="space-y-6">
          <div className="kpi-card border-(--accent-border) shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-(--border-primary)">
              <span className="text-xs font-bold uppercase tracking-wider text-(--accent) flex items-center gap-1.5">
                <Wallet className="w-4 h-4" />
                Financial Summary & Dues
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-(--text-secondary) text-xs">
                  Original Principal Disbursed
                </span>
                <span className="font-semibold text-(--text-primary)">
                  {formatINR(loan.principalAmount.toString())}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--text-secondary) text-xs">Monthly Simple Interest</span>
                <span className="font-bold text-(--accent)">
                  {loan.interestRateMonthly.toString()}% p.m.
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--text-secondary) text-xs">RBI LTV Slab Applied</span>
                <span className="font-bold text-(--text-primary)">
                  {loan.ltvPercent.toString()}%
                </span>
              </div>

              <div className="pt-3 border-t border-(--border-primary) space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-(--text-secondary) text-xs">Unsettled Charges / Fees</span>
                  <span className="font-mono text-(--text-secondary)">
                    {formatINR(unsettledCharges)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-(--text-secondary) text-xs">
                    Accrued Simple Interest
                    <span className="block text-[10px] text-(--text-muted)">
                      Since {formatDate(loan.lastSettledDate)}
                    </span>
                  </span>
                  <span className="font-mono font-bold text-(--accent)">
                    {formatINR(accruedInterest)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-(--text-secondary) font-medium text-xs">
                    Principal Outstanding
                  </span>
                  <span className="font-mono font-bold text-(--text-primary)">
                    {formatINR(principalOutstanding)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-(--border-primary) text-base font-bold text-(--text-primary)">
                  <span>Total Payable Due:</span>
                  <span className="font-mono text-(--accent) text-lg">{formatINR(totalDue)}</span>
                </div>
              </div>
            </div>

            {/* Interest Calculation Info */}
            <div className="p-3.5 rounded-xl bg-(--bg-tertiary) border border-(--border-primary) text-xs text-(--text-secondary) space-y-1">
              <div className="font-semibold text-(--text-primary) flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-(--accent)" />
                Interest Accrual & Repayment Policy
              </div>
              <p className="text-[11px] text-(--text-muted) leading-relaxed">
                Interest is computed daily on outstanding balance using Actual/365 convention.
                Repayments support Counter Cash & Bank/UPI with instant printable receipts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
