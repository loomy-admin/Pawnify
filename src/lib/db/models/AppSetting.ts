import { DataTypes, Model } from "sequelize";
import { sequelize } from "../sequelize";

export interface AppSettingAttributes {
  key: string;
  value: string;
}

export class AppSetting extends Model<AppSettingAttributes> implements AppSettingAttributes {
  declare key: string;
  declare value: string;
}

AppSetting.init(
  {
    key: {
      type: DataTypes.STRING(191),
      primaryKey: true,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "app_settings",
    timestamps: false,
  }
);
