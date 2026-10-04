import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface CustomerAttributes {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  dob?: Date | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  pincode: string;
  photoUrl?: string | null;
  createdById: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CustomerCreationAttributes = Optional<
  CustomerAttributes,
  "id" | "email" | "dob" | "addressLine2" | "photoUrl" | "createdAt" | "updatedAt"
>;

export class Customer extends Model<CustomerAttributes, CustomerCreationAttributes> implements CustomerAttributes {
  declare id: string;
  declare fullName: string;
  declare phone: string;
  declare email: string | null;
  declare dob: Date | null;
  declare addressLine1: string;
  declare addressLine2: string | null;
  declare city: string;
  declare state: string;
  declare pincode: string;
  declare photoUrl: string | null;
  declare createdById: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Customer.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    fullName: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    dob: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    addressLine1: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    addressLine2: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    pincode: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    photoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    createdById: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "customers",
    timestamps: true,
    indexes: [
      { fields: ["phone"] },
      { fields: ["fullName"] },
    ],
  }
);
