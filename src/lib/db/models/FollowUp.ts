import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../sequelize";

export interface FollowUpAttributes {
  id: string;
  loanId: string;
  note: string;
  dueDate: Date;
  status: "PENDING" | "DONE" | "CANCELLED";
  assignedToId?: string | null;
  createdAt?: Date;
}

export type FollowUpCreationAttributes = Optional<
  FollowUpAttributes,
  "id" | "status" | "assignedToId" | "createdAt"
>;

export class FollowUp extends Model<FollowUpAttributes, FollowUpCreationAttributes> implements FollowUpAttributes {
  declare id: string;
  declare loanId: string;
  declare note: string;
  declare dueDate: Date;
  declare status: "PENDING" | "DONE" | "CANCELLED";
  declare assignedToId: string | null;
  declare readonly createdAt: Date;
}

FollowUp.init(
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
    note: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "DONE", "CANCELLED"),
      defaultValue: "PENDING",
    },
    assignedToId: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "follow_ups",
    timestamps: true,
    updatedAt: false,
  }
);
