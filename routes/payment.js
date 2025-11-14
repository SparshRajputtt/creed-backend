const express = require('express');
const router = express.Router();
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  handlePaymentFailure,
  processCODOrder,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

// Apply authentication to all routes
router.use(protect);

/**
 * @route   POST /api/payment/create-order
 * @desc    Create Razorpay order
 * @access  Private
 */
router.post('/create-order', createRazorpayOrder);

/**
 * @route   POST /api/payment/verify
 * @desc    Verify Razorpay payment
 * @access  Private
 */
router.post('/verify', verifyRazorpayPayment);

/**
 * @route   POST /api/payment/failure
 * @desc    Handle payment failure
 * @access  Private
 */
router.post('/failure', handlePaymentFailure);

/**
 * @route   POST /api/payment/cod
 * @desc    Process COD order
 * @access  Private
 */
router.post('/cod', processCODOrder);

module.exports = router;
