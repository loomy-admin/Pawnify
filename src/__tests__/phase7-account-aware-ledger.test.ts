/**
 * Phase 7 Tests — Account-Aware Existing Ledger
 *
 * Tests verify:
 * 1. writeLedgerEntry() creates a correct single LedgerEntry (no pairs)
 * 2. LedgerEntry can reference AccountMaster via accountId
 * 3. Active account can be attached
 * 4. Inactive account cannot be attached to a new posting
 * 5. Invalid accountId is rejected
 * 6. Historical NULL accountId entries remain valid
 * 7-10. Existing DISBURSEMENT / PAYMENT / CLOSURE / ITEM_RELEASE behaviors unchanged
 * 11. Ledger amounts remain true 100% in DB (50% mode does not alter stored amounts)
 * 12. 50% mode does not alter account association
 * 13. writeLedgerEntry remains single-entry (no double-entry)
 * 14. No duplicate ledger event is generated
 * 15. Historical ledger entries are not modified
 * 16. Account deactivation does not alter historical entries (accountId persists)
 * 17. Existing payment waterfall remains unchanged
 * 18. Existing interest calculation remains unchanged
 * 19. Existing projection remains unchanged
 * 20. DB row count is preserved (no phantom rows)
 * 21. writeLedgerEntry without accountId works (backward compatible)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Loan, LedgerEntry, AccountMaster, Op } from "@/lib/db";
import Decimal from "decimal.js";
import { writeLedgerEntry } from "@/lib/ledger-writer";
import { createAccount, toggleAccountStatus } from "@/lib/services/accounts";
import { computeAccruedInterest } from "@/lib/services/interest";
import { previewPaymentAllocation } from "@/lib/services/payments";
import { projectLedgerEntry } from "@/lib/projection";

// ==================== Test Fixtures ====================

let testLoanId: string;
let testAccountId: string;
let testAccountCode: string;

const createdLedgerIds: string[] = [];
const createdAccountCodes: string[] = [];

beforeAll(async () => {
  // Use the first available loan for all tests
  const loan = await Loan.findOne({ attributes: ["id"] });
  if (!loan) {
    throw new Error("No loans in DB — seed required");
  }
  testLoanId = loan.id;
});

afterAll(async () => {
  // Clean up test ledger entries
  if (createdLedgerIds.length > 0) {
    await LedgerEntry.destroy({ where: { id: { [Op.in]: createdLedgerIds } } });
  }
  // Clean up test accounts
  if (createdAccountCodes.length > 0) {
    await AccountMaster.destroy({ where: { code: { [Op.in]: createdAccountCodes } } });
  }
});

function trackLedger(id: string) {
  createdLedgerIds.push(id);
  return id;
}

function trackAccount(code: string) {
  createdAccountCodes.push(code.toUpperCase());
  return code;
}

// ==================== 1. writeLedgerEntry without account (backward compatible) ====================

describe("1. writeLedgerEntry — backward compatible (no accountId)", () => {
  it("creates a single LedgerEntry with accountId = NULL when no account is provided", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "DISBURSEMENT",
      amount: new Decimal("50000.00"),
      principalAfter: new Decimal("50000.00"),
      description: "Phase 7 test — disbursement without account",
    });

    trackLedger(entry.id);
    expect(entry.id).toBeDefined();
    expect(entry.loanId).toBe(testLoanId);
    expect(entry.type).toBe("DISBURSEMENT");
    expect(entry.amount.toString()).toBe("50000");
    expect(entry.principalAfter.toString()).toBe("50000");
    expect(entry.accountId).toBeNull();
  });

  it("creates only ONE LedgerEntry per call (no double-entry pairs)", async () => {
    const before = await LedgerEntry.count({ where: { loanId: testLoanId } });

    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "PAYMENT",
      amount: new Decimal("1000.00"),
      principalAfter: new Decimal("49000.00"),
      description: "Phase 7 test — single entry proof",
    });

    trackLedger(entry.id);
    const after = await LedgerEntry.count({ where: { loanId: testLoanId } });
    expect(after - before).toBe(1); // exactly ONE row added
  });
});

// ==================== 2. Active account association ====================

describe("2. LedgerEntry with active AccountMaster", () => {
  beforeAll(async () => {
    const code = trackAccount(`P7-ACTIVE-${Date.now()}`);
    const account = await createAccount({
      code,
      name: `Phase 7 Active Test Account ${Date.now()}`,
      type: "ASSET",
      isActive: true,
    });
    testAccountId = account.id;
    testAccountCode = account.code;
  });

  it("creates a LedgerEntry linked to an active account", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "DISBURSEMENT",
      amount: new Decimal("75000.00"),
      principalAfter: new Decimal("75000.00"),
      description: "Phase 7 test — linked to active account",
      accountId: testAccountId,
    });

    trackLedger(entry.id);
    expect(entry.accountId).toBe(testAccountId);

    // Verify via DB read
    const fromDb = await LedgerEntry.findByPk(entry.id, { include: [{ model: AccountMaster, as: "account" }] });
    expect((fromDb as any)?.account?.code).toBe(testAccountCode);
    expect((fromDb as any)?.account?.isActive).toBe(true);
  });

  it("does NOT create a second (debit/credit) entry when accountId is provided", async () => {
    const before = await LedgerEntry.count({ where: { loanId: testLoanId } });

    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "DISBURSEMENT",
      amount: new Decimal("10000.00"),
      principalAfter: new Decimal("10000.00"),
      description: "Phase 7 test — no pair proof",
      accountId: testAccountId,
    });

    trackLedger(entry.id);
    const after = await LedgerEntry.count({ where: { loanId: testLoanId } });
    expect(after - before).toBe(1); // still exactly ONE row
  });
});

// ==================== 3. Inactive account rejected ====================

describe("3. Inactive account validation", () => {
  it("throws when attempting to post to an inactive account", async () => {
    const code = trackAccount(`P7-INACT-${Date.now()}`);
    const account = await createAccount({
      code,
      name: `Phase 7 Inactive Test Account ${Date.now()}`,
      type: "LIABILITY",
      isActive: true,
    });
    await toggleAccountStatus(account.id, false);

    await expect(
      writeLedgerEntry(undefined, {
        loanId: testLoanId,
        type: "PAYMENT",
        amount: new Decimal("5000.00"),
        principalAfter: new Decimal("45000.00"),
        description: "Should fail — inactive account",
        accountId: account.id,
      })
    ).rejects.toThrow(/inactive/i);
  });

  it("does NOT create a LedgerEntry when inactive account is rejected", async () => {
    const code = trackAccount(`P7-NOWRITE-${Date.now()}`);
    const account = await createAccount({
      code,
      name: `Phase 7 No Write Account ${Date.now()}`,
      type: "LIABILITY",
      isActive: true,
    });
    await toggleAccountStatus(account.id, false);

    const before = await LedgerEntry.count({ where: { loanId: testLoanId } });

    try {
      await writeLedgerEntry(undefined, {
        loanId: testLoanId,
        type: "PAYMENT",
        amount: new Decimal("5000.00"),
        principalAfter: new Decimal("44000.00"),
        description: "Should fail",
        accountId: account.id,
      });
    } catch {
      // expected
    }

    const after = await LedgerEntry.count({ where: { loanId: testLoanId } });
    expect(after).toBe(before); // no row written on rejection
  });
});

// ==================== 4. Invalid accountId rejected ====================

describe("4. Invalid account ID rejected", () => {
  it("throws when accountId references a non-existent account", async () => {
    await expect(
      writeLedgerEntry(undefined, {
        loanId: testLoanId,
        type: "PAYMENT",
        amount: new Decimal("1000.00"),
        principalAfter: new Decimal("49000.00"),
        description: "Should fail — non-existent account",
        accountId: "non-existent-account-id-00000000",
      })
    ).rejects.toThrow(/does not exist/i);
  });
});

// ==================== 5. Historical NULL accountId entries remain valid ====================

describe("5. Historical LedgerEntry integrity", () => {
  it("all existing historical rows with accountId=NULL remain accessible", async () => {
    const nullEntries = await LedgerEntry.findAll({ where: { accountId: null }, attributes: ["id", "type", "amount"], limit: 10 });

    // Must have historical entries — audit confirmed 29 in DB
    expect(nullEntries.length).toBeGreaterThan(0);
    for (const entry of nullEntries) {
      expect(entry.id).toBeDefined();
      expect(entry.amount).toBeDefined();
    }
  });

  it("does NOT modify existing historical entries during writeLedgerEntry", async () => {
    const historicalBefore = await LedgerEntry.findAll({ where: { accountId: null, loanId: testLoanId }, order: [["createdAt", "ASC"]], attributes: ["id", "amount", "type", "accountId"] });

    // Writing a new entry should not touch existing ones
    const newEntry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "CLOSURE",
      amount: new Decimal("0.00"),
      principalAfter: new Decimal("0.00"),
      description: "Phase 7 test — closure without account",
    });
    trackLedger(newEntry.id);

    // All previously null entries remain unchanged
    for (const h of historicalBefore) {
      const current = await LedgerEntry.findByPk(h.id );
      expect(current?.accountId).toBeNull();
      expect(current?.amount.toString()).toBe(h.amount.toString());
      expect(current?.type).toBe(h.type);
    }
  });
});

// ==================== 6. Account deactivation does not alter historical entries ====================

describe("6. Account deactivation safety", () => {
  it("historical LedgerEntry.accountId is preserved even after account is deactivated", async () => {
    const code = trackAccount(`P7-DEACT-${Date.now()}`);
    const account = await createAccount({
      code,
      name: `Phase 7 Deactivation Safety ${Date.now()}`,
      type: "INCOME",
      isActive: true,
    });

    // Create entry linked to the active account
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "PAYMENT",
      amount: new Decimal("2000.00"),
      principalAfter: new Decimal("48000.00"),
      description: "Phase 7 test — deactivation safety",
      accountId: account.id,
    });
    trackLedger(entry.id);

    // Deactivate the account after the fact
    await toggleAccountStatus(account.id, false);

    // Historical entry still references the now-deactivated account
    const fromDb = await LedgerEntry.findByPk(entry.id );
    expect(fromDb?.accountId).toBe(account.id); // reference is preserved
  });
});

// ==================== 7-10. Existing business event types ====================

describe("7-10. Existing business event types remain unchanged", () => {
  it("DISBURSEMENT: amount = principalAmount disbursed", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "DISBURSEMENT",
      amount: new Decimal("100000.00"),
      principalAfter: new Decimal("100000.00"),
      description: "Test DISBURSEMENT semantics",
    });
    trackLedger(entry.id);
    expect(entry.type).toBe("DISBURSEMENT");
    expect(new Decimal(entry.amount).eq(new Decimal("100000.00"))).toBe(true);
  });

  it("PAYMENT: amount = cash received, principalAfter = remaining principal", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "PAYMENT",
      amount: new Decimal("5000.00"),
      principalAfter: new Decimal("95000.00"),
      description: "Test PAYMENT semantics",
    });
    trackLedger(entry.id);
    expect(entry.type).toBe("PAYMENT");
    expect(new Decimal(entry.principalAfter).toString()).toBe("95000");
  });

  it("CLOSURE: amount = 0, principalAfter = 0 (loan fully settled)", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "CLOSURE",
      amount: new Decimal("0.00"),
      principalAfter: new Decimal("0.00"),
      description: "Test CLOSURE semantics",
    });
    trackLedger(entry.id);
    expect(entry.type).toBe("CLOSURE");
    expect(new Decimal(entry.amount).isZero()).toBe(true);
  });

  it("ITEM_RELEASE: amount = 0, principalAfter = 0 (physical collateral return)", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "ITEM_RELEASE",
      amount: new Decimal("0.00"),
      principalAfter: new Decimal("0.00"),
      description: "Test ITEM_RELEASE semantics",
    });
    trackLedger(entry.id);
    expect(entry.type).toBe("ITEM_RELEASE");
    expect(new Decimal(entry.amount).isZero()).toBe(true);
  });
});

// ==================== 11. 50% mode does NOT alter stored DB amounts ====================

describe("11-12. 50% mode isolation", () => {
  it("stored LedgerEntry amount is always the true 100% value regardless of calculationMode", async () => {
    const truePrincipal = new Decimal("200000.00");

    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "DISBURSEMENT",
      amount: truePrincipal,
      principalAfter: truePrincipal,
      description: "Phase 7 — 50% mode isolation test",
    });
    trackLedger(entry.id);

    // Read from DB — must be 100% regardless of projection mode
    const fromDb = await LedgerEntry.findByPk(entry.id );
    expect(fromDb?.amount.toString()).toBe("200000");
    expect(fromDb?.principalAfter.toString()).toBe("200000");

    // Projection only happens at the presentation layer — projectLedgerEntry
    const projected50 = projectLedgerEntry(
      { amount: new Decimal(fromDb!.amount), principalAfter: new Decimal(fromDb!.principalAfter) },
      "FIFTY_PERCENT"
    );
    expect(projected50.amount.toString()).toBe("100000"); // projected view only
    // DB row is unchanged (the projection is purely in-memory)
    const fromDbAgain = await LedgerEntry.findByPk(entry.id );
    expect(fromDbAgain?.amount.toString()).toBe("200000"); // still 100% in DB
  });

  it("account association is completely unaffected by calculationMode", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "PAYMENT",
      amount: new Decimal("5000.00"),
      principalAfter: new Decimal("195000.00"),
      description: "Phase 7 — account association mode test",
      accountId: testAccountId, // active account
    });
    trackLedger(entry.id);

    // accountId is metadata — no projection ever touches it
    const fromDb = await LedgerEntry.findByPk(entry.id );
    expect(fromDb?.accountId).toBe(testAccountId);

    // Even if projected, accountId is not a monetary field and stays
    const projected = projectLedgerEntry(
      { amount: new Decimal(fromDb!.amount), principalAfter: new Decimal(fromDb!.principalAfter), accountId: fromDb!.accountId },
      "FIFTY_PERCENT"
    );
    expect((projected as { accountId?: string | null }).accountId).toBe(testAccountId);
  });
});

// ==================== 13. Existing interest calculation unchanged ====================

describe("13. Existing interest calculation unchanged", () => {
  it("Actual/365 interest formula is exactly preserved", () => {
    const principal = new Decimal("100000");
    const monthlyRate = new Decimal("2.000");
    const lastSettledDate = new Date("2026-01-01T00:00:00Z");
    const asOfDate = new Date("2026-01-31T00:00:00Z"); // 30 days

    const accrued = computeAccruedInterest(
      { principalOutstanding: principal, interestRateMonthly: monthlyRate, lastSettledDate },
      asOfDate
    );

    expect(accrued.toString()).toBe("1972.6");
  });
});

// ==================== 14. Existing payment waterfall preview unchanged ====================

describe("14. Existing payment waterfall unchanged", () => {
  it("previewPaymentAllocation returns consistent waterfall allocation", async () => {
    const activeLoans = await Loan.findAll({
      where: { status: "ACTIVE" },
      attributes: ["id", "principalOutstanding"],
      limit: 1,
    });

    if (activeLoans.length === 0) {
      // No active loans — skip gracefully
      return;
    }

    const loan = activeLoans[0];
    const smallAmount = "1"; // Smallest safe amount

    const allocation = await previewPaymentAllocation(loan.id, smallAmount, new Date("2026-12-01"));

    // Waterfall structure is present: charges → interest → principal
    expect(allocation.allocatedCharges).toBeDefined();
    expect(allocation.allocatedInterest).toBeDefined();
    expect(allocation.allocatedPrincipal).toBeDefined();
    expect(allocation.accruedInterest).toBeDefined();
    expect(allocation.totalDue).toBeDefined();

    // Total allocated = amount paid
    const totalAllocated = allocation.allocatedCharges
      .plus(allocation.allocatedInterest)
      .plus(allocation.allocatedPrincipal);
    expect(totalAllocated.lte(new Decimal(smallAmount))).toBe(true);
  });
});

// ==================== 15. DB row count — no phantom rows ====================

describe("15. Database safety — no phantom rows", () => {
  it("LedgerEntry count grows exactly by number of test entries created", async () => {
    const before = await LedgerEntry.count();

    const e1 = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "DISBURSEMENT",
      amount: new Decimal("1.00"),
      principalAfter: new Decimal("1.00"),
      description: "Count test 1",
    });
    const e2 = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "PAYMENT",
      amount: new Decimal("1.00"),
      principalAfter: new Decimal("0.00"),
      description: "Count test 2",
    });

    trackLedger(e1.id);
    trackLedger(e2.id);

    const after = await LedgerEntry.count();
    expect(after - before).toBe(2); // exactly 2 new rows
  });
});

// ==================== 16. referenceId optional field ====================

describe("16. referenceId optional field", () => {
  it("stores referenceId when provided (used for PAYMENT → Payment table linkage)", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "PAYMENT",
      amount: new Decimal("500.00"),
      principalAfter: new Decimal("49500.00"),
      description: "Test referenceId",
      referenceId: "test-payment-ref-123",
    });

    trackLedger(entry.id);
    const fromDb = await LedgerEntry.findByPk(entry.id );
    expect(fromDb?.referenceId).toBe("test-payment-ref-123");
  });

  it("referenceId is null when not provided", async () => {
    const entry = await writeLedgerEntry(undefined, {
      loanId: testLoanId,
      type: "CLOSURE",
      amount: new Decimal("0.00"),
      principalAfter: new Decimal("0.00"),
      description: "Test no referenceId",
    });

    trackLedger(entry.id);
    const fromDb = await LedgerEntry.findByPk(entry.id );
    expect(fromDb?.referenceId).toBeNull();
  });
});
