const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { Category, Product, User } = require("../models");
const upload = require("../middlewares/uploads");

const categoryImageError = "يجب رفع صورة واحدة على الأقل";

async function validateParentCategory(parentId) {
  if (!parentId) {
    return null;
  }

  const parentCategory = await Category.findByPk(parentId);
  if (!parentCategory) {
    return { error: "القسم الرئيسي غير موجود" };
  }

  if (parentCategory.parentId) {
    return { error: "لا يمكن إنشاء قسم فرعي داخل قسم فرعي آخر" };
  }

  return { parentCategory };
}

router.post("/categories", upload.array("images", 5), async (req, res) => {
  const { name, name_ar, name_ckb, parentId } = req.body;

  if (!name) {
    return res.status(400).json({ error: "اسم القسم مطلوب" });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: categoryImageError });
  }

  try {
    const parentValidation = await validateParentCategory(parentId || null);
    if (parentValidation?.error) {
      return res.status(400).json({ error: parentValidation.error });
    }

    const images = req.files.map((file) => file.filename);
    if (!images.length) {
      return res.status(400).json({ error: categoryImageError });
    }

    const category = await Category.create({
      name,
      name_ar: name_ar || null,
      name_ckb: name_ckb || null,
      parentId: parentId || null,
      images,
    });

    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/categories", upload.none(), async (req, res) => {
  const all = req.query.all === "true";
  const parentId = req.query.parentId;

  try {
    if (all) {
      const categories = await Category.findAll({
        order: [
          ["parentId", "ASC"],
          ["createdAt", "DESC"],
        ],
      });
      return res.json(categories);
    }

    if (parentId) {
      const subcategories = await Category.findAll({
        where: { parentId },
        order: [["createdAt", "DESC"]],
      });
      return res.json(subcategories);
    }

    const categories = await Category.findAll({
      where: { parentId: null },
      include: [
        {
          model: Category,
          as: "subcategories",
          required: false,
          order: [["createdAt", "DESC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/categories/:id", upload.none(), async (req, res) => {
  const categoryId = req.params.id;

  try {
    const category = await Category.findByPk(categoryId, {
      include: [
        {
          model: Category,
          as: "subcategories",
          required: false,
        },
        {
          model: Category,
          as: "parent",
          required: false,
        },
      ],
    });

    if (!category) {
      return res.status(404).json({ error: "القسم غير موجود" });
    }

    res.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/categories/:id/subcategories", upload.none(), async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ error: "القسم غير موجود" });
    }

    const subcategories = await Category.findAll({
      where: { parentId: category.id },
      order: [["createdAt", "DESC"]],
    });

    res.json(subcategories);
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/categories/:id/products", async (req, res) => {
  const categoryId = req.params.id;
  const userId = parseInt(req.query.userId) || null;
  let page = parseInt(req.query.page) || 1;
  let pageSize = parseInt(req.query.pageSize) || 10;

  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  try {
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ error: "القسم غير موجود" });
    }

    if (!category.parentId) {
      return res.json({
        page,
        pageSize,
        totalItems: 0,
        totalPages: 0,
        products: [],
      });
    }

    const include = [
      {
        model: User,
        as: "seller",
        attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
        required: false,
      },
    ];

    if (userId) {
      include.push({
        model: User,
        as: "favoritedByUsers",
        where: { id: userId },
        required: false,
        attributes: ["id"],
        through: { attributes: [] },
      });
    }

    const { rows: products, count } = await Product.findAndCountAll({
      where: { categoryId },
      include,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const productsWithFavorite = products.map((product) => {
      const isFavorite = product.favoritedByUsers && product.favoritedByUsers.length > 0;
      const prodJson = product.toJSON();
      prodJson.isFavorite = isFavorite;
      delete prodJson.favoritedByUsers;
      return prodJson;
    });

    res.json({
      page,
      pageSize,
      totalItems: count,
      totalPages: Math.ceil(count / pageSize),
      products: productsWithFavorite,
    });
  } catch (error) {
    console.error("Error fetching products for category:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  const categoryId = req.params.id;

  try {
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ error: "القسم غير موجود" });
    }

    await category.destroy();
    res.json({ message: "تم حذف القسم بنجاح" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
