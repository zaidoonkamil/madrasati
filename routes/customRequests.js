const express = require("express");
const multer = require("multer");
const { CustomRequest, User } = require("../models");

const router = express.Router();
const uploads = multer();

router.get("/custom-requests", async (req, res) => {
  try {
    const requests = await CustomRequest.findAll({
      order: [["createdAt", "DESC"]],
      include: [{ model: User, as: "user", attributes: ["id", "name", "phone"] }],
    });
    res.json(requests);
  } catch (error) {
    console.error("Error fetching custom requests:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/custom-requests/user/:userId", async (req, res) => {
  try {
    const requests = await CustomRequest.findAll({
      where: { userId: req.params.userId },
      order: [["createdAt", "DESC"]],
    });
    res.json(requests);
  } catch (error) {
    console.error("Error fetching user custom requests:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/custom-requests", uploads.none(), async (req, res) => {
  try {
    const userId = parseInt(req.body.userId);
    const description = (req.body.description || "").trim();
    if (!userId || !description) {
      return res.status(400).json({ error: "وصف الطلب مطلوب" });
    }

    const user = await User.findByPk(userId, { attributes: ["id"] });
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });

    const request = await CustomRequest.create({ userId, description });
    res.status(201).json(request);
  } catch (error) {
    console.error("Error creating custom request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/custom-requests/:id/status", uploads.none(), async (req, res) => {
  const statuses = ["pending", "reviewed", "completed", "cancelled"];
  try {
    const request = await CustomRequest.findByPk(req.params.id);
    if (!request) return res.status(404).json({ error: "الطلب غير موجود" });
    if (!statuses.includes(req.body.status)) {
      return res.status(400).json({ error: "حالة الطلب غير صحيحة" });
    }
    request.status = req.body.status;
    await request.save();
    res.json(request);
  } catch (error) {
    console.error("Error updating custom request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
