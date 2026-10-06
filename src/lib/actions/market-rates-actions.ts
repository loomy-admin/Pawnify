"use server";

import { checkAuth } from "@/lib/auth/session";
import { getMarketRates } from "@/lib/services/market-rates";
import { serializeForClient } from "@/lib/serialize";

export async function getMarketRatesAction() {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }
  return serializeForClient(await getMarketRates());
}

export async function updateMarketRatesAction(rates: { goldRate: number; silverRate: number }) {
  const auth = await checkAuth();
  if (!auth.authenticated || auth.user?.role !== "ADMIN") {
    throw new Error("Admin authorization required to update market rates.");
  }

  const { updateSetting } = await import("@/lib/services/settings");
  await updateSetting("rate.gold.per_gram", rates.goldRate.toString());
  await updateSetting("rate.silver.per_gram", rates.silverRate.toString());
  await updateSetting("rate.last_updated", new Date().toISOString());

  const updated = await getMarketRates();
  return serializeForClient(updated);
}

