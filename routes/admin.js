const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getAllOrders,
  updateOrderStatus,
  updateOrderTracking,
  getAllUsers,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getAnalytics,
  getSalesAnalytics,
  getInventoryAnalytics,
} = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validation');

// Dashboard
router.get('/dashboard', protect, restrictTo('admin'), getDashboardStats);

// Orders Management
router.get('/orders', protect, restrictTo('admin'), getAllOrders);
router.put(
  '/orders/:id/status',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updateOrderStatus
);
router.put(
  '/orders/:id/tracking',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updateOrderTracking
);

// Users Management
router.get('/users', protect, restrictTo('admin'), getAllUsers);
router.put(
  '/users/:id/role',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updateUserRole
);
router.put(
  '/users/:id/status',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  updateUserStatus
);
router.delete(
  '/users/:id',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  deleteUser
);

// Analytics
router.get('/analytics', protect, restrictTo('admin'), getAnalytics);
router.get('/analytics/sales', protect, restrictTo('admin'), getSalesAnalytics);
router.get(
  '/analytics/inventory',
  protect,
  restrictTo('admin'),
  getInventoryAnalytics
);

module.exports = router;
