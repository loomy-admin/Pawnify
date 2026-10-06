"use server";

import { revalidatePath } from "next/cache";
import { checkAuth } from "@/lib/auth/session";
import {
  createVoucher,
  postDraftVoucher,
  cancelPostedVoucher,
  deleteDraftVoucher,
  listVouchers,
  getVoucherCategories,
  createVoucherCategory,
  createVoucherSubcategory,
  deleteVoucherSubcategory,
  CreateVoucherInput,
} from "@/lib/services/vouchers";
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

export async function postDraftVoucherAction(voucherId: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  try {
    const result = await postDraftVoucher(voucherId, auth.user.id);

    revalidatePath("/vouchers");
    revalidatePath("/day-book");
    revalidatePath("/account-ledger");
    revalidatePath("/dashboard");

    return { success: true, voucher: serializeForClient(result) };
  } catch (err: unknown) {
    console.error("Post draft voucher error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to post draft voucher",
    };
  }
}

export async function cancelVoucherAction(voucherId: string, reason: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  try {
    const result = await cancelPostedVoucher(voucherId, auth.user.id, reason);

    revalidatePath("/vouchers");
    revalidatePath("/day-book");
    revalidatePath("/account-ledger");
    revalidatePath("/dashboard");

    return { success: true, voucher: serializeForClient(result) };
  } catch (err: unknown) {
    console.error("Cancel voucher error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to cancel voucher",
    };
  }
}

export async function deleteDraftVoucherAction(voucherId: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  try {
    await deleteDraftVoucher(voucherId);
    revalidatePath("/vouchers");
    return { success: true };
  } catch (err: unknown) {
    console.error("Delete draft voucher error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete draft voucher",
    };
  }
}

export async function listVouchersAction() {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const vouchers = await listVouchers(200);
  return serializeForClient(vouchers);
}

export async function getVoucherCategoriesAction() {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const categories = await getVoucherCategories();
  return serializeForClient(categories);
}

export async function createVoucherCategoryAction(type: "INCOME" | "EXPENSE", name: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const categories = await createVoucherCategory(type, name);
    return { success: true, categories: serializeForClient(categories) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create category",
    };
  }
}

export async function createVoucherSubcategoryAction(categoryName: string, subcategoryName: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const categories = await createVoucherSubcategory(categoryName, subcategoryName);
    return { success: true, categories: serializeForClient(categories) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create subcategory",
    };
  }
}

export async function deleteVoucherSubcategoryAction(categoryName: string, subcategoryName: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const categories = await deleteVoucherSubcategory(categoryName, subcategoryName);
    return { success: true, categories: serializeForClient(categories) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete subcategory",
    };
  }
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
