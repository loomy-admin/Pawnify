import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface KycDocumentAttributes {
  id: string;
  customerId: string;
  docType: "AADHAAR" | "PAN" | "VOTER_ID" | "PASSPORT" | "DRIVING_LICENSE";
  docNumber: string;
  fileUrl?: string | null;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  verifiedById?: string | null;
  createdAt?: Date;
}

export type KycDocumentCreationAttributes = Optional<
  KycDocumentAttributes,
  "id" | "fileUrl" | "status" | "verifiedById" | "createdAt"
>;

export class KycDocument extends Model<KycDocumentAttributes, KycDocumentCreationAttributes> implements KycDocumentAttributes {
  declare id: string;
  declare customerId: string;
  declare docType: "AADHAAR" | "PAN" | "VOTER_ID" | "PASSPORT" | "DRIVING_LICENSE";
  declare docNumber: string;
  declare fileUrl: string | null;
  declare status: "PENDING" | "VERIFIED" | "REJECTED";
  declare verifiedById: string | null;
  declare readonly createdAt: Date;
}

KycDocument.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    customerId: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    docType: {
      type: DataTypes.ENUM("AADHAAR", "PAN", "VOTER_ID", "PASSPORT", "DRIVING_LICENSE"),
      allowNull: false,
    },
    docNumber: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    fileUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "VERIFIED", "REJECTED"),
      defaultValue: "PENDING",
    },
    verifiedById: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "kyc_documents",
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["customerId", "docType"],
      },
    ],
  }
);
