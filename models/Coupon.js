const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [20, 'Coupon code cannot exceed 20 characters'],
    },
    description: {
      type: String,
      maxlength: [200, 'Description cannot exceed 200 characters'],
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'Coupon type is required'],
    },
    value: {
      type: Number,
      required: [true, 'Coupon value is required'],
      min: [0, 'Coupon value cannot be negative'],
    },
    minimumOrderAmount: {
      type: Number,
      default: 0,
    },
    maximumDiscountAmount: {
      type: Number,
    },
    usageLimit: {
      type: Number,
      default: null, // null means unlimited
    },
    usageLimitPerUser: {
      type: Number,
      default: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    validFrom: {
      type: Date,
      required: [true, 'Valid from date is required'],
    },
    validUntil: {
      type: Date,
      required: [true, 'Valid until date is required'],
    },
    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    excludedProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    excludedCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    applicableUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    firstTimeUserOnly: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    usageHistory: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        order: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Order',
        },
        discountAmount: Number,
        usedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
// couponSchema.index({ code: 1 })
couponSchema.index({ validFrom: 1, validUntil: 1 });
couponSchema.index({ isActive: 1 });

// Virtual for checking if coupon is currently valid
couponSchema.virtual('isCurrentlyValid').get(function () {
  const now = new Date();
  return (
    this.isActive &&
    this.validFrom <= now &&
    this.validUntil >= now &&
    (this.usageLimit === null || this.usedCount < this.usageLimit)
  );
});

// Method to check if coupon is valid for a specific user and order
couponSchema.methods.isValidForUser = function (
  userId,
  orderAmount,
  userOrderCount
) {
  if (!this.isCurrentlyValid) return false;

  // Check minimum order amount
  if (orderAmount < this.minimumOrderAmount) return false;

  // Check if first time user only
  if (this.firstTimeUserOnly && userOrderCount > 0) return false;

  // Check usage limit per user
  const userUsageCount = this.usageHistory.filter(
    (usage) => usage.user.toString() === userId.toString()
  ).length;

  if (userUsageCount >= this.usageLimitPerUser) return false;

  // Check if user is in applicable users list (if specified)
  if (this.applicableUsers.length > 0) {
    return this.applicableUsers.some(
      (user) => user.toString() === userId.toString()
    );
  }

  return true;
};

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function (orderAmount) {
  let discount = 0;

  if (this.type === 'percentage') {
    discount = (orderAmount * this.value) / 100;
  } else if (this.type === 'fixed') {
    discount = this.value;
  }

  // Apply maximum discount limit if specified
  if (this.maximumDiscountAmount && discount > this.maximumDiscountAmount) {
    discount = this.maximumDiscountAmount;
  }

  // Ensure discount doesn't exceed order amount
  return Math.min(discount, orderAmount);
};

module.exports = mongoose.model('Coupon', couponSchema);
