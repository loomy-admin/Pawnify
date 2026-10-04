import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface AccountMasterAttributes {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY";
  isActive: boolean;
  description?: string | null;
  createdById?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AccountMasterCreationAttributes = Optional<
  AccountMasterAttributes,
  "id" | "isActive" | "description" | "createdById" | "createdAt" | "updatedAt"
>;

export class AccountMaster extends Model<AccountMasterAttributes, AccountMasterCreationAttributes> implements AccountMasterAttributes {
  declare id: string;
  declare code: string;
  declare name: string;
  declare type: "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY";
  declare isActive: boolean;
  declare description: string | null;
  declare createdById: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

AccountMaster.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM("ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdById: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "account_masters",
    timestamps: true,
    indexes: [
      { fields: ["type"] },
      { fields: ["isActive"] },
    ],
  }
);
