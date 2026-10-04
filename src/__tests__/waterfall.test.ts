import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";

// Recreate pure waterfall logic to test standalone atomic allocation rules (§6.4)
function computePaymentWaterfall(
  amountPaid: Decimal,
  unsettledCharges: Decimal,
  accruedInterest: Decimal,
  principalOutstanding: Decimal
) {
  let remaining = new Decimal(amountPaid);

  // 1. Charges
  const allocatedCharges = Decimal.min(remaining, unsettledCharges);
  remaining = remaining.minus(allocatedCharges);

  // 2. Interest
  const allocatedInterest = Decimal.min(remaining, accruedInterest);
  remaining = remaining.minus(allocatedInterest);

  // 3. Principal
  const allocatedPrincipal = Decimal.min(remaining, principalOutstanding);
  remaining = remaining.minus(allocatedPrincipal);

  return {
    allocatedCharges,
    allocatedInterest,
    allocatedPrincipal,
    remaining,
  };
}

describe("Atomic Repayment Waterfall Allocation (§6.4)", () => {
  it("allocates entirely to charges when payment is less than total unsettled charges", () => {
    const res = computePaymentWaterfall(
      new Decimal("300"), // Paid 300
      new Decimal("500"), // Charges 500
      new Decimal("1500"), // Interest 1500
      new Decimal("50000") // Principal 50000
    );

    expect(res.allocatedCharges.toString()).toBe("300");
    expect(res.allocatedInterest.toString()).toBe("0");
    expect(res.allocatedPrincipal.toString()).toBe("0");
    expect(res.remaining.toString()).toBe("0");
  });

  it("spills over to interest after settling all charges", () => {
    const res = computePaymentWaterfall(
      new Decimal("1000"), // Paid 1000
      new Decimal("400"), // Charges 400 -> leaves 600
      new Decimal("1500"), // Interest 1500 -> absorbs 600
      new Decimal("50000") // Principal 50000
    );

    expect(res.allocatedCharges.toString()).toBe("400");
    expect(res.allocatedInterest.toString()).toBe("600");
    expect(res.allocatedPrincipal.toString()).toBe("0");
  });

  it("spills over to principal after settling both charges and interest", () => {
    const res = computePaymentWaterfall(
      new Decimal("12000"), // Paid 12000
      new Decimal("500"), // Charges 500 -> leaves 11500
      new Decimal("1500"), // Interest 1500 -> leaves 10000
      new Decimal("50000") // Principal 50000 -> absorbs 10000
    );

    expect(res.allocatedCharges.toString()).toBe("500");
    expect(res.allocatedInterest.toString()).toBe("1500");
    expect(res.allocatedPrincipal.toString()).toBe("10000");
    expect(res.remaining.toString()).toBe("0");
  });

  it("correctly handles full settlement of loan", () => {
    const res = computePaymentWaterfall(
      new Decimal("52000"), // Paid exactly total due
      new Decimal("500"),
      new Decimal("1500"),
      new Decimal("50000")
    );

    expect(res.allocatedCharges.toString()).toBe("500");
    expect(res.allocatedInterest.toString()).toBe("1500");
    expect(res.allocatedPrincipal.toString()).toBe("50000");
    expect(res.remaining.toString()).toBe("0");
  });
});
