"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { MetalType } from "@/lib/db/types";
import { LoansTable, LoanRowData } from "./loans-table";
import { useGetLoansQuery } from "@/lib/redux/api/loansApi";

function LoansListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusParam =
    (searchParams.get("status") as "ACTIVE" | "OVERDUE" | "CLOSED" | null) || undefined;
  const search = searchParams.get("search") || "";
  const metalTypeParam = (searchParams.get("metalType") as MetalType | null) || undefined;

  const { data, isFetching } = useGetLoansQuery({
    status: statusParam,
    search,
    metalType: metalTypeParam,
    page: 1,
    pageSize: 100,
  });

  const loans = data?.loans ?? [];
  const total = data?.total ?? 0;

  const statusTabs = [
    { label: "All Loans", value: undefined },
    { label: "Active", value: "ACTIVE" },
    { label: "Overdue Exposure", value: "OVERDUE" },
    { label: "Closed & Released", value: "CLOSED" },
  ];

  const formattedLoans: LoanRowData[] = loans.map((l) => ({
    id: l.id,
    loanNumber: l.loanNumber,
    loanDate: l.loanDate,
    customer: {
      fullName: l.customer.fullName,
      phone: l.customer.phone,
    },
    customerId: l.customerId,
    items: (l.items || []).map((i: any) => ({ metalType: i.metalType })),
    totalAssessedValue: l.totalAssessedValue,
    ltvPercent: l.ltvPercent,
    principalOutstanding: l.principalOutstanding,
    principalAmount: l.principalAmount,
    dueDate: l.dueDate,
    tenureMonths: l.tenureMonths,
    interestRateMonthly: l.interestRateMonthly,
    displayStatus: l.displayStatus,
  }));

  const handleFilterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    if (statusParam) params.set("status", statusParam);
    const newSearch = form.get("search")?.toString() || "";
    const newMetalType = form.get("metalType")?.toString() || "";
    if (newSearch) params.set("search", newSearch);
    if (newMetalType) params.set("metalType", newMetalType);
    router.push(`/loans?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Octis Loans Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Loans
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Loan contracts directory, pledge collateral, and settlement tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/loans/new"
            className="btn-primary text-xs px-4 py-2 shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Loan</span>
          </Link>
        </div>
      </div>

      {/* Segmented Status Tabs (Octis style) */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-(--bg-card) border border-(--border-primary) shadow-xs max-w-fit flex-wrap">
        {statusTabs.map((tab) => {
          const active = statusParam === tab.value;
          return (
            <Link
              key={tab.label}
              href={`/loans?${tab.value ? `status=${tab.value}` : ""}${
                search ? `&search=${search}` : ""
              }`}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? "bg-[#B38646] text-white shadow-xs"
                  : "text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--bg-secondary)"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div
        className="glass-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ borderColor: "var(--border-card)" }}
      >
        <form
          onSubmit={handleFilterSubmit}
          className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto"
        >
          <div className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              name="search"
              defaultValue={search}
              placeholder="Loan No., customer name, packet..."
              className="input-field pl-10 text-xs py-2 w-full"
            />
          </div>

          <select
            name="metalType"
            defaultValue={metalTypeParam || ""}
            className="input-field text-xs py-2 w-full sm:w-44"
          >
            <option value="">All Collateral Types</option>
            <option value="GOLD">Gold (22K / 24K / 18K)</option>
            <option value="SILVER">Silver (Sterling / Fine)</option>
          </select>

          <button type="submit" className="btn-secondary text-xs px-3 py-2 shrink-0 cursor-pointer">
            Filter
          </button>
        </form>

        <div className="text-xs self-end sm:self-center" style={{ color: "var(--text-tertiary)" }}>
          Showing{" "}
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>
            {formattedLoans.length}
          </span>{" "}
          of{" "}
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>
            {total}
          </span>{" "}
          contracts
        </div>
      </div>

      <LoansTable data={formattedLoans} isLoading={isFetching} />
    </div>
  );
}

export function LoansListClient() {
  return (
    <Suspense fallback={null}>
      <LoansListContent />
    </Suspense>
  );
}
