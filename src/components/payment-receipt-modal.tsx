"use client";

import React, { useRef } from "react";
import { Printer, X, CheckCircle2, Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PaymentReceiptData {
  receiptNumber: string;
  paymentDate: string | Date;
  loanNumber: string;
  customerName: string;
  customerPhone: string;
  amountPaid: number;
  cashAmount?: number;
  bankAmount?: number;
  paymentType?: string;
  allocatedCharges?: number;
  allocatedInterest?: number;
  allocatedPrincipal?: number;
  remainingPrincipal?: number;
  notes?: string;
}

interface PaymentReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PaymentReceiptData | null;
}

export function PaymentReceiptModal({ open, onOpenChange, data }: PaymentReceiptModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const formatINR = (val: number | undefined | null) => {
    if (val === undefined || val === null) return "₹0.00";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatDateTime = (dateString: Date | string) => {
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
      return "Current Date & Time";
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isSplit = (data.cashAmount ?? 0) > 0 && (data.bankAmount ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-(--border-primary)">
        {/* Action Toolbar (Hidden in Print) */}
        <div className="flex items-center justify-between p-4 bg-(--bg-secondary) border-b border-(--border-primary) print:hidden sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#B38646]" />
            <span className="font-bold text-xs text-(--text-primary)">
              Payment Receipt · {data.receiptNumber}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-[#B38646] hover:bg-[#966727] text-white text-xs px-4"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print Receipt (A4 / Thermal)
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded-lg text-(--text-muted) hover:text-(--text-primary) cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Slip */}
        <div
          ref={printRef}
          className="p-8 bg-white text-black font-sans text-xs space-y-5 print-slip-container"
          style={{ color: "#111827", backgroundColor: "#ffffff" }}
        >
          {/* Shop Header */}
          <div className="text-center border-b-2 border-black pb-3 space-y-1">
            <div className="font-serif text-xl font-black uppercase text-black tracking-wider">
              PAWNIFY JEWELLERS & PAWN BROKERS
            </div>
            <div className="text-[10px] font-semibold text-gray-700">
              Gold & Silver Loan Installment / Repayment Acknowledgement Slip
            </div>
            <div className="text-[10px] text-gray-600">
              Main Market Road · Phone: +91 98765 43210 · GSTIN: 29AAAAA0000A1Z5
            </div>
            <div className="pt-1.5">
              <span className="inline-block px-3 py-0.5 bg-black text-white text-[10px] font-bold uppercase tracking-wider rounded">
                OFFICIAL REPAYMENT RECEIPT
              </span>
            </div>
          </div>

          {/* Receipt & Loan Header Grid */}
          <div className="grid grid-cols-2 gap-3 p-3 border border-gray-300 rounded bg-gray-50 text-[11px]">
            <div>
              <span className="text-gray-500 block text-[10px]">Receipt Number:</span>
              <span className="font-mono font-bold text-black text-xs">{data.receiptNumber}</span>
            </div>
            <div className="text-right">
              <span className="text-gray-500 block text-[10px]">Payment Date & Time:</span>
              <span className="font-bold text-black">{formatDateTime(data.paymentDate)}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px]">Loan Account Number:</span>
              <span className="font-mono font-bold text-[#B38646] text-xs">{data.loanNumber}</span>
            </div>
            <div className="text-right">
              <span className="text-gray-500 block text-[10px]">Customer / Pledgor:</span>
              <span className="font-bold text-black">{data.customerName} ({data.customerPhone})</span>
            </div>
          </div>

          {/* Amount Paid Box */}
          <div className="p-4 border-2 border-black rounded bg-gray-50 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-gray-600 uppercase block">Total Amount Received:</span>
              <span className="font-mono text-2xl font-black text-black">
                {formatINR(data.amountPaid)}
              </span>
              <div className="text-[10px] text-gray-600 font-medium pt-0.5">
                Payment Type: <span className="font-bold text-black uppercase">{data.paymentType || "STANDARD INSTALLMENT"}</span>
              </div>
            </div>

            <div className="text-right text-[11px] space-y-1">
              <div className="text-gray-500 text-[10px] font-semibold">Payment Method:</div>
              {isSplit ? (
                <div className="font-mono text-xs font-bold text-black space-y-0.5">
                  <div>Cash at Counter: {formatINR(data.cashAmount)}</div>
                  <div>Bank / Online UPI: {formatINR(data.bankAmount)}</div>
                </div>
              ) : (
                <div className="font-bold text-xs text-black uppercase">
                  {(data.cashAmount ?? 0) > 0 ? "Counter Cash" : "Online UPI / Bank"}
                </div>
              )}
            </div>
          </div>

          {/* Allocation Breakdown Table */}
          <div>
            <div className="font-bold text-[10px] uppercase text-gray-700 tracking-wider mb-1">
              Settlement Allocation Breakdown
            </div>
            <table className="w-full border-collapse border border-gray-300 text-[11px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300 text-left font-bold text-gray-800">
                  <th className="p-2 border-r border-gray-300">Category</th>
                  <th className="p-2 border-r border-gray-300 text-right">Amount Settled</th>
                  <th className="p-2 text-right">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="p-2 border-r border-gray-300 font-medium">1. Processing Fees & Other Charges</td>
                  <td className="p-2 border-r border-gray-300 text-right font-mono font-semibold">
                    {formatINR(data.allocatedCharges)}
                  </td>
                  <td className="p-2 text-right text-gray-500">Unsettled fees clearance</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 border-r border-gray-300 font-medium">2. Accrued Monthly Interest</td>
                  <td className="p-2 border-r border-gray-300 text-right font-mono font-bold text-[#B38646]">
                    {formatINR(data.allocatedInterest)}
                  </td>
                  <td className="p-2 text-right text-gray-500">Interest realized to date</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="p-2 border-r border-gray-300 font-medium">3. Principal Repayment</td>
                  <td className="p-2 border-r border-gray-300 text-right font-mono font-bold text-black">
                    {formatINR(data.allocatedPrincipal)}
                  </td>
                  <td className="p-2 text-right text-gray-500">Capital balance reduction</td>
                </tr>
                <tr className="bg-gray-50 font-bold border-t-2 border-black">
                  <td className="p-2 border-r border-gray-300">New Remaining Principal:</td>
                  <td className="p-2 border-r border-gray-300 text-right font-mono text-black text-xs">
                    {formatINR(data.remainingPrincipal)}
                  </td>
                  <td className="p-2 text-right text-black font-semibold">
                    {(data.remainingPrincipal ?? 0) <= 0.05 ? "LOAN FULLY SETTLED" : "ACTIVE BALANCE"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Notes if present */}
          {data.notes && (
            <div className="p-2.5 rounded bg-gray-50 border border-gray-200 text-[10px]">
              <span className="font-bold text-gray-600">Reference Details: </span>
              <span className="text-gray-800">{data.notes}</span>
            </div>
          )}

          {/* Footer & Signatures */}
          <div className="grid grid-cols-2 gap-10 pt-8 text-center text-xs">
            <div className="border-t border-black pt-2">
              <span className="font-bold block text-black">Pledgor / Depositor Signature</span>
              <span className="text-[10px] text-gray-500">Subject to realization of cheques/UPI</span>
            </div>
            <div className="border-t border-black pt-2">
              <span className="font-bold block text-black">Authorized Cashier / Stamp</span>
              <span className="text-[10px] text-gray-500">For PAWNIFY JEWELLERS</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
