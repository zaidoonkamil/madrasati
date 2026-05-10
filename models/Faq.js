const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Faq = sequelize.define("Faq", {
  question: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  answer: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
});

module.exports = Faq;
