"use client";

import React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Scale, AlertTriangle, CheckCircle2, ArrowRight, Plus, Clock, ShieldCheck } from "lucide-react";

export interface LoanRowData {
  id: string;
  loanNumber: string;
  loanDate: Date | string;
  customer: {
    fullName: string;
    phone: string;
  };
  customerId: string;
  items: Array<{
    metalType: string;
  }>;
  totalAssessedValue: number | string;
  ltvPercent: number | string;
  principalOutstanding: number | string;
  principalAmount: number | string;
  dueDate: Date | string;
  tenureMonths: number;
  interestRateMonthly: number | string;
  displayStatus: "ACTIVE" | "OVERDUE" | "CLOSED" | string;
}

interface LoansTableProps {
  data: LoanRowData[];
  isLoading?: boolean;
}

const formatINR = (val: string | number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(typeof val === "string" ? parseFloat(val) : val);
};

const formatDate = (dateString: Date | string) => {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
};

export function LoansTable({ data, isLoading = false }: LoansTableProps) {
  const columns: ColumnDef<LoanRowData>[] = [
    {
      accessorKey: "loanNumber",
      header: "Loan Contract",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <Link
              href={`/loans/${l.id}`}
              className="font-mono font-semibold text-xs hover:underline"
              style={{ color: "var(--accent-text)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {l.loanNumber}
            </Link>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Disbursed: {formatDate(l.loanDate)}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "customer.fullName",
      header: "Customer Profile",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <Link
              href={`/customers/${l.customerId}`}
              className="font-medium hover:underline transition-colors text-sm"
              style={{ color: "var(--text-primary)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {l.customer.fullName}
            </Link>
            <div className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
              {l.customer.phone}
            </div>
          </div>
        );
      },
    },
    {
      id: "collateral",
      header: "Collateral & LTV",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <div
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <Scale className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--accent-text)" }} />
              <span className="font-semibold">
                {l.items[0]?.metalType || "MIXED"} ({l.items.length} item
                {l.items.length > 1 ? "s" : ""})
              </span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Val: {formatINR(l.totalAssessedValue.toString())} | LTV:{" "}
              <span className="font-bold" style={{ color: "var(--accent-text)" }}>
                {l.ltvPercent.toString()}%
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "principalOutstanding",
      header: "Principal Outstanding",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              {formatINR(l.principalOutstanding.toString())}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Original: {formatINR(l.principalAmount.toString())}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due Date & Tenure",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {formatDate(l.dueDate)}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {l.tenureMonths} mo @ {l.interestRateMonthly.toString()}% p.m.
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "displayStatus",
      header: "Status",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1 ${
              l.displayStatus === "ACTIVE"
                ? "badge-active"
                : l.displayStatus === "OVERDUE"
                  ? "badge-overdue"
                  : l.displayStatus === "DRAFT"
                    ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    : l.displayStatus === "APPROVED"
                      ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                      : "badge-closed"
            }`}
          >
            {l.displayStatus === "DRAFT" && <Clock className="w-3 h-3" />}
            {l.displayStatus === "APPROVED" && <ShieldCheck className="w-3 h-3" />}
            {l.displayStatus === "OVERDUE" && <AlertTriangle className="w-3 h-3" />}
            {l.displayStatus === "CLOSED" && <CheckCircle2 className="w-3 h-3" />}
            {l.displayStatus}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Action",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div className="text-right">
            <Link
              href={`/loans/${l.id}`}
              className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <span>Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyTitle="No Loan Contracts Found"
      emptyDescription="No pawn loans matched your search keywords or active status filter."
      emptyAction={
        <Link
          href="/loans/new"
          className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 mt-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Disburse New Loan
        </Link>
      }
      defaultPageSize={10}
      onRowClick={(row) => {
        window.location.href = `/loans/${row.id}`;
      }}
    />
  );
}
