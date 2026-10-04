/**
 * Payment Service — §6.4
 *
 * Implements the payment allocation waterfall within an atomic DB transaction.
 *
 * Waterfall order:
 *   1. Outstanding charges (oldest first)
 *   2. Accrued interest
 *   3. Principal
 *
 * Overpayment beyond total outstanding is rejected, not silently dropped.
 */

import Decimal from "decimal.js";
import { differenceInCalendarDays } from "date-fns";
import type { Transaction } from "sequelize";
import {
  Loan,
  LoanCharge,
  Payment,
  Op,
  runTransaction,
  PaymentMode,
} from "@/lib/db";
import { debugLog } from "@/lib/debug";
import { computeAccruedInterest } from "./interest";
import { writeLedgerEntry } from "@/lib/ledger-writer";
import { resolveCounterCashAccount } from "@/lib/services/account-resolver";

export interface PaymentAllocation {
  allocatedCharges: Decimal;
  allocatedInterest: Decimal;
  allocatedPrincipal: Decimal;
  remainingPrincipal: Decimal;
  chargeDetails: Array<{ chargeId: string; amount: Decimal; settled: boolean }>;
}

export interface PaymentResult {
  paymentId: string;
  receiptNumber: string;
  allocation: PaymentAllocation;
  loanFullyPaid: boolean;
}

/**
 * Generate a receipt number: REC-YYYYMMDD-XXXXX
 */
async function generateReceiptNumber(transaction?: Transaction): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const count = await Payment.count({
    where: {
      createdAt: {
        [Op.gte]: startOfDay,
      },
    },
    transaction,
  });
  return `REC-${dateStr}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Preview the allocation waterfall without persisting anything.
 */
export async function previewPaymentAllocation(
  loanId: string,
  amountPaid: string | number,
  asOfDate: Date = new Date()
): Promise<PaymentAllocation & { accruedInterest: Decimal; totalDue: Decimal }> {
  const loanInstance = await Loan.findByPk(loanId, {
    include: [
      {
        model: LoanCharge,
        as: "charges",
        where: { isSettled: false },
        required: false,
      },
    ],
  });

  if (!loanInstance) throw new Error("Loan not found");
  if (loanInstance.status !== "ACTIVE") throw new Error("Loan is not active");

  const charges: LoanCharge[] = (loanInstance as any).charges || [];
  charges.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const principalOutstanding = new Decimal(loanInstance.principalOutstanding);
  const interestRateMonthly = new Decimal(loanInstance.interestRateMonthly);
  const lastSettledDate = new Date(loanInstance.lastSettledDate);

  const amount = new Decimal(amountPaid);
  let remaining = amount;

  // 1. Charges
  let allocatedCharges = new Decimal(0);
  const chargeDetails: PaymentAllocation["chargeDetails"] = [];
  for (const charge of charges) {
    if (remaining.lte(new Decimal(0))) break;
    const chargeAmount = new Decimal(charge.amount);
    const pay = Decimal.min(remaining, chargeAmount);
    allocatedCharges = allocatedCharges.plus(pay);
    remaining = remaining.minus(pay);
    chargeDetails.push({
      chargeId: charge.id,
      amount: pay,
      settled: pay.gte(chargeAmount),
    });
  }

  // 2. Interest
  const accruedInterest = computeAccruedInterest(
    {
      principalOutstanding,
      interestRateMonthly,
      lastSettledDate,
    },
    asOfDate
  );
  const allocatedInterest = Decimal.min(remaining, accruedInterest);
  remaining = remaining.minus(allocatedInterest);

  // 3. Principal
  const allocatedPrincipal = Decimal.min(remaining, principalOutstanding);
  remaining = remaining.minus(allocatedPrincipal);

  const remainingPrincipal = principalOutstanding.minus(allocatedPrincipal);

  const totalCharges = charges.reduce((sum, c) => sum.plus(new Decimal(c.amount)), new Decimal(0));
  const totalDue = totalCharges.plus(accruedInterest).plus(principalOutstanding);

  return {
    allocatedCharges,
    allocatedInterest,
    allocatedPrincipal,
    remainingPrincipal,
    chargeDetails,
    accruedInterest,
    totalDue,
  };
}

/**
 * Record a payment with atomic waterfall allocation.
 */
export async function recordPayment(
  loanId: string,
  amountPaid: string | number,
  mode: PaymentMode,
  collectedById: string,
  notes?: string,
  asOfDate: Date = new Date()
): Promise<PaymentResult> {
  const amount = new Decimal(amountPaid);

  if (amount.lte(new Decimal(0))) {
    throw new Error("Payment amount must be positive");
  }

  debugLog("payments", `recordPayment: loan=${loanId} amount=${amount.toString()} mode=${mode}`);

  return await runTransaction(async (t) => {
    const loanInstance = await Loan.findByPk(loanId, {
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

    if (!loanInstance) throw new Error("Loan not found");
    if (loanInstance.status !== "ACTIVE") throw new Error("Loan is not active");

    const charges: LoanCharge[] = (loanInstance as any).charges || [];
    charges.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const principalOutstanding = new Decimal(loanInstance.principalOutstanding);
    const interestRateMonthly = new Decimal(loanInstance.interestRateMonthly);
    const lastSettledDate = new Date(loanInstance.lastSettledDate);

    let remaining = amount;

    // ===== 1. Outstanding charges (oldest first) =====
    let allocatedCharges = new Decimal(0);
    const chargeDetails: PaymentAllocation["chargeDetails"] = [];

    for (const charge of charges) {
      if (remaining.lte(new Decimal(0))) break;

      const chargeAmount = new Decimal(charge.amount);
      const pay = Decimal.min(remaining, chargeAmount);
      allocatedCharges = allocatedCharges.plus(pay);
      remaining = remaining.minus(pay);

      const settled = pay.gte(chargeAmount);
      chargeDetails.push({ chargeId: charge.id, amount: pay, settled });

      if (settled) {
        await charge.update({ isSettled: true }, { transaction: t });
      }
    }

    // ===== 2. Accrued interest =====
    const accruedInterest = computeAccruedInterest(
      {
        principalOutstanding,
        interestRateMonthly,
        lastSettledDate,
      },
      asOfDate
    );
    const allocatedInterest = Decimal.min(remaining, accruedInterest);
    remaining = remaining.minus(allocatedInterest);

    // ===== 3. Principal =====
    const allocatedPrincipal = Decimal.min(remaining, principalOutstanding);
    remaining = remaining.minus(allocatedPrincipal);

    // ===== Reject overpayment =====
    if (remaining.gt(new Decimal("0.01"))) {
      throw new Error(
        `Payment of ₹${amount.toString()} exceeds total outstanding of ₹${amount
          .minus(remaining)
          .toString()}. Reduce the payment amount.`
      );
    }

    // ===== Update loan state =====
    const newPrincipalOutstanding = principalOutstanding.minus(allocatedPrincipal);

    const daysElapsed = differenceInCalendarDays(asOfDate, lastSettledDate);
    let newLastSettledDate = asOfDate;
    if (daysElapsed > 0 && accruedInterest.gt(0) && allocatedInterest.lt(accruedInterest)) {
      const paidDays = allocatedInterest.div(accruedInterest).times(daysElapsed);
      newLastSettledDate = new Date(
        lastSettledDate.getTime() + paidDays.toNumber() * 24 * 60 * 60 * 1000
      );
      debugLog(
        "payments",
        `partial interest payment: accrued=${accruedInterest.toString()} paid=${allocatedInterest.toString()} — advancing clock ${paidDays.toFixed(2)}/${daysElapsed} days instead of full settle`
      );
    }

    await loanInstance.update(
      {
        principalOutstanding: newPrincipalOutstanding.toString(),
        lastSettledDate: newLastSettledDate,
      },
      { transaction: t }
    );

    // ===== Create Payment record =====
    const receiptNumber = await generateReceiptNumber(t);

    const payment = await Payment.create(
      {
        loanId,
        receiptNumber,
        paymentDate: asOfDate,
        amountPaid: amount.toString(),
        mode: mode as any,
        allocatedCharges: allocatedCharges.toString(),
        allocatedInterest: allocatedInterest.toString(),
        allocatedPrincipal: allocatedPrincipal.toString(),
        collectedById,
        notes: notes || null,
      },
      { transaction: t }
    );

    // ===== Create LedgerEntry =====
    const counterCashAccountId = await resolveCounterCashAccount(t);
    await writeLedgerEntry(t, {
      loanId,
      type: "PAYMENT",
      amount,
      principalAfter: newPrincipalOutstanding,
      referenceId: payment.id,
      accountId: counterCashAccountId,
      description: `Payment of ₹${amount.toString()} — Charges: ₹${allocatedCharges.toString()}, Interest: ₹${allocatedInterest.toString()}, Principal: ₹${allocatedPrincipal.toString()}`,
    });

    return {
      paymentId: payment.id,
      receiptNumber,
      allocation: {
        allocatedCharges,
        allocatedInterest,
        allocatedPrincipal,
        remainingPrincipal: newPrincipalOutstanding,
        chargeDetails,
      },
      loanFullyPaid: newPrincipalOutstanding.eq(new Decimal(0)),
    };
  });
}

/**
 * Reverse a posted payment.
 * Implements Function 13 of Pawn Broker Operations:
 * Never hard-delete financial records; create a linked REVERSAL audit record.
 */
export async function reversePayment(
  paymentId: string,
  reversedById: string,
  reason: string
) {
  if (!reason || !reason.trim()) {
    throw new Error("Reversal reason is required");
  }

  return await runTransaction(async (t) => {
    const payment = await Payment.findByPk(paymentId, { transaction: t });
    if (!payment) throw new Error("Payment not found");
    if (payment.isReversed) {
      throw new Error("This payment has already been reversed");
    }

    const loan = await Loan.findByPk(payment.loanId, { transaction: t });
    if (!loan) throw new Error("Associated loan not found");

    const now = new Date();
    const allocatedPrincipal = new Decimal(payment.allocatedPrincipal);
    const newPrincipal = new Decimal(loan.principalOutstanding).plus(allocatedPrincipal);

    // 1. Mark payment as reversed
    await payment.update(
      {
        isReversed: true,
        reversedAt: now,
        reversedById,
        reversalReason: reason.trim(),
      },
      { transaction: t }
    );

    // 2. Restore loan principal and reopen loan if it was closed
    const loanUpdates: any = {
      principalOutstanding: newPrincipal.toString(),
    };
    if (loan.status === "CLOSED") {
      loanUpdates.status = "ACTIVE";
      loanUpdates.closedAt = null;
      loanUpdates.closedById = null;
    }
    await loan.update(loanUpdates, { transaction: t });

    // 3. Write linked REVERSAL ledger entry
    const counterCashAccountId = await resolveCounterCashAccount(t);
    await writeLedgerEntry(t, {
      loanId: loan.id,
      type: "REVERSAL",
      amount: new Decimal(payment.amountPaid),
      principalAfter: newPrincipal,
      referenceId: payment.id,
      accountId: counterCashAccountId,
      description: `Reversal of Payment ${payment.receiptNumber} (₹${payment.amountPaid}) — Reason: ${reason.trim()}`,
    });

    debugLog("payments", `Payment ${payment.receiptNumber} reversed: ${reason}`);

    return {
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
      reversedAt: now,
      restoredPrincipal: newPrincipal,
    };
  });
}

