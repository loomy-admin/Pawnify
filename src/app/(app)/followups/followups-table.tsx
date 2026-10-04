"use client";

import React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { FollowUpStatusButton, DeleteFollowUpButton } from "./followup-client";
import { AlertTriangle, Phone } from "lucide-react";
import type { FollowUpStatus } from "@/lib/db/types";

export interface FollowUpRowData {
  id: string;
  dueDate: string;
  loanId: string;
  loan: {
    loanNumber: string;
    principalOutstanding: string;
    customer: {
      fullName: string;
      phone: string;
    };
  };
  note: string;
  assignedToName: string;
  status: FollowUpStatus;
  isOverdueTask?: boolean;
}

interface FollowUpsTableProps {
  data: FollowUpRowData[];
  isLoading?: boolean;
  tab: string;
}

const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
};

const formatINR = (val: string | number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(typeof val === "string" ? parseFloat(val) : val);
};

export function FollowUpsTable({ data, isLoading = false, tab }: FollowUpsTableProps) {
  const columns: ColumnDef<FollowUpRowData>[] = [
    {
      accessorKey: "dueDate",
      header: "Target Date",
      cell: ({ row }) => {
        const f = row.original;
        return (
          <div>
            <div
              className={`font-semibold text-xs flex items-center gap-1.5 ${
                f.isOverdueTask ? "text-red-500" : ""
              }`}
              style={!f.isOverdueTask ? { color: "var(--text-primary)" } : undefined}
            >
              {f.isOverdueTask && <AlertTriangle className="w-3.5 h-3.5" />}
              {formatDate(f.dueDate)}
            </div>
            {f.isOverdueTask && (
              <div className="text-[10px] text-red-500 font-medium mt-0.5">Overdue task</div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "loan.loanNumber",
      header: "Loan Contract",
      cell: ({ row }) => {
        const f = row.original;
        return (
          <div>
            <Link
              href={`/loans/${f.loanId}`}
              className="font-mono text-xs font-semibold hover:underline"
              style={{ color: "var(--accent-text)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {f.loan.loanNumber}
            </Link>
            <div className="text-[11px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
              Due: {formatINR(f.loan.principalOutstanding)}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "loan.customer.fullName",
      header: "Customer Profile",
      cell: ({ row }) => {
        const f = row.original;
        return (
          <div>
            <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
              {f.loan.customer.fullName}
            </div>
            <div
              className="font-mono text-xs flex items-center gap-1 mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              <Phone className="w-3 h-3 shrink-0" />
              <span>{f.loan.customer.phone}</span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "note",
      header: "Reminder Action Note",
      cell: ({ row }) => {
        return (
          <div className="text-xs max-w-md font-sans" style={{ color: "var(--text-secondary)" }}>
            {row.original.note}
          </div>
        );
      },
    },
    {
      accessorKey: "assignedToName",
      header: "Assigned Staff",
      cell: ({ row }) => {
        return (
          <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
            {row.original.assignedToName}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Status Action",
      cell: ({ row }) => {
        const f = row.original;
        return (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <FollowUpStatusButton id={f.id} currentStatus={f.status} />
            <DeleteFollowUpButton id={f.id} />
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
      searchKey="loan_customer_fullName"
      searchPlaceholder="Filter reminders by customer name, note..."
      emptyTitle={`No ${tab.toLowerCase()} tasks found`}
      emptyDescription={
        tab === "PENDING"
          ? "All caught up! No pending reminder follow-ups currently scheduled."
          : "No completed follow-up records yet."
      }
      defaultPageSize={10}
      onRowClick={(row) => {
        window.location.href = `/loans/${row.loanId}`;
      }}
    />
  );
}
