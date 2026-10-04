"use server";

import { revalidatePath } from "next/cache";
import { checkAuth, checkAdmin } from "@/lib/auth/session";
import { recordPayment } from "@/lib/services/payments";
import { closeLoan, releaseItems, getLoanById } from "@/lib/services/loans";
import { paymentSchema } from "@/lib/validation/payment";
import { serializeForClient } from "@/lib/serialize";
import { projectLoan, invertMonetaryInputNumber } from "@/lib/projection";

export async function getLoanDetailAction(loanId: string) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }
  const loan = await getLoanById(loanId);
  if (!loan) {
    throw new Error("Loan not found");
  }
  const projectedLoan = projectLoan(loan, auth.calculationMode);
  return serializeForClient(projectedLoan);
}

export async function recordPaymentAction(formData: unknown) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized. Please sign in." };
  }

  const parsed = paymentSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid payment data",
    };
  }

  try {
    // Critical Input Rule (PART I):
    // In FIFTY_PERCENT mode, the user entered amount in displayed monetary system (halved).
    // Convert back to true 100% legal amount before calling pure domain service recordPayment.
    const trueAmountPaid = invertMonetaryInputNumber(
      parsed.data.amountPaid,
      auth.calculationMode
    );

    const pmt = await recordPayment(
      parsed.data.loanId,
      trueAmountPaid,
      parsed.data.mode,
      auth.user.id,
      parsed.data.notes
    );

    revalidatePath(`/loans/${parsed.data.loanId}`);
    revalidatePath("/loans");
    revalidatePath("/dashboard");
    return { success: true, receiptNumber: pmt.receiptNumber };
  } catch (err: unknown) {
    console.error("Payment recording error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record payment",
    };
  }
}

export async function closeLoanAction(loanId: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await closeLoan(loanId, auth.user.id);
    revalidatePath(`/loans/${loanId}`);
    revalidatePath("/loans");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    console.error("Close loan error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to close loan",
    };
  }
}

export async function releaseItemsAction(loanId: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await releaseItems(loanId);
    revalidatePath(`/loans/${loanId}`);
    revalidatePath("/loans");
    return { success: true };
  } catch (err: unknown) {
    console.error("Release items error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to release items",
    };
  }
}

import { Loan, LedgerEntry, Payment, LoanItem, LoanCharge, FollowUp } from "@/lib/db";

export async function updateLoanNotesAction(loanId: string, notes: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await Loan.update(
      { notes: notes.trim() || null },
      { where: { id: loanId } }
    );
    revalidatePath(`/loans/${loanId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error("Update loan notes error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update loan notes",
    };
  }
}

export async function deleteLoanAction(loanId: string) {
  const auth = await checkAdmin();
  if (!auth.authenticated) {
    return { success: false, error: auth.error };
  }

  try {
    const hasLedger = await LedgerEntry.count({ where: { loanId } });
    const hasPayments = await Payment.count({ where: { loanId } });
    if (hasLedger > 0 || hasPayments > 0) {
      return {
        success: false,
        error: "Cannot delete loan with financial ledger entries or payment records. Financial audit records must remain immutable.",
      };
    }

    await LoanItem.destroy({ where: { loanId } });
    await LoanCharge.destroy({ where: { loanId } });
    await FollowUp.destroy({ where: { loanId } });
    await Loan.destroy({ where: { id: loanId } });

    revalidatePath("/loans");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    console.error("Delete loan error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete loan",
    };
  }
}

export async function reversePaymentAction(paymentId: string, loanId: string, reason: string) {
  const auth = await checkAdmin();
  if (!auth.authenticated) {
    return { success: false, error: auth.error };
  }

  try {
    const { reversePayment } = await import("@/lib/services/payments");
    await reversePayment(paymentId, auth.user.id, reason);
    revalidatePath(`/loans/${loanId}`);
    revalidatePath("/loans");
    revalidatePath("/dashboard");
    revalidatePath("/day-book");
    return { success: true };
  } catch (err: unknown) {
    console.error("Reverse payment error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reverse payment",
    };
  }
}

export async function getPreclosureQuoteAction(loanId: string, asOfDateStr?: string) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { getPreclosureQuote } = await import("@/lib/services/loans");
    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : new Date();
    const quote = await getPreclosureQuote(loanId, asOfDate);
    return { success: true, quote: serializeForClient(quote) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to compute quote",
    };
  }
}
