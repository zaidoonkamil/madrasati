const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CustomRequest = sequelize.define("CustomRequest", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("pending", "reviewed", "completed", "cancelled"),
    allowNull: false,
    defaultValue: "pending",
  },
});

module.exports = CustomRequest;
