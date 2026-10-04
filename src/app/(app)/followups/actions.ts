"use server";

import { revalidatePath } from "next/cache";
import { checkAuth } from "@/lib/auth/session";
import { FollowUp, Loan, Customer, User, FollowUpStatus } from "@/lib/db";
import { serializeForClient } from "@/lib/serialize";
import { projectMonetaryString } from "@/lib/projection";

export async function getFollowUpsAction(tab: string) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const [rawFollowUps, rawActiveLoans] = await Promise.all([
    FollowUp.findAll({
      where: tab === "DONE" ? { status: "DONE" } : { status: "PENDING" },
      include: [
        {
          model: Loan,
          as: "loan",
          attributes: ["id", "loanNumber", "principalOutstanding", "dueDate"],
          include: [
            {
              model: Customer,
              as: "customer",
              attributes: ["fullName", "phone"],
            },
          ],
        },
        {
          model: User,
          as: "assignedTo",
          attributes: ["name"],
        },
      ],
      order: [["dueDate", "ASC"]],
    }),
    Loan.findAll({
      where: { status: "ACTIVE" },
      attributes: ["id", "loanNumber"],
      include: [
        {
          model: Customer,
          as: "customer",
          attributes: ["fullName"],
        },
      ],
      order: [["createdAt", "DESC"]],
    }),
  ]);

  const activeLoanOptions = rawActiveLoans.map((rawL) => {
    const l = rawL.toJSON() as any;
    return {
      id: l.id,
      loanNumber: l.loanNumber,
      customerName: l.customer?.fullName ?? "",
    };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formattedFollowUps = rawFollowUps.map((rawF) => {
    const f = rawF.toJSON() as any;
    const dueDate = new Date(f.dueDate);
    return {
      id: f.id,
      dueDate: dueDate.toISOString(),
      loanId: f.loanId,
      loan: {
        loanNumber: f.loan?.loanNumber ?? "",
        principalOutstanding: projectMonetaryString(
          (f.loan?.principalOutstanding ?? 0).toString(),
          auth.calculationMode
        ),
        customer: {
          fullName: f.loan?.customer?.fullName ?? "",
          phone: f.loan?.customer?.phone ?? "",
        },
      },
      note: f.note,
      assignedToName: f.assignedTo?.name || "Unassigned",
      status: f.status,
      isOverdueTask: tab === "PENDING" && dueDate < today,
    };
  });

  return serializeForClient({ followUps: formattedFollowUps, activeLoanOptions });
}

export async function createFollowUpAction(loanId: string, note: string, dueDateStr: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  if (!note.trim()) {
    return { success: false, error: "Note is required" };
  }

  try {
    await FollowUp.create({
      loanId,
      note: note.trim(),
      dueDate: new Date(dueDateStr),
      status: "PENDING",
      assignedToId: auth.user.id,
    });

    revalidatePath("/followups");
    revalidatePath(`/loans/${loanId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error("Create follow-up error:", err);
    return { success: false, error: "Failed to create follow-up task" };
  }
}

export async function updateFollowUpStatusAction(id: string, status: FollowUpStatus) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const f = await FollowUp.findByPk(id);
    if (!f) return { success: false, error: "Follow-up not found" };

    await f.update({ status });

    revalidatePath("/followups");
    revalidatePath(`/loans/${f.loanId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error("Update follow-up error:", err);
    return { success: false, error: "Failed to update follow-up status" };
  }
}

export async function deleteFollowUpAction(id: string) {
  const auth = await checkAuth();
  if (!auth.authenticated || !auth.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const f = await FollowUp.findByPk(id);
    if (!f) return { success: false, error: "Follow-up not found" };

    const loanId = f.loanId;
    await f.destroy();

    revalidatePath("/followups");
    revalidatePath(`/loans/${loanId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error("Delete follow-up error:", err);
    return { success: false, error: "Failed to delete follow-up task" };
  }
}
