"use client";

import React from "react";
import Link from "next/link";
import { useGetCustomerByIdQuery } from "@/lib/redux/api/customersApi";
import { maskDocNumber } from "@/lib/validation/customer";
import { PageHeader } from "@/components/page-header";
import { AddKycForm, VerifyKycButtons } from "./kyc-actions";
import { CustomerCrudButtons } from "./customer-crud-buttons";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Coins,
  ArrowLeft,
  Plus,
  FileText,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface CustomerDetailClientProps {
  id: string;
  isAdmin: boolean;
}

export function CustomerDetailClient({ id, isAdmin }: CustomerDetailClientProps) {
  const { data, isLoading, isError } = useGetCustomerByIdQuery(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-(--accent)" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-sm text-(--text-muted)">Customer profile not found.</div>
    );
  }

  const { customer, panStatus } = data;

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

  const getKycBadge = (status: string) => {
    if (status === "VERIFIED") {
      return (
        <span className="badge-verified text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          Verified
        </span>
      );
    }
    if (status === "REJECTED") {
      return (
        <span className="badge-rejected text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" />
          Rejected
        </span>
      );
    }
    return (
      <span className="badge-pending text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Pending Review
      </span>
    );
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-(--text-secondary) hover:text-(--accent) transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customers Directory
        </Link>
      </div>

      <PageHeader
        title={customer.fullName}
        description={`Registered on ${formatDate(customer.createdAt)} by ${
          customer.createdBy.name
        }`}
        action={
          <div className="flex items-center gap-2">
            <CustomerCrudButtons
              customer={{
                id: customer.id,
                fullName: customer.fullName,
                phone: customer.phone,
                email: customer.email,
                addressLine1: customer.addressLine1,
                city: customer.city,
                state: customer.state,
                pincode: customer.pincode,
              }}
              canDelete={isAdmin}
            />
            <Link
              href={`/loans/new?customerId=${customer.id}`}
              className="btn-primary text-xs px-4 py-2.5 shadow-md shadow-amber-500/10"
            >
              <Plus className="w-4 h-4" />
              Disburse New Loan
            </Link>
          </div>
        }
      />

      {/* PAN Threshold Alert */}
      {panStatus.required && !panStatus.hasPan && (
        <div className="mb-6 p-4 rounded-xl bg-(--accent-bg) border border-(--accent-border) flex items-start gap-3 text-(--accent-text) text-sm animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-(--accent) shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-(--accent-text)">
              PAN Card Required for High-Value Exposure
            </div>
            <p className="text-xs text-(--accent-text)/80 mt-1">
              Total active loan principal exceeds ₹{panStatus.threshold.toLocaleString("en-IN")}. As
              per Indian regulatory compliance, please collect and verify the customer&apos;s PAN
              card.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Personal & Contact Details */}
        <div className="space-y-6">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-(--border-primary)">
              <User className="w-4 h-4 text-(--accent)" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-secondary)">
                Contact & Personal Info
              </h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-(--text-muted) flex items-center gap-2 text-xs">
                  <Phone className="w-3.5 h-3.5" /> Mobile Number
                </span>
                <span className="font-mono font-medium text-(--text-primary)">
                  {customer.phone}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--text-muted) flex items-center gap-2 text-xs">
                  <Mail className="w-3.5 h-3.5" /> Email
                </span>
                <span className="text-(--text-secondary) text-xs">{customer.email || "—"}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--text-muted) flex items-center gap-2 text-xs">
                  <Calendar className="w-3.5 h-3.5" /> Date of Birth
                </span>
                <span className="text-(--text-secondary) text-xs">
                  {customer.dob ? formatDate(customer.dob) : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Residential Address */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-(--border-primary)">
              <MapPin className="w-4 h-4 text-(--accent)" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-secondary)">
                Residential Address
              </h2>
            </div>

            <div className="text-xs text-(--text-secondary) leading-relaxed space-y-1">
              <div className="font-medium text-(--text-primary)">{customer.addressLine1}</div>
              {customer.addressLine2 && <div>{customer.addressLine2}</div>}
              <div>
                {customer.city}, {customer.state} —{" "}
                <span className="font-mono text-(--accent)">{customer.pincode}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: KYC Docs & Loan History */}
        <div className="lg:col-span-2 space-y-8">
          {/* KYC Documents Card */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-(--border-primary)">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-(--accent)" />
                <h2 className="text-base font-semibold text-(--text-primary)">
                  KYC Identity Documents
                </h2>
              </div>
              <AddKycForm customerId={customer.id} />
            </div>

            {customer.kycDocuments.length === 0 ? (
              <div className="p-8 text-center text-xs text-(--text-muted) bg-(--bg-tertiary) rounded-xl border border-dashed border-(--border-primary)">
                No KYC documents uploaded yet. Click &quot;Add KYC Document&quot; above to record
                Aadhaar or PAN.
              </div>
            ) : (
              <div className="space-y-3">
                {customer.kycDocuments.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="p-3.5 rounded-xl bg-(--bg-tertiary) border border-(--border-primary) flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-(--bg-secondary) border border-(--border-primary) flex items-center justify-center font-bold text-xs text-(--accent) shrink-0">
                        {doc.docType === "AADHAAR"
                          ? "UID"
                          : doc.docType === "VOTER_ID"
                            ? "VOT"
                            : doc.docType === "DRIVING_LICENSE"
                              ? "DL"
                              : doc.docType}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-(--text-primary)">
                            {doc.docType.replace("_", " ")}
                          </span>
                          {getKycBadge(doc.status)}
                        </div>
                        <div className="font-mono text-xs text-(--text-secondary) mt-0.5">
                          {maskDocNumber(doc.docNumber)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <VerifyKycButtons
                        docId={doc.id}
                        customerId={customer.id}
                        currentStatus={doc.status}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Loan History Card */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-(--border-primary)">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-(--accent)" />
                <h2 className="text-base font-semibold text-(--text-primary)">
                  Loan Contracts History ({customer.loans.length})
                </h2>
              </div>
            </div>

            {customer.loans.length === 0 ? (
              <div className="p-8 text-center text-xs text-(--text-muted) bg-(--bg-tertiary) rounded-xl border border-dashed border-(--border-primary)">
                No loans recorded for this customer yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Loan No.</th>
                      <th>Date</th>
                      <th>Principal</th>
                      <th>Outstanding</th>
                      <th>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.loans.map((l: any) => (
                      <tr key={l.id}>
                        <td className="font-mono text-xs font-medium text-(--accent)">
                          <Link href={`/loans/${l.id}`} className="hover:underline">
                            {l.loanNumber}
                          </Link>
                        </td>
                        <td className="text-xs text-(--text-secondary)">
                          {formatDate(l.loanDate)}
                        </td>
                        <td className="font-semibold text-(--text-primary)">
                          {formatINR(l.principalAmount.toString())}
                        </td>
                        <td className="font-semibold text-(--accent)">
                          {formatINR(l.principalOutstanding.toString())}
                        </td>
                        <td>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                              l.status === "ACTIVE" ? "badge-active" : "badge-closed"
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="text-right">
                          <Link
                            href={`/loans/${l.id}`}
                            className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1"
                          >
                            View
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
