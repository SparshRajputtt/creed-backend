const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const dotenv = require('dotenv');
dotenv.config();

/**
 * Hash password
 */
const hashPassword = async (password) => {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (err) {
    console.log(err);
    throw err;
  }
};

/**
 * Compare password
 */
const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Generate JWT tokens (access and refresh)
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "15m",
  });

  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || "7d",
    }
  );

  return { accessToken, refreshToken };
};

/**
 * Generate random string
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

/**
 * Generate SKU
 */
const generateSKU = (productName, category) => {
  const timestamp = Date.now().toString().slice(-6);
  const nameCode = productName.substring(0, 3).toUpperCase();
  const categoryCode = category.substring(0, 2).toUpperCase();
  return `${categoryCode}-${nameCode}-${timestamp}`;
};

/**
 * Calculate pagination
 */
const calculatePagination = (page, limit, total) => {
  const currentPage = Number.parseInt(page) || 1;
  const itemsPerPage = Number.parseInt(limit) || 10;
  const totalPages = Math.ceil(total / itemsPerPage);
  const skip = (currentPage - 1) * itemsPerPage;

  return {
    currentPage,
    itemsPerPage,
    totalPages,
    totalItems: total,
    skip,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
};

/**
 * Format currency
 */
const formatCurrency = (amount, currency = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
};

/**
 * Generate slug from string
 */
const generateSlug = (name) => {
  if (!name || typeof name !== "string") {
    throw new Error("Invalid name for slug generation");
  }

  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
};

/**
 * Calculate discount percentage
 */
const calculateDiscountPercentage = (originalPrice, discountedPrice) => {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s-()]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, "").length >= 10;
};

/**
 * Generate order number
 */
const generateOrderNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `ORD-${timestamp}-${random}`;
};

/**
 * Calculate shipping cost (basic implementation)
 */
const calculateShippingCost = (
  weight,
  distance,
  shippingMethod = "standard"
) => {
  const baseCost = 5;
  const weightCost = weight * 0.5;
  const distanceCost = distance * 0.1;

  let multiplier = 1;
  switch (shippingMethod) {
    case "express":
      multiplier = 2;
      break;
    case "overnight":
      multiplier = 3;
      break;
    default:
      multiplier = 1;
  }

  return (
    Math.round((baseCost + weightCost + distanceCost) * multiplier * 100) / 100
  );
};

/**
 * Calculate tax amount
 */
const calculateTax = (amount, taxRate = 0.08) => {
  return Math.round(amount * taxRate * 100) / 100;
};

/**
 * Generate coupon code
 */
const generateCouponCode = (length = 8) => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

/**
 * Deep clone object
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Remove sensitive data from user object
 */
const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.password;
  delete userObj.passwordResetToken;
  delete userObj.passwordResetExpires;
  delete userObj.emailVerificationToken;
  delete userObj.emailVerificationExpires;
  return userObj;
};

/**
 * Format date
 */
const formatDate = (date, format = "YYYY-MM-DD") => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  switch (format) {
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    default:
      return d.toISOString();
  }
};

module.exports = {
  hashPassword,
  comparePassword,
  generateTokens,
  generateRandomString,
  generateSKU,
  calculatePagination,
  formatCurrency,
  generateSlug,
  calculateDiscountPercentage,
  isValidEmail,
  isValidPhone,
  generateOrderNumber,
  calculateShippingCost,
  calculateTax,
  generateCouponCode,
  deepClone,
  sanitizeUser,
  formatDate,
};
