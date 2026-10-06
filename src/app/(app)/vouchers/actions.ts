"use server";

import { revalidatePath } from "next/cache";
import { checkAuth } from "@/lib/auth/session";
import { createVoucher, listVouchers, CreateVoucherInput } from "@/lib/services/vouchers";
import { AccountMaster } from "@/lib/db";
import { serializeForClient } from "@/lib/serialize";

export async function createVoucherAction(input: CreateVoucherInput) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  try {
    const result = await createVoucher({
      ...input,
      createdById: auth.user.id,
    });

    revalidatePath("/vouchers");
    revalidatePath("/day-book");
    revalidatePath("/account-ledger");
    revalidatePath("/dashboard");

    return { success: true, voucher: serializeForClient(result) };
  } catch (err: unknown) {
    console.error("Voucher creation error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record voucher",
    };
  }
}

export async function listVouchersAction() {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const vouchers = await listVouchers(100);
  return serializeForClient(vouchers);
}

export async function listAccountsForVouchersAction() {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const accounts = await AccountMaster.findAll({
    where: { isActive: true },
    order: [["code", "ASC"]],
    attributes: ["id", "code", "name", "type"],
  });

  return serializeForClient(accounts.map((a) => a.toJSON()));
}
