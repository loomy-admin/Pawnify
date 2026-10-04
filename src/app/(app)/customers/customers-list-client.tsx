"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { CustomersTable, CustomerRowData } from "./customers-table";
import { useGetCustomersQuery } from "@/lib/redux/api/customersApi";

function CustomersListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";

  const { data, isFetching } = useGetCustomersQuery({
    search,
    page: 1,
    pageSize: 100,
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;

  const formattedCustomers: CustomerRowData[] = customers.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    city: c.city,
    state: c.state,
    _count: {
      loans: c._count.loans,
    },
    kycDocuments: (c.kycDocuments || []).map((d: any) => ({ status: d.status })),
  }));

  const handleFilterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const newSearch = form.get("search")?.toString() || "";
    if (newSearch) params.set("search", newSearch);
    router.push(`/customers?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Octis Customer Relations Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Customers
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Directory, identity records, and credit history
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/customers/new"
            className="btn-primary text-xs px-4 py-2 shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </Link>
        </div>
      </div>

      {/* Directory Filter Bar & Summary Pills */}
      <div
        className="glass-card p-3.5 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ borderColor: "var(--border-card)" }}
      >
        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
              Customer directory
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-(--bg-secondary) border border-(--border-primary) text-(--text-muted) uppercase">
              TOTAL {total}
            </span>
          </div>

          <form onSubmit={handleFilterSubmit} className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              name="search"
              defaultValue={search}
              placeholder="Name, mobile, city, email..."
              className="input-field pl-10 text-xs py-1.5 w-full"
            />
          </form>
        </div>

        <div className="text-xs self-end sm:self-center" style={{ color: "var(--text-tertiary)" }}>
          Showing <span className="font-bold text-(--text-primary)">{formattedCustomers.length}</span> of{" "}
          <span className="font-bold text-(--text-primary)">{total}</span> records
        </div>
      </div>

      <CustomersTable data={formattedCustomers} isLoading={isFetching} />
    </div>
  );
}

export function CustomersListClient() {
  return (
    <Suspense fallback={null}>
      <CustomersListContent />
    </Suspense>
  );
}
