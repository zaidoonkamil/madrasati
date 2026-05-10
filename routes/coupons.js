const express = require("express");
const router = express.Router();
const multer = require("multer");
const uploads = multer();
const { Coupon, CouponUsage } = require("../models");

function normalizeCode(code) {
  return (code || "").trim().toUpperCase();
}

function calculateDiscount(coupon, totalPrice) {
  if (coupon.type === "fixed") {
    return Math.min(coupon.value, totalPrice);
  }
  return Math.min((totalPrice * coupon.value) / 100, totalPrice);
}

router.get("/coupons", async (req, res) => {
  try {
    const coupons = await Coupon.findAll({ order: [["createdAt", "DESC"]] });
    res.json(coupons);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/coupons", uploads.none(), async (req, res) => {
  try {
    const code = normalizeCode(req.body.code);
    const type = req.body.type === "fixed" ? "fixed" : "percentage";
    const value = parseFloat(req.body.value);

    if (!code || Number.isNaN(value) || value <= 0) {
      return res.status(400).json({ error: "بيانات الكوبون غير صحيحة" });
    }
    if (type === "percentage" && value > 100) {
      return res.status(400).json({ error: "نسبة الخصم لا يمكن أن تتجاوز 100%" });
    }

    const coupon = await Coupon.create({ code, type, value, isActive: true });
    res.status(201).json(coupon);
  } catch (error) {
    console.error("Error creating coupon:", error);
    res.status(500).json({ error: "الكوبون موجود أو حدث خطأ" });
  }
});

router.patch("/coupons/:id", uploads.none(), async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ error: "الكوبون غير موجود" });

    if (req.body.code !== undefined) coupon.code = normalizeCode(req.body.code);
    if (req.body.type !== undefined) {
      coupon.type = req.body.type === "fixed" ? "fixed" : "percentage";
    }
    if (req.body.value !== undefined) coupon.value = parseFloat(req.body.value) || 0;
    if (req.body.isActive !== undefined) {
      coupon.isActive = req.body.isActive === true || req.body.isActive === "true";
    }

    await coupon.save();
    res.json(coupon);
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/coupons/validate", uploads.none(), async (req, res) => {
  try {
    const code = normalizeCode(req.body.code);
    const userId = parseInt(req.body.userId);
    const totalPrice = parseFloat(req.body.totalPrice) || 0;

    const coupon = await Coupon.findOne({ where: { code, isActive: true } });
    if (!coupon) return res.status(404).json({ error: "الكوبون غير صالح" });

    const usage = await CouponUsage.findOne({ where: { userId, couponId: coupon.id } });
    if (usage) return res.status(400).json({ error: "تم استخدام هذا الكوبون مسبقاً" });

    const discountAmount = calculateDiscount(coupon, totalPrice);
    res.json({
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountAmount,
      finalTotal: Math.max(totalPrice - discountAmount, 0),
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = { router, normalizeCode, calculateDiscount };
