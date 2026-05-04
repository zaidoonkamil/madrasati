const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Op } = require("sequelize");
const uploadImage = require("../middlewares/uploads");
const { User, UserDevice } = require("../models");
const { createOtp, deleteOtpByCode, normalizePhone, verifyOtp } = require("../services/otpService");
const { ensureWhatsAppReady, sendWhatsAppText } = require("../services/waSender");

const saltRounds = 10;
const router = express.Router();
const upload = multer();

const OTP_PURPOSES = {
  activation: "activation",
  passwordReset: "password_reset",
};

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "700d" }
  );

function parseOtpPurpose(purpose) {
  return purpose === OTP_PURPOSES.passwordReset
    ? OTP_PURPOSES.passwordReset
    : OTP_PURPOSES.activation;
}

async function sendOtpForPurpose(phone, purpose) {
  await ensureWhatsAppReady();
  const otp = await createOtp(phone, purpose);

  const purposeLabel =
    purpose === OTP_PURPOSES.passwordReset
      ? "إعادة تعيين كلمة المرور"
      : "تفعيل الحساب";

  const message = [
    `رمز ${purposeLabel} الخاص بك هو: ${otp.code}`,
    `صالح لمدة ${Math.floor(otp.expiresInSeconds / 60)} دقائق.`,
    "لا تشارك هذا الرمز مع أي شخص.",
  ].join("\n");

  try {
    await sendWhatsAppText(otp.phone, message);
    return otp;
  } catch (error) {
    await deleteOtpByCode(otp.phone, otp.code, purpose);
    throw error;
  }
}

router.post("/send-otp", upload.none(), async (req, res) => {
  try {
    const purpose = parseOtpPurpose(req.body.purpose);
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (purpose === OTP_PURPOSES.activation && user.isVerified) {
      return res.status(400).json({ error: "Account is already verified" });
    }

    const otp = await sendOtpForPurpose(phone, purpose);

    return res.status(200).json({
      success: true,
      phone: otp.phone,
      purpose,
      expiresInSeconds: otp.expiresInSeconds,
      retryAfterSeconds: otp.retryAfterSeconds,
      message: "OTP sent successfully",
    });
  } catch (error) {
    if (error.response?.data) {
      console.error("Error sending OTP:", error.response.data);
    } else {
      console.error("Error sending OTP:", error.message);
    }
    return res.status(400).json({ error: error.message || "Failed to send OTP" });
  }
});

router.post("/verify-otp", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || "").trim();
    const purpose = parseOtpPurpose(req.body.purpose);

    if (!phone || !code) {
      return res.status(400).json({ error: "phone and code are required" });
    }

    await verifyOtp(phone, code, purpose);

    if (purpose === OTP_PURPOSES.activation) {
      const user = await User.findOne({ where: { phone } });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      user.isVerified = true;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      purpose,
      message:
        purpose === OTP_PURPOSES.activation
          ? "Account verified successfully"
          : "OTP verified successfully",
    });
  } catch (error) {
    console.error("Error verifying OTP:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to verify OTP" });
  }
});

router.post("/forgot-password/request", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: "Phone number is not registered" });
    }

    const otp = await sendOtpForPurpose(phone, OTP_PURPOSES.passwordReset);

    return res.status(200).json({
      success: true,
      phone: otp.phone,
      expiresInSeconds: otp.expiresInSeconds,
      retryAfterSeconds: otp.retryAfterSeconds,
      message: "Password reset OTP sent successfully",
    });
  } catch (error) {
    console.error("Forgot password request error:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to send reset OTP" });
  }
});

router.post("/forgot-password/reset", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.code || "").trim();
    const password = String(req.body.password || "").trim();

    if (!phone || !code || !password) {
      return res.status(400).json({ error: "phone, code and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    await verifyOtp(phone, code, OTP_PURPOSES.passwordReset);

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.password = await bcrypt.hash(password, saltRounds);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Forgot password reset error:", error.message || error);
    return res.status(400).json({ error: error.message || "Failed to reset password" });
  }
});

router.post("/users", uploadImage.array("images", 5), async (req, res) => {
  const { name, location, password, role = "user" } = req.body;
  let { phone } = req.body;

  try {
    phone = normalizePhone(phone);

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "Allowed role values are admin or user" });
    }

    if (!name || !phone || !location || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) {
      return res.status(400).json({ error: "Phone number is already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const images =
      req.files && Array.isArray(req.files)
        ? req.files.map((file) => file.filename)
        : [];

    const user = await User.create({
      name,
      phone,
      location,
      password: hashedPassword,
      role,
      isVerified: role === "admin",
      image: images.length > 0 ? images[0] : null,
    });

    return res.status(201).json({
      id: user.id,
      image: user.image,
      name: user.name,
      phone: user.phone,
      location: user.location,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    console.error("Error creating user:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/login", upload.none(), async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password are required" });
    }

    const user = await User.findOne({ where: { phone } });
    if (!user) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        error: "Your account is not verified yet",
        code: "ACCOUNT_NOT_VERIFIED",
        phone: user.phone,
        isVerified: false,
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        isVerified: user.isVerified,
        role: user.role,
        location: user.location,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByPk(id, {
      include: { model: UserDevice, as: "devices" },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await user.destroy();

    return res.status(200).json({ message: "User and devices deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

router.get("/verify-token", (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.json({ valid: false, message: "Token is missing" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.json({ valid: false, message: "Invalid token" });
    }
    return res.json({ valid: true, data: decoded });
  });
});

router.get("/usersOnly", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      where: { role: "user" },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      users,
      pagination: {
        totalUsers: count,
        currentPage: page,
        totalPages,
        limit,
      },
    });
  } catch (err) {
    console.error("Error fetching users with pagination:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/user/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.status(200).json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/profile", async (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: "Token is missing" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid token" });
    }

    try {
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.status(200).json(user);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

module.exports = router;
