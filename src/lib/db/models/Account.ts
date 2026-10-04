import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface AccountAttributes {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scope?: string | null;
  password?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AccountCreationAttributes = Optional<
  AccountAttributes,
  | "accessToken"
  | "refreshToken"
  | "idToken"
  | "accessTokenExpiresAt"
  | "refreshTokenExpiresAt"
  | "scope"
  | "password"
  | "createdAt"
  | "updatedAt"
>;

export class Account extends Model<AccountAttributes, AccountCreationAttributes> implements AccountAttributes {
  declare id: string;
  declare accountId: string;
  declare providerId: string;
  declare userId: string;
  declare accessToken: string | null;
  declare refreshToken: string | null;
  declare idToken: string | null;
  declare accessTokenExpiresAt: Date | null;
  declare refreshTokenExpiresAt: Date | null;
  declare scope: string | null;
  declare password: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Account.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
    },
    accountId: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    accessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    idToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    accessTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    refreshTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    scope: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "account",
    timestamps: true,
  }
);
