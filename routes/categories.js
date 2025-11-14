const express = require('express');
const router = express.Router();
const {
  getCategories,
  getCategoryTree,
  getCategory,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryProducts,
  updateCategoryProductCount,
} = require('../controllers/categoryController');
const { protect, restrictTo } = require('../middleware/auth');
const {
  validateCategory,
  validateObjectId,
} = require('../middleware/validation');
const upload = require('../middleware/upload');

/**
 * @route   GET /api/categories
 * @desc    Get all categories
 * @access  Public
 */
router.get('/', getCategories);

/**
 * @route   GET /api/categories/tree
 * @desc    Get category tree
 * @access  Public
 */
router.get('/tree', getCategoryTree);

/**
 * @route   POST /api/categories
 * @desc    Create new category
 * @access  Private (Admin)
 */
router.post(
  '/',
  protect,
  restrictTo('admin'),
  upload.single('image'),
  validateCategory,
  createCategory
);

/**
 * @route   GET /api/categories/slug/:slug
 * @desc    Get category by slug
 * @access  Public
 */
router.get('/slug/:slug', getCategoryBySlug);

/**
 * @route   GET /api/categories/:id
 * @desc    Get single category
 * @access  Public
 */
router.get('/:id', validateObjectId(), getCategory);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update category
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  upload.single('image'),
  updateCategory
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  deleteCategory
);

/**
 * @route   GET /api/categories/:id/products
 * @desc    Get category products
 * @access  Public
 */
router.get('/:id/products', validateObjectId(), getCategoryProducts);

/**
 * @route   PUT /api/categories/:id/update-count
 * @desc    Update category product count
 * @access  Private (Admin)
 */
router.put(
  '/:id/update-count',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updateCategoryProductCount
);

module.exports = router;
