/**
 * Voucher Management Service
 *
 * Implements standard Indian pawn broking & jewellery accounting vouchers:
 * 1. Receipt Voucher (Receive Money / Jama):
 *    - Capital Introduction, Owner Equity, Misc Receipts, Investment.
 * 2. Payment Voucher (Send Money / Kharcha):
 *    - Shop Expenses (Rent, Tea, Electricity, Supplies), Partner Drawings, Vendor Payouts.
 *
 * Automatically updates AccountMaster (Cash/Bank) and records single-entry LedgerEntry.
 */

import Decimal from "decimal.js";
import type { Transaction } from "sequelize";
import { LedgerEntry, AccountMaster, Op, runTransaction } from "@/lib/db";
import { writeLedgerEntry } from "@/lib/ledger-writer";
import { resolveCounterCashAccount } from "@/lib/services/account-resolver";

export type VoucherType = "RECEIPT" | "PAYMENT";

export interface CreateVoucherInput {
  voucherType: VoucherType;
  amount: number | string;
  accountId?: string; // Target Cash or Bank account
  partyName: string; // Source or Payee (e.g. "Rajesh Owner", "Landlord", "Office Tea")
  category: string; // e.g. "CAPITAL_INTRO", "EXPENSE", "DRAWING", "SUPPLIER", "OTHER"
  paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD";
  date?: Date | string;
  referenceNo?: string;
  notes?: string;
  createdById?: string;
}

export interface VoucherRecord {
  id: string;
  voucherNumber: string;
  voucherType: VoucherType;
  amount: string;
  partyName: string;
  category: string;
  paymentMode: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  createdAt: Date;
  referenceNo: string | null;
  notes: string;
}

/**
 * Generate sequential Voucher Number: VCH-[REC/PAY]-YYYYMMDD-XXXXX
 */
async function generateVoucherNumber(type: VoucherType, transaction?: Transaction): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = type === "RECEIPT" ? "VCH-REC" : "VCH-PAY";
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const count = await LedgerEntry.count({
    where: {
      referenceId: {
        [Op.like]: `${prefix}-${dateStr}-%`,
      },
      createdAt: {
        [Op.gte]: startOfDay,
      },
    },
    transaction,
  });

  return `${prefix}-${dateStr}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Creates and posts a Voucher (Receive Money or Send Money).
 */
export async function createVoucher(input: CreateVoucherInput) {
  const amount = new Decimal(input.amount);
  if (amount.lte(new Decimal(0))) {
    throw new Error("Voucher amount must be greater than zero.");
  }

  if (!input.partyName || !input.partyName.trim()) {
    throw new Error(
      input.voucherType === "RECEIPT"
        ? "Received From (Party / Source) is required."
        : "Paid To (Expense / Payee Name) is required."
    );
  }

  return await runTransaction(async (t) => {
    // 1. Resolve Account
    let accountId = input.accountId;
    if (!accountId) {
      accountId = await resolveCounterCashAccount(t);
    }

    const account = await AccountMaster.findByPk(accountId, { transaction: t });
    if (!account) {
      throw new Error("Specified cash or bank account not found.");
    }
    if (!account.isActive) {
      throw new Error(`Account "${account.name}" (${account.code}) is inactive.`);
    }

    // 2. Generate Voucher Number
    const voucherNumber = await generateVoucherNumber(input.voucherType, t);

    // 3. Format Audit Description
    const typeLabel = input.voucherType === "RECEIPT" ? "Receive Money (Jama)" : "Send Money (Kharcha)";
    const description = `Voucher ${voucherNumber} · ${typeLabel}: ₹${amount.toFixed(2)} [${input.category}] - ${input.partyName.trim()}${
      input.notes ? ` (${input.notes.trim()})` : ""
    } · Mode: ${input.paymentMode}`;

    // 4. Record single-entry LedgerEntry
    const ledgerType = input.voucherType === "RECEIPT" ? "CAPITAL_INTRO" : "DISBURSEMENT";

    const entry = await writeLedgerEntry(t, {
      loanId: null,
      type: ledgerType,
      amount,
      principalAfter: new Decimal(0),
      accountId: account.id,
      referenceId: voucherNumber,
      description,
    });

    return {
      voucherNumber,
      voucherType: input.voucherType,
      amount: amount.toString(),
      ledgerEntryId: entry.id,
      accountId: account.id,
      accountName: account.name,
      partyName: input.partyName.trim(),
      category: input.category,
      paymentMode: input.paymentMode,
      date: entry.createdAt,
    };
  });
}

/**
 * List recent Vouchers by querying non-loan LedgerEntries with VCH prefix.
 */
export async function listVouchers(limit: number = 100) {
  const entries = await LedgerEntry.findAll({
    where: {
      loanId: null,
      referenceId: {
        [Op.like]: "VCH-%",
      },
    },
    order: [["createdAt", "DESC"]],
    limit,
    include: [
      {
        model: AccountMaster,
        as: "account",
        attributes: ["id", "code", "name", "type"],
      },
    ],
  });

  return entries.map((e) => {
    const raw = e.toJSON() as any;
    const isReceipt = raw.referenceId?.startsWith("VCH-REC");
    return {
      id: raw.id,
      voucherNumber: raw.referenceId,
      voucherType: isReceipt ? ("RECEIPT" as VoucherType) : ("PAYMENT" as VoucherType),
      amount: raw.amount,
      description: raw.description,
      accountCode: raw.account?.code ?? "CASH-01",
      accountName: raw.account?.name ?? "Counter Cash",
      createdAt: raw.createdAt,
    };
  });
}
