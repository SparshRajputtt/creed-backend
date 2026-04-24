const Product = require('../models/Product');
const Category = require('../models/Category');
const Coupon = require('../models/Coupon');

exports.getChatContext = async (req, res) => {
  try {
    const [products, categories, coupons] = await Promise.all([
      Product.find({ status: 'active' })
        .select('name price comparePrice shortDescription description category brand tags features ratings stock isFeatured slug images')
        .populate('category', 'name slug')
        .limit(150)
        .lean(),

      Category.find({ isActive: true })
        .select('name description slug level isFeatured')
        .lean(),

      Coupon.find({
        isActive: true,
        validUntil: { $gt: new Date() },
      })
        .select('code type value minimumOrderAmount maximumDiscountAmount validUntil firstTimeUserOnly description')
        .lean(),
    ]);

    res.json({ products, categories, coupons });
  } catch (error) {
    console.error('Chat context error:', error);
    res.status(500).json({ error: 'Failed to load chat context' });
  }
};