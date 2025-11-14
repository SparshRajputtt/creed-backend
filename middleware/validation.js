const { body, param, query, validationResult } = require('express-validator');
const Category = require('../models/Category');
const { default: mongoose } = require('mongoose');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

/**
 * User registration validation
 */
const validateUserRegistration = [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),

  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  }),

  body('otp')
    .isLength({ min: 4, max: 4 })
    .withMessage('OTP must be 4 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),

  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),

  handleValidationErrors,
];

/**
 * User login validation
 */
const validateUserLogin = [
  // body('email')
  // .isEmail()
  // .withMessage('Please provide a valid email')
  // .normalizeEmail(),

  body('password').notEmpty().withMessage('Password is required'),

  handleValidationErrors,
];

/**
 * Product validation
 */
const validateProduct = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 200 })
    .withMessage('Product name cannot exceed 200 characters'),

  body('description')
    .trim()
    .notEmpty()
    .withMessage('Product description is required')
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),

  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),

  body('category').isMongoId().withMessage('Valid category ID is required'),

  body('stock')
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer'),

  handleValidationErrors,
];

/**
 * Category validation
 */
const validateCategory = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Category name is required')
    .isLength({ max: 100 })
    .withMessage('Category name cannot exceed 100 characters'),

  body('parent')
    .optional({ checkFalsy: true })
    .custom(async (value) => {
      if (!value || value === 'none') return true; // Root category

      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid parent category ID format');
      }

      // Check if parent category exists
      const parentExists = await Category.findById(value);
      if (!parentExists) {
        throw new Error('Parent category does not exist');
      }

      return true;
    }),

  body('sortOrder')
    .optional()
    .isInt({ min: -1000, max: 1000 })
    .withMessage('Sort order must be a number between -1000 and 1000'),

  handleValidationErrors,
];

// Helper function to get category hierarchy
const getCategoryWithHierarchy = async (categoryId) => {
  const category = await Category.findById(categoryId)
    .populate('parent', 'name slug level')
    .populate('children', 'name slug level');

  if (!category) return null;

  // Build full path
  const buildPath = async (cat) => {
    const path = [cat.name];
    let current = cat;

    while (current.parent) {
      current = await Category.findById(current.parent).select('name parent');
      if (current) path.unshift(current.name);
    }

    return path.join(' > ');
  };

  return {
    ...category.toObject(),
    fullPath: await buildPath(category),
    isRootCategory: !category.parent,
    hasChildren: category.children.length > 0,
  };
};

// Helper function to get all root categories
const getRootCategories = async () => {
  return await Category.find({ parent: null })
    .populate('children', 'name slug level')
    .sort({ sortOrder: 1, name: 1 });
};

// Helper function to get category tree
const getCategoryTree = async () => {
  const rootCategories = await Category.find({ parent: null }).sort({
    sortOrder: 1,
    name: 1,
  });

  const buildTree = async (categories) => {
    const tree = [];

    for (const category of categories) {
      const children = await Category.find({ parent: category._id }).sort({
        sortOrder: 1,
        name: 1,
      });

      tree.push({
        ...category.toObject(),
        children: children.length > 0 ? await buildTree(children) : [],
      });
    }

    return tree;
  };

  return await buildTree(rootCategories);
};

/**
 * Order validation
 */
const validateOrder = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must contain at least one item'),

  body('items.*.product')
    .isMongoId()
    .withMessage('Valid product ID is required'),

  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),

  body('shippingAddress.firstName')
    .trim()
    .notEmpty()
    .withMessage('Shipping first name is required'),

  body('shippingAddress.lastName')
    .trim()
    .notEmpty()
    .withMessage('Shipping last name is required'),

  body('shippingAddress.address1')
    .trim()
    .notEmpty()
    .withMessage('Shipping address is required'),

  body('shippingAddress.city')
    .trim()
    .notEmpty()
    .withMessage('Shipping city is required'),

  body('shippingAddress.postalCode')
    .trim()
    .notEmpty()
    .withMessage('Shipping postal code is required'),

  body('paymentMethod')
    .isIn(['credit_card', 'debit_card', 'paypal', 'stripe', 'razorpay', 'cod'])
    .withMessage('Valid payment method is required'),

  handleValidationErrors,
];

/**
 * Review validation
 */
const validateReview = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),

  body('comment')
    .trim()
    .notEmpty()
    .withMessage('Review comment is required')
    .isLength({ max: 1000 })
    .withMessage('Comment cannot exceed 1000 characters'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),

  handleValidationErrors,
];

/**
 * MongoDB ObjectId validation
 */
const validateObjectId = (field = 'id') => [
  param(field).isMongoId().withMessage(`Valid ${field} is required`),

  handleValidationErrors,
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateProduct,
  getCategoryWithHierarchy,
  getCategoryTree,
  validateCategory,
  getRootCategories,
  validateOrder,
  validateReview,
  validateObjectId,
  handleValidationErrors,
};
