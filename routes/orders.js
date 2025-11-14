const express = require('express');
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrder,
  updateOrderStatus,
  updatePaymentStatus,
  addTrackingInfo,
  cancelOrder,
  getOrderStats,
} = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/auth');
const { validateOrder, validateObjectId } = require('../middleware/validation');

/**
 * @route   POST /api/orders
 * @desc    Create new order
 * @access  Private
 */
router.post('/', protect, validateOrder, createOrder);

/**
 * @route   GET /api/orders
 * @desc    Get all orders (Admin only)
 * @access  Private (Admin)
 */
router.get('/', protect, restrictTo('admin'), getAllOrders);

/**
 * @route   GET /api/orders/stats
 * @desc    Get order statistics
 * @access  Private (Admin)
 */
router.get('/stats', protect, restrictTo('admin'), getOrderStats);

/**
 * @route   GET /api/orders/:id
 * @desc    Get single order
 * @access  Private
 */
router.get('/:id', protect, validateObjectId(), getOrder);

/**
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (Admin)
 */
router.put(
  '/:id/status',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updateOrderStatus
);

/**
 * @route   PUT /api/orders/:id/payment
 * @desc    Update payment status
 * @access  Private (Admin)
 */
router.put(
  '/:id/payment',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updatePaymentStatus
);

/**
 * @route   PUT /api/orders/:id/tracking
 * @desc    Add tracking information
 * @access  Private (Admin)
 */
router.put(
  '/:id/tracking',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  addTrackingInfo
);

/**
 * @route   PUT /api/orders/:id/cancel
 * @desc    Cancel order
 * @access  Private
 */
router.put('/:id/cancel', protect, validateObjectId(), cancelOrder);

module.exports = router;
