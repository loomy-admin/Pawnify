import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface UserAttributes {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: "ADMIN" | "STAFF";
  phone?: string | null;
  isActive: boolean;
  passwordHash?: string | null;
  hiddenPasswordHash?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  "emailVerified" | "role" | "isActive" | "image" | "phone" | "passwordHash" | "hiddenPasswordHash" | "createdAt" | "updatedAt"
>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare name: string;
  declare email: string;
  declare emailVerified: boolean;
  declare image: string | null;
  declare role: "ADMIN" | "STAFF";
  declare phone: string | null;
  declare isActive: boolean;
  declare passwordHash: string | null;
  declare hiddenPasswordHash: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.STRING(191),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(191),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(191),
      allowNull: false,
      unique: true,
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    image: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM("ADMIN", "STAFF"),
      defaultValue: "STAFF",
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hiddenPasswordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "user",
    timestamps: true,
  }
);
