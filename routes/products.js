const express = require("express");
const router = express.Router();
const { Op, fn, col, where } = require("sequelize");
const { Product, User, Category } = require("../models");
const upload = require("../middlewares/uploads");

function subcategoryInclude(required = true) {
  return {
    model: Category,
    as: "category",
    attributes: ["id", "name", "name_ar", "name_ckb", "parentId"],
    required,
    where: {
      parentId: {
        [Op.not]: null,
      },
    },
  };
}

router.post("/products", upload.array("images", 5), async (req, res) => {
  const {
    title,
    description,
    price,
    userId,
    categoryId,
    title_ar,
    title_ckb,
    description_ar,
    description_ckb,
    stock,
  } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: "العنوان والسعر مطلوبان" });
  }

  const stockValue = parseInt(stock) || 0;
  if (stockValue < 0) {
    return res.status(400).json({ error: "المخزون يجب أن يكون صفراً أو أكثر" });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "يجب رفع صورة واحدة على الأقل" });
  }

  try {
    const category = await Category.findByPk(categoryId);
    if (!category || !category.parentId) {
      return res.status(400).json({ error: "يجب اختيار قسم فرعي صالح للمنتج" });
    }

    const images = req.files.map((file) => file.filename);

    const product = await Product.create({
      title,
      description,
      title_ar: title_ar || null,
      title_ckb: title_ckb || null,
      description_ar: description_ar || null,
      description_ckb: description_ckb || null,
      price,
      stock: stockValue,
      images,
      userId,
      categoryId,
    });

    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/products/search", async (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  const userId = parseInt(req.query.userId);
  const categoryId = parseInt(req.query.categoryId);
  const minPrice = parseInt(req.query.minPrice);
  const maxPrice = parseInt(req.query.maxPrice);
  const availableOnly = req.query.availableOnly === "true";
  const favoritesOnly = req.query.favoritesOnly === "true";
  const sortBy = req.query.sortBy || "relevance";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const hasFilters =
    !Number.isNaN(categoryId) ||
    !Number.isNaN(minPrice) ||
    !Number.isNaN(maxPrice) ||
    availableOnly ||
    favoritesOnly ||
    sortBy !== "relevance";

  if ((!query || query.length < 2) && !hasFilters) {
    return res.json({
      totalItems: 0,
      totalPages: 0,
      currentPage: page,
      products: [],
    });
  }

  try {
    const include = [
      {
        model: User,
        as: "seller",
        attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
        required: false,
      },
      subcategoryInclude(true),
    ];

    if (!Number.isNaN(userId) && userId > 0) {
      include.push({
        model: User,
        as: "favoritedByUsers",
        where: { id: userId },
        required: favoritesOnly,
        attributes: ["id"],
        through: { attributes: [] },
      });
    }

    const startsWithQuery = Product.sequelize.escape(`${query}%`);
    const containsQuery = Product.sequelize.escape(`%${query}%`);
    const productWhere = {};

    if (query && query.length >= 2) {
      productWhere[Op.or] = [
        where(fn("LOWER", col("Product.title")), { [Op.like]: `%${query}%` }),
        where(fn("LOWER", col("Product.description")), { [Op.like]: `%${query}%` }),
        where(fn("LOWER", fn("COALESCE", col("Product.title_ar"), "")), { [Op.like]: `%${query}%` }),
        where(fn("LOWER", fn("COALESCE", col("Product.title_ckb"), "")), { [Op.like]: `%${query}%` }),
        where(fn("LOWER", fn("COALESCE", col("Product.description_ar"), "")), { [Op.like]: `%${query}%` }),
        where(fn("LOWER", fn("COALESCE", col("Product.description_ckb"), "")), { [Op.like]: `%${query}%` }),
      ];
    }

    if (!Number.isNaN(categoryId)) {
      productWhere.categoryId = categoryId;
    }

    if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
      productWhere.price = {};
      if (!Number.isNaN(minPrice)) productWhere.price[Op.gte] = minPrice;
      if (!Number.isNaN(maxPrice)) productWhere.price[Op.lte] = maxPrice;
    }

    if (availableOnly) {
      productWhere.stock = { [Op.gt]: 0 };
    }

    let order = [];
    switch (sortBy) {
      case "price_low":
        order = [["price", "ASC"]];
        break;
      case "price_high":
        order = [["price", "DESC"]];
        break;
      case "newest":
        order = [["createdAt", "DESC"]];
        break;
      case "name":
        order = [["title", "ASC"]];
        break;
      case "relevance":
      default:
        order =
          query && query.length >= 2
            ? [
                [
                  Product.sequelize.literal(`
                    CASE
                      WHEN LOWER(COALESCE(Product.title_ar, Product.title_ckb, Product.title, '')) LIKE ${startsWithQuery} THEN 0
                      WHEN LOWER(COALESCE(Product.description_ar, Product.description_ckb, Product.description, '')) LIKE ${startsWithQuery} THEN 1
                      WHEN LOWER(COALESCE(Product.title_ar, Product.title_ckb, Product.title, '')) LIKE ${containsQuery} THEN 2
                      WHEN LOWER(COALESCE(Product.description_ar, Product.description_ckb, Product.description, '')) LIKE ${containsQuery} THEN 3
                      ELSE 4
                    END
                  `),
                  "ASC",
                ],
                ["createdAt", "DESC"],
              ]
            : [["createdAt", "DESC"]];
        break;
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where: productWhere,
      include,
      distinct: true,
      limit,
      offset,
      order,
    });

    const productsWithFavorite = products.map((product) => {
      const prodJson = product.toJSON();
      prodJson.isFavorite = !!(
        prodJson.favoritedByUsers && prodJson.favoritedByUsers.length > 0
      );
      delete prodJson.favoritedByUsers;
      return prodJson;
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      products: productsWithFavorite,
    });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/products/featured", async (req, res) => {
  const userId = parseInt(req.query.userId);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 8;
  const offset = (page - 1) * limit;

  try {
    const include = [
      {
        model: User,
        as: "seller",
        attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
        required: false,
      },
      subcategoryInclude(true),
    ];

    if (!Number.isNaN(userId) && userId > 0) {
      include.push({
        model: User,
        as: "favoritedByUsers",
        where: { id: userId },
        required: false,
        attributes: ["id"],
        through: { attributes: [] },
      });
    }

    const { count, rows: products } = await Product.findAndCountAll({
      include,
      distinct: true,
      limit,
      offset,
      order: [Product.sequelize.random()],
    });

    const productsWithFavorite = products.map((product) => {
      const prodJson = product.toJSON();
      prodJson.isFavorite = !!(
        prodJson.favoritedByUsers && prodJson.favoritedByUsers.length > 0
      );
      delete prodJson.favoritedByUsers;
      return prodJson;
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      products: productsWithFavorite,
    });
  } catch (error) {
    console.error("Error fetching featured products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/products/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 40;
    const offset = (page - 1) * limit;

    const { count, rows: products } = await Product.findAndCountAll({
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
          required: false,
        },
        subcategoryInclude(true),
        {
          model: User,
          as: "favoritedByUsers",
          where: { id: userId },
          required: false,
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
      distinct: true,
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

    const totalPages = Math.ceil(count / limit);

    res.json({
      totalItems: count,
      totalPages,
      currentPage: page,
      products: productsWithFavorite,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/productItem/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
        },
        subcategoryInclude(false),
      ],
    });

    if (!product) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


router.patch("/products/:id", upload.none(), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    const allowedFields = ["title", "description", "price", "stock"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        product[field] = field === "price" || field === "stock"
          ? parseInt(req.body[field]) || 0
          : req.body[field];
      }
    }

    if (product.price < 0 || product.stock < 0) {
      return res.status(400).json({ error: "السعر والمخزون يجب أن يكونا صفراً أو أكثر" });
    }

    await product.save();
    return res.status(200).json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
router.delete("/products/:id", async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    await product.destroy();
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/products/seller/:sellerId", async (req, res) => {
  const sellerId = req.params.sellerId;

  try {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: products } = await Product.findAndCountAll({
      where: { userId: sellerId },
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
          required: false,
        },
        subcategoryInclude(true),
      ],
      distinct: true,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      totalItems: count,
      totalPages,
      currentPage: page,
      products,
    });
  } catch (error) {
    console.error("Error fetching seller products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;

