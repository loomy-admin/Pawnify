"use client";

import React, { useState, useRef } from "react";
import { Printer, X, Coins, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PawnTicketModalProps {
  loan: {
    id: string;
    loanNumber: string;
    loanDate: string | Date;
    dueDate: string | Date;
    tenureMonths: number;
    interestRateMonthly: number | string;
    principalAmount: number | string;
    principalOutstanding: number | string;
    gracePeriodDays: number;
    customer: {
      fullName: string;
      phone: string;
      city?: string | null;
      address?: string | null;
      idNumber?: string | null;
    };
    items: Array<{
      id: string;
      metalType: string;
      description: string;
      purityLabel: string;
      grossWeightGrams: number | string;
      stoneWeightGrams: number | string;
      netWeightGrams: number | string;
      fineWeightGrams: number | string;
      valuationRatePerGram: number | string;
      assessedValue: number | string;
      packetNumber?: string;
    }>;
  };
}

export function PawnTicketModal({ loan }: PawnTicketModalProps) {
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const formatINR = (val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "₹0.00";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatDate = (dateString: Date | string) => {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateString));
  };

  const handlePrint = () => {
    window.print();
  };

  const totalGross = loan.items.reduce((s, i) => s + parseFloat(i.grossWeightGrams.toString()), 0);
  const totalNet = loan.items.reduce((s, i) => s + parseFloat(i.netWeightGrams.toString()), 0);
  const totalFine = loan.items.reduce((s, i) => s + parseFloat(i.fineWeightGrams.toString()), 0);
  const totalValuation = loan.items.reduce((s, i) => s + parseFloat(i.assessedValue.toString()), 0);
  const monthlyRateNum = parseFloat(loan.interestRateMonthly.toString());

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold shadow-xs"
        title="Print Standard Indian Pawn Ticket / Pledge Slip"
      >
        <Printer className="w-3.5 h-3.5 text-(--accent) mr-1.5" />
        Print Pawn Ticket
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 border-(--border-primary)">
          {/* Action Toolbar (Hidden in Print) */}
          <div className="flex items-center justify-between p-4 bg-(--bg-secondary) border-b border-(--border-primary) print:hidden sticky top-0 z-20">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-[#B38646]" />
              <span className="font-bold text-xs text-(--text-primary)">
                Standard Pawn Ticket Preview · {loan.loanNumber}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handlePrint}
                className="bg-[#B38646] hover:bg-[#966727] text-white text-xs px-4"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print Ticket (A4 / Thermal)
              </Button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-(--text-muted) hover:text-(--text-primary) cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Printable Ticket Area */}
          <div
            ref={printRef}
            className="p-8 bg-white text-black font-sans text-xs space-y-6 print-slip-container"
            style={{ color: "#111827", backgroundColor: "#ffffff" }}
          >
            {/* Shop Header */}
            <div className="text-center border-b-2 border-black pb-4 space-y-1">
              <div className="font-serif text-2xl font-black tracking-wider uppercase text-black">
                PAWNIFY JEWELLERS & PAWN BROKERS
              </div>
              <div className="text-[11px] font-semibold text-gray-700">
                Licensed Gold & Silver Loan Financier · Govt. Registered Pawn Broking Estab.
              </div>
              <div className="text-[10px] text-gray-600">
                Main Market Road, Bullion Bazaar · Phone: +91 98765 43210 · GSTIN: 29AAAAA0000A1Z5
              </div>
              <div className="pt-2">
                <span className="inline-block px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-widest rounded">
                  PAWN TICKET / GIRVI PLEDGE MEMORANDUM
                </span>
              </div>
            </div>

            {/* Ticket Metadata Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 border border-gray-300 rounded bg-gray-50 text-[11px]">
              <div>
                <span className="text-gray-500 block">Pledge Ticket No:</span>
                <span className="font-mono font-bold text-sm text-black">{loan.loanNumber}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Pledge Date:</span>
                <span className="font-bold text-black">{formatDate(loan.loanDate)}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Maturity Due Date:</span>
                <span className="font-bold text-black">{formatDate(loan.dueDate)}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Tenure / Grace:</span>
                <span className="font-bold text-black">{loan.tenureMonths} Mo ({loan.gracePeriodDays}d Grace)</span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="border border-gray-300 rounded p-3 space-y-1 bg-white">
              <div className="font-bold text-[11px] uppercase tracking-wider text-gray-700 border-b pb-1 mb-1">
                Pledgor / Customer Particulars
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-gray-500 block text-[10px]">Customer Name:</span>
                  <span className="font-bold text-black text-xs">{loan.customer.fullName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">Mobile Number:</span>
                  <span className="font-mono font-semibold text-black">{loan.customer.phone}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">Address / City:</span>
                  <span className="text-black">{loan.customer.address || loan.customer.city || "Local Resident"}</span>
                </div>
              </div>
            </div>

            {/* Collateral Particulars Table */}
            <div>
              <div className="font-bold text-[11px] uppercase tracking-wider text-gray-700 mb-1">
                Pledged Articles Breakdown
              </div>
              <table className="w-full border-collapse border border-gray-300 text-[11px]">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300 text-left font-bold text-gray-800">
                    <th className="p-2 border-r border-gray-300">#</th>
                    <th className="p-2 border-r border-gray-300">Description</th>
                    <th className="p-2 border-r border-gray-300">Metal / Purity</th>
                    <th className="p-2 border-r border-gray-300 text-right">Gross Wt</th>
                    <th className="p-2 border-r border-gray-300 text-right">Stone Wt</th>
                    <th className="p-2 border-r border-gray-300 text-right">Net Wt</th>
                    <th className="p-2 border-r border-gray-300 text-right">Pure Wt</th>
                    <th className="p-2 text-right">Assessed Val</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="p-2 border-r border-gray-300 font-mono">{idx + 1}</td>
                      <td className="p-2 border-r border-gray-300 font-medium">{item.description}</td>
                      <td className="p-2 border-r border-gray-300">{item.metalType} · {item.purityLabel}</td>
                      <td className="p-2 border-r border-gray-300 text-right font-mono">{parseFloat(item.grossWeightGrams.toString()).toFixed(3)}g</td>
                      <td className="p-2 border-r border-gray-300 text-right font-mono">{parseFloat(item.stoneWeightGrams.toString()).toFixed(3)}g</td>
                      <td className="p-2 border-r border-gray-300 text-right font-mono font-bold">{parseFloat(item.netWeightGrams.toString()).toFixed(3)}g</td>
                      <td className="p-2 border-r border-gray-300 text-right font-mono">{parseFloat(item.fineWeightGrams.toString()).toFixed(3)}g</td>
                      <td className="p-2 text-right font-mono font-semibold">{formatINR(item.assessedValue)}</td>
                    </tr>
                  ))}
                  {/* Totals Row */}
                  <tr className="bg-gray-50 font-bold border-t-2 border-black">
                    <td colSpan={3} className="p-2 text-right border-r border-gray-300">Total Weight & Valuation:</td>
                    <td className="p-2 text-right border-r border-gray-300 font-mono">{totalGross.toFixed(3)}g</td>
                    <td className="p-2 text-right border-r border-gray-300 font-mono">-</td>
                    <td className="p-2 text-right border-r border-gray-300 font-mono text-black">{totalNet.toFixed(3)}g</td>
                    <td className="p-2 text-right border-r border-gray-300 font-mono">{totalFine.toFixed(3)}g</td>
                    <td className="p-2 text-right font-mono text-black">{formatINR(totalValuation)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financial Terms & Repayment Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border-2 border-black rounded bg-gray-50">
              <div className="space-y-1.5">
                <div className="text-gray-600 text-[10px] uppercase font-bold">Principal Loan Advanced:</div>
                <div className="font-mono text-2xl font-black text-black">
                  {formatINR(loan.principalAmount)}
                </div>
                <div className="text-[11px] text-gray-700 font-medium">
                  Monthly Rate: <span className="font-bold">{monthlyRateNum.toFixed(2)}% pm</span> (₹{monthlyRateNum.toFixed(2)} per ₹100 / month)
                </div>
              </div>

              <div className="space-y-1 text-right text-[11px]">
                <div className="text-gray-600 text-[10px] uppercase font-bold">Current Principal Balance:</div>
                <div className="font-mono text-xl font-bold text-black">
                  {formatINR(loan.principalOutstanding)}
                </div>
                <div className="text-[10px] text-gray-500">
                  Calculated Actual/365 simple interest standard
                </div>
              </div>
            </div>

            {/* Terms and Conditions (Indian Pawn Broking Standard) */}
            <div className="border border-gray-300 p-3 rounded text-[9.5px] text-gray-600 space-y-1 leading-relaxed">
              <div className="font-bold text-black uppercase text-[10px]">Terms & Conditions of Pawn:</div>
              <p>1. The pledgor declares that the pledged articles are their absolute bona fide property and free from all encumbrances.</p>
              <p>2. Interest is calculated on monthly basis as agreed. Payments may be made via Counter Cash or Bank/UPI transfer.</p>
              <p>3. Articles must be redeemed on or before the due date. A statutory grace period of {loan.gracePeriodDays} days is provided.</p>
              <p>4. Upon complete repayment of principal, interest, and charges, the original articles shall be safely returned against surrender of this ticket.</p>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-12 pt-10 text-center text-xs">
              <div className="border-t border-black pt-2">
                <span className="font-bold block text-black">Signature / Thumb Impression of Pledgor</span>
                <span className="text-[10px] text-gray-500">I have received the advance and accepted the terms</span>
              </div>
              <div className="border-t border-black pt-2">
                <span className="font-bold block text-black">For PAWNIFY JEWELLERS</span>
                <span className="text-[10px] text-gray-500">Authorized Cashier / Proprietor Signature</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
