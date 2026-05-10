const { DataTypes } = require("sequelize");

async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch (error) {
    return false;
  }
}

async function ensureColumn(queryInterface, tableName, columnName, definition) {
  const exists = await tableExists(queryInterface, tableName);
  if (!exists) return;

  const table = await queryInterface.describeTable(tableName);
  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
    console.log(`Added missing column ${tableName}.${columnName}`);
  }
}

async function ensureAppSettingsTable(queryInterface) {
  if (await tableExists(queryInterface, "AppSettings")) return;

  await queryInterface.createTable("AppSettings", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  console.log("Created missing AppSettings table");
}

async function ensureCouponsTable(queryInterface) {
  if (await tableExists(queryInterface, "Coupons")) return;

  await queryInterface.createTable("Coupons", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  console.log("Created missing Coupons table");
}

async function ensureCouponUsagesTable(queryInterface) {
  if (await tableExists(queryInterface, "CouponUsages")) return;

  await queryInterface.createTable("CouponUsages", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  console.log("Created missing CouponUsages table");
}

async function ensureSchema(sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  await ensureAppSettingsTable(queryInterface);
  await ensureCouponsTable(queryInterface);
  await ensureCouponUsagesTable(queryInterface);

  await ensureColumn(queryInterface, "Products", "colors", {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "Products", "sizes", {
    type: DataTypes.JSON,
    allowNull: true,
  });

  await ensureColumn(queryInterface, "BasketItems", "selectedColor", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "BasketItems", "selectedSize", {
    type: DataTypes.STRING,
    allowNull: true,
  });

  await ensureColumn(queryInterface, "OrderItems", "selectedColor", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, "OrderItems", "selectedSize", {
    type: DataTypes.STRING,
    allowNull: true,
  });

  await ensureColumn(queryInterface, "Orders", "discountAmount", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await ensureColumn(queryInterface, "Orders", "couponCode", {
    type: DataTypes.STRING,
    allowNull: true,
  });
}

module.exports = ensureSchema;
