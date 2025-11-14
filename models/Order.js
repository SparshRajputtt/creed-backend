const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        size: String,
        color: String,
        sku: String,
        image: {
          url: String,
          alt: String,
        },
        subtotal: {
          type: Number,
          required: true,
        },
      },
    ],
    shippingAddress: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      company: String,
      address1: { type: String, required: true },
      address2: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      phone: String,
    },
    billingAddress: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      company: String,
      address1: { type: String, required: true },
      address2: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      phone: String,
    },
    pricing: {
      subtotal: {
        type: Number,
        required: true,
      },
      tax: {
        type: Number,
        default: 0,
      },
      shipping: {
        type: Number,
        default: 0,
      },
      discount: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        required: true,
      },
    },
    coupon: {
      code: String,
      discount: Number,
      type: {
        type: String,
        enum: ['percentage', 'fixed'],
      },
    },
    payment: {
      method: {
        type: String,
        enum: [
          'credit_card',
          'debit_card',
          'paypal',
          'stripe',
          'razorpay',
          'cod',
        ],
        required: true,
      },
      status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
        default: 'pending',
      },
      transactionId: String,
      paymentIntentId: String,
      paidAt: Date,
      refundedAt: Date,
      refundAmount: Number,
    },
    shipping: {
      method: String,
      carrier: String,
      trackingNumber: String,
      estimatedDelivery: Date,
      shippedAt: Date,
      deliveredAt: Date,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
        'returned',
      ],
      default: 'pending',
    },
    statusHistory: [
      {
        status: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        note: String,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],
    notes: [
      {
        message: String,
        isCustomerVisible: {
          type: Boolean,
          default: false,
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    cancellation: {
      reason: String,
      cancelledAt: Date,
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      refundStatus: {
        type: String,
        enum: ['pending', 'processed', 'failed'],
      },
    },
    return: {
      reason: String,
      requestedAt: Date,
      approvedAt: Date,
      status: {
        type: String,
        enum: ['requested', 'approved', 'rejected', 'completed'],
      },
      refundAmount: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
orderSchema.index({ user: 1, createdAt: -1 });
// orderSchema.index({ orderNumber: 1 })
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ createdAt: -1 });

// Pre-save middleware to generate order number
orderSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    this.orderNumber = `ORD-${Date.now()}-${(count + 1)
      .toString()
      .padStart(4, '0')}`;
  }
  next();
});

// Method to add status history
orderSchema.methods.addStatusHistory = function (status, note, updatedBy) {
  this.statusHistory.push({
    status,
    note,
    updatedBy,
    timestamp: new Date(),
  });
  this.status = status;
};
// In your Order model file
orderSchema.pre('save', function (next) {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.orderNumber = `ORD-${timestamp.slice(-6)}${random}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
