const User = require("./user");
const UserDevice = require("./user_device");
const Category = require("./category");
const Product = require("./product");
const Favorite = require("./favorites");
const Basket = require("./Basket");
const BasketItem = require("./BasketItem");
const Order = require("./Order");
const OrderItem = require("./OrderItem");
const ChatMessage = require("./ChatMessage");
const AppSetting = require("./AppSetting");
const Coupon = require("./Coupon");
const CouponUsage = require("./CouponUsage");
const Faq = require("./Faq");
const CustomRequest = require("./CustomRequest");

User.hasMany(Order, { foreignKey: "userId", as: "orders", onDelete: "CASCADE" });
Order.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });

Order.hasMany(OrderItem, { foreignKey: "orderId", onDelete: "CASCADE" });
OrderItem.belongsTo(Order, { foreignKey: "orderId" });

Product.hasMany(OrderItem, { foreignKey: "productId", onDelete: "CASCADE" });
OrderItem.belongsTo(Product, { foreignKey: "productId" });

User.hasOne(Basket, { foreignKey: "userId", onDelete: "CASCADE" });
Basket.belongsTo(User, { foreignKey: "userId" });

Basket.hasMany(BasketItem, { foreignKey: "basketId", onDelete: "CASCADE" });
BasketItem.belongsTo(Basket, { foreignKey: "basketId" });

Product.hasMany(BasketItem, { foreignKey: "productId", onDelete: "CASCADE" });
BasketItem.belongsTo(Product, { foreignKey: "productId" });

User.hasMany(UserDevice, { foreignKey: 'user_id', as: 'devices', onDelete: 'CASCADE' });
UserDevice.belongsTo(User, { foreignKey: 'user_id', as: 'user', onDelete: 'CASCADE' });

Product.belongsTo(User, { foreignKey: "userId", as: "seller", onDelete: 'CASCADE' });
User.hasMany(Product, { foreignKey: "userId", as: "products" , onDelete: 'CASCADE'});

User.belongsToMany(Product, { through: Favorite, foreignKey: "userId", as: "favoriteProducts" , onDelete: 'CASCADE' });
Product.belongsToMany(User, { through: Favorite, foreignKey: "productId", as: "favoritedByUsers", onDelete: 'CASCADE' });

ChatMessage.belongsTo(User, { as: "sender", foreignKey: "senderId" , onDelete: 'CASCADE'});
ChatMessage.belongsTo(User, { as: "receiver", foreignKey: "receiverId" , onDelete: 'CASCADE' });

User.hasMany(ChatMessage, { as: "sentMessages", foreignKey: "senderId" , onDelete: 'CASCADE' });
User.hasMany(ChatMessage, { as: "receivedMessages", foreignKey: "receiverId" , onDelete: 'CASCADE'});

Category.hasMany(Product, { foreignKey: "categoryId", as: "products", onDelete: "CASCADE" });
Product.belongsTo(Category, { foreignKey: "categoryId", as: "category", onDelete: "CASCADE" });

Category.hasMany(Category, { foreignKey: "parentId", as: "subcategories", onDelete: "CASCADE" });
Category.belongsTo(Category, { foreignKey: "parentId", as: "parent", onDelete: "CASCADE" });

Favorite.belongsTo(Product, { foreignKey: "productId", as: "product", onDelete: "CASCADE" });
Product.hasMany(Favorite, { foreignKey: "productId", as: "favorites", onDelete: "CASCADE" });

Coupon.hasMany(CouponUsage, { foreignKey: "couponId", as: "usages", onDelete: "CASCADE" });
CouponUsage.belongsTo(Coupon, { foreignKey: "couponId", as: "coupon", onDelete: "CASCADE" });
User.hasMany(CouponUsage, { foreignKey: "userId", as: "couponUsages", onDelete: "CASCADE" });
CouponUsage.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });
Order.hasOne(CouponUsage, { foreignKey: "orderId", as: "couponUsage", onDelete: "SET NULL" });
CouponUsage.belongsTo(Order, { foreignKey: "orderId", as: "order", onDelete: "SET NULL" });

User.hasMany(CustomRequest, { foreignKey: "userId", as: "customRequests", onDelete: "CASCADE" });
CustomRequest.belongsTo(User, { foreignKey: "userId", as: "user", onDelete: "CASCADE" });

module.exports = {
  User,
  UserDevice,
  Category,
  Product,
  Favorite,
  Basket,
  BasketItem,
  Order,
  OrderItem,
  ChatMessage,
  AppSetting,
  Coupon,
  CouponUsage,
  Faq,
  CustomRequest,
};
