"use server";

import { checkAdmin, checkAuth } from "@/lib/auth/session";
import {
  createAccount,
  updateAccount,
  toggleAccountStatus,
  listAccounts,
  getAccountById,
} from "@/lib/services/accounts";
import {
  CreateAccountInput,
  CreateAccountSchema,
  UpdateAccountInput,
  UpdateAccountSchema,
  AccountFilter,
} from "@/lib/validation/account";
import { revalidatePath } from "next/cache";

/**
 * Server Action: Create a new account in Account Master.
 * Authorization: ADMIN only.
 */
export async function createAccountAction(data: CreateAccountInput) {
  try {
    const auth = await checkAdmin();
    if (!auth.authenticated) {
      return { success: false, error: auth.error };
    }

    const validated = CreateAccountSchema.parse(data);
    const account = await createAccount(validated, auth.user.id);

    try {
      revalidatePath("/admin/accounts");
    } catch {
      // Safe fallback when executed outside of Next.js HTTP request cycle (e.g. tests)
    }
    return { success: true, account };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create account.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Update an existing account in Account Master.
 * Authorization: ADMIN only.
 */
export async function updateAccountAction(id: string, data: UpdateAccountInput) {
  try {
    const auth = await checkAdmin();
    if (!auth.authenticated) {
      return { success: false, error: auth.error };
    }

    const validated = UpdateAccountSchema.parse(data);
    const account = await updateAccount(id, validated);

    try {
      revalidatePath("/admin/accounts");
    } catch {
      // Safe fallback when executed outside of Next.js HTTP request cycle (e.g. tests)
    }
    return { success: true, account };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update account.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Activate or deactivate an account.
 * Authorization: ADMIN only.
 */
export async function toggleAccountStatusAction(id: string, isActive: boolean) {
  try {
    const auth = await checkAdmin();
    if (!auth.authenticated) {
      return { success: false, error: auth.error };
    }

    const account = await toggleAccountStatus(id, isActive);

    try {
      revalidatePath("/admin/accounts");
    } catch {
      // Safe fallback when executed outside of Next.js HTTP request cycle (e.g. tests)
    }
    return { success: true, account };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to change account status.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: List accounts with optional filters.
 * Authorization: Authenticated (ADMIN or STAFF).
 */
export async function getAccountsAction(filter?: AccountFilter) {
  try {
    const auth = await checkAuth();
    if (!auth.authenticated) {
      return { success: false, error: auth.error };
    }

    const accounts = await listAccounts(filter);
    return { success: true, accounts };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch accounts.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Get account by ID.
 * Authorization: Authenticated (ADMIN or STAFF).
 */
export async function getAccountByIdAction(id: string) {
  try {
    const auth = await checkAuth();
    if (!auth.authenticated) {
      return { success: false, error: auth.error };
    }

    const account = await getAccountById(id);
    if (!account) {
      return { success: false, error: "Account not found." };
    }

    return { success: true, account };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch account.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Introduce lending capital to the shop pool.
 * Authorization: ADMIN only.
 */
export async function introduceCapitalAction(data: {
  amount: number | string;
  source: string;
  mode: any;
  notes?: string;
  accountId?: string;
}) {
  try {
    const auth = await checkAdmin();
    if (!auth.authenticated) {
      return { success: false, error: auth.error };
    }

    const { introduceCapital } = await import("@/lib/services/capital");
    const result = await introduceCapital({
      amount: data.amount,
      source: data.source,
      mode: data.mode,
      notes: data.notes,
      accountId: data.accountId,
      createdById: auth.user.id,
    });

    try {
      revalidatePath("/admin/accounts");
      revalidatePath("/day-book");
      revalidatePath("/dashboard");
    } catch {
      // Safe fallback outside HTTP request
    }

    return { success: true, result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to introduce capital.";
    return { success: false, error: message };
  }
}

/**
 * Server Action: Get available shop lending funds summary.
 * Authorization: Authenticated.
 */
export async function getAvailableFundsAction() {
  try {
    const auth = await checkAuth();
    if (!auth.authenticated) {
      return { success: false, error: auth.error };
    }

    const { getAvailableLendingFunds } = await import("@/lib/services/capital");
    const funds = await getAvailableLendingFunds();
    return {
      success: true,
      funds: {
        totalCapitalIntroduced: funds.totalCapitalIntroduced.toFixed(2),
        totalDisbursed: funds.totalDisbursed.toFixed(2),
        totalCollected: funds.totalCollected.toFixed(2),
        totalReversed: funds.totalReversed.toFixed(2),
        availableLendingFunds: funds.availableLendingFunds.toFixed(2),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to compute available funds.";
    return { success: false, error: message };
  }
}
