/**
 * Valuation Service — §6.1 & §6.2
 *
 * Server-side computation of item valuations and tiered LTV.
 * ALL arithmetic uses Prisma.Decimal (decimal.js) — never native JS floats.
 * Client-side auto-calculation is UX convenience only; these functions are the source of truth.
 */

import Decimal from "decimal.js";
import { AppSetting, Op } from "@/lib/db";

// ==================== Purity Reference Table ====================
// Standardized purity values — hardcoded lookup for common standards,
// with support for custom purity entry.

export const PURITY_PRESETS = {
  GOLD: [
    { label: "24K", purityPercent: 99.9, fineness: "999" },
    { label: "22K", purityPercent: 91.6, fineness: "916" },
    { label: "18K", purityPercent: 75.0, fineness: "750" },
    { label: "14K", purityPercent: 58.5, fineness: "585" },
  ],
  SILVER: [
    { label: "Fine Silver", purityPercent: 99.9, fineness: "999" },
    { label: "Sterling Silver", purityPercent: 92.5, fineness: "925" },
  ],
} as const;

// ==================== §6.1 Item Valuation ====================

export interface ItemValuationInput {
  grossWeightGrams: string | number;
  stoneWeightGrams: string | number;
  purityPercent: string | number;
  valuationRatePerGram: string | number;
}

export interface ItemValuationResult {
  netWeightGrams: Decimal;
  fineWeightGrams: Decimal;
  assessedValue: Decimal;
}

/**
 * netWeightGrams = grossWeightGrams − stoneWeightGrams
 * Must be ≥ 0.
 */
export function computeNetWeight(grossWeight: Decimal, stoneWeight: Decimal): Decimal {
  const net = grossWeight.minus(stoneWeight);
  if (net.isNegative()) {
    throw new Error("Net weight cannot be negative: stone weight exceeds gross weight");
  }
  return net;
}

/**
 * fineWeightGrams = netWeightGrams × (purityPercent / 100)
 * Converts actual metal weight to pure-metal equivalent.
 */
export function computeFineWeight(netWeight: Decimal, purityPercent: Decimal): Decimal {
  return netWeight.times(purityPercent).div(new Decimal(100));
}

/**
 * assessedValue = round(fineWeightGrams × valuationRatePerGram, 2)
 * Rate is always for pure (999) metal.
 */
export function computeAssessedValue(fineWeight: Decimal, ratePerGram: Decimal): Decimal {
  return fineWeight.times(ratePerGram).toDecimalPlaces(2);
}

/**
 * Full item valuation pipeline — recomputes all derived fields server-side.
 */
export function computeItemValuation(input: ItemValuationInput): ItemValuationResult {
  const gross = new Decimal(input.grossWeightGrams);
  const stone = new Decimal(input.stoneWeightGrams);
  const purity = new Decimal(input.purityPercent);
  const rate = new Decimal(input.valuationRatePerGram);

  const netWeightGrams = computeNetWeight(gross, stone);
  const fineWeightGrams = computeFineWeight(netWeightGrams, purity);
  const assessedValue = computeAssessedValue(fineWeightGrams, rate);

  return { netWeightGrams, fineWeightGrams, assessedValue };
}

// ==================== §6.2 Tiered LTV ====================

export interface LtvSlab {
  maxValue: Decimal; // upper bound of assessed value for this slab (Infinity for last slab)
  ltvPercent: Decimal;
}

/**
 * Default RBI gold-loan framework (April 2026):
 *   ≤ ₹2,50,000 → 85% LTV
 *   ₹2,50,001 – ₹5,00,000 → 80% LTV
 *   > ₹5,00,000 → 75% LTV
 */
export const DEFAULT_LTV_SLABS: LtvSlab[] = [
  { maxValue: new Decimal("250000"), ltvPercent: new Decimal("85") },
  { maxValue: new Decimal("500000"), ltvPercent: new Decimal("80") },
  { maxValue: new Decimal("Infinity"), ltvPercent: new Decimal("75") },
];

/**
 * Fetch LTV slabs from AppSetting, falling back to defaults.
 * Settings keys: ltv.tier1.max, ltv.tier1.percent, ltv.tier2.max, ltv.tier2.percent, ltv.tier3.percent
 */
export async function getLtvSlabs(): Promise<LtvSlab[]> {
  const settings = await AppSetting.findAll({
    where: {
      key: {
        [Op.like]: "ltv.%",
      },
    },
  });

  if (settings.length === 0) {
    return DEFAULT_LTV_SLABS;
  }

  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

  const tier1Max = settingsMap.get("ltv.tier1.max");
  const tier1Pct = settingsMap.get("ltv.tier1.percent");
  const tier2Max = settingsMap.get("ltv.tier2.max");
  const tier2Pct = settingsMap.get("ltv.tier2.percent");
  const tier3Pct = settingsMap.get("ltv.tier3.percent");

  if (tier1Max && tier1Pct && tier2Max && tier2Pct && tier3Pct) {
    return [
      { maxValue: new Decimal(tier1Max), ltvPercent: new Decimal(tier1Pct) },
      { maxValue: new Decimal(tier2Max), ltvPercent: new Decimal(tier2Pct) },
      { maxValue: new Decimal("Infinity"), ltvPercent: new Decimal(tier3Pct) },
    ];
  }

  return DEFAULT_LTV_SLABS;
}

/**
 * Determine the applicable LTV percentage for a given total assessed value.
 */
export function getLtvPercent(totalAssessedValue: Decimal, slabs: LtvSlab[]): Decimal {
  for (const slab of slabs) {
    if (totalAssessedValue.lte(slab.maxValue)) {
      return slab.ltvPercent;
    }
  }
  // Fallback to last slab (should not reach here with Infinity slab)
  return slabs[slabs.length - 1].ltvPercent;
}

/**
 * eligibleLoanAmount = totalAssessedValue × (ltvPercent / 100)
 */
export function computeEligibleAmount(totalAssessedValue: Decimal, ltvPercent: Decimal): Decimal {
  return totalAssessedValue.times(ltvPercent).div(new Decimal(100)).toDecimalPlaces(2);
}
