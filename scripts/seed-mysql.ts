import "dotenv/config";
import {
  sequelize,
  syncDatabase,
  User,
  Account,
  AppSetting,
  AccountMaster,
  Customer,
  KycDocument,
  Loan,
  LoanItem,
  LoanCharge,
  Payment,
  LedgerEntry,
  FollowUp,
} from "../src/lib/db";
import { hashPassword } from "better-auth/crypto";
import Decimal from "decimal.js";
import { addMonths, subDays, subMonths } from "date-fns";

function loanNumber(n: number): string {
  return `PL-2026-${String(n).padStart(6, "0")}`;
}

function receiptNumber(n: number): string {
  return `REC-20260706-${String(n).padStart(5, "0")}`;
}

async function main() {
  console.log("🌱 Syncing MySQL database schema...");
  await syncDatabase();

  console.log("🌱 Seeding App Settings...");
  const settingsData = [
    { key: "ltv.tier1.max", value: "250000" },
    { key: "ltv.tier1.percent", value: "85" },
    { key: "ltv.tier2.max", value: "500000" },
    { key: "ltv.tier2.percent", value: "80" },
    { key: "ltv.tier3.percent", value: "75" },
    { key: "interest.default.monthly", value: "1.500" },
    { key: "grace.period.days", value: "7" },
    { key: "pan.threshold", value: "50000" },
    { key: "account.counter_cash.code", value: "CASH-01" },
  ];

  for (const s of settingsData) {
    await AppSetting.upsert(s);
  }

  console.log("🌱 Seeding Account Master...");
  const standardAccounts = [
    {
      code: "CASH-01",
      name: "Counter Cash",
      type: "ASSET" as const,
      description: "Physical counter cash drawer for loan disbursements and payments",
      isActive: true,
    },
    {
      code: "BANK-01",
      name: "HDFC Bank Primary",
      type: "ASSET" as const,
      description: "Primary operational bank account for transfers and UPI",
      isActive: true,
    },
    {
      code: "LOAN-ASSET",
      name: "Gold Loan Portfolio",
      type: "ASSET" as const,
      description: "Principal outstanding on issued gold and silver loans",
      isActive: true,
    },
    {
      code: "INT-INC",
      name: "Interest Income",
      type: "INCOME" as const,
      description: "Monthly accrued and collected interest income",
      isActive: true,
    },
    {
      code: "FEE-INC",
      name: "Fee & Charge Income",
      type: "INCOME" as const,
      description: "Processing fees, notice charges, and appraisal fees",
      isActive: true,
    },
    {
      code: "CAP-01",
      name: "Proprietor Capital",
      type: "EQUITY" as const,
      description: "Owner invested capital",
      isActive: true,
    },
  ];

  const createdAccounts: Record<string, string> = {};
  for (const acc of standardAccounts) {
    let existing = await AccountMaster.findOne({ where: { code: acc.code } });
    if (!existing) {
      existing = await AccountMaster.create(acc);
    }
    createdAccounts[acc.code] = existing.id;
  }

  console.log("🌱 Seeding Users & Auth Accounts...");
  const normalHash = await hashPassword("password123");
  const hiddenHash = await hashPassword("hidden123");

  const seedUsers = [
    {
      id: "usr_admin_001",
      name: "Rajesh Kumar",
      email: "admin@pawnify.com",
      emailVerified: true,
      role: "ADMIN" as const,
      phone: "9876543210",
      isActive: true,
      hiddenPasswordHash: hiddenHash,
    },
    {
      id: "usr_staff_001",
      name: "Priya Sharma",
      email: "priya@pawnify.com",
      emailVerified: true,
      role: "STAFF" as const,
      phone: "9876543211",
      isActive: true,
      hiddenPasswordHash: hiddenHash,
    },
    {
      id: "usr_staff_002",
      name: "Amit Patel",
      email: "amit@pawnify.com",
      emailVerified: true,
      role: "STAFF" as const,
      phone: "9876543212",
      isActive: true,
      hiddenPasswordHash: hiddenHash,
    },
  ];

  for (const u of seedUsers) {
    await User.upsert(u);
    await Account.upsert({
      id: `acc_${u.id}`,
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: normalHash,
    });
  }

  console.log("🌱 Seeding Customers & KYC...");
  const customersData = [
    {
      fullName: "Lakshmi Devi",
      phone: "9845012345",
      email: "lakshmi.d@email.com",
      addressLine1: "12, Gandhi Nagar",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600001",
      kyc: [
        { docType: "AADHAAR" as const, docNumber: "234567891234", status: "VERIFIED" as const },
        { docType: "PAN" as const, docNumber: "ABCDE1234F", status: "VERIFIED" as const },
      ],
    },
    {
      fullName: "Mohammed Farooq",
      phone: "9845012346",
      email: "farooq.m@email.com",
      addressLine1: "45, Jubilee Hills",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500033",
      kyc: [
        { docType: "AADHAAR" as const, docNumber: "345678912345", status: "VERIFIED" as const },
      ],
    },
    {
      fullName: "Anita Verma",
      phone: "9845012347",
      email: "anita.v@email.com",
      addressLine1: "78, MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
      kyc: [
        { docType: "PAN" as const, docNumber: "FGHIJ5678K", status: "VERIFIED" as const },
        { docType: "VOTER_ID" as const, docNumber: "XYZ1234567", status: "PENDING" as const },
      ],
    },
    {
      fullName: "Suresh Babu",
      phone: "9845012348",
      email: "suresh.b@email.com",
      addressLine1: "23, Anna Salai",
      city: "Madurai",
      state: "Tamil Nadu",
      pincode: "625001",
      kyc: [
        { docType: "AADHAAR" as const, docNumber: "456789123456", status: "VERIFIED" as const },
      ],
    },
  ];

  const dbCustomers: Array<{ id: string; fullName: string }> = [];
  for (const c of customersData) {
    let customer = await Customer.findOne({ where: { phone: c.phone } });
    if (!customer) {
      customer = await Customer.create({
        fullName: c.fullName,
        phone: c.phone,
        email: c.email || null,
        addressLine1: c.addressLine1,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        createdById: seedUsers[0].id,
      });
      for (const k of c.kyc) {
        await KycDocument.create({
          customerId: customer.id,
          docType: k.docType,
          docNumber: k.docNumber,
          status: k.status,
          verifiedById: k.status !== "PENDING" ? seedUsers[0].id : null,
        });
      }
    }
    dbCustomers.push({ id: customer.id, fullName: customer.fullName });
  }

  console.log("🌱 Seeding Loans & Ledger...");
  const existingLoanCount = await Loan.count();
  if (existingLoanCount === 0) {
    const now = new Date();
    const cashAccountId = createdAccounts["CASH-01"];

    const loansToSeed = [
      {
        customerIdx: 0,
        staffId: seedUsers[1].id,
        items: [
          {
            metalType: "GOLD" as const,
            description: "22K Gold Chain",
            purityLabel: "22K",
            purityPercent: 91.6,
            grossWeight: 25.5,
            stoneWeight: 0,
            rate: 7500,
            packetNumber: "PKT-001",
            storageLocation: "Vault A / Rack 1 / Shelf 1",
          },
        ],
        tenureMonths: 6,
        interestRate: 1.5,
        principalPercent: 95,
        loanDate: subDays(now, 30),
      },
      {
        customerIdx: 1,
        staffId: seedUsers[2].id,
        items: [
          {
            metalType: "GOLD" as const,
            description: "22K Gold Bangles (pair)",
            purityLabel: "22K",
            purityPercent: 91.6,
            grossWeight: 40.0,
            stoneWeight: 1.2,
            rate: 7500,
            packetNumber: "PKT-002",
            storageLocation: "Vault A / Rack 1 / Shelf 2",
          },
        ],
        tenureMonths: 6,
        interestRate: 1.5,
        principalPercent: 90,
        loanDate: subDays(now, 45),
      },
      {
        customerIdx: 2,
        staffId: seedUsers[1].id,
        items: [
          {
            metalType: "GOLD" as const,
            description: "24K Gold Coin (10g)",
            purityLabel: "24K",
            purityPercent: 99.9,
            grossWeight: 10.0,
            stoneWeight: 0,
            rate: 7800,
            packetNumber: "PKT-003",
            storageLocation: "Vault A / Rack 2 / Shelf 1",
          },
        ],
        tenureMonths: 3,
        interestRate: 1.5,
        principalPercent: 85,
        loanDate: subMonths(now, 6),
      },
      {
        customerIdx: 3,
        staffId: seedUsers[2].id,
        items: [
          {
            metalType: "SILVER" as const,
            description: "Fine Silver Bowl",
            purityLabel: "Fine Silver",
            purityPercent: 99.9,
            grossWeight: 200.0,
            stoneWeight: 0,
            rate: 95,
            packetNumber: "PKT-004",
            storageLocation: "Vault B / Rack 1 / Shelf 2",
          },
        ],
        tenureMonths: 6,
        interestRate: 1.8,
        principalPercent: 80,
        loanDate: subMonths(now, 8),
      },
    ];

    let lIdx = 0;
    for (const l of loansToSeed) {
      lIdx++;
      const cust = dbCustomers[l.customerIdx];
      let totalAssessed = new Decimal(0);
      const computedItems = l.items.map((item) => {
        const netWeight = new Decimal(item.grossWeight).minus(new Decimal(item.stoneWeight));
        const fineWeight = netWeight.times(new Decimal(item.purityPercent)).div(new Decimal(100));
        const assessedValue = fineWeight.times(new Decimal(item.rate)).toDecimalPlaces(2);
        totalAssessed = totalAssessed.plus(assessedValue);
        return { ...item, netWeight, fineWeight, assessedValue };
      });

      const ltvPercent = new Decimal(85);
      const eligibleAmount = totalAssessed.times(ltvPercent).div(new Decimal(100)).toDecimalPlaces(2);
      const principalAmount = eligibleAmount
        .times(new Decimal(l.principalPercent))
        .div(new Decimal(100))
        .toDecimalPlaces(2);
      const dueDate = addMonths(l.loanDate, l.tenureMonths);

      const loan = await Loan.create({
        loanNumber: loanNumber(lIdx),
        customerId: cust.id,
        handledById: l.staffId,
        loanDate: l.loanDate,
        dueDate,
        tenureMonths: l.tenureMonths,
        interestRateMonthly: new Decimal(l.interestRate).toString(),
        ltvPercent: ltvPercent.toString(),
        gracePeriodDays: 7,
        totalAssessedValue: totalAssessed.toString(),
        principalAmount: principalAmount.toString(),
        principalOutstanding: principalAmount.toString(),
        lastSettledDate: l.loanDate,
        status: "ACTIVE",
      });

      for (const item of computedItems) {
        await LoanItem.create({
          loanId: loan.id,
          metalType: item.metalType,
          description: item.description,
          purityLabel: item.purityLabel,
          purityPercent: new Decimal(item.purityPercent).toString(),
          grossWeightGrams: new Decimal(item.grossWeight).toString(),
          stoneWeightGrams: new Decimal(item.stoneWeight).toString(),
          netWeightGrams: item.netWeight.toString(),
          fineWeightGrams: item.fineWeight.toString(),
          valuationRatePerGram: new Decimal(item.rate).toString(),
          assessedValue: item.assessedValue.toString(),
          packetNumber: item.packetNumber,
          storageLocation: item.storageLocation,
        });
      }

      await LedgerEntry.create({
        loanId: loan.id,
        type: "DISBURSEMENT",
        amount: principalAmount.toString(),
        principalAfter: principalAmount.toString(),
        description: `Loan ${loan.loanNumber} disbursed — ₹${principalAmount.toString()}`,
        accountId: cashAccountId,
        createdAt: l.loanDate,
      });

      console.log(`  ✅ Created Loan ${loan.loanNumber} for ${cust.fullName} (₹${principalAmount.toString()})`);
    }
  }

  console.log("\n🚀 Pure MySQL Seeding completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
