import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { AccountMaster, User, Loan, LedgerEntry, Op } from "@/lib/db";
import Decimal from "decimal.js";
import {
  createAccount,
  updateAccount,
  toggleAccountStatus,
  getAccountById,
  getAccountByCode,
  listAccounts,
  getActiveAccounts,
  validateAccountForPosting,
} from "@/lib/services/accounts";
import {
  createAccountAction,
  updateAccountAction,
  toggleAccountStatusAction,
  getAccountsAction,
} from "@/app/(app)/admin/accounts/actions";
import { computeAccruedInterest, computeDailyInterest } from "@/lib/services/interest";
import { projectLedgerEntry } from "@/lib/projection";


// Mock auth session helpers for testing server action RBAC
vi.mock("@/lib/auth/session", () => ({
  checkAuth: vi.fn(),
  checkAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { checkAuth, checkAdmin } from "@/lib/auth/session";

describe("Phase 6: Account Master Foundation", () => {
  const testAccountCodes: string[] = [];

  // Helper to register codes for cleanup
  function trackCode(code: string) {
    testAccountCodes.push(code.toUpperCase());
    return code;
  }

  // Cleanup created test accounts after suite completes
  afterAll(async () => {
    if (testAccountCodes.length > 0) {
      await AccountMaster.destroy({ where: { code: { [Op.in]: testAccountCodes } } });
    }
  });

  // ==================== 1. CREATE ACCOUNT ====================
  describe("1. Create Account", () => {
    it("successfully creates a master account with all valid fields", async () => {
      const code = trackCode(`TEST-CASH-${Date.now()}`);
      const account = await createAccount({
        code,
        name: `Test Primary Cash ${Date.now()}`,
        type: "ASSET",
        description: "Primary cash account for counter transactions",
        isActive: true,
      });

      expect(account).toBeDefined();
      expect(account.id).toBeDefined();
      expect(account.code).toBe(code);
      expect(account.type).toBe("ASSET");
      expect(account.isActive).toBe(true);
      expect(account.description).toBe("Primary cash account for counter transactions");
      expect(account.createdAt).toBeInstanceOf(Date);
    });

    it("normalizes lowercase account codes to uppercase", async () => {
      const rawCode = `test-lower-${Date.now()}`;
      trackCode(rawCode);

      const account = await createAccount({
        code: rawCode,
        name: `Test Lowercase Code ${Date.now()}`,
        type: "INCOME",
        isActive: true,
      });

      expect(account.code).toBe(rawCode.toUpperCase());
    });
  });

  // ==================== 2. DUPLICATE ACCOUNT CODE REJECTED ====================
  describe("2. Duplicate Account Code Rejected", () => {
    it("rejects creating an account with an identical account code", async () => {
      const code = trackCode(`TEST-DUP-${Date.now()}`);
      await createAccount({
        code,
        name: `First Account ${Date.now()}`,
        type: "ASSET",
      });

      await expect(
        createAccount({
          code,
          name: `Second Account Different Name ${Date.now()}`,
          type: "LIABILITY",
        })
      ).rejects.toThrow(/already exists/i);
    });

    it("rejects creating an account with same code in different case", async () => {
      const baseCode = `TEST-CASE-${Date.now()}`;
      trackCode(baseCode);

      await createAccount({
        code: baseCode.toUpperCase(),
        name: `Case Test One ${Date.now()}`,
        type: "EXPENSE",
      });

      await expect(
        createAccount({
          code: baseCode.toLowerCase(),
          name: `Case Test Two ${Date.now()}`,
          type: "EXPENSE",
        })
      ).rejects.toThrow(/already exists/i);
    });
  });

  // ==================== 3. INVALID ACCOUNT REJECTED ====================
  describe("3. Invalid Account Validation", () => {
    it("rejects code containing special invalid characters", async () => {
      await expect(
        createAccount({
          code: "INVALID CODE WITH SPACES",
          name: "Invalid Account",
          type: "ASSET",
        })
      ).rejects.toThrow();

      await expect(
        createAccount({
          code: "CASH@123!",
          name: "Invalid Account",
          type: "ASSET",
        })
      ).rejects.toThrow();
    });

    it("rejects code shorter than 2 characters", async () => {
      await expect(
        createAccount({
          code: "A",
          name: "Too short code",
          type: "ASSET",
        })
      ).rejects.toThrow();
    });

    it("rejects empty account name", async () => {
      await expect(
        createAccount({
          code: trackCode(`TEST-NONAME-${Date.now()}`),
          name: "  ",
          type: "ASSET",
        })
      ).rejects.toThrow();
    });

    it("rejects invalid account category", async () => {
      await expect(
        createAccount({
          code: trackCode(`TEST-CAT-${Date.now()}`),
          name: "Bad category",
          // @ts-expect-error Testing invalid enum value
          type: "CRYPTO_PORTFOLIO",
        })
      ).rejects.toThrow();
    });
  });

  // ==================== 4. UPDATE ACCOUNT ====================
  describe("4. Update Account", () => {
    it("updates account name, type, and description without altering code", async () => {
      const code = trackCode(`TEST-UPD-${Date.now()}`);
      const created = await createAccount({
        code,
        name: `Original Name ${Date.now()}`,
        type: "ASSET",
        description: "Initial description",
      });

      const updated = await updateAccount(created.id, {
        name: `Updated Name ${Date.now()}`,
        type: "EXPENSE",
        description: "Updated description text",
      });

      expect(updated.id).toBe(created.id);
      expect(updated.code).toBe(code); // Code remains unchanged
      expect(updated.name).toContain("Updated Name");
      expect(updated.type).toBe("EXPENSE");
      expect(updated.description).toBe("Updated description text");
    });

    it("rejects updating account name to an already existing account name", async () => {
      const code1 = trackCode(`TEST-NAME1-${Date.now()}`);
      const uniqueName1 = `Unique Account Alpha ${Date.now()}`;
      await createAccount({ code: code1, name: uniqueName1, type: "ASSET" });

      const code2 = trackCode(`TEST-NAME2-${Date.now()}`);
      const account2 = await createAccount({
        code: code2,
        name: `Unique Account Beta ${Date.now()}`,
        type: "LIABILITY",
      });

      await expect(
        updateAccount(account2.id, {
          name: uniqueName1,
        })
      ).rejects.toThrow(/already exists/i);
    });
  });

  // ==================== 5. ACTIVATE / DEACTIVATE ====================
  describe("5. Activate / Deactivate", () => {
    it("toggles active status and filters correctly", async () => {
      const code = trackCode(`TEST-DEACT-${Date.now()}`);
      const account = await createAccount({
        code,
        name: `Deactivation Test ${Date.now()}`,
        type: "INCOME",
        isActive: true,
      });

      expect(account.isActive).toBe(true);

      // Deactivate
      const deactivated = await toggleAccountStatus(account.id, false);
      expect(deactivated.isActive).toBe(false);

      // Reactivate
      const reactivated = await toggleAccountStatus(account.id, true);
      expect(reactivated.isActive).toBe(true);
    });

    it("getActiveAccounts excludes inactive accounts", async () => {
      const codeActive = trackCode(`TEST-ACT-${Date.now()}`);
      const codeInactive = trackCode(`TEST-INACT-${Date.now()}`);

      await createAccount({ code: codeActive, name: `Active Acc ${Date.now()}`, type: "ASSET", isActive: true });
      const inact = await createAccount({ code: codeInactive, name: `Inactive Acc ${Date.now()}`, type: "ASSET", isActive: true });
      await toggleAccountStatus(inact.id, false);

      const activeList = await getActiveAccounts("ASSET");
      const activeCodes = activeList.map((a) => a.code);

      expect(activeCodes).toContain(codeActive);
      expect(activeCodes).not.toContain(codeInactive);
    });
  });

  // ==================== 6. INACTIVE ACCOUNT GUARD ====================
  describe("6. Inactive Account Guard for New Transactions", () => {
    it("allows active accounts for posting", async () => {
      const code = trackCode(`TEST-POST-OK-${Date.now()}`);
      const account = await createAccount({
        code,
        name: `Active Posting Account ${Date.now()}`,
        type: "ASSET",
        isActive: true,
      });

      const validated = await validateAccountForPosting(account.id);
      expect(validated.id).toBe(account.id);
    });

    it("throws explicit business error when attempting to use inactive account", async () => {
      const code = trackCode(`TEST-POST-BLOCK-${Date.now()}`);
      const account = await createAccount({
        code,
        name: `Blocked Inactive Account ${Date.now()}`,
        type: "ASSET",
        isActive: true,
      });
      await toggleAccountStatus(account.id, false);

      await expect(validateAccountForPosting(account.id)).rejects.toThrow(
        /inactive and cannot be used for new transactions/i
      );
    });
  });

  // ==================== 7. ADMIN AUTHORIZATION ====================
  describe("7. ADMIN Authorization on Server Actions", () => {
    beforeEach(async () => {
      const realAdmin = await User.findOne({ where: { role: "ADMIN" } });
      vi.mocked(checkAdmin).mockResolvedValue({
        authenticated: true,
        user: {
          id: realAdmin ? realAdmin.id : "admin-user-id",
          name: "Admin User",
          email: "admin@pawnify.com",
          role: "ADMIN",
          phone: "9876543210",
          isActive: true,
        },
        sessionId: "admin-session-id",
        calculationMode: "NORMAL",
      });
    });

    it("permits ADMIN to create an account via Server Action", async () => {
      const code = trackCode(`TEST-ACT-ADM-${Date.now()}`);
      const res = await createAccountAction({
        code,
        name: `Admin Action Acc ${Date.now()}`,
        type: "ASSET",
      });

      expect(res.success).toBe(true);
      if (res.success && res.account) {
        expect(res.account.code).toBe(code);
      }
    });

    it("permits ADMIN to update account status via Server Action", async () => {
      const code = trackCode(`TEST-ACT-STAT-${Date.now()}`);
      const acc = await createAccount({
        code,
        name: `Admin Toggle Acc ${Date.now()}`,
        type: "LIABILITY",
      });

      const res = await toggleAccountStatusAction(acc.id, false);
      expect(res.success).toBe(true);
      if (res.success && res.account) {
        expect(res.account.isActive).toBe(false);
      }
    });
  });

  // ==================== 8. STAFF AUTHORIZATION ====================
  describe("8. STAFF Authorization on Server Actions", () => {
    beforeEach(() => {
      // Staff role fails checkAdmin
      vi.mocked(checkAdmin).mockResolvedValue({
        authenticated: false,
        error: "Unauthorized: Admin privileges required.",
      });

      // Staff role passes checkAuth
      vi.mocked(checkAuth).mockResolvedValue({
        authenticated: true,
        user: {
          id: "staff-user-id",
          name: "Staff Member",
          email: "staff@pawnify.com",
          role: "STAFF",
          phone: "9876543211",
          isActive: true,
        },
        sessionId: "staff-session-id",
        calculationMode: "NORMAL",
      });
    });

    it("blocks STAFF from creating accounts via Server Action", async () => {
      const res = await createAccountAction({
        code: `STAFF-BLOCKED-${Date.now()}`,
        name: "Staff Forbidden Acc",
        type: "ASSET",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Admin privileges required");
    });

    it("blocks STAFF from updating accounts via Server Action", async () => {
      const res = await updateAccountAction("some-id", {
        name: "Attempted Staff Update",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Admin privileges required");
    });

    it("blocks STAFF from toggling account status via Server Action", async () => {
      const res = await toggleAccountStatusAction("some-id", false);

      expect(res.success).toBe(false);
      expect(res.error).toContain("Admin privileges required");
    });

    it("allows STAFF read-only access to list accounts", async () => {
      const res = await getAccountsAction();
      expect(res.success).toBe(true);
      expect(Array.isArray(res.accounts)).toBe(true);
    });
  });

  // ==================== 9. EXISTING LEDGER ENTRY VALIDITY ====================
  describe("9. Existing LedgerEntry Integrity", () => {
    it("ensures historical LedgerEntry records without accountId remain valid", async () => {
      // Find an existing loan to create a standard single-entry ledger record
      const loan = await Loan.findOne({ attributes: ["id"] });
      if (loan) {
        const entry = await LedgerEntry.create({ loanId: loan.id, type: "DISBURSEMENT", amount: "1000.00", principalAfter: "1000.00", description: "Phase 6 backward compatibility test entry" });

        expect(entry.id).toBeDefined();
        expect(entry.accountId ?? null).toBeNull(); // accountId is optional and defaults to null

        // Clean up test entry
        await entry.destroy();
      }
    });

    it("supports optional linkage to AccountMaster without breaking single-entry structure", async () => {
      const loan = await Loan.findOne({ attributes: ["id"] });
      if (loan) {
        const code = trackCode(`TEST-LEDG-${Date.now()}`);
        const account = await createAccount({
          code,
          name: `Ledger Linked Acc ${Date.now()}`,
          type: "ASSET",
        });

        const entry = await LedgerEntry.create({ loanId: loan.id, accountId: account.id, type: "DISBURSEMENT", amount: "5000.00", principalAfter: "5000.00", description: "Phase 6 linked entry test" });
        const fullEntry = await LedgerEntry.findByPk(entry.id, { include: [{ model: AccountMaster, as: "account" }] });
        expect(fullEntry?.accountId).toBe(account.id);
        expect((fullEntry as any)?.account?.code).toBe(code);
        await entry.destroy();
      }
    });
  });

  // ==================== 10. FINANCIAL CALCULATIONS UNCHANGED ====================
  describe("10. Existing Pawnify Financial Calculations Unchanged", () => {
    it("interest calculation formula is exactly preserved", () => {
      const principal = new Decimal("100000");
      const monthlyRate = new Decimal("2.000"); // 2% per month
      const lastSettledDate = new Date("2026-01-01T00:00:00Z");
      const asOfDate = new Date("2026-01-31T00:00:00Z"); // 30 days

      const daily = computeDailyInterest(principal, monthlyRate);
      const accrued = computeAccruedInterest(
        { principalOutstanding: principal, interestRateMonthly: monthlyRate, lastSettledDate },
        asOfDate
      );

      // daily = 100000 * 24 / 365 / 100 = 65.7534246...
      expect(daily.toFixed(4)).toBe("65.7534");
      // accrued = 65.7534246... * 30 = 1972.60
      expect(accrued.toString()).toBe("1972.6");
    });
  });

  // ==================== 11. 50% MODE HAS NO EFFECT ON ACCOUNT MASTER ====================
  describe("11. 50% Mode Isolation", () => {
    it("proves Account Master fields are metadata and completely unaffected by calculationMode", async () => {
      const code = trackCode(`TEST-MODE-${Date.now()}`);
      const account = await createAccount({
        code,
        name: `Mode Neutral Account ${Date.now()}`,
        type: "INCOME",
        description: "Zero monetary values stored here",
      });

      // AccountMaster contains zero monetary fields (no balance, no amounts)
      expect(typeof account.code).toBe("string");
      expect(typeof account.name).toBe("string");
      expect(typeof account.isActive).toBe("boolean");
      expect(typeof account.type).toBe("string");
      // Verify no monetary field exists on account
      expect((account as unknown as Record<string, unknown>).balance).toBeUndefined();
      expect((account as unknown as Record<string, unknown>).amount).toBeUndefined();
    });

    it("verifies LedgerEntry projection continues scaling monetary values only", () => {
      const rawEntry = {
        amount: new Decimal("10000.00"),
        principalAfter: new Decimal("50000.00"),
        description: "Payment entry",
      };

      const normal = projectLedgerEntry(rawEntry, "NORMAL");
      const fifty = projectLedgerEntry(rawEntry, "FIFTY_PERCENT");

      expect(normal.amount.toString()).toBe("10000");
      expect(fifty.amount.toString()).toBe("5000");
    });
  });
});
