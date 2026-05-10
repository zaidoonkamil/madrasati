const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Coupon = sequelize.define("Coupon", {
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  type: {
    type: DataTypes.ENUM("percentage", "fixed"),
    allowNull: false,
    defaultValue: "percentage",
  },
  value: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
});

module.exports = Coupon;
