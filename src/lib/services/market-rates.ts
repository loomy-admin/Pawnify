/**
 * Market Rates Service — Live Spot Prices for 24K Gold & Fine Silver
 *
 * Integrates open financial spot APIs with intelligent caching in AppSetting.
 * Standard Indian pawn brokering conventions: 1 Troy Ounce = 31.1034768 grams.
 * Fallbacks ensure 100% system uptime even if external APIs timeout or fail.
 */

import { AppSetting, Op } from "@/lib/db";
import { updateSetting } from "@/lib/services/settings";

export interface MarketRates {
  goldRatePerGram: number; // ₹/g for 24K Gold
  silverRatePerGram: number; // ₹/g for Fine Silver
  lastUpdated: string;
  safetyMarginPercent: number; // Valuation haircut %
  source: string;
  ltvTier1Percent: number;
  ltvTier2Percent: number;
  ltvTier3Percent: number;
  ltvTier1Max: number;
  ltvTier2Max: number;
  defaultInterestMonthly: number;
  defaultGraceDays: number;
  panThreshold: number;
}

const DEFAULT_RATES: MarketRates = {
  goldRatePerGram: 7850.0,
  silverRatePerGram: 98.5,
  lastUpdated: "Default / System Initialized",
  safetyMarginPercent: 0,
  source: "System Default Fallback",
  ltvTier1Percent: 85.0,
  ltvTier2Percent: 80.0,
  ltvTier3Percent: 75.0,
  ltvTier1Max: 250000,
  ltvTier2Max: 500000,
  defaultInterestMonthly: 1.5,
  defaultGraceDays: 7,
  panThreshold: 50000,
};

/**
 * Get current market rates and formula settings cached in database settings.
 */
export async function getMarketRates(): Promise<MarketRates> {
  try {
    const settings = await AppSetting.findAll({
      where: {
        key: {
          [Op.in]: [
            "rate.gold.per_gram",
            "rate.silver.per_gram",
            "rate.last_updated",
            "valuation.safety.margin",
            "ltv.tier1.percent",
            "ltv.tier2.percent",
            "ltv.tier3.percent",
            "ltv.tier1.max",
            "ltv.tier2.max",
            "interest.default.monthly",
            "grace.period.days",
            "pan.threshold",
          ],
        },
      },
    });

    const map = new Map(settings.map((s) => [s.key, s.value]));

    const gold = parseFloat(map.get("rate.gold.per_gram") || "") || DEFAULT_RATES.goldRatePerGram;
    const silver =
      parseFloat(map.get("rate.silver.per_gram") || "") || DEFAULT_RATES.silverRatePerGram;
    const updated = map.get("rate.last_updated") || DEFAULT_RATES.lastUpdated;
    const margin = parseFloat(map.get("valuation.safety.margin") || "0") || 0;

    return {
      goldRatePerGram: gold,
      silverRatePerGram: silver,
      lastUpdated: updated,
      safetyMarginPercent: margin,
      source: updated.includes("Default") ? "System Default" : "Cached DB Setting",
      ltvTier1Percent:
        parseFloat(map.get("ltv.tier1.percent") || "") || DEFAULT_RATES.ltvTier1Percent,
      ltvTier2Percent:
        parseFloat(map.get("ltv.tier2.percent") || "") || DEFAULT_RATES.ltvTier2Percent,
      ltvTier3Percent:
        parseFloat(map.get("ltv.tier3.percent") || "") || DEFAULT_RATES.ltvTier3Percent,
      ltvTier1Max: parseFloat(map.get("ltv.tier1.max") || "") || DEFAULT_RATES.ltvTier1Max,
      ltvTier2Max: parseFloat(map.get("ltv.tier2.max") || "") || DEFAULT_RATES.ltvTier2Max,
      defaultInterestMonthly:
        parseFloat(map.get("interest.default.monthly") || "") ||
        DEFAULT_RATES.defaultInterestMonthly,
      defaultGraceDays:
        parseFloat(map.get("grace.period.days") || "") || DEFAULT_RATES.defaultGraceDays,
      panThreshold: parseFloat(map.get("pan.threshold") || "") || DEFAULT_RATES.panThreshold,
    };
  } catch (err) {
    console.error("Error fetching market rates from DB:", err);
    return DEFAULT_RATES;
  }
}

/**
 * Fetch live spot metal prices from public open APIs and cache in AppSetting.
 */
export async function fetchAndSaveLiveMetalRates(): Promise<{
  success: boolean;
  rates: MarketRates;
  error?: string;
}> {
  let goldRate = DEFAULT_RATES.goldRatePerGram;
  let silverRate = DEFAULT_RATES.silverRatePerGram;
  let source = "Fallback Market Estimate";
  let fetchSuccess = false;

  try {
    // Attempt 1: Fetch from GoldPrice.org API (returns spot INR per troy oz)
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/INR", {
      next: { revalidate: 0 },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.items && data.items.length > 0) {
        const item = data.items[0];
        if (item.xauPrice && item.xagPrice) {
          // Convert Troy Ounce to Grams (1 troy oz = 31.1034768 grams)
          goldRate = Number((item.xauPrice / 31.1034768).toFixed(2));
          silverRate = Number((item.xagPrice / 31.1034768).toFixed(2));
          source = "Live Spot API (GoldPrice ASG INR)";
          fetchSuccess = true;
        }
      }
    }
  } catch (apiErr) {
    console.warn("Primary spot API fetch failed, trying secondary fallback...", apiErr);
  }

  // Attempt 2: If primary failed, try secondary open exchange rate + spot API
  if (!fetchSuccess) {
    try {
      const [fxRes, goldRes, silverRes] = await Promise.all([
        fetch("https://open.er-api.com/v6/latest/USD"),
        fetch("https://api.gold-api.com/price/XAU"),
        fetch("https://api.gold-api.com/price/XAG"),
      ]);

      if (fxRes.ok && goldRes.ok && silverRes.ok) {
        const fxData = await fxRes.json();
        const goldData = await goldRes.json();
        const silverData = await silverRes.json();

        const inrPerUsd = fxData?.rates?.INR || 86.5;
        if (goldData?.price && silverData?.price) {
          const goldInrTroyOz = goldData.price * inrPerUsd;
          const silverInrTroyOz = silverData.price * inrPerUsd;

          goldRate = Number((goldInrTroyOz / 31.1034768).toFixed(2));
          silverRate = Number((silverInrTroyOz / 31.1034768).toFixed(2));
          source = "Live Spot API (OpenER + GoldAPI USD/INR)";
          fetchSuccess = true;
        }
      }
    } catch (secErr) {
      console.warn("Secondary spot API fetch failed, using cached or fallback rates.", secErr);
    }
  }

  // If both live fetches failed, check if we have existing DB rates before using default fallback
  if (!fetchSuccess) {
    const existing = await getMarketRates();
    if (existing.goldRatePerGram > 0 && !existing.lastUpdated.includes("Default")) {
      goldRate = existing.goldRatePerGram;
      silverRate = existing.silverRatePerGram;
      source = "Cached Spot Rate (Offline Fallback)";
    }
  }

  const timestamp =
    new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " IST";

  try {
    await Promise.all([
      updateSetting("rate.gold.per_gram", goldRate.toString()),
      updateSetting("rate.silver.per_gram", silverRate.toString()),
      updateSetting("rate.last_updated", `${timestamp} (${source})`),
    ]);

    const updatedRates = await getMarketRates();
    return { success: true, rates: updatedRates };
  } catch (dbErr) {
    console.error("Failed to save updated metal rates to DB:", dbErr);
    return {
      success: false,
      rates: {
        ...DEFAULT_RATES,
        goldRatePerGram: goldRate,
        silverRatePerGram: silverRate,
        lastUpdated: timestamp,
        safetyMarginPercent: 0,
        source: source,
      },
      error: "Could not persist rates to database",
    };
  }
}
