"use server";

import { revalidatePath } from "next/cache";
import { checkAuth, checkAdmin } from "@/lib/auth/session";
import { AppSetting } from "@/lib/db";
import { updateSetting } from "@/lib/services/settings";
import { serializeForClient } from "@/lib/serialize";

export async function getSettingsAction() {
  const adminAuth = await checkAdmin();
  if (!adminAuth.authenticated) {
    throw new Error(adminAuth.error);
  }

  const allSettings = await AppSetting.findAll();
  const settingsMap: Record<string, string> = {};
  for (const s of allSettings) {
    settingsMap[s.key] = s.value;
  }

  const initialSettings = {
    ltv_tier1_max: settingsMap["ltv.tier1.percent"] || "85.0",
    ltv_tier2_max: settingsMap["ltv.tier2.percent"] || "80.0",
    ltv_tier3_max: settingsMap["ltv.tier3.percent"] || "75.0",
    ltv_tier1_limit: settingsMap["ltv.tier1.max"] || "250000",
    ltv_tier2_limit: settingsMap["ltv.tier2.max"] || "500000",
    default_interest_monthly: settingsMap["interest.default.monthly"] || "1.5",
    default_grace_days: settingsMap["grace.period.days"] || "7",
    pan_required_threshold: settingsMap["pan.threshold"] || "50000",
    rate_gold_per_gram: settingsMap["rate.gold.per_gram"] || "7850",
    rate_silver_per_gram: settingsMap["rate.silver.per_gram"] || "98.50",
    valuation_safety_margin: settingsMap["valuation.safety.margin"] || "0",
    rate_last_updated: settingsMap["rate.last_updated"] || "System Initialized",
  };

  return serializeForClient(initialSettings);
}

export async function saveSettingsAction(formData: FormData) {
  const adminAuth = await checkAuth();
  if (!adminAuth.authenticated || adminAuth.user?.role !== "ADMIN") {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }

  try {
    const keysMap: Record<string, string> = {
      ltv_tier1_max: "ltv.tier1.percent",
      ltv_tier2_max: "ltv.tier2.percent",
      ltv_tier3_max: "ltv.tier3.percent",
      ltv_tier1_limit: "ltv.tier1.max",
      ltv_tier2_limit: "ltv.tier2.max",
      default_interest_monthly: "interest.default.monthly",
      default_grace_days: "grace.period.days",
      pan_required_threshold: "pan.threshold",
      rate_gold_per_gram: "rate.gold.per_gram",
      rate_silver_per_gram: "rate.silver.per_gram",
      valuation_safety_margin: "valuation.safety.margin",
    };

    const interestRate = formData.get("default_interest_monthly");
    if (interestRate !== null && (Number(interestRate) <= 0 || Number(interestRate) > 10)) {
      return { success: false, error: "Default interest rate must be between 0 and 10% per month" };
    }
    const graceDays = formData.get("default_grace_days");
    if (graceDays !== null && (Number(graceDays) < 0 || Number(graceDays) > 90)) {
      return { success: false, error: "Default grace period must be between 0 and 90 days" };
    }

    for (const [formKey, dbKey] of Object.entries(keysMap)) {
      const val = formData.get(formKey);
      if (val !== null && val !== undefined) {
        await updateSetting(dbKey, val.toString());
      }
    }

    revalidatePath("/admin/settings");
    revalidatePath("/dashboard");
    revalidatePath("/loans/new");
    return { success: true };
  } catch (err: unknown) {
    console.error("Save settings error:", err);
    return { success: false, error: "Failed to save system settings" };
  }
}

export async function fetchLiveSpotRatesAction() {
  const adminAuth = await checkAuth();
  if (!adminAuth.authenticated || adminAuth.user?.role !== "ADMIN") {
    return { success: false, error: "Unauthorized. Admin privileges required." };
  }
  const { fetchAndSaveLiveMetalRates } = await import("@/lib/services/market-rates");
  const res = await fetchAndSaveLiveMetalRates();
  if (res.success) {
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard");
    revalidatePath("/loans/new");
  }
  return res;
}
