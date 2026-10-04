"use server";

import { checkAuth } from "@/lib/auth/session";
import { Loan, LoanItem, Payment, LoanCharge } from "@/lib/db";
import Decimal from "decimal.js";
import { serializeForClient } from "@/lib/serialize";
import {
  projectReportsData,
  projectLoanRegisterReport,
  projectPaymentRegisterReport,
  projectDisbursementRegisterReport,
  projectOverdueLoansReport,
  projectCustomerWiseSummaryReport,
  projectAccountWiseSummaryReport,
  projectDayBookSummaryReport,
  projectPortfolioSummaryReport,
  projectTransactionHistoryReport,
} from "@/lib/projection";
import {
  getLoanRegisterReport,
  LoanRegisterFilter,
  getPaymentRegisterReport,
  PaymentRegisterFilter,
  getDisbursementRegisterReport,
  DisbursementRegisterFilter,
  getOverdueLoansReport,
  OverdueLoansFilter,
  getCustomerWiseLoanSummaryReport,
  CustomerWiseSummaryFilter,
  getAccountWiseFinancialSummaryReport,
  AccountWiseSummaryFilter,
  getDayBookSummaryReport,
  DayBookSummaryFilter,
  getPortfolioSummaryReport,
  PortfolioSummaryFilter,
  getTransactionHistoryReport,
  TransactionHistoryFilter,
} from "@/lib/services/reports";

/**
 * Legacy summary report action preserved for backwards compatibility.
 */
export async function getReportsDataAction() {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const allLoans = await Loan.findAll({
    include: [
      {
        model: LoanItem,
        as: "items",
        attributes: ["metalType", "assessedValue"],
      },
    ],
  });

  const allPayments = await Payment.findAll();
  const allCharges = await LoanCharge.findAll();

  let activeCount = 0;
  let overdueCount = 0;
  let closedCount = 0;
  let totalActiveAUM = new Decimal(0);

  let goldLoansCount = 0;
  let silverLoansCount = 0;
  let goldAssessedValue = new Decimal(0);
  let silverAssessedValue = new Decimal(0);

  let ltv85Count = 0;
  let ltv80Count = 0;
  let ltv75Count = 0;

  const today = new Date();

  for (const rawLoan of allLoans) {
    const loan = rawLoan.toJSON() as any;
    const ltv = parseFloat((loan.ltvPercent ?? 0).toString());
    const principalOutstanding = new Decimal(loan.principalOutstanding ?? 0);
    const principalAmount = new Decimal(loan.principalAmount ?? 0);
    const totalAssessedValue = new Decimal(loan.totalAssessedValue ?? 0);
    const items: any[] = loan.items || [];

    if (loan.status === "CLOSED") {
      closedCount++;
    } else {
      totalActiveAUM = totalActiveAUM.plus(principalOutstanding);
      const graceDueDate = new Date(loan.dueDate);
      graceDueDate.setDate(graceDueDate.getDate() + (loan.gracePeriodDays ?? 7));
      if (today > graceDueDate) overdueCount++;
      else activeCount++;
    }

    if (ltv >= 85) ltv85Count++;
    else if (ltv >= 80) ltv80Count++;
    else ltv75Count++;

    const isGold = items.some((i) => i.metalType === "GOLD");
    const isSilver = items.some((i) => i.metalType === "SILVER");

    if (isGold) {
      goldLoansCount++;
      goldAssessedValue = goldAssessedValue.plus(totalAssessedValue);
    }
    if (isSilver && !isGold) {
      silverLoansCount++;
      silverAssessedValue = silverAssessedValue.plus(totalAssessedValue);
    }
  }

  let totalCollected = new Decimal(0);
  let interestCollected = new Decimal(0);
  let principalCollected = new Decimal(0);
  let chargesCollected = new Decimal(0);

  for (const rawP of allPayments) {
    const p = rawP.toJSON() as any;
    totalCollected = totalCollected.plus(new Decimal(p.amountPaid ?? 0));
    interestCollected = interestCollected.plus(new Decimal(p.allocatedInterest ?? 0));
    principalCollected = principalCollected.plus(new Decimal(p.allocatedPrincipal ?? 0));
    chargesCollected = chargesCollected.plus(new Decimal(p.allocatedCharges ?? 0));
  }

  let totalDisbursed = new Decimal(0);
  for (const rawLoan of allLoans) {
    const loan = rawLoan.toJSON() as any;
    totalDisbursed = totalDisbursed.plus(new Decimal(loan.principalAmount ?? 0));
  }

  const rawReports = {
    totalLoansCount: allLoans.length,
    totalPaymentsCount: allPayments.length,
    totalChargesCount: allCharges.length,
    activeCount,
    overdueCount,
    closedCount,
    totalActiveAUM: totalActiveAUM.toNumber(),
    goldLoansCount,
    silverLoansCount,
    goldAssessedValue: goldAssessedValue.toNumber(),
    silverAssessedValue: silverAssessedValue.toNumber(),
    ltv85Count,
    ltv80Count,
    ltv75Count,
    totalCollected: totalCollected.toNumber(),
    interestCollected: interestCollected.toNumber(),
    principalCollected: principalCollected.toNumber(),
    chargesCollected: chargesCollected.toNumber(),
    totalDisbursed: totalDisbursed.toNumber(),
  };

  const projectedReports = projectReportsData(rawReports, auth.calculationMode);

  return serializeForClient(projectedReports);
}

// ==================== PHASE 10 REPORT SERVER ACTIONS ====================

/**
 * 1. Loan Register Report
 */
export async function getLoanRegisterReportAction(filter?: LoanRegisterFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getLoanRegisterReport(filter);
  const projected = projectLoanRegisterReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 2. Payment / Collection Register Report
 */
export async function getPaymentRegisterReportAction(filter?: PaymentRegisterFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getPaymentRegisterReport(filter);
  const projected = projectPaymentRegisterReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 3. Disbursement Register Report
 */
export async function getDisbursementRegisterReportAction(filter?: DisbursementRegisterFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getDisbursementRegisterReport(filter);
  const projected = projectDisbursementRegisterReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 4. Overdue Loans Report
 */
export async function getOverdueLoansReportAction(filter?: OverdueLoansFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getOverdueLoansReport(filter);
  const projected = projectOverdueLoansReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 5. Customer-wise Loan Summary Report
 */
export async function getCustomerWiseLoanSummaryReportAction(filter?: CustomerWiseSummaryFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getCustomerWiseLoanSummaryReport(filter);
  const projected = projectCustomerWiseSummaryReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 6. Account-wise Financial Summary Report
 */
export async function getAccountWiseFinancialSummaryReportAction(filter?: AccountWiseSummaryFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getAccountWiseFinancialSummaryReport(filter);
  const projected = projectAccountWiseSummaryReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 7. Day Book Summary Report
 */
export async function getDayBookSummaryReportAction(filter?: DayBookSummaryFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getDayBookSummaryReport(filter);
  const projected = projectDayBookSummaryReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 8. Portfolio Summary Report
 */
export async function getPortfolioSummaryReportAction(filter?: PortfolioSummaryFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getPortfolioSummaryReport(filter);
  const projected = projectPortfolioSummaryReport(report, auth.calculationMode);
  return serializeForClient(projected);
}

/**
 * 9. Transaction History Report
 */
export async function getTransactionHistoryReportAction(filter?: TransactionHistoryFilter) {
  const auth = await checkAuth();
  if (!auth.authenticated) {
    throw new Error(auth.error);
  }

  const report = await getTransactionHistoryReport(filter);
  const projected = projectTransactionHistoryReport(report, auth.calculationMode);
  return serializeForClient(projected);
}
