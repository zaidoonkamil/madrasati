const express = require("express");
const router = express.Router();
const { Order, OrderItem, Product, Basket, BasketItem, User, Coupon, CouponUsage } = require("../models");
const multer = require("multer");
const uploads = multer();
const { Op } = require("sequelize");
const { sendNotificationToUser } = require("../services/notifications");
const { normalizeCode, calculateDiscount } = require("./coupons");

const ORDER_STATUSES = ["pending", "delivery", "completed", "cancelled"];
const DELIVERY_TYPES = ["standard", "express_basra", "pickup"];

function normalizeOption(value) {
  const text = (value || "").toString().trim();
  return text.length ? text : null;
}

function validateProductOption(product, field, selectedValue, label) {
  const options = Array.isArray(product[field]) ? product[field] : [];
  if (options.length === 0) return null;
  if (!selectedValue) return `يرجى اختيار ${label} للمنتج ${product.title}`;
  if (!options.map((item) => item.toString()).includes(selectedValue)) {
    return `${label} المختار غير متوفر للمنتج ${product.title}`;
  }
  return null;
}

router.get("/orders/admin/status", async (req, res) => {
  const status = (req.query.status || "").trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 40;
  const offset = (page - 1) * limit;

  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }

  try {
    const { rows: orders, count: totalItems } = await Order.findAndCountAll({
      where: { status: { [Op.eq]: status } },
      order: [["createdAt", "DESC"]],
      offset,
      limit,
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ["id", "title", "price", "images", "userId"],
              include: [
                {
                  model: User,
                  as: "seller",
                  attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
                },
              ],
            },
          ],
        },
      ],
    });

    const ordersData = orders
      .map((order) => {
        const totalItemsOrder = order.OrderItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = order.totalPrice;

        return {
          id: order.id,
          phone: order.phone,
          secondaryPhone: order.secondaryPhone,
          address: order.address,
          deliveryType: order.deliveryType || "standard",
          status: order.status,
          createdAt: order.createdAt,
          totalItems: totalItemsOrder,
          totalPrice,
          discountAmount: order.discountAmount || 0,
          couponCode: order.couponCode,
          items: order.OrderItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            priceAtOrder: item.priceAtOrder,
            selectedColor: item.selectedColor,
            selectedSize: item.selectedSize,
            product: {
              id: item.Product.id,
              title: item.Product.title,
              price: item.Product.price,
              images: item.Product.images,
              seller: item.Product.seller,
            },
          })),
        };
      })
      .filter((order) => order.items.length > 0);

    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      orders: ordersData,
      paginationOrders: {
        currentPage: page,
        totalPages,
        totalItems,
      },
    });
  } catch (error) {
    console.error("Error fetching admin orders by status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/orders/:userId", uploads.none(), async (req, res) => {
  const userId = req.params.userId;
  const { phone, secondaryPhone, address, products } = req.body;
  const couponCode = normalizeCode(req.body.couponCode);
  const deliveryType = DELIVERY_TYPES.includes(req.body.deliveryType)
    ? req.body.deliveryType
    : "standard";

  if (deliveryType !== "pickup" && !address) {
    return res.status(400).json({ error: "رقم الهاتف والعنوان مطلوبان" });
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: "يجب تمرير قائمة المنتجات مع الكميات" });
  }

  try {
    const orderingUser = await User.findByPk(userId, {
      attributes: ["id", "phone"],
    });
    if (!orderingUser) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    if (!orderingUser.phone && !phone) {
      return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    }

    for (const item of products) {
      if (typeof item.productId !== "number" || typeof item.quantity !== "number" || item.quantity <= 0) {
        return res.status(400).json({ error: "بيانات المنتجات غير صحيحة" });
      }
    }

    const productIds = products.map((p) => p.productId);
    const dbProducts = await Product.findAll({
      where: { id: productIds },
      include: [{ model: User, as: "seller" }],
    });

    if (dbProducts.length !== products.length) {
      return res.status(400).json({ error: "منتجات غير موجودة في النظام" });
    }

    let totalPrice = 0;
    products.forEach((item) => {
      const prod = dbProducts.find((p) => p.id === item.productId);
      if (prod.stock < item.quantity) {
        throw new Error(`مخزون المنتج ${prod.title} غير كافٍ. المتوفر: ${prod.stock}`);
      }
      const selectedColor = normalizeOption(item.selectedColor);
      const selectedSize = normalizeOption(item.selectedSize);
      const colorError = validateProductOption(prod, "colors", selectedColor, "اللون");
      if (colorError) throw new Error(colorError);
      const sizeError = validateProductOption(prod, "sizes", selectedSize, "القياس");
      if (sizeError) throw new Error(sizeError);
      totalPrice += prod.price * item.quantity;
    });

    let coupon = null;
    let discountAmount = 0;
    if (couponCode) {
      coupon = await Coupon.findOne({ where: { code: couponCode, isActive: true } });
      if (!coupon) {
        return res.status(404).json({ error: "الكوبون غير صالح" });
      }

      const usage = await CouponUsage.findOne({ where: { userId, couponId: coupon.id } });
      if (usage) {
        return res.status(400).json({ error: "تم استخدام هذا الكوبون مسبقاً" });
      }

      discountAmount = calculateDiscount(coupon, totalPrice);
    }

    const order = await Order.create({
      userId,
      phone: orderingUser.phone || phone,
      secondaryPhone: secondaryPhone || null,
      address: address || "استلام من المتجر",
      deliveryType,
      totalPrice: Math.max(totalPrice - discountAmount, 0),
      discountAmount,
      couponCode: coupon ? coupon.code : null,
      status: "pending",
    });

    if (coupon) {
      await CouponUsage.create({
        userId,
        couponId: coupon.id,
        orderId: order.id,
      });
    }

    for (const item of products) {
      const prod = dbProducts.find((p) => p.id === item.productId);
      await OrderItem.create({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        priceAtOrder: prod.price,
        selectedColor: normalizeOption(item.selectedColor),
        selectedSize: normalizeOption(item.selectedSize),
      });

      prod.stock -= item.quantity;
      await prod.save();

      if (prod.seller) {
        const message = `تم طلب منتج: ${prod.title} (الكمية: ${item.quantity})`;
        const title = "طلب جديد";
        try {
          await sendNotificationToUser(prod.seller.id, message, title);
        } catch (notificationError) {
          console.error("Order notification failed:", notificationError);
        }
      }
    }

    try {
      const basket = await Basket.findOne({ where: { userId } });
      if (basket) {
        await BasketItem.destroy({ where: { basketId: basket.id } });
      }
    } catch (basketError) {
      console.error("Basket cleanup failed after order creation:", basketError);
    }

    return res.status(201).json({
      message: "تم إنشاء الطلب بنجاح",
      orderId: order.id,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

router.patch("/orders/:orderId/status", uploads.none(), async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
  }

  try {
    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: "user" }],
    });

    if (!order) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    order.status = status;
    await order.save();

    let notificationResult = null;

    if (order.user) {
      const message = `تم تحديث حالة طلبك إلى: ${status}`;
      const title = "تحديث حالة الطلب";
      notificationResult = await sendNotificationToUser(order.user.id, message, title);
    }

    res.status(200).json({
      message: "تم تحديث حالة الطلب",
      order,
      notificationResult,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/orders/:userId", uploads.none(), async (req, res) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(400).json({ error: "يرجى تحديد معرف المستخدم userId" });
  }

  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 20;
  if (page < 1) page = 1;

  const offset = (page - 1) * limit;

  try {
    const { count, rows: orders } = await Order.findAndCountAll({
      where: { userId },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ["price"],
            },
          ],
        },
      ],
    });

    const ordersData = orders
      .map((order) => {
        const totalItems = order.OrderItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = order.totalPrice;

        return {
          id: order.id,
          createdAt: order.createdAt,
          totalItems,
          totalPrice,
          discountAmount: order.discountAmount || 0,
          couponCode: order.couponCode,
          status: order.status,
          deliveryType: order.deliveryType || "standard",
        };
      })
      .filter((order) => order.totalItems > 0);

    const totalPages = Math.ceil(count / limit);

    res.json({
      totalItems: count,
      totalPages,
      currentPage: page,
      paginationOrdersUser: {
        totalItems: count,
        totalPages,
        currentPage: page,
      },
      orders: ordersData,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;

