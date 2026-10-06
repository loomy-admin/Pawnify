/**
 * Octis Pawnbroker — Voucher Management Service
 *
 * Implements full double-entry-ready voucher operations:
 * 1. Voucher Types:
 *    - Money Received (RECEIPT / Jama)
 *    - Money Paid (PAYMENT / Kharcha)
 * 2. Dynamic Categories & Subcategories (Income / Expense hierarchy with inline [+ Add New])
 * 3. 3-State Lifecycle:
 *    - DRAFT: editable; no financial/ledger posting
 *    - POSTED: creates automatic ledger entries (LedgerEntry); cannot be directly edited
 *    - CANCELLED: creates a compensating REVERSAL entry; original voucher remains for audit
 * 4. Audit Invariant: Never delete a posted voucher.
 */

import Decimal from "decimal.js";
import { randomUUID } from "crypto";
import type { Transaction } from "sequelize";
import { LedgerEntry, AccountMaster, AppSetting, Op, runTransaction } from "@/lib/db";
import { writeLedgerEntry } from "@/lib/ledger-writer";
import { resolveCounterCashAccount } from "@/lib/services/account-resolver";

export type VoucherType = "RECEIPT" | "PAYMENT";
export type VoucherStatus = "DRAFT" | "POSTED" | "CANCELLED";

export interface VoucherCategory {
  id: string;
  type: "INCOME" | "EXPENSE";
  name: string;
  subcategories: string[];
}

export interface CreateVoucherInput {
  voucherType: VoucherType;
  amount: number | string;
  accountId?: string;
  partyName: string;
  category: string;
  subcategory: string;
  paymentMode: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "OTHER";
  date?: Date | string;
  referenceNo?: string;
  notes?: string;
  asDraft?: boolean;
  createdById?: string;
}

export interface VoucherItem {
  id: string;
  voucherNumber: string;
  voucherType: VoucherType;
  status: VoucherStatus;
  amount: string;
  partyName: string;
  category: string;
  subcategory: string;
  paymentMode: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  date: string;
  referenceNo: string | null;
  notes: string;
  ledgerEntryId?: string | null;
  reversalEntryId?: string | null;
  createdById?: string | null;
  cancelledById?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_CATEGORIES: VoucherCategory[] = [
  {
    id: "cat_expense",
    type: "EXPENSE",
    name: "Expense",
    subcategories: [
      "Rent",
      "Electricity",
      "Salary",
      "Office Expense",
      "Tea & Refreshments",
      "Printing & Stationery",
      "Legal & Accounting Fees",
      "Shop Maintenance",
      "Travel & Conveyance",
    ],
  },
  {
    id: "cat_income",
    type: "INCOME",
    name: "Income",
    subcategories: [
      "Interest Income",
      "Capital Introduction",
      "Partner Investment",
      "Document / Processing Fee",
      "Late Payment Fee",
      "Scrap / Bullion Sale",
      "Other Income",
    ],
  },
];

const CATEGORIES_SETTING_KEY = "voucher.categories.v1";

// ==================== Category Management ====================

export async function getVoucherCategories(): Promise<VoucherCategory[]> {
  try {
    const setting = await AppSetting.findByPk(CATEGORIES_SETTING_KEY);
    if (!setting || !setting.value) {
      await AppSetting.upsert({
        key: CATEGORIES_SETTING_KEY,
        value: JSON.stringify(DEFAULT_CATEGORIES),
      });
      return DEFAULT_CATEGORIES;
    }
    return JSON.parse(setting.value);
  } catch (err) {
    console.error("Failed to load voucher categories:", err);
    return DEFAULT_CATEGORIES;
  }
}

export async function createVoucherCategory(type: "INCOME" | "EXPENSE", name: string): Promise<VoucherCategory[]> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  const categories = await getVoucherCategories();
  const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return categories;

  const newCat: VoucherCategory = {
    id: `cat_${Date.now()}`,
    type,
    name: trimmed,
    subcategories: [],
  };

  const updated = [...categories, newCat];
  await AppSetting.upsert({
    key: CATEGORIES_SETTING_KEY,
    value: JSON.stringify(updated),
  });

  return updated;
}

export async function createVoucherSubcategory(categoryName: string, subcategoryName: string): Promise<VoucherCategory[]> {
  const subTrimmed = subcategoryName.trim();
  if (!subTrimmed) throw new Error("Subcategory name is required");

  const categories = await getVoucherCategories();
  let found = false;

  const updated = categories.map((cat) => {
    if (cat.name.toLowerCase() === categoryName.trim().toLowerCase()) {
      found = true;
      const alreadyHas = cat.subcategories.some((s) => s.toLowerCase() === subTrimmed.toLowerCase());
      if (alreadyHas) return cat;
      return { ...cat, subcategories: [...cat.subcategories, subTrimmed] };
    }
    return cat;
  });

  if (!found) {
    // Automatically create the category if it doesn't exist
    updated.push({
      id: `cat_${Date.now()}`,
      type: "EXPENSE",
      name: categoryName.trim(),
      subcategories: [subTrimmed],
    });
  }

  await AppSetting.upsert({
    key: CATEGORIES_SETTING_KEY,
    value: JSON.stringify(updated),
  });

  return updated;
}

export async function deleteVoucherSubcategory(categoryName: string, subcategoryName: string): Promise<VoucherCategory[]> {
  const categories = await getVoucherCategories();
  const updated = categories.map((cat) => {
    if (cat.name.toLowerCase() === categoryName.trim().toLowerCase()) {
      return {
        ...cat,
        subcategories: cat.subcategories.filter((s) => s.toLowerCase() !== subcategoryName.trim().toLowerCase()),
      };
    }
    return cat;
  });

  await AppSetting.upsert({
    key: CATEGORIES_SETTING_KEY,
    value: JSON.stringify(updated),
  });

  return updated;
}

// ==================== Voucher Number Generation ====================

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

// ==================== Voucher Storage (AppSetting Row-per-voucher) ====================

function getVoucherSettingKey(id: string): string {
  return `vch:${id}`;
}

async function saveVoucherToStorage(voucher: VoucherItem): Promise<void> {
  await AppSetting.upsert({
    key: getVoucherSettingKey(voucher.id),
    value: JSON.stringify(voucher),
  });
}

async function getVoucherFromStorage(id: string): Promise<VoucherItem | null> {
  const setting = await AppSetting.findByPk(getVoucherSettingKey(id));
  if (!setting || !setting.value) return null;
  try {
    return JSON.parse(setting.value);
  } catch {
    return null;
  }
}

// ==================== Create Voucher ====================

export async function createVoucher(input: CreateVoucherInput): Promise<VoucherItem> {
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

  if (!input.category || !input.category.trim()) {
    throw new Error("Category is required.");
  }
  if (!input.subcategory || !input.subcategory.trim()) {
    throw new Error("Subcategory is required.");
  }

  const isDraft = Boolean(input.asDraft);
  const status: VoucherStatus = isDraft ? "DRAFT" : "POSTED";
  const now = new Date();
  const voucherId = randomUUID();

  return await runTransaction(async (t) => {
    // 1. Resolve Target Account (Counter Cash / Bank)
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

    // 2. Generate unique voucher number
    const voucherNumber = await generateVoucherNumber(input.voucherType, t);

    let ledgerEntryId: string | null = null;

    // 3. Post to Financial Ledger ONLY if status is POSTED
    if (!isDraft) {
      const typeLabel = input.voucherType === "RECEIPT" ? "Receive Money (Jama)" : "Send Money (Kharcha)";
      const description = `Voucher ${voucherNumber} · ${typeLabel}: ₹${amount.toFixed(2)} [${input.category} ➔ ${input.subcategory}] - ${input.partyName.trim()}${
        input.notes ? ` (${input.notes.trim()})` : ""
      } · Mode: ${input.paymentMode}`;

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

      ledgerEntryId = entry.id;
    }

    // 4. Construct and save the master VoucherItem
    const voucherRecord: VoucherItem = {
      id: voucherId,
      voucherNumber,
      voucherType: input.voucherType,
      status,
      amount: amount.toString(),
      partyName: input.partyName.trim(),
      category: input.category.trim(),
      subcategory: input.subcategory.trim(),
      paymentMode: input.paymentMode,
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      date: input.date ? new Date(input.date).toISOString() : now.toISOString(),
      referenceNo: input.referenceNo ? input.referenceNo.trim() : null,
      notes: input.notes ? input.notes.trim() : "",
      ledgerEntryId,
      reversalEntryId: null,
      createdById: input.createdById || null,
      cancelledById: null,
      cancelledAt: null,
      cancelledReason: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await saveVoucherToStorage(voucherRecord);

    return voucherRecord;
  });
}

// ==================== Post Draft Voucher ====================

export async function postDraftVoucher(voucherId: string, postedById: string): Promise<VoucherItem> {
  const voucher = await getVoucherFromStorage(voucherId);
  if (!voucher) throw new Error("Voucher not found.");
  if (voucher.status !== "DRAFT") {
    throw new Error(`Cannot post voucher: status is already ${voucher.status}.`);
  }

  const amount = new Decimal(voucher.amount);

  return await runTransaction(async (t) => {
    const account = await AccountMaster.findByPk(voucher.accountId, { transaction: t });
    if (!account) throw new Error("Linked account not found.");

    const typeLabel = voucher.voucherType === "RECEIPT" ? "Receive Money (Jama)" : "Send Money (Kharcha)";
    const description = `Voucher ${voucher.voucherNumber} · ${typeLabel}: ₹${amount.toFixed(2)} [${voucher.category} ➔ ${voucher.subcategory}] - ${voucher.partyName}${
      voucher.notes ? ` (${voucher.notes})` : ""
    } · Mode: ${voucher.paymentMode}`;

    const ledgerType = voucher.voucherType === "RECEIPT" ? "CAPITAL_INTRO" : "DISBURSEMENT";

    const entry = await writeLedgerEntry(t, {
      loanId: null,
      type: ledgerType,
      amount,
      principalAfter: new Decimal(0),
      accountId: account.id,
      referenceId: voucher.voucherNumber,
      description,
    });

    const updated: VoucherItem = {
      ...voucher,
      status: "POSTED",
      ledgerEntryId: entry.id,
      updatedAt: new Date().toISOString(),
    };

    await saveVoucherToStorage(updated);
    return updated;
  });
}

// ==================== Cancel Posted Voucher (Golden Rule #5: Reversal) ====================

export async function cancelPostedVoucher(voucherId: string, cancelledById: string, reason: string): Promise<VoucherItem> {
  const trimmedReason = reason?.trim() || "Voucher cancelled by user";
  const voucher = await getVoucherFromStorage(voucherId);
  if (!voucher) throw new Error("Voucher not found.");
  if (voucher.status === "CANCELLED") {
    throw new Error("Voucher is already cancelled.");
  }

  const amount = new Decimal(voucher.amount);

  return await runTransaction(async (t) => {
    let reversalEntryId: string | null = null;

    // If it was POSTED, write a compensating REVERSAL entry into LedgerEntry
    if (voucher.status === "POSTED") {
      const reversalDescription = `REVERSAL: ${voucher.voucherNumber} (${voucher.category} ➔ ${voucher.subcategory}) · Reason: ${trimmedReason}`;

      const revEntry = await writeLedgerEntry(t, {
        loanId: null,
        type: "REVERSAL",
        amount,
        principalAfter: new Decimal(0),
        accountId: voucher.accountId,
        referenceId: `REV-${voucher.voucherNumber}`,
        description: reversalDescription,
      });

      reversalEntryId = revEntry.id;
    }

    const updated: VoucherItem = {
      ...voucher,
      status: "CANCELLED",
      reversalEntryId,
      cancelledById,
      cancelledAt: new Date().toISOString(),
      cancelledReason: trimmedReason,
      updatedAt: new Date().toISOString(),
    };

    await saveVoucherToStorage(updated);
    return updated;
  });
}

// ==================== Delete Draft Voucher ====================

export async function deleteDraftVoucher(voucherId: string): Promise<void> {
  const voucher = await getVoucherFromStorage(voucherId);
  if (!voucher) throw new Error("Voucher not found.");
  if (voucher.status !== "DRAFT") {
    throw new Error("Cannot delete a posted or cancelled voucher. You must cancel it instead to preserve audit history.");
  }

  await AppSetting.destroy({
    where: { key: getVoucherSettingKey(voucherId) },
  });
}

// ==================== List Vouchers ====================

export async function listVouchers(limit: number = 200): Promise<VoucherItem[]> {
  // 1. Fetch all vouchers from AppSetting rows
  const voucherSettings = await AppSetting.findAll({
    where: {
      key: {
        [Op.like]: "vch:%",
      },
    },
    order: [["key", "DESC"]],
    limit,
  });

  const vouchersFromStorage: VoucherItem[] = [];
  const storedVoucherNumbers = new Set<string>();

  for (const s of voucherSettings) {
    try {
      const v: VoucherItem = JSON.parse(s.value);
      vouchersFromStorage.push(v);
      if (v.voucherNumber) storedVoucherNumbers.add(v.voucherNumber);
    } catch {
      // ignore malformed rows
    }
  }

  // 2. Backward compatibility: also check historical LedgerEntries with referenceId like "VCH-%"
  const historicalEntries = await LedgerEntry.findAll({
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

  for (const e of historicalEntries) {
    const raw = e.toJSON() as any;
    const vNum = raw.referenceId;
    if (vNum && !storedVoucherNumbers.has(vNum)) {
      const isReceipt = vNum.startsWith("VCH-REC");
      vouchersFromStorage.push({
        id: raw.id,
        voucherNumber: vNum,
        voucherType: isReceipt ? "RECEIPT" : "PAYMENT",
        status: "POSTED",
        amount: raw.amount,
        partyName: "Direct Counter",
        category: isReceipt ? "Income" : "Expense",
        subcategory: isReceipt ? "Capital Introduction" : "Shop Expense",
        paymentMode: "CASH",
        accountId: raw.accountId ?? "",
        accountCode: raw.account?.code ?? "CASH-01",
        accountName: raw.account?.name ?? "Counter Cash",
        date: raw.createdAt,
        referenceNo: null,
        notes: raw.description,
        ledgerEntryId: raw.id,
        createdAt: raw.createdAt,
        updatedAt: raw.createdAt,
      });
      storedVoucherNumbers.add(vNum);
    }
  }

  // Sort by date DESC
  vouchersFromStorage.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return vouchersFromStorage.slice(0, limit);
}
