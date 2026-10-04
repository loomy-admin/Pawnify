/**
 * Capital Introduction & Lending Pool Service
 *
 * Implements Function 1 of Pawn Broker Operations:
 * Tracks capital introduced into the shop's lending fund pool.
 * Capital is NOT customer payment or loan revenue.
 * Computes available lending funds across cash and bank accounts.
 */

import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { LedgerEntry, AccountMaster, Op, runTransaction, PaymentMode } from "@/lib/db";
import { writeLedgerEntry } from "@/lib/ledger-writer";
import { resolveCounterCashAccount } from "@/lib/services/account-resolver";
import { debugLog } from "@/lib/debug";

export interface IntroduceCapitalInput {
  amount: number | string;
  source: string; // e.g. "Owner - Rajesh", "Investor - Kumar"
  mode: PaymentMode | "CASH" | "BANK_TRANSFER" | "UPI";
  notes?: string;
  date?: Date;
  accountId?: string;
  createdById?: string;
}

export interface AvailableFundsSummary {
  totalCapitalIntroduced: Decimal;
  totalDisbursed: Decimal;
  totalCollected: Decimal;
  totalReversed: Decimal;
  availableLendingFunds: Decimal;
}

/**
 * Record a capital introduction into the shop's lending fund pool.
 */
export async function introduceCapital(input: IntroduceCapitalInput) {
  const amount = new Decimal(input.amount);
  if (amount.lte(new Decimal(0))) {
    throw new Error("Capital introduction amount must be positive");
  }

  if (!input.source || !input.source.trim()) {
    throw new Error("Source/owner of capital is required");
  }

  return await runTransaction(async (t) => {
    // Resolve account: use provided accountId, or default counter cash account
    let targetAccountId = input.accountId;
    if (!targetAccountId) {
      targetAccountId = await resolveCounterCashAccount(t);
    }

    const description = `Capital introduced — ₹${amount.toFixed(2)} from ${input.source.trim()}${
      input.notes ? ` (${input.notes.trim()})` : ""
    }`;

    const entry = await writeLedgerEntry(t, {
      loanId: null,
      type: "CAPITAL_INTRO",
      amount,
      principalAfter: 0,
      accountId: targetAccountId,
      description,
      referenceId: input.source.trim(),
    });

    debugLog("capital", `Capital introduced: ₹${amount.toString()} from ${input.source}`);

    return {
      id: entry.id,
      amount,
      source: input.source,
      accountId: targetAccountId,
      createdAt: entry.createdAt,
    };
  });
}

/**
 * Compute the shop's current available lending funds.
 * Available = (Capital Introductions + Customer Payments) - Disbursements +/- Reversals
 */
export async function getAvailableLendingFunds(): Promise<AvailableFundsSummary> {
  const entries = await LedgerEntry.findAll({
    attributes: ["type", "amount"],
  });

  let totalCapitalIntroduced = new Decimal(0);
  let totalDisbursed = new Decimal(0);
  let totalCollected = new Decimal(0);
  let totalReversed = new Decimal(0);

  for (const entry of entries) {
    const amt = new Decimal(entry.amount || 0);
    switch (entry.type) {
      case "CAPITAL_INTRO":
        totalCapitalIntroduced = totalCapitalIntroduced.plus(amt);
        break;
      case "DISBURSEMENT":
        totalDisbursed = totalDisbursed.plus(amt);
        break;
      case "PAYMENT":
        totalCollected = totalCollected.plus(amt);
        break;
      case "REVERSAL":
        totalReversed = totalReversed.plus(amt);
        break;
    }
  }

  const availableLendingFunds = totalCapitalIntroduced
    .plus(totalCollected)
    .minus(totalDisbursed)
    .minus(totalReversed);

  return {
    totalCapitalIntroduced,
    totalDisbursed,
    totalCollected,
    totalReversed,
    availableLendingFunds,
  };
}
