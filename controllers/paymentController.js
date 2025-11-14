const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
require('dotenv').config();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * @desc    Create Razorpay order
 * @route   POST /api/payment/create-order
 * @access  Private
 */
const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', orderId } = req.body;

    // Validate order exists and belongs to user
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this order',
      });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: `order_${orderId}`,
      notes: {
        orderId: orderId,
        userId: req.user.id,
      },
    });

    // Update order with Razorpay order ID
    order.payment.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.status(200).json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating Razorpay order',
      error: error.message,
    });
  }
};

/**
 * @desc    Verify Razorpay payment
 * @route   POST /api/payment/verify
 * @access  Private
 */
const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    // Add debugging logs
    console.log('Verification Data:', {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    });

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    console.log('Expected Signature:', expectedSignature);
    console.log('Received Signature:', razorpay_signature);
    console.log('Signatures Match:', expectedSignature === razorpay_signature);

    if (expectedSignature !== razorpay_signature) {
      console.log('Signature verification failed!');
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    order.payment.status = 'completed';
    order.payment.razorpayPaymentId = razorpay_payment_id;
    order.payment.razorpaySignature = razorpay_signature;
    order.payment.paidAt = new Date();

    // Update order status
    if (order.status === 'pending') {
      order.addStatusHistory('confirmed', 'Payment completed', req.user.id);
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: order._id,
        paymentStatus: order.payment.status,
      },
    });
  } catch (error) {
    console.error('Verification Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message,
    });
  }
};

/**
 * @desc    Handle payment failure
 * @route   POST /api/payment/failure
 * @access  Private
 */
const handlePaymentFailure = async (req, res) => {
  try {
    const { orderId, error } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    order.payment.status = 'failed';
    order.addStatusHistory(
      'cancelled',
      `Payment failed: ${error.description}`,
      req.user.id
    );

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Payment failure recorded',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error handling payment failure',
      error: error.message,
    });
  }
};

/**
 * @desc    Process COD order
 * @route   POST /api/payment/cod
 * @access  Private
 */
const processCODOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this order',
      });
    }

    // Update order for COD
    order.paymentMethod = 'cod';
    order.payment.status = 'pending';
    order.addStatusHistory('confirmed', 'COD order confirmed', req.user.id);

    await order.save();

    res.status(200).json({
      success: true,
      message: 'COD order processed successfully',
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        paymentMethod: 'cod',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error processing COD order',
      error: error.message,
    });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  handlePaymentFailure,
  processCODOrder,
};
