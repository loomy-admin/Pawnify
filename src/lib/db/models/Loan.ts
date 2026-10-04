import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface LoanAttributes {
  id: string;
  loanNumber: string;
  customerId: string;
  handledById: string;
  loanDate: Date;
  dueDate: Date;
  tenureMonths: number;
  interestRateMonthly: number | string;
  ltvPercent: number | string;
  gracePeriodDays: number;
  totalAssessedValue: number | string;
  principalAmount: number | string;
  principalOutstanding: number | string;
  lastSettledDate: Date;
  loanType?: "STANDARD" | "CUMULATIVE";
  cumulativeFrequency?: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | null;
  cumulativeTreatment?: "ADD_TO_CAPITAL" | "KEEP_SEPARATE" | null;
  status: "DRAFT" | "APPROVED" | "ACTIVE" | "CLOSED" | "CANCELLED";
  approvedAt?: Date | null;
  approvedById?: string | null;
  approvalNotes?: string | null;
  disbursedAt?: Date | null;
  disbursedById?: string | null;
  cancelledAt?: Date | null;
  cancelledById?: string | null;
  cancellationReason?: string | null;
  closedAt?: Date | null;
  closedById?: string | null;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LoanCreationAttributes = Optional<
  LoanAttributes,
  | "id"
  | "loanDate"
  | "gracePeriodDays"
  | "lastSettledDate"
  | "loanType"
  | "cumulativeFrequency"
  | "cumulativeTreatment"
  | "status"
  | "approvedAt"
  | "approvedById"
  | "approvalNotes"
  | "disbursedAt"
  | "disbursedById"
  | "cancelledAt"
  | "cancelledById"
  | "cancellationReason"
  | "closedAt"
  | "closedById"
  | "notes"
  | "createdAt"
  | "updatedAt"
>;

export class Loan extends Model<LoanAttributes, LoanCreationAttributes> implements LoanAttributes {
  declare id: string;
  declare loanNumber: string;
  declare customerId: string;
  declare handledById: string;
  declare loanDate: Date;
  declare dueDate: Date;
  declare tenureMonths: number;
  declare interestRateMonthly: number | string;
  declare ltvPercent: number | string;
  declare gracePeriodDays: number;
  declare totalAssessedValue: number | string;
  declare principalAmount: number | string;
  declare principalOutstanding: number | string;
  declare lastSettledDate: Date;
  declare loanType: "STANDARD" | "CUMULATIVE";
  declare cumulativeFrequency: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | null;
  declare cumulativeTreatment: "ADD_TO_CAPITAL" | "KEEP_SEPARATE" | null;
  declare status: "DRAFT" | "APPROVED" | "ACTIVE" | "CLOSED" | "CANCELLED";
  declare approvedAt: Date | null;
  declare approvedById: string | null;
  declare approvalNotes: string | null;
  declare disbursedAt: Date | null;
  declare disbursedById: string | null;
  declare cancelledAt: Date | null;
  declare cancelledById: string | null;
  declare cancellationReason: string | null;
  declare closedAt: Date | null;
  declare closedById: string | null;
  declare notes: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Loan.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    loanNumber: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    customerId: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    handledById: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    loanDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    tenureMonths: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    interestRateMonthly: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: false,
    },
    ltvPercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    gracePeriodDays: {
      type: DataTypes.INTEGER,
      defaultValue: 7,
    },
    totalAssessedValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    principalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    principalOutstanding: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    lastSettledDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    loanType: {
      type: DataTypes.ENUM("STANDARD", "CUMULATIVE"),
      defaultValue: "STANDARD",
    },
    cumulativeFrequency: {
      type: DataTypes.ENUM("MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"),
      allowNull: true,
    },
    cumulativeTreatment: {
      type: DataTypes.ENUM("ADD_TO_CAPITAL", "KEEP_SEPARATE"),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("DRAFT", "APPROVED", "ACTIVE", "CLOSED", "CANCELLED"),
      defaultValue: "ACTIVE",
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    approvedById: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    approvalNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    disbursedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    disbursedById: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledById: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    closedById: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "loans",
    timestamps: true,
    indexes: [
      { fields: ["status"] },
      { fields: ["dueDate"] },
      { fields: ["customerId"] },
    ],
  }
);
