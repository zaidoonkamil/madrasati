const express = require("express");
const multer = require("multer");
const { Faq } = require("../models");

const router = express.Router();
const uploads = multer();

router.get("/faqs", async (req, res) => {
  try {
    const where = req.query.all === "true" ? {} : { isActive: true };
    const faqs = await Faq.findAll({ where, order: [["createdAt", "DESC"]] });
    res.json(faqs);
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/faqs", uploads.none(), async (req, res) => {
  try {
    const question = (req.body.question || "").trim();
    const answer = (req.body.answer || "").trim();
    if (!question || !answer) {
      return res.status(400).json({ error: "السؤال والجواب مطلوبان" });
    }
    const faq = await Faq.create({ question, answer, isActive: true });
    res.status(201).json(faq);
  } catch (error) {
    console.error("Error creating FAQ:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/faqs/:id", uploads.none(), async (req, res) => {
  try {
    const faq = await Faq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ error: "السؤال غير موجود" });

    if (req.body.question !== undefined) faq.question = req.body.question.trim();
    if (req.body.answer !== undefined) faq.answer = req.body.answer.trim();
    if (req.body.isActive !== undefined) {
      faq.isActive = req.body.isActive === true || req.body.isActive === "true";
    }

    await faq.save();
    res.json(faq);
  } catch (error) {
    console.error("Error updating FAQ:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/faqs/:id", async (req, res) => {
  try {
    const faq = await Faq.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ error: "السؤال غير موجود" });
    await faq.destroy();
    res.json({ message: "تم حذف السؤال" });
  } catch (error) {
    console.error("Error deleting FAQ:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
