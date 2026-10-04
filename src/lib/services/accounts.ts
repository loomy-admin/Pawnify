/**
 * Account Master Service — Phase 6
 *
 * Provides master data management for financial accounts used by:
 * - Day Book
 * - Account Ledger
 * - Accounting reports & summaries
 */

import { AccountMaster, User, Op, AccountType } from "@/lib/db";
import {
  CreateAccountInput,
  CreateAccountSchema,
  UpdateAccountInput,
  UpdateAccountSchema,
  AccountFilter,
} from "@/lib/validation/account";

export interface AccountMasterWithCreator {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isActive: boolean;
  description: string | null;
  createdById: string | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

function formatAccount(acc: AccountMaster): AccountMasterWithCreator {
  const json = acc.toJSON() as any;
  return {
    ...json,
    createdBy: json.createdBy
      ? {
          id: json.createdBy.id,
          name: json.createdBy.name,
          email: json.createdBy.email,
        }
      : null,
  };
}

/**
 * Create a new account in Account Master.
 */
export async function createAccount(
  input: CreateAccountInput,
  createdById?: string
): Promise<AccountMasterWithCreator> {
  const parsed = CreateAccountSchema.parse(input);

  // 1. Check duplicate code
  const existingCode = await AccountMaster.findOne({
    where: {
      code: parsed.code,
    },
  });

  if (existingCode) {
    throw new Error(`Account code "${parsed.code}" already exists.`);
  }

  // 2. Check duplicate name
  const existingName = await AccountMaster.findOne({
    where: {
      name: parsed.name,
    },
  });

  if (existingName) {
    throw new Error(`Account with name "${parsed.name}" already exists.`);
  }

  // 3. Create account
  const created = await AccountMaster.create({
    code: parsed.code,
    name: parsed.name,
    type: parsed.type as any,
    description: parsed.description || null,
    isActive: parsed.isActive ?? true,
    createdById: createdById ?? null,
  });

  const full = await AccountMaster.findByPk(created.id, {
    include: [{ model: User, as: "createdBy", attributes: ["id", "name", "email"] }],
  });

  return formatAccount(full || created);
}

/**
 * Update an existing account in Account Master.
 * Note: `code` is immutable to preserve audit integrity.
 */
export async function updateAccount(
  id: string,
  input: UpdateAccountInput
): Promise<AccountMasterWithCreator> {
  const parsed = UpdateAccountSchema.parse(input);

  const existing = await AccountMaster.findByPk(id);

  if (!existing) {
    throw new Error("Account not found.");
  }

  // If name is updated, check uniqueness against other accounts
  if (parsed.name && parsed.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateName = await AccountMaster.findOne({
      where: {
        name: parsed.name,
        id: { [Op.ne]: id },
      },
    });

    if (duplicateName) {
      throw new Error(`Account with name "${parsed.name}" already exists.`);
    }
  }

  await existing.update({
    ...(parsed.name !== undefined && { name: parsed.name }),
    ...(parsed.type !== undefined && { type: parsed.type as any }),
    ...(parsed.description !== undefined && { description: parsed.description }),
    ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
  });

  const full = await AccountMaster.findByPk(id, {
    include: [{ model: User, as: "createdBy", attributes: ["id", "name", "email"] }],
  });

  return formatAccount(full || existing);
}

/**
 * Activate or deactivate an account.
 */
export async function toggleAccountStatus(
  id: string,
  isActive: boolean
): Promise<AccountMasterWithCreator> {
  const existing = await AccountMaster.findByPk(id);

  if (!existing) {
    throw new Error("Account not found.");
  }

  await existing.update({ isActive });

  const full = await AccountMaster.findByPk(id, {
    include: [{ model: User, as: "createdBy", attributes: ["id", "name", "email"] }],
  });

  return formatAccount(full || existing);
}

/**
 * Get account by unique ID.
 */
export async function getAccountById(
  id: string
): Promise<AccountMasterWithCreator | null> {
  const item = await AccountMaster.findByPk(id, {
    include: [{ model: User, as: "createdBy", attributes: ["id", "name", "email"] }],
  });
  return item ? formatAccount(item) : null;
}

/**
 * Get account by unique code.
 */
export async function getAccountByCode(
  code: string
): Promise<AccountMasterWithCreator | null> {
  const item = await AccountMaster.findOne({
    where: {
      code: code.trim(),
    },
    include: [{ model: User, as: "createdBy", attributes: ["id", "name", "email"] }],
  });
  return item ? formatAccount(item) : null;
}

/**
 * List accounts with optional filters and search.
 */
export async function listAccounts(
  filter?: AccountFilter
): Promise<AccountMasterWithCreator[]> {
  const where: any = {};

  if (filter?.type) {
    where.type = filter.type;
  }

  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }

  if (filter?.search) {
    const term = `%${filter.search.trim()}%`;
    where[Op.or] = [
      { code: { [Op.like]: term } },
      { name: { [Op.like]: term } },
      { description: { [Op.like]: term } },
    ];
  }

  const items = await AccountMaster.findAll({
    where,
    order: [["type", "ASC"], ["code", "ASC"]],
    include: [
      {
        model: User,
        as: "createdBy",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  return items.map(formatAccount);
}

/**
 * Get active accounts for transaction dropdowns.
 */
export async function getActiveAccounts(
  type?: AccountType
): Promise<Array<{ id: string; code: string; name: string; type: AccountType }>> {
  const where: any = { isActive: true };
  if (type) {
    where.type = type;
  }

  const items = await AccountMaster.findAll({
    where,
    attributes: ["id", "code", "name", "type"],
    order: [["code", "ASC"]],
  });

  return items.map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    type: i.type as AccountType,
  }));
}

/**
 * Validation guard: Ensures an account exists and is ACTIVE before posting.
 */
export async function validateAccountForPosting(accountId: string): Promise<AccountMasterWithCreator> {
  const account = await getAccountById(accountId);
  if (!account) {
    throw new Error("Account does not exist.");
  }
  if (!account.isActive) {
    throw new Error(`Account "${account.name}" (${account.code}) is inactive and cannot be used for new transactions.`);
  }
  return account;
}
