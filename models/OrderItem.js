const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const OrderItem = sequelize.define("OrderItem", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  priceAtOrder: { 
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  selectedColor: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  selectedSize: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: false,
});

module.exports = OrderItem;
