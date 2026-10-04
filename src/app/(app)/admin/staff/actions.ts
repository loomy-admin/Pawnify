"use server";

import { revalidatePath } from "next/cache";
import { checkAuth, checkAdmin } from "@/lib/auth/session";
import { User, Loan, Payment, Session, Account, Op } from "@/lib/db";
import { auth } from "@/lib/auth";
import { serializeForClient } from "@/lib/serialize";
import { hashPassword } from "better-auth/crypto";
import { isValidIndianMobile, normalizeIndianMobile } from "@/lib/auth/mobile-plugin";

export async function getStaffListAction() {
  const adminAuth = await checkAdmin();
  if (!adminAuth.authenticated) {
    throw new Error(adminAuth.error);
  }

  const rawUsers = await User.findAll({
    order: [["createdAt", "DESC"]],
  });

  const formattedUsers = await Promise.all(
    rawUsers.map(async (rawU) => {
      const u = rawU.toJSON() as any;
      const [loansHandled, paymentsCollected] = await Promise.all([
        Loan.count({ where: { handledById: u.id } }),
        Payment.count({ where: { collectedById: u.id } }),
      ]);

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        hasHiddenPassword: !!u.hiddenPasswordHash,
        _count: {
          loansHandled,
          paymentsCollected,
        },
        createdAt: u.createdAt,
        isSelf: u.id === adminAuth.user.id,
      };
    })
  );

  return serializeForClient(formattedUsers);
}

export async function createStaffUserAction(formData: unknown) {
  const adminAuth = await checkAuth();
  if (!adminAuth.authenticated || adminAuth.user?.role !== "ADMIN") {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  const data = formData as {
    name: string;
    email: string;
    phone: string;
    password: string;
    hiddenPassword?: string;
    role: "ADMIN" | "STAFF";
  };
  if (!data.name || !data.email || !data.password || !data.phone) {
    return { success: false, error: "Name, email, mobile number, and password are required" };
  }

  if (!isValidIndianMobile(data.phone)) {
    return { success: false, error: "Please enter a valid 10-digit Indian mobile number" };
  }

  const normalizedPhone = normalizeIndianMobile(data.phone);

  try {
    const existingEmail = await User.findOne({ where: { email: data.email } });
    if (existingEmail) {
      return { success: false, error: "A user with this email already exists" };
    }

    const existingPhone = await User.findOne({ where: { phone: normalizedPhone } });
    if (existingPhone) {
      return { success: false, error: "A user with this mobile number already exists" };
    }

    let hiddenPasswordHash: string | null = null;
    if (data.hiddenPassword && data.hiddenPassword.trim().length > 0) {
      hiddenPasswordHash = await hashPassword(data.hiddenPassword.trim());
    }

    await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
      },
    });

    await User.update(
      {
        phone: normalizedPhone,
        hiddenPasswordHash,
        role: data.role,
      },
      { where: { email: data.email } }
    );

    revalidatePath("/admin/staff");
    return { success: true };
  } catch (err: unknown) {
    console.error("Create staff error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create staff member",
    };
  }
}

export async function updateStaffStatusAction(userId: string, isActive: boolean) {
  const adminAuth = await checkAuth();
  if (!adminAuth.authenticated || adminAuth.user?.role !== "ADMIN") {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  if (userId === adminAuth.user.id) {
    return { success: false, error: "You cannot deactivate your own admin account" };
  }

  try {
    await User.update(
      { isActive },
      { where: { id: userId } }
    );

    revalidatePath("/admin/staff");
    return { success: true };
  } catch (err: unknown) {
    console.error("Update staff status error:", err);
    return { success: false, error: "Failed to update user status" };
  }
}

export async function updateStaffUserAction(
  userId: string,
  data: { name: string; email: string; role: "ADMIN" | "STAFF"; isActive: boolean }
) {
  const adminAuth = await checkAuth();
  if (!adminAuth.authenticated || adminAuth.user?.role !== "ADMIN") {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  if (userId === adminAuth.user?.id && data.role !== "ADMIN") {
    return {
      success: false,
      error: "You cannot demote your own active admin account to STAFF role.",
    };
  }
  if (userId === adminAuth.user?.id && !data.isActive) {
    return { success: false, error: "You cannot deactivate your own admin account." };
  }

  try {
    const existing = await User.findOne({
      where: { email: data.email, id: { [Op.ne]: userId } },
    });
    if (existing) {
      return {
        success: false,
        error: "Another user account is already registered with this email address.",
      };
    }

    await User.update(
      {
        name: data.name,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
      },
      { where: { id: userId } }
    );

    revalidatePath("/admin/staff");
    return { success: true };
  } catch (err: unknown) {
    console.error("Update staff details error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update staff account details",
    };
  }
}

export async function deleteStaffUserAction(userId: string) {
  const adminAuth = await checkAuth();
  if (!adminAuth.authenticated || adminAuth.user?.role !== "ADMIN") {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  if (userId === adminAuth.user.id) {
    return { success: false, error: "You cannot delete your own active admin account" };
  }

  try {
    const handledLoans = await Loan.count({ where: { handledById: userId } });
    if (handledLoans > 0) {
      return {
        success: false,
        error:
          "Cannot delete user who has processed historical loans. Please deactivate their account instead.",
      };
    }

    await Session.destroy({ where: { userId } });
    await Account.destroy({ where: { userId } });
    await User.destroy({ where: { id: userId } });

    revalidatePath("/admin/staff");
    return { success: true };
  } catch (err: unknown) {
    console.error("Delete staff error:", err);
    return { success: false, error: "Failed to delete staff account" };
  }
}
