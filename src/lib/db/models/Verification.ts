import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface VerificationAttributes {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type VerificationCreationAttributes = Optional<
  VerificationAttributes,
  "createdAt" | "updatedAt"
>;

export class Verification extends Model<VerificationAttributes, VerificationCreationAttributes> implements VerificationAttributes {
  declare id: string;
  declare identifier: string;
  declare value: string;
  declare expiresAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Verification.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
    },
    identifier: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "verification",
    timestamps: true,
  }
);
