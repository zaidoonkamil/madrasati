const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Ads = sequelize.define("ads", {
    images: {
        type: DataTypes.JSON,
        allowNull: false
      },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    title_ar: {
        type: DataTypes.STRING,
        allowNull: true
    },
    title_ckb: {
        type: DataTypes.STRING,
        allowNull: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    description_ar: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    description_ckb: {
        type: DataTypes.TEXT,
        allowNull: true
    },
}, {
    timestamps: true
});

module.exports = Ads;
