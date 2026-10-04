import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface LoanItemAttributes {
  id: string;
  loanId: string;
  metalType: "GOLD" | "SILVER";
  description: string;
  purityLabel: string;
  purityPercent: number | string;
  grossWeightGrams: number | string;
  stoneWeightGrams: number | string;
  netWeightGrams: number | string;
  fineWeightGrams: number | string;
  valuationRatePerGram: number | string;
  assessedValue: number | string;
  packetNumber: string;
  storageLocation: string;
  photoUrl?: string | null;
  releasedAt?: Date | null;
  createdAt?: Date;
}

export type LoanItemCreationAttributes = Optional<
  LoanItemAttributes,
  "id" | "stoneWeightGrams" | "photoUrl" | "releasedAt" | "createdAt"
>;

export class LoanItem extends Model<LoanItemAttributes, LoanItemCreationAttributes> implements LoanItemAttributes {
  declare id: string;
  declare loanId: string;
  declare metalType: "GOLD" | "SILVER";
  declare description: string;
  declare purityLabel: string;
  declare purityPercent: number | string;
  declare grossWeightGrams: number | string;
  declare stoneWeightGrams: number | string;
  declare netWeightGrams: number | string;
  declare fineWeightGrams: number | string;
  declare valuationRatePerGram: number | string;
  declare assessedValue: number | string;
  declare packetNumber: string;
  declare storageLocation: string;
  declare photoUrl: string | null;
  declare releasedAt: Date | null;
  declare readonly createdAt: Date;
}

LoanItem.init(
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
    metalType: {
      type: DataTypes.ENUM("GOLD", "SILVER"),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    purityLabel: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    purityPercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    grossWeightGrams: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
    },
    stoneWeightGrams: {
      type: DataTypes.DECIMAL(8, 3),
      defaultValue: 0,
    },
    netWeightGrams: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
    },
    fineWeightGrams: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
    },
    valuationRatePerGram: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    assessedValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    packetNumber: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    storageLocation: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    photoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    releasedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "loan_items",
    timestamps: true,
    updatedAt: false,
  }
);
