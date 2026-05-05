const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    deliveryType: {
      type: DataTypes.ENUM("standard", "express_basra", "pickup"),
      allowNull: false,
      defaultValue: "standard",
    },
    status: {
      type: DataTypes.ENUM("pending", "delivery", "completed", "cancelled"),
      allowNull: false,
      defaultValue: "pending",
    },
    totalPrice: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = Order;
