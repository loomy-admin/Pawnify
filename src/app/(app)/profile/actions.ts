"use server";

import { requireSession } from "@/lib/auth/session";
import { User } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateProfileNameAction(formData: FormData) {
  try {
    const session = await requireSession();
    const userId = (session.user as unknown as { id: string }).id;
    const name = formData.get("name") as string;

    if (!name || name.trim().length < 2) {
      return { success: false, error: "Name must be at least 2 characters long" };
    }

    await User.update(
      { name: name.trim() },
      { where: { id: userId } }
    );

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("Update profile error:", err);
    return { success: false, error: "Failed to update profile" };
  }
}

export async function updateProfileAvatarAction(avatarUrl: string) {
  try {
    const session = await requireSession();
    const userId = (session.user as unknown as { id: string }).id;

    await User.update(
      { image: avatarUrl },
      { where: { id: userId } }
    );

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("Update avatar error:", err);
    return { success: false, error: "Failed to update avatar" };
  }
}
