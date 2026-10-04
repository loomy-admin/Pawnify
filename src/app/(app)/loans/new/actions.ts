"use server";

import { revalidatePath } from "next/cache";
import { checkAuth } from "@/lib/auth/session";
import { createLoan } from "@/lib/services/loans";
import { createLoanSchema } from "@/lib/validation/loan";

export async function createLoanAction(formData: unknown) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  const parsed = createLoanSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid loan application data",
    };
  }

  try {
    const loan = await createLoan({
      customerId: parsed.data.customerId,
      handledById: auth.user.id,
      items: parsed.data.items,
      tenureMonths: parsed.data.tenureMonths,
      interestRateMonthly: parsed.data.interestRateMonthly,
      principalAmount: parsed.data.principalAmount,
      gracePeriodDays: parsed.data.gracePeriodDays,
      processingFee: parsed.data.processingFee,
      loanType: parsed.data.loanType,
      cumulativeFrequency: parsed.data.cumulativeFrequency,
      cumulativeTreatment: parsed.data.cumulativeTreatment,
      asDraft: parsed.data.asDraft,
    });

    revalidatePath("/loans");
    revalidatePath("/dashboard");
    revalidatePath(`/customers/${parsed.data.customerId}`);
    return { success: true, loanId: loan.id, status: loan.status };
  } catch (err: unknown) {
    console.error("Failed to create loan:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to disburse loan",
    };
  }
}

export async function approveLoanAction(loanId: string, notes?: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { approveLoan } = await import("@/lib/services/loans");
    await approveLoan(loanId, auth.user.id, notes);
    revalidatePath(`/loans/${loanId}`);
    revalidatePath("/loans");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to approve loan" };
  }
}

export async function disburseApprovedLoanAction(loanId: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { disburseApprovedLoan } = await import("@/lib/services/loans");
    await disburseApprovedLoan(loanId, auth.user.id);
    revalidatePath(`/loans/${loanId}`);
    revalidatePath("/loans");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to disburse loan" };
  }
}

export async function cancelDraftLoanAction(loanId: string, reason: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { cancelDraftLoan } = await import("@/lib/services/loans");
    await cancelDraftLoan(loanId, auth.user.id, reason);
    revalidatePath(`/loans/${loanId}`);
    revalidatePath("/loans");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to cancel loan" };
  }
}
