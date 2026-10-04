import { Op, fn, col, where } from "sequelize";
import { sequelize, runTransaction } from "./sequelize";
import { User } from "./models/User";
import { Session } from "./models/Session";
import { Account } from "./models/Account";
import { Verification } from "./models/Verification";
import { Customer } from "./models/Customer";
import { KycDocument } from "./models/KycDocument";
import { Loan } from "./models/Loan";
import { LoanItem } from "./models/LoanItem";
import { LoanCharge } from "./models/LoanCharge";
import { Payment } from "./models/Payment";
import { LedgerEntry } from "./models/LedgerEntry";
import { FollowUp } from "./models/FollowUp";
import { AppSetting } from "./models/AppSetting";
import { AccountMaster } from "./models/AccountMaster";

export * from "./types";

let associationsInitialized = false;

export function initAssociations() {
  if (associationsInitialized) return;

  // User relations
  User.hasMany(Session, { foreignKey: "userId", as: "sessions", onDelete: "CASCADE" });
  Session.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasMany(Account, { foreignKey: "userId", as: "accounts", onDelete: "CASCADE" });
  Account.belongsTo(User, { foreignKey: "userId", as: "user" });

  User.hasMany(Customer, { foreignKey: "createdById", as: "customersCreated" });
  Customer.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });

  User.hasMany(Loan, { foreignKey: "handledById", as: "loansHandled" });
  Loan.belongsTo(User, { foreignKey: "handledById", as: "handledBy" });

  User.hasMany(Payment, { foreignKey: "collectedById", as: "paymentsCollected" });
  Payment.belongsTo(User, { foreignKey: "collectedById", as: "collectedBy" });

  User.hasMany(FollowUp, { foreignKey: "assignedToId", as: "followUpsAssigned" });
  FollowUp.belongsTo(User, { foreignKey: "assignedToId", as: "assignedTo" });

  User.hasMany(KycDocument, { foreignKey: "verifiedById", as: "kycVerified" });
  KycDocument.belongsTo(User, { foreignKey: "verifiedById", as: "verifiedBy" });

  User.hasMany(AccountMaster, { foreignKey: "createdById", as: "accountsCreated" });
  AccountMaster.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });

  // Customer relations
  Customer.hasMany(KycDocument, { foreignKey: "customerId", as: "kycDocuments", onDelete: "CASCADE" });
  KycDocument.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

  Customer.hasMany(Loan, { foreignKey: "customerId", as: "loans" });
  Loan.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

  // Loan relations
  Loan.hasMany(LoanItem, { foreignKey: "loanId", as: "items", onDelete: "CASCADE" });
  LoanItem.belongsTo(Loan, { foreignKey: "loanId", as: "loan" });

  Loan.hasMany(LoanCharge, { foreignKey: "loanId", as: "charges", onDelete: "CASCADE" });
  LoanCharge.belongsTo(Loan, { foreignKey: "loanId", as: "loan" });

  Loan.hasMany(Payment, { foreignKey: "loanId", as: "payments" });
  Payment.belongsTo(Loan, { foreignKey: "loanId", as: "loan" });

  Loan.hasMany(LedgerEntry, { foreignKey: "loanId", as: "transactions" });
  LedgerEntry.belongsTo(Loan, { foreignKey: "loanId", as: "loan" });

  Loan.hasMany(FollowUp, { foreignKey: "loanId", as: "followUps" });
  FollowUp.belongsTo(Loan, { foreignKey: "loanId", as: "loan" });

  // AccountMaster relations
  AccountMaster.hasMany(LedgerEntry, { foreignKey: "accountId", as: "ledgerEntries" });
  LedgerEntry.belongsTo(AccountMaster, { foreignKey: "accountId", as: "account" });

  associationsInitialized = true;
}

// Ensure associations are registered on module load
initAssociations();

/**
 * Standard MySQL database table synchronization without CLI migrations.
 */
export async function syncDatabase(options?: { alter?: boolean; force?: boolean }) {
  initAssociations();
  await sequelize.authenticate();
  await sequelize.sync({ alter: options?.alter ?? true, force: options?.force ?? false });
}

export {
  sequelize,
  runTransaction,
  Op,
  fn,
  col,
  where,
  User,
  Session,
  Account,
  Verification,
  Customer,
  KycDocument,
  Loan,
  LoanItem,
  LoanCharge,
  Payment,
  LedgerEntry,
  FollowUp,
  AppSetting,
  AccountMaster,
};

export default sequelize;
