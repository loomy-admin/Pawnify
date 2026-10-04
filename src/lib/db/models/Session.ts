import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface SessionAttributes {
  id: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId: string;
  calculationMode: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SessionCreationAttributes = Optional<
  SessionAttributes,
  "ipAddress" | "userAgent" | "calculationMode" | "createdAt" | "updatedAt"
>;

export class Session extends Model<SessionAttributes, SessionCreationAttributes> implements SessionAttributes {
  declare id: string;
  declare expiresAt: Date;
  declare token: string;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare userId: string;
  declare calculationMode: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Session.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    token: {
      type: DataTypes.STRING(191),
      allowNull: false,
      unique: true,
    },
    ipAddress: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    userId: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    calculationMode: {
      type: DataTypes.STRING(50),
      defaultValue: "NORMAL",
    },
  },
  {
    sequelize,
    tableName: "session",
    timestamps: true,
  }
);
