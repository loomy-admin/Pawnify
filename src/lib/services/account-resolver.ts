/**
 * Account Resolver — Phase 8
 *
 * Centralizes resolution of the configured/default active Counter Cash account
 * for automatic account-aware posting (DISBURSEMENT and PAYMENT) in Pawnify.
 *
 * DESIGN RULES (LOCKED):
 * 1. Find the configured Counter Cash account reliably.
 * 2. Ensure it exists in AccountMaster.
 * 3. Ensure it is active (isActive === true).
 * 4. Return its AccountMaster ID.
 * 5. Fail safely with a clear, descriptive business error if unavailable or inactive.
 * 6. Do NOT hardcode arbitrary database IDs.
 * 7. Do NOT silently create missing accounts.
 */

import { AppSetting, AccountMaster, Op } from "@/lib/db";
import type { Transaction } from "sequelize";

const STANDARD_CASH_CODES = ["CASH-01", "CASH", "COUNTER-CASH"];

/**
 * Resolves the active Counter Cash AccountMaster ID.
 */
export async function resolveCounterCashAccount(transaction?: Transaction): Promise<string> {
  const account = await getCounterCashAccount(transaction);
  return account.id;
}

/**
 * Retrieves the full AccountMaster record for the configured Counter Cash account.
 */
export async function getCounterCashAccount(transaction?: Transaction) {
  // 1. Check AppSetting override
  const setting = await AppSetting.findOne({
    where: {
      key: { [Op.in]: ["account.counter_cash.code", "account.default.cash"] },
    },
    transaction,
  });

  if (setting && setting.value && setting.value.trim()) {
    const configuredCode = setting.value.trim().toUpperCase();
    const account = await AccountMaster.findOne({
      where: {
        code: configuredCode,
      },
      transaction,
    });

    if (!account) {
      throw new Error(
        `Configured Counter Cash account with code "${configuredCode}" was not found in Account Master.`
      );
    }

    if (!account.isActive) {
      throw new Error(
        `Configured Counter Cash account "${account.name}" (${account.code}) is inactive. Please activate it before recording cash transactions.`
      );
    }

    return account;
  }

  // 2. Lookup standard conventional codes in order
  for (const code of STANDARD_CASH_CODES) {
    const account = await AccountMaster.findOne({
      where: {
        code,
        type: "ASSET",
      },
      transaction,
    });

    if (account) {
      if (!account.isActive) {
        throw new Error(
          `Counter Cash account "${account.name}" (${account.code}) is inactive. Please activate it before recording cash transactions.`
        );
      }
      return account;
    }
  }

  // 3. Fallback: Search for ASSET account with name containing "Counter Cash"
  const namedAccount = await AccountMaster.findOne({
    where: {
      name: { [Op.like]: "%Counter Cash%" },
      type: "ASSET",
    },
    transaction,
  });

  if (namedAccount) {
    if (!namedAccount.isActive) {
      throw new Error(
        `Counter Cash account "${namedAccount.name}" (${namedAccount.code}) is inactive. Please activate it before recording cash transactions.`
      );
    }
    return namedAccount;
  }

  // 3b. Dynamic Fallback: Search for ANY active ASSET account with name or code containing "Cash"
  const generalCashAccount = await AccountMaster.findOne({
    where: {
      [Op.or]: [
        { name: { [Op.like]: "%Cash%" } },
        { code: { [Op.like]: "%CASH%" } },
      ],
      type: "ASSET",
      isActive: true,
    },
    transaction,
  });

  if (generalCashAccount) {
    return generalCashAccount;
  }

  // 4. Missing: Fail safely with explicit business error
  throw new Error(
    "Default Counter Cash account is not configured in Account Master. Please create an active Cash account in Account Master."
  );
}
