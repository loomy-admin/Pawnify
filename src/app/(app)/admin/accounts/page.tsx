import React from "react";
import { checkAuth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { listAccounts } from "@/lib/services/accounts";
import { getAvailableLendingFunds } from "@/lib/services/capital";
import { AccountsClient } from "./accounts-client";

export const metadata = {
  title: "Account Master | Pawnify",
  description: "Master financial accounts configuration for Day Book, Ledgers, and reporting.",
};

export default async function AccountsPage() {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    redirect("/login");
  }

  // Fetch initial accounts server-side
  const initialAccounts = await listAccounts();
  const rawFunds = await getAvailableLendingFunds();

  const initialFunds = {
    totalCapitalIntroduced: rawFunds.totalCapitalIntroduced.toFixed(2),
    totalDisbursed: rawFunds.totalDisbursed.toFixed(2),
    totalCollected: rawFunds.totalCollected.toFixed(2),
    totalReversed: rawFunds.totalReversed.toFixed(2),
    availableLendingFunds: rawFunds.availableLendingFunds.toFixed(2),
  };

  return (
    <AccountsClient
      userRole={auth.user.role}
      initialAccounts={JSON.parse(JSON.stringify(initialAccounts))}
      initialFunds={initialFunds}
    />
  );
}
