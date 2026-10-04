"use server";

import { revalidatePath } from "next/cache";
import { checkAuth, checkAdmin } from "@/lib/auth/session";
import {
  addKycDocument,
  updateKycStatus,
  getCustomerById,
  checkPanRequired,
} from "@/lib/services/customers";
import { kycDocumentSchema } from "@/lib/validation/customer";
import { KycStatus, Customer, Loan, KycDocument } from "@/lib/db";
import { serializeForClient } from "@/lib/serialize";
import { projectLoan, projectPanStatus } from "@/lib/projection";

export async function getCustomerDetailAction(customerId: string) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }
  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new Error("Customer not found");
  }
  const panStatus = await checkPanRequired(customerId);
  const projectedCustomer = {
    ...customer,
    loans: (customer.loans || []).map((l: any) => projectLoan(l, auth.calculationMode)),
  };
  return {
    customer: serializeForClient(projectedCustomer),
    panStatus: projectPanStatus(panStatus, auth.calculationMode),
  };
}

export async function addKycDocumentAction(customerId: string, formData: unknown) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = kycDocumentSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid document data",
    };
  }

  try {
    const doc = await addKycDocument(
      customerId,
      parsed.data.docType,
      parsed.data.docNumber,
      parsed.data.fileUrl
    );

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { success: true, docId: doc.id };
  } catch (err: unknown) {
    console.error("Add KYC doc error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add document",
    };
  }
}

export async function verifyKycDocumentAction(
  docId: string,
  customerId: string,
  status: KycStatus
) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await updateKycStatus(docId, status, auth.user.id);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { success: true };
  } catch (err: unknown) {
    console.error("Update KYC status error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update KYC status",
    };
  }
}

export async function updateCustomerDetailsAction(
  customerId: string,
  data: {
    fullName: string;
    phone: string;
    email?: string;
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
  }
) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await Customer.update(
      {
        fullName: data.fullName.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || null,
        addressLine1: data.addressLine1.trim(),
        city: data.city.trim(),
        state: data.state.trim(),
        pincode: data.pincode.trim(),
      },
      { where: { id: customerId } }
    );

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { success: true };
  } catch (err: unknown) {
    console.error("Update customer error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update customer details",
    };
  }
}

export async function deleteCustomerAction(customerId: string) {
  const auth = await checkAdmin();
  if (!auth.authenticated) {
    return { success: false, error: auth.error };
  }

  try {
    const totalLoans = await Loan.count({
      where: { customerId },
    });

    if (totalLoans > 0) {
      return {
        success: false,
        error: "Cannot delete customer with existing loan history. Financial and ledger audit records must remain immutable.",
      };
    }

    await KycDocument.destroy({ where: { customerId } });
    await Customer.destroy({ where: { id: customerId } });

    revalidatePath("/customers");
    return { success: true };
  } catch (err: unknown) {
    console.error("Delete customer error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete customer",
    };
  }
}
