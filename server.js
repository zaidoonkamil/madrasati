const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Op } = require("sequelize");
const sequelize = require("./config/db");
const { Product, Category } = require("./models");

const usersRouter = require("./routes/user");
const adsRouter = require("./routes/ads");
const categoriesRouter = require("./routes/categories");
const favoritedRouter = require("./routes/favorites");
const productsRouter = require("./routes/products");
const orderRouter = require("./routes/order");
const basketRouter = require("./routes/Basket");
const statsRouter = require("./routes/stats");
const notifications = require("./routes/notifications.js");
const chat = require("./routes/chatRoutes");

let whatsappRouter = null;
let startWhatsAppAutoInit = null;

try {
  whatsappRouter = require("./routes/whatsapp");
  ({ startWhatsAppAutoInit } = require("./services/waSender"));
  console.log("WhatsApp integration loaded successfully");
} catch (error) {
  console.error("WhatsApp integration disabled:", error.message);
}

async function cleanupProductsWithoutSubcategory() {
  const subcategories = await Category.findAll({
    where: {
      parentId: {
        [Op.not]: null,
      },
    },
    attributes: ["id"],
  });

  const validSubcategoryIds = subcategories.map((item) => item.id);
  const deletedCount = await Product.destroy({
    where: {
      [Op.or]: validSubcategoryIds.length
          ? [
              { categoryId: null },
              {
                categoryId: {
                  [Op.notIn]: validSubcategoryIds,
                },
              },
            ]
          : [{ id: { [Op.not]: null } }],
    },
  });

  if (deletedCount > 0) {
    console.log(`Deleted ${deletedCount} products not linked to subcategories`);
  }
}

sequelize
  .sync({ alter: true })
  .then(async () => {
    console.log("Database & tables synced!");
    await cleanupProductsWithoutSubcategory();
  })
  .catch((err) => {
    console.error("Error syncing database:", err);
  });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.json());
app.use("/uploads", express.static("./uploads"));

app.use("/", usersRouter);
app.use("/", adsRouter);
app.use("/", categoriesRouter);
app.use("/", favoritedRouter);
app.use("/", productsRouter);
app.use("/", orderRouter);
app.use("/", basketRouter);
app.use("/", notifications);
app.use("/", statsRouter);
app.use("/", chat.router);

if (whatsappRouter) {
  app.use("/", whatsappRouter);
} else {
  app.use("/whatsapp", (req, res) => {
    res.status(503).json({
      error: "WhatsApp service is not available on this server yet",
    });
  });
}

chat.initChatSocket(io);

if (startWhatsAppAutoInit) {
  startWhatsAppAutoInit();
}

server.listen(1008, () => {
  console.log("Server running on http://localhost:1008");
});
