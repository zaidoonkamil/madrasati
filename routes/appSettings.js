const express = require("express");
const router = express.Router();
const multer = require("multer");
const uploads = multer();
const { AppSetting } = require("../models");

const DEFAULT_SOCIAL_SETTINGS = {
  showSocialLinks: true,
};

const DEFAULT_DELIVERY_SETTINGS = {
  expressBasraPrice: 2000,
};

async function getSetting(key, defaultValue) {
  const row = await AppSetting.findOne({ where: { key } });
  return row ? row.value : defaultValue;
}

router.get("/app-settings/social", async (req, res) => {
  try {
    const value = await getSetting("social", DEFAULT_SOCIAL_SETTINGS);
    res.json({ ...DEFAULT_SOCIAL_SETTINGS, ...value });
  } catch (error) {
    console.error("Error fetching social settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/app-settings/social", uploads.none(), async (req, res) => {
  try {
    const showSocialLinks =
      req.body.showSocialLinks === true || req.body.showSocialLinks === "true";
    const value = { showSocialLinks };
    const [row] = await AppSetting.findOrCreate({
      where: { key: "social" },
      defaults: { value },
    });
    row.value = value;
    await row.save();
    res.json(value);
  } catch (error) {
    console.error("Error updating social settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /app-settings/delivery
router.get("/app-settings/delivery", async (req, res) => {
  try {
    const value = await getSetting("delivery", DEFAULT_DELIVERY_SETTINGS);
    res.json({ ...DEFAULT_DELIVERY_SETTINGS, ...value });
  } catch (error) {
    console.error("Error fetching delivery settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /app-settings/delivery — admin update express basra price
router.patch("/app-settings/delivery", uploads.none(), async (req, res) => {
  try {
    const expressBasraPrice = parseFloat(req.body.expressBasraPrice);
    if (isNaN(expressBasraPrice) || expressBasraPrice < 0) {
      return res.status(400).json({ error: "سعر التوصيل السريع غير صحيح" });
    }

    const value = { expressBasraPrice };
    const [row] = await AppSetting.findOrCreate({
      where: { key: "delivery" },
      defaults: { value },
    });
    row.value = value;
    await row.save();
    res.json(value);
  } catch (error) {
    console.error("Error updating delivery settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
