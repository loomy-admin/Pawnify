/**
 * Ledger Writer — Phase 7
 *
 * A thin wrapper around LedgerEntry creation that supports optional account
 * association via AccountMaster.
 */

import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { LedgerEntry, TransactionType } from "@/lib/db";
import { validateAccountForPosting } from "@/lib/services/accounts";

export interface WriteLedgerEntryInput {
  loanId?: string | null;
  type: "DISBURSEMENT" | "PAYMENT" | "CLOSURE" | "ITEM_RELEASE" | "CAPITAL_INTRO" | "REVERSAL" | TransactionType;
  amount: Decimal | number | string;
  principalAfter: Decimal | number | string;
  description: string;
  referenceId?: string | null;
  /** Optional AccountMaster link. When provided, account must exist and be ACTIVE. */
  accountId?: string | null;
}

/**
 * Write a single LedgerEntry, optionally linked to an AccountMaster account.
 *
 * @param tx    A Sequelize Transaction instance (optional)
 * @param input The ledger entry fields
 * @returns     The created LedgerEntry record
 *
 * @throws When accountId is provided but the account does not exist or is inactive
 */
export async function writeLedgerEntry(
  tx: Transaction | any,
  input: WriteLedgerEntryInput
) {
  // Validate account only if accountId is explicitly supplied
  if (input.accountId) {
    await validateAccountForPosting(input.accountId);
  }

  const transaction = tx && tx.commit && tx.rollback ? (tx as Transaction) : undefined;

  return await LedgerEntry.create(
    {
      loanId: input.loanId,
      type: input.type as any,
      amount: input.amount.toString(),
      principalAfter: input.principalAfter.toString(),
      description: input.description,
      referenceId: input.referenceId || null,
      accountId: input.accountId || null,
    },
    { transaction }
  );
}
