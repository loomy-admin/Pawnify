/**
 * Loan Service — Creation, Queries, Status Derivation, Closure
 *
 * Handles the full loan lifecycle from creation through closure and item release.
 * All valuations are recomputed server-side.
 * Closure is a two-step process: financial close + physical item release.
 */

import Decimal from "decimal.js";
import { addMonths } from "date-fns";
import type { Transaction } from "sequelize";
import {
  Loan,
  LoanItem,
  LoanCharge,
  Payment,
  LedgerEntry,
  FollowUp,
  Customer,
  User,
  AppSetting,
  Op,
  runTransaction,
  MetalType,
  PaymentMode,
  LoanStatus,
} from "@/lib/db";
import { debugLog } from "@/lib/debug";
import {
  computeItemValuation,
  getLtvSlabs,
  getLtvPercent,
  computeEligibleAmount,
} from "./valuation";
import { computeAccruedInterest, computeInterestSummary } from "./interest";
import { writeLedgerEntry } from "@/lib/ledger-writer";
import { resolveCounterCashAccount } from "@/lib/services/account-resolver";

// ==================== Types ====================

export interface LoanItemInput {
  metalType: MetalType;
  description: string;
  purityLabel: string;
  purityPercent: string | number;
  grossWeightGrams: string | number;
  stoneWeightGrams: string | number;
  valuationRatePerGram: string | number;
  packetNumber: string;
  storageLocation: string;
  photoUrl?: string;
}

export interface CreateLoanInput {
  customerId: string;
  handledById: string;
  items: LoanItemInput[];
  tenureMonths: number;
  interestRateMonthly: string | number;
  principalAmount: string | number;
  gracePeriodDays?: number;
  loanDate?: Date;
  processingFee?: string | number;
  disbursementMode?: PaymentMode;
  loanType?: "STANDARD" | "CUMULATIVE";
  cumulativeFrequency?: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY";
  cumulativeTreatment?: "ADD_TO_CAPITAL" | "KEEP_SEPARATE";
  asDraft?: boolean;
}

export type LoanDisplayStatus = "DRAFT" | "APPROVED" | "ACTIVE" | "OVERDUE" | "CLOSED" | "CANCELLED";

// ==================== Loan Number Generation ====================

async function generateLoanNumber(transaction?: Transaction): Promise<string> {
  const year = new Date().getFullYear();
  const latestLoan = await Loan.findOne({
    where: {
      loanNumber: {
        [Op.like]: `PL-${year}-%`,
      },
    },
    order: [["loanNumber", "DESC"]],
    transaction,
  });

  let nextSeq = 1;
  if (latestLoan && latestLoan.loanNumber) {
    const parts = latestLoan.loanNumber.split("-");
    const lastNum = parseInt(parts[2], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }
  return `PL-${year}-${String(nextSeq).padStart(6, "0")}`;
}

// ==================== Status Derivation ====================

export function deriveLoanDisplayStatus(loan: {
  status: LoanStatus | "DRAFT" | "APPROVED" | "ACTIVE" | "CLOSED" | "CANCELLED";
  dueDate: Date;
  gracePeriodDays: number;
}): LoanDisplayStatus {
  if (loan.status === "DRAFT") return "DRAFT";
  if (loan.status === "APPROVED") return "APPROVED";
  if (loan.status === "CANCELLED") return "CANCELLED";
  if (loan.status === "CLOSED") return "CLOSED";

  const today = new Date();
  const graceDueDate = new Date(loan.dueDate);
  graceDueDate.setDate(graceDueDate.getDate() + loan.gracePeriodDays);

  if (today > graceDueDate) return "OVERDUE";
  return "ACTIVE";
}

// ==================== Loan Creation ====================

export async function createLoan(input: CreateLoanInput) {
  const loanDate = input.loanDate || new Date();

  return await runTransaction(async (t) => {
    // 1. Recompute all item valuations server-side
    const computedItems = input.items.map((item) => {
      const valuation = computeItemValuation({
        grossWeightGrams: item.grossWeightGrams,
        stoneWeightGrams: item.stoneWeightGrams,
        purityPercent: item.purityPercent,
        valuationRatePerGram: item.valuationRatePerGram,
      });
      return { ...item, ...valuation };
    });

    // 2. Sum assessed values
    const totalAssessedValue = computedItems.reduce(
      (sum, item) => sum.plus(item.assessedValue),
      new Decimal(0)
    );

    // 3. Determine tiered LTV
    const slabs = await getLtvSlabs();
    const ltvPercent = getLtvPercent(totalAssessedValue, slabs);
    const eligibleAmount = computeEligibleAmount(totalAssessedValue, ltvPercent);

    // 4. Validate principal <= eligible
    const principalAmount = new Decimal(input.principalAmount);
    if (principalAmount.gt(eligibleAmount)) {
      throw new Error(
        `Principal ₹${principalAmount.toString()} exceeds eligible amount ₹${eligibleAmount.toString()} (LTV: ${ltvPercent.toString()}%)`
      );
    }
    if (principalAmount.lte(new Decimal(0))) {
      throw new Error("Principal amount must be positive");
    }

    // 5. Compute due date
    const dueDate = addMonths(loanDate, input.tenureMonths);

    // 6. Generate loan number
    const loanNumber = await generateLoanNumber(t);

    const isDraft = Boolean(input.asDraft);
    const status = isDraft ? "DRAFT" : "ACTIVE";

    // 7. Create Loan
    const loan = await Loan.create(
      {
        loanNumber,
        customerId: input.customerId,
        handledById: input.handledById,
        loanDate,
        dueDate,
        tenureMonths: input.tenureMonths,
        interestRateMonthly: new Decimal(input.interestRateMonthly).toString(),
        ltvPercent: ltvPercent.toString(),
        gracePeriodDays: input.gracePeriodDays ?? 7,
        totalAssessedValue: totalAssessedValue.toString(),
        principalAmount: principalAmount.toString(),
        principalOutstanding: principalAmount.toString(),
        lastSettledDate: loanDate,
        loanType: input.loanType || "STANDARD",
        cumulativeFrequency: input.cumulativeFrequency || null,
        cumulativeTreatment: input.cumulativeTreatment || null,
        status,
        disbursedAt: isDraft ? null : loanDate,
        disbursedById: isDraft ? null : input.handledById,
      },
      { transaction: t }
    );

    // 8. Create items
    for (const item of computedItems) {
      await LoanItem.create(
        {
          loanId: loan.id,
          metalType: item.metalType as any,
          description: item.description,
          purityLabel: item.purityLabel,
          purityPercent: new Decimal(item.purityPercent).toString(),
          grossWeightGrams: new Decimal(item.grossWeightGrams).toString(),
          stoneWeightGrams: new Decimal(item.stoneWeightGrams).toString(),
          netWeightGrams: item.netWeightGrams.toString(),
          fineWeightGrams: item.fineWeightGrams.toString(),
          valuationRatePerGram: new Decimal(item.valuationRatePerGram).toString(),
          assessedValue: item.assessedValue.toString(),
          packetNumber: item.packetNumber,
          storageLocation: item.storageLocation,
          photoUrl: item.photoUrl,
        },
        { transaction: t }
      );
    }

    // 9. Processing fee charge (optional)
    if (input.processingFee) {
      const fee = new Decimal(input.processingFee);
      if (fee.gt(new Decimal(0))) {
        await LoanCharge.create(
          {
            loanId: loan.id,
            chargeType: "PROCESSING_FEE",
            amount: fee.toString(),
          },
          { transaction: t }
        );
      }
    }

    // 10. Disbursement ledger entry (only if loan is disbursed / not a draft)
    if (!isDraft) {
      const counterCashAccountId = await resolveCounterCashAccount(t);
      await writeLedgerEntry(t, {
        loanId: loan.id,
        type: "DISBURSEMENT",
        amount: principalAmount,
        principalAfter: principalAmount,
        accountId: counterCashAccountId,
        description: `Loan ${loanNumber} disbursed — ₹${principalAmount.toString()} against ${computedItems.length} item(s) valued at ₹${totalAssessedValue.toString()} (LTV: ${ltvPercent.toString()}%)`,
      });
    }

    debugLog(
      "loans",
      `createLoan: ${loanNumber} status=${status} principal=${principalAmount.toString()} ltv=${ltvPercent.toString()}%`
    );

    const fullLoan = await Loan.findByPk(loan.id, {
      include: [{ model: LoanItem, as: "items" }],
      transaction: t,
    });

    return fullLoan ? fullLoan.toJSON() : loan.toJSON();
  });
}

// ==================== Loan Queries ====================

export async function getLoanById(id: string) {
  const loanInstance = await Loan.findByPk(id, {
    include: [
      { model: Customer, as: "customer" },
      { model: User, as: "handledBy", attributes: ["id", "name", "email"] },
    ],
  });

  if (!loanInstance) return null;

  const loan = loanInstance.toJSON() as any;

  const [items, payments, charges, transactions, followUps] = await Promise.all([
    LoanItem.findAll({ where: { loanId: id }, order: [["createdAt", "ASC"]] }),
    Payment.findAll({ where: { loanId: id }, order: [["createdAt", "DESC"]] }),
    LoanCharge.findAll({ where: { loanId: id }, order: [["createdAt", "ASC"]] }),
    LedgerEntry.findAll({ where: { loanId: id }, order: [["createdAt", "ASC"]] }),
    FollowUp.findAll({ where: { loanId: id }, order: [["dueDate", "ASC"]] }),
  ]);

  const fullLoan = {
    ...loan,
    principalOutstanding: new Decimal(loan.principalOutstanding ?? 0),
    principalAmount: new Decimal(loan.principalAmount ?? 0),
    totalAssessedValue: new Decimal(loan.totalAssessedValue ?? 0),
    interestRateMonthly: new Decimal(loan.interestRateMonthly ?? 0),
    ltvPercent: new Decimal(loan.ltvPercent ?? 0),
    lastSettledDate: new Date(loan.lastSettledDate),
    dueDate: new Date(loan.dueDate),
    items: items.map((i) => {
      const it = i.toJSON() as any;
      return {
        ...it,
        assessedValue: new Decimal(it.assessedValue ?? 0),
        purityPercent: new Decimal(it.purityPercent ?? 0),
        grossWeightGrams: new Decimal(it.grossWeightGrams ?? 0),
        stoneWeightGrams: new Decimal(it.stoneWeightGrams ?? 0),
        netWeightGrams: new Decimal(it.netWeightGrams ?? 0),
        fineWeightGrams: new Decimal(it.fineWeightGrams ?? 0),
        valuationRatePerGram: new Decimal(it.valuationRatePerGram ?? 0),
      };
    }),
    payments: payments.map((p) => {
      const py = p.toJSON() as any;
      return {
        ...py,
        amountPaid: new Decimal(py.amountPaid ?? 0),
        allocatedCharges: new Decimal(py.allocatedCharges ?? 0),
        allocatedInterest: new Decimal(py.allocatedInterest ?? 0),
        allocatedPrincipal: new Decimal(py.allocatedPrincipal ?? 0),
      };
    }),
    charges: charges.map((c) => {
      const ch = c.toJSON() as any;
      return {
        ...ch,
        amount: new Decimal(ch.amount ?? 0),
      };
    }),
    transactions: transactions.map((t) => {
      const tx = t.toJSON() as any;
      return {
        ...tx,
        amount: new Decimal(tx.amount ?? 0),
        principalAfter: new Decimal(tx.principalAfter ?? 0),
      };
    }),
    followUps: followUps.map((f) => f.toJSON()),
  };

  const displayStatus = deriveLoanDisplayStatus(fullLoan);
  const interestSummary = computeInterestSummary({
    principalOutstanding: fullLoan.principalOutstanding,
    interestRateMonthly: fullLoan.interestRateMonthly,
    lastSettledDate: fullLoan.lastSettledDate,
  });

  const totalDue = fullLoan.principalOutstanding
    .plus(interestSummary.accruedInterest)
    .plus(
      fullLoan.charges
        .filter((c: any) => !c.isSettled)
        .reduce((sum: Decimal, c: any) => sum.plus(c.amount), new Decimal(0))
    );

  return {
    ...fullLoan,
    displayStatus,
    interestSummary,
    totalDue,
  };
}

export interface LoanFilters {
  status?: LoanDisplayStatus;
  customerId?: string;
  search?: string;
  metalType?: MetalType;
  dateFrom?: Date;
  dateTo?: Date;
  handledById?: string;
  page?: number;
  pageSize?: number;
}

export async function getLoans(filters: LoanFilters = {}) {
  const { page = 1, pageSize = 20 } = filters;

  const where: any = {};

  if (filters.status === "CLOSED") {
    where.status = "CLOSED";
  } else if (filters.status === "ACTIVE" || filters.status === "OVERDUE") {
    where.status = "ACTIVE";
  }

  if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.handledById) {
    where.handledById = filters.handledById;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.loanDate = {};
    if (filters.dateFrom) where.loanDate[Op.gte] = filters.dateFrom;
    if (filters.dateTo) where.loanDate[Op.lte] = filters.dateTo;
  }

  const includeItems: any = {
    model: LoanItem,
    as: "items",
    attributes: ["metalType", "packetNumber"],
  };

  if (filters.metalType) {
    includeItems.where = { metalType: filters.metalType };
  }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    where[Op.or] = [
      { loanNumber: { [Op.like]: q } },
      { "$customer.fullName$": { [Op.like]: q } },
      { "$customer.phone$": { [Op.like]: q } },
      { "$items.packetNumber$": { [Op.like]: q } },
    ];
  }

  const include = [
    {
      model: Customer,
      as: "customer",
      attributes: ["id", "fullName", "phone"],
    },
    {
      model: User,
      as: "handledBy",
      attributes: ["id", "name"],
    },
    includeItems,
  ];

  if (filters.status === "ACTIVE" || filters.status === "OVERDUE") {
    const allMatching = await Loan.findAll({
      where,
      include,
      order: [["createdAt", "DESC"]],
    });

    const parsed = allMatching.map((l) => {
      const loan = l.toJSON() as any;
      return {
        ...loan,
        principalOutstanding: new Decimal(loan.principalOutstanding ?? 0),
        principalAmount: new Decimal(loan.principalAmount ?? 0),
        dueDate: new Date(loan.dueDate),
        displayStatus: deriveLoanDisplayStatus(loan),
      };
    });

    const filtered = parsed.filter((l) => l.displayStatus === filters.status);
    const total = filtered.length;
    const skip = (page - 1) * pageSize;

    return {
      loans: filtered.slice(skip, skip + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  const skip = (page - 1) * pageSize;
  const { rows, count: total } = await Loan.findAndCountAll({
    where,
    include,
    order: [["createdAt", "DESC"]],
    offset: skip,
    limit: pageSize,
    distinct: true,
  });

  return {
    loans: rows.map((l) => {
      const loan = l.toJSON() as any;
      return {
        ...loan,
        principalOutstanding: new Decimal(loan.principalOutstanding ?? 0),
        principalAmount: new Decimal(loan.principalAmount ?? 0),
        dueDate: new Date(loan.dueDate),
        displayStatus: deriveLoanDisplayStatus(loan),
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ==================== Loan Closure (§6.5) ====================

export async function closeLoan(loanId: string, closedById: string) {
  return await runTransaction(async (t) => {
    const loan = await Loan.findByPk(loanId, {
      include: [
        {
          model: LoanCharge,
          as: "charges",
          where: { isSettled: false },
          required: false,
        },
      ],
      transaction: t,
    });

    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "ACTIVE") throw new Error("Loan is already closed");

    const outstanding = new Decimal(loan.principalOutstanding);
    if (outstanding.gt(new Decimal(0))) {
      throw new Error(
        `Cannot close loan: ₹${outstanding.toString()} principal still outstanding`
      );
    }

    const charges = (loan as any).charges || [];
    if (charges.length > 0) {
      throw new Error("Cannot close loan: unsettled charges remain");
    }

    const accrued = computeAccruedInterest(
      {
        principalOutstanding: outstanding,
        interestRateMonthly: new Decimal(loan.interestRateMonthly),
        lastSettledDate: new Date(loan.lastSettledDate),
      },
      new Date()
    );

    if (accrued.gt(new Decimal("0.01"))) {
      throw new Error(`Cannot close loan: ₹${accrued.toString()} interest still accrued`);
    }

    const now = new Date();

    await loan.update(
      {
        status: "CLOSED",
        closedAt: now,
        closedById,
      },
      { transaction: t }
    );

    await writeLedgerEntry(t, {
      loanId,
      type: "CLOSURE",
      amount: new Decimal(0),
      principalAfter: new Decimal(0),
      accountId: null,
      description: `Loan ${loan.loanNumber} closed — all dues settled`,
    });

    return { closedAt: now };
  });
}

export async function releaseItems(loanId: string) {
  return await runTransaction(async (t) => {
    const loan = await Loan.findByPk(loanId, {
      include: [{ model: LoanItem, as: "items" }],
      transaction: t,
    });

    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "CLOSED") {
      throw new Error("Cannot release items: loan is not closed");
    }

    const items: LoanItem[] = (loan as any).items || [];
    const alreadyReleased = items.length > 0 && items.every((i) => i.releasedAt !== null);
    if (alreadyReleased) {
      throw new Error("Items have already been released");
    }

    const now = new Date();

    await LoanItem.update(
      { releasedAt: now },
      {
        where: {
          loanId,
          releasedAt: null,
        },
        transaction: t,
      }
    );

    await writeLedgerEntry(t, {
      loanId,
      type: "ITEM_RELEASE",
      amount: new Decimal(0),
      principalAfter: new Decimal(0),
      accountId: null,
      description: `${items.length} item(s) released to customer`,
    });

    return { releasedAt: now };
  });
}

// ==================== Default Interest Rate ====================

export async function getDefaultInterestRate(): Promise<string> {
  const setting = await AppSetting.findByPk("interest.default.monthly");
  return setting?.value ?? "1.500";
}

export async function getDefaultGracePeriod(): Promise<number> {
  const setting = await AppSetting.findByPk("grace.period.days");
  return setting ? parseInt(setting.value) : 7;
}

// ==================== Lifecycle Actions: Approve, Disburse, Cancel ====================

export async function approveLoan(loanId: string, approvedById: string, approvalNotes?: string) {
  return await runTransaction(async (t) => {
    const loan = await Loan.findByPk(loanId, { transaction: t });
    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "DRAFT") {
      throw new Error(`Cannot approve loan: status is ${loan.status} (expected DRAFT)`);
    }

    const now = new Date();
    await loan.update(
      {
        status: "APPROVED",
        approvedAt: now,
        approvedById,
        approvalNotes: approvalNotes || null,
      },
      { transaction: t }
    );

    return { approvedAt: now, status: "APPROVED" };
  });
}

export async function disburseApprovedLoan(
  loanId: string,
  handledById: string,
  disbursementMode?: PaymentMode
) {
  return await runTransaction(async (t) => {
    const loan = await Loan.findByPk(loanId, {
      include: [{ model: LoanItem, as: "items" }],
      transaction: t,
    });
    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "APPROVED") {
      throw new Error(`Cannot disburse loan: status is ${loan.status} (expected APPROVED)`);
    }

    const now = new Date();
    await loan.update(
      {
        status: "ACTIVE",
        disbursedAt: now,
        disbursedById: handledById,
      },
      { transaction: t }
    );

    // Write disbursement ledger entry
    const counterCashAccountId = await resolveCounterCashAccount(t);
    const principalAmount = new Decimal(loan.principalAmount);
    const items = (loan as any).items || [];
    await writeLedgerEntry(t, {
      loanId: loan.id,
      type: "DISBURSEMENT",
      amount: principalAmount,
      principalAfter: principalAmount,
      accountId: counterCashAccountId,
      description: `Loan ${loan.loanNumber} disbursed — ₹${principalAmount.toString()} against ${items.length} item(s)`,
    });

    return { disbursedAt: now, status: "ACTIVE" };
  });
}

export async function cancelDraftLoan(loanId: string, cancelledById: string, cancellationReason: string) {
  return await runTransaction(async (t) => {
    const loan = await Loan.findByPk(loanId, { transaction: t });
    if (!loan) throw new Error("Loan not found");
    if (loan.status !== "DRAFT" && loan.status !== "APPROVED") {
      throw new Error(
        `Cannot cancel loan: status is ${loan.status} (only DRAFT or APPROVED loans can be cancelled)`
      );
    }

    const now = new Date();
    await loan.update(
      {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById,
        cancellationReason,
      },
      { transaction: t }
    );

    return { cancelledAt: now, status: "CANCELLED" };
  });
}

// ==================== Preclosure Quotation ====================

export async function getPreclosureQuote(loanId: string, asOfDate: Date = new Date()) {
  const loanInstance = await Loan.findByPk(loanId, {
    include: [
      {
        model: LoanCharge,
        as: "charges",
        where: { isSettled: false },
        required: false,
      },
      {
        model: Customer,
        as: "customer",
        attributes: ["id", "fullName", "phone"],
      },
    ],
  });

  if (!loanInstance) throw new Error("Loan not found");
  if (loanInstance.status !== "ACTIVE") throw new Error("Loan is not active");

  const principal = new Decimal(loanInstance.principalOutstanding);
  const accruedInterest = computeAccruedInterest(
    {
      principalOutstanding: principal,
      interestRateMonthly: new Decimal(loanInstance.interestRateMonthly),
      lastSettledDate: new Date(loanInstance.lastSettledDate),
      loanType: loanInstance.loanType,
      cumulativeFrequency: loanInstance.cumulativeFrequency,
      cumulativeTreatment: loanInstance.cumulativeTreatment,
    },
    asOfDate
  );

  const charges: LoanCharge[] = (loanInstance as any).charges || [];
  const unsettledChargesTotal = charges.reduce(
    (sum, c) => sum.plus(new Decimal(c.amount)),
    new Decimal(0)
  );

  const settlementAmount = principal.plus(accruedInterest).plus(unsettledChargesTotal);

  return {
    loanId: loanInstance.id,
    loanNumber: loanInstance.loanNumber,
    customer: (loanInstance as any).customer,
    quoteDate: asOfDate,
    principalOutstanding: principal,
    accruedInterest,
    unsettledCharges: charges.map((c) => ({
      id: c.id,
      chargeType: c.chargeType,
      amount: new Decimal(c.amount),
    })),
    unsettledChargesTotal,
    settlementAmount,
  };
}
