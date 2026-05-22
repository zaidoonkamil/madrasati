const express = require("express");
const router = express.Router();
const { Op, fn, col, where } = require("sequelize");
const { Product, User, Category, ProductRecommendation } = require("../models");
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

function parseTextOptions(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => item.toString().trim()).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => item.toString().trim()).filter(Boolean);
    }
  } catch (_) {}
  return value
    .toString()
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNumberText(value) {
  if (value === null || value === undefined) return "";
  return value
    .toString()
    .trim()
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    .replace(/,/g, "")
    .replace(/،/g, "")
    .replace(/\s+/g, "");
}

function parsePositiveNumber(value) {
  const number = Number(normalizeNumberText(value));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseNonNegativeInteger(value, fallback = 0) {
  const number = Number(normalizeNumberText(value));
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function parseProductIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => parseInt(item)).filter((item) => !Number.isNaN(item));
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => parseInt(item)).filter((item) => !Number.isNaN(item));
    }
  } catch (_) {}
  return value
    .toString()
    .split(",")
    .map((item) => parseInt(item.trim()))
    .filter((item) => !Number.isNaN(item));
}

async function productListWithFavorite(products, userId) {
  let favoriteIds = new Set();
  if (!Number.isNaN(userId) && userId > 0) {
    const favorites = await Product.findAll({
      where: { id: products.map((product) => product.id) },
      include: [
        {
          model: User,
          as: "favoritedByUsers",
          where: { id: userId },
          required: true,
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
    });
    favoriteIds = new Set(favorites.map((product) => product.id));
  }

  return products.map((product) => {
    const prodJson = product.toJSON();
    prodJson.isFavorite = favoriteIds.has(product.id);
    delete prodJson.favoritedByUsers;
    return prodJson;
  });
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
    lowStockAlert,
    colors,
    sizes,
  } = req.body;

  if (!title || price === undefined || price === null || price.toString().trim() === "") {
    return res.status(400).json({ error: "العنوان والسعر مطلوبان" });
  }

  const priceValue = parsePositiveNumber(price);
  if (priceValue === null) {
    return res.status(400).json({ error: "السعر يجب أن يكون رقماً صحيحاً أكبر من صفر" });
  }

  const stockValue = parseNonNegativeInteger(stock, 0);
  if (stockValue < 0) {
    return res.status(400).json({ error: "المخزون يجب أن يكون صفراً أو أكثر" });
  }
  const safeLowStockAlert = parseNonNegativeInteger(lowStockAlert, 3);

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
      price: priceValue,
      stock: stockValue,
      lowStockAlert: safeLowStockAlert,
      colors: parseTextOptions(colors),
      sizes: parseTextOptions(sizes),
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
  let minPrice = parseFloat(req.query.minPrice);
  let maxPrice = parseFloat(req.query.maxPrice);
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
    (favoritesOnly && !Number.isNaN(userId) && userId > 0) ||
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
    if (!Number.isNaN(minPrice) && !Number.isNaN(maxPrice) && minPrice > maxPrice) {
      const tempPrice = minPrice;
      minPrice = maxPrice;
      maxPrice = tempPrice;
    }

    const include = [
      {
        model: User,
        as: "seller",
        attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
        required: false,
      },
      subcategoryInclude(true),
    ];

    if (favoritesOnly && (Number.isNaN(userId) || userId <= 0)) {
      return res.json({
        totalItems: 0,
        totalPages: 0,
        currentPage: page,
        products: [],
      });
    }

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
      const selectedCategory = await Category.findByPk(categoryId, {
        attributes: ["id", "parentId"],
        include: [
          {
            model: Category,
            as: "subcategories",
            attributes: ["id"],
            required: false,
          },
        ],
      });

      if (selectedCategory && selectedCategory.parentId === null) {
        const subcategoryIds = (selectedCategory.subcategories || []).map((item) => item.id);
        productWhere.categoryId = { [Op.in]: subcategoryIds };
      } else {
        productWhere.categoryId = categoryId;
      }
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

router.get("/products/low-stock", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const maxStock = parseInt(req.query.maxStock);
  const offset = (page - 1) * limit;

  try {
    const whereClause = Number.isNaN(maxStock)
      ? Product.sequelize.where(
          Product.sequelize.col("stock"),
          Op.lte,
          Product.sequelize.col("lowStockAlert")
        )
      : { stock: { [Op.lte]: Math.max(maxStock, 0) } };

    const { count, rows: products } = await Product.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
          required: false,
        },
        subcategoryInclude(false),
      ],
      distinct: true,
      limit,
      offset,
      order: [
        ["stock", "ASC"],
        ["updatedAt", "DESC"],
      ],
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      products,
    });
  } catch (error) {
    console.error("Error fetching low stock products:", error);
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

router.get("/products/:id/marketing", async (req, res) => {
  const productId = parseInt(req.params.id);
  const userId = parseInt(req.query.userId);

  if (Number.isNaN(productId)) {
    return res.status(400).json({ error: "معرف المنتج غير صالح" });
  }

  try {
    const links = await ProductRecommendation.findAll({
      where: { productId },
      order: [["createdAt", "ASC"]],
    });
    const recommendedIds = links.map((item) => item.recommendedProductId);

    if (recommendedIds.length === 0) {
      return res.json({
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        products: [],
      });
    }

    const products = await Product.findAll({
      where: { id: recommendedIds },
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "name", "phone", "location", "role", "isVerified", "image"],
          required: false,
        },
        subcategoryInclude(false),
      ],
    });

    const byId = new Map(products.map((product) => [product.id, product]));
    const sortedProducts = recommendedIds
      .map((id) => byId.get(id))
      .filter(Boolean);

    res.json({
      totalItems: sortedProducts.length,
      totalPages: 1,
      currentPage: 1,
      products: await productListWithFavorite(sortedProducts, userId),
    });
  } catch (error) {
    console.error("Error fetching marketing products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/products/:id/marketing", upload.none(), async (req, res) => {
  const productId = parseInt(req.params.id);
  const productIds = [...new Set(parseProductIds(req.body.productIds))]
    .filter((id) => id !== productId)
    .slice(0, 12);

  if (Number.isNaN(productId)) {
    return res.status(400).json({ error: "معرف المنتج غير صالح" });
  }

  try {
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    if (productIds.length > 0) {
      const count = await Product.count({ where: { id: productIds } });
      if (count !== productIds.length) {
        return res.status(400).json({ error: "بعض المنتجات المختارة غير موجودة" });
      }
    }

    await ProductRecommendation.destroy({ where: { productId } });
    if (productIds.length > 0) {
      await ProductRecommendation.bulkCreate(
        productIds.map((recommendedProductId) => ({ productId, recommendedProductId }))
      );
    }

    const links = await ProductRecommendation.findAll({
      where: { productId },
      order: [["createdAt", "ASC"]],
    });
    res.json({
      productId,
      productIds: links.map((item) => item.recommendedProductId),
    });
  } catch (error) {
    console.error("Error updating marketing products:", error);
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

    const allowedFields = [
      "title",
      "description",
      "price",
      "stock",
      "lowStockAlert",
      "colors",
      "sizes",
    ];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "price") {
          const priceValue = parsePositiveNumber(req.body[field]);
          if (priceValue === null) {
            return res.status(400).json({ error: "السعر يجب أن يكون رقماً صحيحاً أكبر من صفر" });
          }
          product[field] = priceValue;
        } else if (field === "stock" || field === "lowStockAlert") {
          product[field] = parseNonNegativeInteger(req.body[field], 0);
        } else if (field === "colors" || field === "sizes") {
          product[field] = parseTextOptions(req.body[field]);
        } else {
          product[field] = req.body[field];
        }
      }
    }

    if (product.price < 0 || product.stock < 0 || product.lowStockAlert < 0) {
      return res.status(400).json({ error: "السعر والمخزون وحد التنبيه يجب أن تكون صفراً أو أكثر" });
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

