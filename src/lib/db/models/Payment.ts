import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface PaymentAttributes {
  id: string;
  loanId: string;
  receiptNumber: string;
  paymentDate: Date;
  amountPaid: number | string;
  mode: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD";
  allocatedCharges: number | string;
  allocatedInterest: number | string;
  allocatedPrincipal: number | string;
  collectedById: string;
  notes?: string | null;
  isReversed?: boolean;
  reversedAt?: Date | null;
  reversedById?: string | null;
  reversalReason?: string | null;
  createdAt?: Date;
}

export type PaymentCreationAttributes = Optional<
  PaymentAttributes,
  | "id"
  | "paymentDate"
  | "allocatedCharges"
  | "allocatedInterest"
  | "allocatedPrincipal"
  | "isReversed"
  | "reversedAt"
  | "reversedById"
  | "reversalReason"
  | "notes"
  | "createdAt"
>;

export class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> implements PaymentAttributes {
  declare id: string;
  declare loanId: string;
  declare receiptNumber: string;
  declare paymentDate: Date;
  declare amountPaid: number | string;
  declare mode: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD";
  declare allocatedCharges: number | string;
  declare allocatedInterest: number | string;
  declare allocatedPrincipal: number | string;
  declare collectedById: string;
  declare isReversed: boolean;
  declare reversedAt: Date | null;
  declare reversedById: string | null;
  declare reversalReason: string | null;
  declare notes: string | null;
  declare readonly createdAt: Date;
}

Payment.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    loanId: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    receiptNumber: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    paymentDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    amountPaid: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    mode: {
      type: DataTypes.ENUM("CASH", "UPI", "BANK_TRANSFER", "CARD"),
      allowNull: false,
    },
    allocatedCharges: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },
    allocatedInterest: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },
    allocatedPrincipal: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },
    isReversed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    reversedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reversedById: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    reversalReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    collectedById: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "payments",
    timestamps: true,
    updatedAt: false,
  }
);
