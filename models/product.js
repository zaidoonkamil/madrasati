const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Product = sequelize.define("Product", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    title_ar: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    title_ckb: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    description_ar: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    description_ckb: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    lowStockAlert: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
    },
    colors: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    sizes: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    images: {
        type: DataTypes.JSON,
        allowNull: false,
    }
}, {
    timestamps: true,
});


module.exports = Product;

