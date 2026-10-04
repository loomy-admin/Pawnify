import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface LedgerEntryAttributes {
  id: string;
  loanId?: string | null;
  accountId?: string | null;
  type: "DISBURSEMENT" | "PAYMENT" | "CLOSURE" | "ITEM_RELEASE" | "CAPITAL_INTRO" | "REVERSAL";
  amount: number | string;
  principalAfter: number | string;
  referenceId?: string | null;
  description: string;
  createdAt?: Date;
}

export type LedgerEntryCreationAttributes = Optional<
  LedgerEntryAttributes,
  "id" | "loanId" | "accountId" | "referenceId" | "createdAt"
>;

export class LedgerEntry extends Model<LedgerEntryAttributes, LedgerEntryCreationAttributes> implements LedgerEntryAttributes {
  declare id: string;
  declare loanId: string | null;
  declare accountId: string | null;
  declare type: "DISBURSEMENT" | "PAYMENT" | "CLOSURE" | "ITEM_RELEASE" | "CAPITAL_INTRO" | "REVERSAL";
  declare amount: number | string;
  declare principalAfter: number | string;
  declare referenceId: string | null;
  declare description: string;
  declare readonly createdAt: Date;
}

LedgerEntry.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    loanId: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    accountId: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("DISBURSEMENT", "PAYMENT", "CLOSURE", "ITEM_RELEASE", "CAPITAL_INTRO", "REVERSAL"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    principalAfter: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    referenceId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "ledger_entries",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["loanId", "createdAt"] },
      { fields: ["accountId"] },
    ],
  }
);
