const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const AppSetting = sequelize.define("AppSetting", {
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  value: {
    type: DataTypes.JSON,
    allowNull: false,
  },
});

module.exports = AppSetting;
