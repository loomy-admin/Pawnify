import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface LoanChargeAttributes {
  id: string;
  loanId: string;
  chargeType: "PROCESSING_FEE" | "PENAL_CHARGE" | "OTHER";
  amount: number | string;
  isSettled: boolean;
  createdAt?: Date;
}

export type LoanChargeCreationAttributes = Optional<
  LoanChargeAttributes,
  "id" | "isSettled" | "createdAt"
>;

export class LoanCharge extends Model<LoanChargeAttributes, LoanChargeCreationAttributes> implements LoanChargeAttributes {
  declare id: string;
  declare loanId: string;
  declare chargeType: "PROCESSING_FEE" | "PENAL_CHARGE" | "OTHER";
  declare amount: number | string;
  declare isSettled: boolean;
  declare readonly createdAt: Date;
}

LoanCharge.init(
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
    chargeType: {
      type: DataTypes.ENUM("PROCESSING_FEE", "PENAL_CHARGE", "OTHER"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    isSettled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: "loan_charges",
    timestamps: true,
    updatedAt: false,
  }
);
