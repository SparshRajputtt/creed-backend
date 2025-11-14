const express = require('express');
const router = express.Router();
const {
  getAllCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  applyCoupon,
  getCouponStats,
  getActiveCoupons,
} = require('../controllers/couponController');
const { protect, restrictTo } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');

/**
 * @route   GET /api/coupons/active
 * @desc    Get active coupons for user
 * @access  Public/Private (works for both)
 */
router.get('/active', getActiveCoupons);

/**
 * @route   POST /api/coupons/validate
 * @desc    Validate coupon
 * @access  Private
 */
router.post('/validate', protect, validateCoupon);

/**
 * @route   POST /api/coupons/apply
 * @desc    Apply coupon to order
 * @access  Private
 */
router.post('/apply', protect, applyCoupon);

/**
 * @route   GET /api/coupons
 * @desc    Get all coupons
 * @access  Private (Admin)
 */
router.get('/', protect, restrictTo('admin'), getAllCoupons);

/**
 * @route   POST /api/coupons
 * @desc    Create new coupon
 * @access  Private (Admin)
 */
router.post('/', protect, restrictTo('admin'), createCoupon);

/**
 * @route   GET /api/coupons/:id
 * @desc    Get single coupon
 * @access  Private (Admin)
 */
router.get('/:id', protect, restrictTo('admin'), validateObjectId(), getCoupon);

/**
 * @route   PUT /api/coupons/:id
 * @desc    Update coupon
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updateCoupon
);

/**
 * @route   DELETE /api/coupons/:id
 * @desc    Delete coupon
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  deleteCoupon
);

/**
 * @route   GET /api/coupons/:id/stats
 * @desc    Get coupon usage statistics
 * @access  Private (Admin)
 */
router.get(
  '/:id/stats',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  getCouponStats
);

module.exports = router;
