const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { calculatePagination, generateCouponCode } = require('../utils/helpers');
const dotenv = require('dotenv');
dotenv.config();

/**
 * @desc    Get all coupons (Admin)
 * @route   GET /api/coupons
 * @access  Private (Admin)
 */
const getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive, type } = req.query;

    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (type) {
      query.type = type;
    }

    const total = await Coupon.countDocuments(query);
    const pagination = calculatePagination(page, limit, total);

    const coupons = await Coupon.find(query)
      .populate('createdBy', 'firstName lastName')
      .populate('applicableProducts', 'name')
      .populate('applicableCategories', 'name')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.itemsPerPage);

    res.status(200).json({
      success: true,
      count: coupons.length,
      pagination,
      data: coupons,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching coupons',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single coupon
 * @route   GET /api/coupons/:id
 * @access  Private (Admin)
 */
const getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('createdBy', 'firstName lastName')
      .populate('applicableProducts', 'name price')
      .populate('applicableCategories', 'name')
      .populate('excludedProducts', 'name')
      .populate('excludedCategories', 'name')
      .populate('applicableUsers', 'firstName lastName email');

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
    }

    res.status(200).json({
      success: true,
      data: coupon,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon',
      error: error.message,
    });
  }
};

/**
 * @desc    Create new coupon
 * @route   POST /api/coupons
 * @access  Private (Admin)
 */
const createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      type,
      value,
      minimumOrderAmount,
      maximumDiscountAmount,
      usageLimit,
      usageLimitPerUser,
      validFrom,
      validUntil,
      applicableProducts,
      applicableCategories,
      excludedProducts,
      excludedCategories,
      applicableUsers,
      firstTimeUserOnly,
    } = req.body;

    // Generate code if not provided
    const couponCode = code || generateCouponCode();

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
    });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists',
      });
    }

    const coupon = await Coupon.create({
      code: couponCode.toUpperCase(),
      description,
      type,
      value,
      minimumOrderAmount: minimumOrderAmount || 0,
      maximumDiscountAmount,
      usageLimit,
      usageLimitPerUser: usageLimitPerUser || 1,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      applicableProducts: applicableProducts || [],
      applicableCategories: applicableCategories || [],
      excludedProducts: excludedProducts || [],
      excludedCategories: excludedCategories || [],
      applicableUsers: applicableUsers || [],
      firstTimeUserOnly: firstTimeUserOnly || false,
      createdBy: req.user.id,
    });

    await coupon.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating coupon',
      error: error.message,
    });
  }
};

/**
 * @desc    Update coupon
 * @route   PUT /api/coupons/:id
 * @access  Private (Admin)
 */
const updateCoupon = async (req, res) => {
  try {
    let coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
    }

    // Check if code is being changed and if new code already exists
    if (req.body.code && req.body.code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({
        code: req.body.code.toUpperCase(),
      });
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists',
        });
      }
      req.body.code = req.body.code.toUpperCase();
    }

    // Convert date strings to Date objects
    if (req.body.validFrom) req.body.validFrom = new Date(req.body.validFrom);
    if (req.body.validUntil)
      req.body.validUntil = new Date(req.body.validUntil);

    coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('createdBy', 'firstName lastName');

    res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      data: coupon,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating coupon',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete coupon
 * @route   DELETE /api/coupons/:id
 * @access  Private (Admin)
 */
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
    }

    await Coupon.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting coupon',
      error: error.message,
    });
  }
};

/**
 * @desc    Validate coupon
 * @route   POST /api/coupons/validate
 * @access  Private
 */
const validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount, cartItems } = req.body;
    const userId = req.user?.id;

    // Validate input
    if (!code || !orderAmount || !cartItems || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: code, orderAmount, and cartItems',
      });
    }

    // Find the coupon
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code',
        data: {
          isValid: false,
          errors: ['Coupon not found'],
        },
      });
    }

    // Check if coupon is currently valid (date and usage limits)
    const now = new Date();
    const validationErrors = [];

    if (coupon.validFrom > now) {
      validationErrors.push('Coupon is not yet active');
    }

    if (coupon.validUntil < now) {
      validationErrors.push('Coupon has expired');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      validationErrors.push('Coupon usage limit reached');
    }

    // Check minimum order amount
    if (orderAmount < coupon.minimumOrderAmount) {
      validationErrors.push(
        `Minimum order amount of ₹${coupon.minimumOrderAmount} required`
      );
    }

    // Check user-specific validations if user is logged in
    if (userId) {
      const user = await User.findById(userId);

      // Check if first time user only
      if (coupon.firstTimeUserOnly) {
        const userOrderCount = await Order.countDocuments({
          user: userId,
          status: 'completed',
        });
        if (userOrderCount > 0) {
          validationErrors.push(
            'This coupon is only valid for first-time customers'
          );
        }
      }

      // Check usage limit per user
      const userUsageCount = coupon.usageHistory.filter(
        (usage) => usage.user.toString() === userId
      ).length;

      if (userUsageCount >= coupon.usageLimitPerUser) {
        validationErrors.push(
          'You have reached the usage limit for this coupon'
        );
      }

      // Check if user is in applicable users list (if specified)
      if (coupon.applicableUsers.length > 0) {
        const isApplicableUser = coupon.applicableUsers.some(
          (user) => user.toString() === userId
        );
        if (!isApplicableUser) {
          validationErrors.push(
            'This coupon is not applicable to your account'
          );
        }
      }
    }

    // Check product/category restrictions
    if (
      coupon.applicableProducts.length > 0 ||
      coupon.applicableCategories.length > 0
    ) {
      const productIds = cartItems.map((item) => item.productId);
      const products = await Product.find({
        _id: { $in: productIds },
      }).populate('category');

      let hasApplicableProducts = false;

      for (const product of products) {
        // Check if product is in applicable products
        if (coupon.applicableProducts.length > 0) {
          if (coupon.applicableProducts.includes(product._id)) {
            hasApplicableProducts = true;
            break;
          }
        }

        // Check if product category is in applicable categories
        if (coupon.applicableCategories.length > 0) {
          if (coupon.applicableCategories.includes(product.category._id)) {
            hasApplicableProducts = true;
            break;
          }
        }
      }

      if (!hasApplicableProducts) {
        validationErrors.push(
          'This coupon is not applicable to any items in your cart'
        );
      }
    }

    // Check excluded products/categories
    if (
      coupon.excludedProducts.length > 0 ||
      coupon.excludedCategories.length > 0
    ) {
      const productIds = cartItems.map((item) => item.productId);
      const products = await Product.find({
        _id: { $in: productIds },
      }).populate('category');

      for (const product of products) {
        // Check if product is excluded
        if (coupon.excludedProducts.includes(product._id)) {
          validationErrors.push(
            `This coupon cannot be applied to ${product.name}`
          );
          break;
        }

        // Check if product category is excluded
        if (coupon.excludedCategories.includes(product.category._id)) {
          validationErrors.push(
            `This coupon cannot be applied to ${product.category.name} products`
          );
          break;
        }
      }
    }

    // If there are validation errors, return them
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors[0], // Return first error as main message
        data: {
          isValid: false,
          errors: validationErrors,
          coupon: {
            code: coupon.code,
            description: coupon.description,
            type: coupon.type,
            value: coupon.value,
          },
        },
      });
    }

    // Calculate discount amount
    const discountAmount = coupon.calculateDiscount(orderAmount);

    // Return successful validation
    res.json({
      success: true,
      message: 'Coupon is valid',
      data: {
        isValid: true,
        coupon: {
          _id: coupon._id,
          code: coupon.code,
          description: coupon.description,
          type: coupon.type,
          value: coupon.value,
          minimumOrderAmount: coupon.minimumOrderAmount,
          maximumDiscountAmount: coupon.maximumDiscountAmount,
          validUntil: coupon.validUntil,
        },
        discountAmount,
        errors: [],
      },
    });
  } catch (error) {
    console.error('Coupon validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while validating coupon',
      data: {
        isValid: false,
        errors: ['Server error occurred'],
      },
    });
  }
};

/**
 * @desc    Apply coupon to order
 * @route   POST /api/coupons/apply
 * @access  Private
 */
const applyCoupon = async (req, res) => {
  try {
    const { code, orderId } = req.body;
    const userId = req.user.id;

    // Find the order and coupon
    const [order, coupon] = await Promise.all([
      Order.findOne({ _id: orderId, user: userId }),
      Coupon.findOne({ code: code.toUpperCase(), isActive: true }),
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code',
      });
    }

    // Validate coupon (reuse validation logic)
    const userOrderCount = await getUserOrderCount(userId);
    const isValid = coupon.isValidForUser(
      userId,
      order.subtotal,
      userOrderCount
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Coupon is not valid for this order',
      });
    }

    // Calculate discount
    const discountAmount = coupon.calculateDiscount(order.subtotal);

    // Update order with coupon
    order.coupon = {
      code: coupon.code,
      discountAmount: discountAmount,
    };
    order.totalAmount =
      order.subtotal + order.shippingCost + order.tax - discountAmount;

    await order.save();

    // Add to coupon usage history
    coupon.usageHistory.push({
      user: userId,
      order: orderId,
      discountAmount: discountAmount,
      usedAt: new Date(),
    });
    coupon.usedCount += 1;
    await coupon.save();

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        order,
        discountAmount,
        finalAmount: order.totalAmount,
      },
    });
  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while applying coupon',
    });
  }
};

/**
 * @desc    Get coupon usage statistics
 * @route   GET /api/coupons/:id/stats
 * @access  Private (Admin)
 */
const getCouponStats = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
    }

    const stats = {
      totalUsage: coupon.usedCount,
      remainingUsage: coupon.usageLimit
        ? coupon.usageLimit - coupon.usedCount
        : 'Unlimited',
      totalDiscountGiven: coupon.usageHistory.reduce(
        (total, usage) => total + usage.discountAmount,
        0
      ),
      uniqueUsers: new Set(
        coupon.usageHistory.map((usage) => usage.user.toString())
      ).size,
      usageByDate: {},
    };

    // Group usage by date
    coupon.usageHistory.forEach((usage) => {
      const date = usage.usedAt.toISOString().split('T')[0];
      stats.usageByDate[date] = (stats.usageByDate[date] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon statistics',
      error: error.message,
    });
  }
};

/**
 * @desc    Get active coupons for user
 * @route   GET /api/coupons/active
 * @access  Private
 */
const getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    const userId = req.user?.id;

    const coupons = await Coupon.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
      ],
    }).select('code description type value minimumOrderAmount validUntil');

    // If no user is logged in, return all active coupons
    if (!userId) {
      return res.json({
        success: true,
        count: coupons.length,
        data: coupons,
      });
    }

    // Filter coupons that are applicable to the user
    const applicableCoupons = [];

    for (const coupon of coupons) {
      // Check if coupon is applicable to user
      if (coupon.applicableUsers.length > 0) {
        if (!coupon.applicableUsers.includes(userId)) {
          continue;
        }
      }

      // Check usage limit per user
      const userUsageCount = coupon.usageHistory.filter(
        (usage) => usage.user.toString() === userId
      ).length;

      if (userUsageCount >= coupon.usageLimitPerUser) {
        continue;
      }

      // Check first time user only
      if (coupon.firstTimeUserOnly) {
        const userOrderCount = await Order.countDocuments({
          user: userId,
          status: 'completed',
        });
        if (userOrderCount > 0) {
          continue;
        }
      }

      applicableCoupons.push(coupon);
    }

    res.json({
      success: true,
      count: applicableCoupons.length,
      data: applicableCoupons,
    });
  } catch (error) {
    console.error('Get active coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching coupons',
    });
  }
};

// Helper function
async function getUserOrderCount(userId) {
  return await Order.countDocuments({ user: userId, status: 'completed' });
}

module.exports = {
  getAllCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  applyCoupon,
  getCouponStats,
  getActiveCoupons,
};
