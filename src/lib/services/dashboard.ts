/**
 * Dashboard Service — KPI aggregations and quick-access queries.
 * "Overdue" is derived at query time, never stored.
 */

import Decimal from "decimal.js";
import {
  Loan,
  LoanItem,
  Payment,
  LedgerEntry,
  FollowUp,
  Customer,
  AccountMaster,
  Op,
} from "@/lib/db";
import { debugLog } from "@/lib/debug";
import { deriveLoanDisplayStatus } from "./loans";
import { computeAccruedInterest } from "./interest";
import { classifyFlow } from "./day-book";

export interface DashboardFilter {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export async function getDashboardStats(filter?: DashboardFilter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  // Period Date Range Normalization
  let periodStart: Date | null = null;
  let periodEnd: Date | null = null;
  if (filter?.startDate) {
    const s = new Date(filter.startDate);
    if (!isNaN(s.getTime())) {
      periodStart = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    }
  }
  if (filter?.endDate) {
    const e = new Date(filter.endDate);
    if (!isNaN(e.getTime())) {
      periodEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
    }
  }

  // Active loans
  const rawActiveLoans = await Loan.findAll({
    where: { status: "ACTIVE" },
    attributes: [
      "id",
      "loanNumber",
      "principalOutstanding",
      "principalAmount",
      "dueDate",
      "gracePeriodDays",
      "status",
      "ltvPercent",
      "interestRateMonthly",
      "lastSettledDate",
    ],
  });

  const activeLoans = rawActiveLoans.map((l) => {
    const json = l.toJSON() as any;
    return {
      ...json,
      principalOutstanding: new Decimal(json.principalOutstanding ?? 0),
      principalAmount: new Decimal(json.principalAmount ?? 0),
      ltvPercent: new Decimal(json.ltvPercent ?? 0),
      interestRateMonthly: new Decimal(json.interestRateMonthly ?? 0),
      dueDate: new Date(json.dueDate),
      lastSettledDate: new Date(json.lastSettledDate),
    };
  });

  let activeCount = 0;
  let overdueCount = 0;
  let totalAUM = new Decimal(0);
  let overdueAmount = new Decimal(0);
  let dueIn7Days = 0;
  let dueIn30Days = 0;
  let totalLtv = new Decimal(0);
  let weeklyInterestAccrued = new Decimal(0);
  let totalAccruedInterest = new Decimal(0);

  for (const loan of activeLoans) {
    const displayStatus = deriveLoanDisplayStatus(loan);
    totalAUM = totalAUM.plus(loan.principalOutstanding);
    if (loan.ltvPercent) {
      totalLtv = totalLtv.plus(loan.ltvPercent);
    }
    if (loan.interestRateMonthly) {
      const monthlyInterest = loan.principalOutstanding.mul(loan.interestRateMonthly).div(100);
      weeklyInterestAccrued = weeklyInterestAccrued.plus(monthlyInterest.div(4.33));
    }

    const accrued = computeAccruedInterest(
      {
        principalOutstanding: loan.principalOutstanding,
        interestRateMonthly: loan.interestRateMonthly,
        lastSettledDate: loan.lastSettledDate,
      },
      now
    );
    totalAccruedInterest = totalAccruedInterest.plus(accrued);

    if (displayStatus === "OVERDUE") {
      overdueCount++;
      overdueAmount = overdueAmount.plus(loan.principalOutstanding);
    } else {
      activeCount++;
    }

    if (loan.dueDate >= today && loan.dueDate <= in7Days) {
      dueIn7Days++;
    }
    if (loan.dueDate >= today && loan.dueDate <= in30Days) {
      dueIn30Days++;
    }
  }

  // Lifetime counts & aggregates
  const [totalLoansCount, closedCount, customerCount, totalDisbursedSum, closedSum] =
    await Promise.all([
      Loan.count({ where: { status: { [Op.in]: ["ACTIVE", "CLOSED"] } } }),
      Loan.count({ where: { status: "CLOSED" } }),
      Customer.count(),
      Loan.sum("principalAmount"),
      Loan.sum("principalAmount", { where: { status: "CLOSED" } }),
    ]);

  const totalDisbursedLifetimeAmount = new Decimal(totalDisbursedSum || 0);
  const closedLoansPrincipalSum = new Decimal(closedSum || 0);

  // Disbursement metrics: Today, Week, and Period
  const disbursementPeriodWhere: any = {};
  if (periodStart && periodEnd) {
    disbursementPeriodWhere.loanDate = { [Op.gte]: periodStart, [Op.lte]: periodEnd };
  } else if (periodStart) {
    disbursementPeriodWhere.loanDate = { [Op.gte]: periodStart };
  } else if (periodEnd) {
    disbursementPeriodWhere.loanDate = { [Op.lte]: periodEnd };
  }

  const [disbursedTodaySum, disbursedTodayCount, disbursedWeekSum, disbursedWeekCount, disbursedPeriodSum, disbursedPeriodCount] =
    await Promise.all([
      Loan.sum("principalAmount", { where: { loanDate: { [Op.gte]: today, [Op.lte]: todayEnd } } }),
      Loan.count({ where: { loanDate: { [Op.gte]: today, [Op.lte]: todayEnd } } }),
      Loan.sum("principalAmount", { where: { loanDate: { [Op.gte]: weekAgo } } }),
      Loan.count({ where: { loanDate: { [Op.gte]: weekAgo } } }),
      Loan.sum("principalAmount", { where: disbursementPeriodWhere }),
      Loan.count({ where: disbursementPeriodWhere }),
    ]);

  // Payment metrics: Today and Period
  const paymentPeriodWhere: any = {};
  if (periodStart && periodEnd) {
    paymentPeriodWhere.paymentDate = { [Op.gte]: periodStart, [Op.lte]: periodEnd };
  } else if (periodStart) {
    paymentPeriodWhere.paymentDate = { [Op.gte]: periodStart };
  } else if (periodEnd) {
    paymentPeriodWhere.paymentDate = { [Op.lte]: periodEnd };
  }

  const [
    collectionsTodaySum,
    collectionsTodayCount,
    collectionsPeriodCount,
    collectionsPeriodTotal,
    collectionsPeriodPrincipal,
    collectionsPeriodInterest,
    collectionsPeriodCharges,
  ] = await Promise.all([
    Payment.sum("amountPaid", { where: { paymentDate: { [Op.gte]: today, [Op.lte]: todayEnd } } }),
    Payment.count({ where: { paymentDate: { [Op.gte]: today, [Op.lte]: todayEnd } } }),
    Payment.count({ where: paymentPeriodWhere }),
    Payment.sum("amountPaid", { where: paymentPeriodWhere }),
    Payment.sum("allocatedPrincipal", { where: paymentPeriodWhere }),
    Payment.sum("allocatedInterest", { where: paymentPeriodWhere }),
    Payment.sum("allocatedCharges", { where: paymentPeriodWhere }),
  ]);

  // Recent loans
  const rawRecentLoans = await Loan.findAll({
    limit: 5,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: Customer,
        as: "customer",
        attributes: ["fullName", "phone"],
      },
    ],
  });

  // Overdue loans
  const overdueLoanIds = activeLoans
    .filter((l) => deriveLoanDisplayStatus(l) === "OVERDUE")
    .map((l) => l.id)
    .slice(0, 10);

  const rawOverdueLoans =
    overdueLoanIds.length > 0
      ? await Loan.findAll({
          where: { id: { [Op.in]: overdueLoanIds } },
          include: [
            {
              model: Customer,
              as: "customer",
              attributes: ["fullName", "phone"],
            },
          ],
          order: [["dueDate", "ASC"]],
        })
      : [];

  const pendingFollowUpsCount = await FollowUp.count({
    where: {
      status: "PENDING",
      dueDate: { [Op.gte]: today, [Op.lte]: in7Days },
    },
  });

  const avgLtv = activeCount > 0 ? totalLtv.div(activeCount).toFixed(1) : "0";

  // Recent activity from single-entry LedgerEntry table
  const recentLedgerWhere: any = {};
  if (periodStart && periodEnd) {
    recentLedgerWhere.createdAt = { [Op.gte]: periodStart, [Op.lte]: periodEnd };
  } else if (periodStart) {
    recentLedgerWhere.createdAt = { [Op.gte]: periodStart };
  } else if (periodEnd) {
    recentLedgerWhere.createdAt = { [Op.lte]: periodEnd };
  }

  const rawRecentLedgerEntries = await LedgerEntry.findAll({
    where: recentLedgerWhere,
    limit: 10,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: Loan,
        as: "loan",
        attributes: ["loanNumber"],
        include: [
          {
            model: Customer,
            as: "customer",
            attributes: ["id", "fullName", "phone"],
          },
        ],
      },
      {
        model: AccountMaster,
        as: "account",
        attributes: ["id", "code", "name", "type"],
      },
    ],
  });

  const recentActivity = rawRecentLedgerEntries.map((item) => {
    const e = item.toJSON() as any;
    return {
      id: e.id,
      createdAt: e.createdAt,
      type: e.type,
      flow: classifyFlow(e.type),
      amount: new Decimal(e.amount ?? 0),
      principalAfter: new Decimal(e.principalAfter ?? 0),
      loanNumber: e.loan?.loanNumber ?? "",
      customerName: e.loan?.customer?.fullName ?? "",
      customerPhone: e.loan?.customer?.phone ?? "",
      accountId: e.accountId,
      accountCode: e.account?.code ?? null,
      accountName: e.account?.name ?? null,
      referenceId: e.referenceId,
      description: e.description,
    };
  });

  const totalPrincipalOutstanding = totalAUM;
  const totalExposure = totalPrincipalOutstanding.plus(totalAccruedInterest);

  const loanStatusSummary = {
    active: { count: activeCount, amount: totalAUM.minus(overdueAmount) },
    overdue: { count: overdueCount, amount: overdueAmount },
    closed: { count: closedCount, amount: closedLoansPrincipalSum },
    ACTIVE: { count: activeCount, amount: totalAUM.minus(overdueAmount) },
    OVERDUE: { count: overdueCount, amount: overdueAmount },
    CLOSED: { count: closedCount, amount: closedLoansPrincipalSum },
  };

  const collectionsSummary = {
    count: collectionsPeriodCount,
    totalCollected: new Decimal(collectionsPeriodTotal || 0),
    principalCollected: new Decimal(collectionsPeriodPrincipal || 0),
    interestCollected: new Decimal(collectionsPeriodInterest || 0),
    chargesCollected: new Decimal(collectionsPeriodCharges || 0),
    startDate: periodStart ? periodStart.toISOString() : null,
    endDate: periodEnd ? periodEnd.toISOString() : null,
  };

  const disbursementSummary = {
    count: disbursedPeriodCount,
    totalDisbursed: new Decimal(disbursedPeriodSum || 0),
    startDate: periodStart ? periodStart.toISOString() : null,
    endDate: periodEnd ? periodEnd.toISOString() : null,
  };

  const portfolioSummary = {
    totalLoanCount: totalLoansCount,
    activeLoanCount: activeCount,
    overdueLoanCount: overdueCount,
    closedLoanCount: closedCount,
    totalPrincipalDisbursed: totalDisbursedLifetimeAmount,
    totalPrincipalOutstanding,
    totalAccruedInterest,
    totalExposure,
  };

  debugLog(
    "dashboard",
    `getDashboardStats: active=${activeCount} overdue=${overdueCount} closed=${closedCount} AUM=${totalAUM.toString()} accruedInterest=${totalAccruedInterest.toString()}`
  );

  return {
    // Core KPIs
    totalLoansCount,
    activeCount,
    overdueCount,
    closedCount,
    totalAUM: totalAUM.toString(),
    totalPrincipalOutstanding,
    totalAccruedInterest,
    totalExposure,
    overdueAmount: overdueAmount.toString(),
    dueIn7Days,
    dueIn30Days,
    avgLtv,
    weeklyInterestAccrued: weeklyInterestAccrued.toFixed(0),
    pendingFollowUpsCount,
    disbursedToday: {
      count: disbursedTodayCount,
      amount: new Decimal(disbursedTodaySum || 0).toString(),
    },
    disbursedWeek: {
      count: disbursedWeekCount,
      amount: new Decimal(disbursedWeekSum || 0).toString(),
    },
    disbursedPeriod: {
      count: disbursedPeriodCount,
      amount: new Decimal(disbursedPeriodSum || 0),
    },
    collectionsToday: {
      count: collectionsTodayCount,
      amount: new Decimal(collectionsTodaySum || 0).toString(),
    },
    collectionsPeriod: {
      count: collectionsPeriodCount,
      totalCollected: new Decimal(collectionsPeriodTotal || 0),
      principalCollected: new Decimal(collectionsPeriodPrincipal || 0),
      interestCollected: new Decimal(collectionsPeriodInterest || 0),
      chargesCollected: new Decimal(collectionsPeriodCharges || 0),
    },
    recentLoans: rawRecentLoans.map((l) => {
      const json = l.toJSON() as any;
      return {
        ...json,
        dueDate: new Date(json.dueDate),
        displayStatus: deriveLoanDisplayStatus(json),
      };
    }),
    overdueLoans: rawOverdueLoans.map((l) => {
      const json = l.toJSON() as any;
      return {
        ...json,
        dueDate: new Date(json.dueDate),
        displayStatus: "OVERDUE" as const,
      };
    }),
    customerCount,
    filterPeriod: {
      isFiltered: !!(periodStart || periodEnd),
      startDate: periodStart ? periodStart.toISOString() : null,
      endDate: periodEnd ? periodEnd.toISOString() : null,
    },
    activeLoansCount: activeCount,
    overdueLoansCount: overdueCount,
    closedLoansCount: closedCount,
    totalActivePrincipal: loanStatusSummary.ACTIVE.amount,
    totalOverduePrincipal: loanStatusSummary.OVERDUE.amount,
    totalClosedPrincipal: loanStatusSummary.CLOSED.amount,
    totalPaymentsCollected: new Decimal(collectionsPeriodTotal || 0),
    totalPaymentsCount: collectionsPeriodCount,
    totalDisbursedAmount: new Decimal(disbursedPeriodSum || 0),
    totalDisbursementsCount: disbursedPeriodCount,
    loanStatusSummary,
    collectionsSummary,
    disbursementSummary,
    portfolioSummary,
    recentActivity,
  };
}

export async function getDashboardChartData() {
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

  // 1. Metal Breakdown
  let goldCount = 0;
  let silverCount = 0;
  let goldValue = new Decimal(0);
  let silverValue = new Decimal(0);

  for (const loanInst of allLoans) {
    const loan = loanInst.toJSON() as any;
    for (const item of loan.items || []) {
      if (item.metalType === "GOLD") {
        goldCount++;
        goldValue = goldValue.plus(new Decimal(item.assessedValue ?? 0));
      } else {
        silverCount++;
        silverValue = silverValue.plus(new Decimal(item.assessedValue ?? 0));
      }
    }
  }

  // 2. Status Breakdown
  let activeVal = new Decimal(0);
  let overdueVal = new Decimal(0);
  let closedVal = new Decimal(0);
  let activeCnt = 0;
  let overdueCnt = 0;
  let closedCnt = 0;

  for (const loanInst of allLoans) {
    const loan = loanInst.toJSON() as any;
    loan.dueDate = new Date(loan.dueDate);
    const st = deriveLoanDisplayStatus(loan);
    if (st === "OVERDUE") {
      overdueCnt++;
      overdueVal = overdueVal.plus(new Decimal(loan.principalOutstanding ?? 0));
    } else if (st === "CLOSED" || loan.status === "CLOSED") {
      closedCnt++;
      closedVal = closedVal.plus(new Decimal(loan.principalAmount ?? 0));
    } else {
      activeCnt++;
      activeVal = activeVal.plus(new Decimal(loan.principalOutstanding ?? 0));
    }
  }

  // 3. Monthly Disbursed vs Collected (Last 6 Months)
  const monthlyData: Record<string, { month: string; disbursed: number; collected: number }> = {};
  const now = new Date();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
    monthlyData[key] = { month: key, disbursed: 0, collected: 0 };
  }

  for (const loanInst of allLoans) {
    const loan = loanInst.toJSON() as any;
    const d = new Date(loan.loanDate);
    const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
    if (monthlyData[key]) {
      monthlyData[key].disbursed += Number(loan.principalAmount ?? 0);
    }
  }

  for (const payInst of allPayments) {
    const pay = payInst.toJSON() as any;
    const d = new Date(pay.paymentDate);
    const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
    if (monthlyData[key]) {
      monthlyData[key].collected += Number(pay.amountPaid ?? 0);
    }
  }

  return {
    metalBreakdown: [
      { name: "Gold Loans", count: goldCount, value: Number(goldValue), fill: "#16a34a" },
      { name: "Silver Loans", count: silverCount, value: Number(silverValue), fill: "#86efac" },
    ],
    statusBreakdown: [
      { name: "Active", count: activeCnt, value: Number(activeVal), fill: "#22c55e" },
      { name: "Overdue", count: overdueCnt, value: Number(overdueVal), fill: "#f43f5e" },
      { name: "Closed", count: closedCnt, value: Number(closedVal), fill: "#94a3b8" },
    ],
    monthlyTrend: Object.values(monthlyData),
  };
}
