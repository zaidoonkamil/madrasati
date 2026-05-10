const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CouponUsage = sequelize.define("CouponUsage", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  couponId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

module.exports = CouponUsage;
