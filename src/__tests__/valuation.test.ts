import { describe, it, expect } from "vitest";
import {
  computeNetWeight,
  computeFineWeight,
  computeAssessedValue,
  getLtvPercent,
  computeEligibleAmount,
  DEFAULT_LTV_SLABS,
} from "../lib/services/valuation";
import Decimal from "decimal.js";

describe("Collateral Valuation & Tiered LTV (§6.1 / §6.2)", () => {
  it("correctly computes net weight subtracting stone/wax weight", () => {
    const net = computeNetWeight(new Decimal("25.50"), new Decimal("2.50"));
    expect(net.toString()).toBe("23");
  });

  it("correctly computes fine weight based on purity percentage (22K -> 91.6%)", () => {
    const net = new Decimal("20.00");
    const purity = new Decimal("91.6");
    const fine = computeFineWeight(net, purity);
    expect(fine.toFixed(2)).toBe("18.32");
  });

  it("correctly computes assessed value from fine weight and market rate per gram", () => {
    const fine = new Decimal("10.00");
    const rate = new Decimal("7500");
    const val = computeAssessedValue(fine, rate);
    expect(val.toString()).toBe("75000");
  });

  describe("RBI-Compliant Tiered LTV Slabs (§6.2)", () => {
    it("applies Tier 1 (85% LTV) for assessed value <= ₹2,50,000", () => {
      const assessed = new Decimal("200000");
      const ltvApplied = getLtvPercent(assessed, DEFAULT_LTV_SLABS);
      const eligibleAmount = computeEligibleAmount(assessed, ltvApplied);
      expect(ltvApplied.toString()).toBe("85");
      expect(eligibleAmount.toString()).toBe("170000"); // 85% of 2L
    });

    it("applies Tier 2 (80% LTV) for assessed value between ₹2,50,001 and ₹5,00,000", () => {
      const assessed = new Decimal("400000");
      const ltvApplied = getLtvPercent(assessed, DEFAULT_LTV_SLABS);
      const eligibleAmount = computeEligibleAmount(assessed, ltvApplied);
      expect(ltvApplied.toString()).toBe("80");
      expect(eligibleAmount.toString()).toBe("320000"); // 80% of 4L
    });

    it("applies Tier 3 (75% LTV) for assessed value > ₹5,00,000", () => {
      const assessed = new Decimal("1000000");
      const ltvApplied = getLtvPercent(assessed, DEFAULT_LTV_SLABS);
      const eligibleAmount = computeEligibleAmount(assessed, ltvApplied);
      expect(ltvApplied.toString()).toBe("75");
      expect(eligibleAmount.toString()).toBe("750000"); // 75% of 10L
    });
  });
});
