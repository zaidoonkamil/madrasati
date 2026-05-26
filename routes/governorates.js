const express = require("express");
const router = express.Router();
const multer = require("multer");
const uploads = multer();
const { Governorate } = require("../models");

const IRAQI_GOVERNORATES = [
  { name: "بغداد", deliveryPrice: 5000 },
  { name: "البصرة", deliveryPrice: 3000 },
  { name: "نينوى", deliveryPrice: 7000 },
  { name: "أربيل", deliveryPrice: 8000 },
  { name: "كركوك", deliveryPrice: 7000 },
  { name: "ديالى", deliveryPrice: 6000 },
  { name: "الأنبار", deliveryPrice: 7000 },
  { name: "بابل", deliveryPrice: 5000 },
  { name: "كربلاء", deliveryPrice: 5000 },
  { name: "واسط", deliveryPrice: 5000 },
  { name: "صلاح الدين", deliveryPrice: 7000 },
  { name: "النجف", deliveryPrice: 5000 },
  { name: "المثنى", deliveryPrice: 6000 },
  { name: "القادسية", deliveryPrice: 6000 },
  { name: "ذي قار", deliveryPrice: 5000 },
  { name: "ميسان", deliveryPrice: 5000 },
  { name: "دهوك", deliveryPrice: 8000 },
  { name: "السليمانية", deliveryPrice: 8000 },
];

// Seed default governorates if table is empty
async function seedGovernoratesIfEmpty() {
  const count = await Governorate.count();
  if (count === 0) {
    await Governorate.bulkCreate(IRAQI_GOVERNORATES);
    console.log("Seeded Iraqi governorates");
  }
}

seedGovernoratesIfEmpty().catch((err) =>
  console.error("Governorate seed error:", err)
);

// GET /governorates — active only (for users)
router.get("/governorates", async (req, res) => {
  try {
    const governorates = await Governorate.findAll({
      where: { isActive: true },
      order: [["name", "ASC"]],
      attributes: ["id", "name", "deliveryPrice"],
    });
    res.json(governorates);
  } catch (error) {
    console.error("Error fetching governorates:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /governorates/admin — all governorates (for admin)
router.get("/governorates/admin", async (req, res) => {
  try {
    const governorates = await Governorate.findAll({
      order: [["name", "ASC"]],
    });
    res.json(governorates);
  } catch (error) {
    console.error("Error fetching admin governorates:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /governorates — admin add governorate
router.post("/governorates", uploads.none(), async (req, res) => {
  const { name, deliveryPrice } = req.body;

  if (!name || deliveryPrice === undefined) {
    return res.status(400).json({ error: "الاسم والسعر مطلوبان" });
  }

  const price = parseFloat(deliveryPrice);
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ error: "سعر التوصيل غير صحيح" });
  }

  try {
    const existing = await Governorate.findOne({ where: { name: name.trim() } });
    if (existing) {
      return res.status(400).json({ error: "المحافظة موجودة مسبقاً" });
    }

    const governorate = await Governorate.create({
      name: name.trim(),
      deliveryPrice: price,
      isActive: true,
    });

    res.status(201).json(governorate);
  } catch (error) {
    console.error("Error creating governorate:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PATCH /governorates/:id — admin update price, name, or active status
router.patch("/governorates/:id", uploads.none(), async (req, res) => {
  const { id } = req.params;
  const { name, deliveryPrice, isActive } = req.body;

  try {
    const governorate = await Governorate.findByPk(id);
    if (!governorate) {
      return res.status(404).json({ error: "المحافظة غير موجودة" });
    }

    if (name !== undefined) {
      governorate.name = name.trim();
    }

    if (deliveryPrice !== undefined) {
      const price = parseFloat(deliveryPrice);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ error: "سعر التوصيل غير صحيح" });
      }
      governorate.deliveryPrice = price;
    }

    if (isActive !== undefined) {
      governorate.isActive = isActive === true || isActive === "true";
    }

    await governorate.save();
    res.json(governorate);
  } catch (error) {
    console.error("Error updating governorate:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /governorates/:id — admin delete governorate
router.delete("/governorates/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const governorate = await Governorate.findByPk(id);
    if (!governorate) {
      return res.status(404).json({ error: "المحافظة غير موجودة" });
    }

    await governorate.destroy();
    res.json({ message: "تم حذف المحافظة" });
  } catch (error) {
    console.error("Error deleting governorate:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
