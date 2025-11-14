const User = require('../models/User');
const Address = require('../models/Address');
const Order = require('../models/Order');
const { sanitizeUser, calculatePagination } = require('../utils/helpers');
const cloudinary = require('../config/cloudinary');
const dotenv = require('dotenv');
dotenv.config();

/**
 * @desc    Get user profile
 * @route   GET /api/users/profile
 * @access  Private
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('addresses')
      .populate('wishlist', 'name price images');

    res.status(200).json({
      success: true,
      data: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message,
    });
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        firstName,
        lastName,
        phone,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message,
    });
  }
};

/**
 * @desc    Upload user avatar
 * @route   POST /api/users/avatar
 * @access  Private
 */
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image',
      });
    }

    const user = await User.findById(req.user.id);

    // Delete old avatar from cloudinary if exists
    // if (user.avatar && user.avatar.public_id) {
    //   await cloudinary.uploader.destroy(user.avatar.public_id);
    // }

    // Upload new avatar
    // const result = await cloudinary.uploader.upload(req.file.path, {
    //   folder: 'avatars',
    //   width: 300,
    //   height: 300,
    //   crop: 'fill',
    // });

    user.avatar = {
      public_id: result.public_id,
      url: result.secure_url,
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading avatar',
      error: error.message,
    });
  }
};

/**
 * @desc    Get user addresses
 * @route   GET /api/users/addresses
 * @access  Private
 */
const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user.id }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: addresses.length,
      data: addresses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching addresses',
      error: error.message,
    });
  }
};

/**
 * @desc    Add new address
 * @route   POST /api/users/addresses
 * @access  Private
 */
const addAddress = async (req, res) => {
  try {
    const addressData = {
      ...req.body,
      user: req.user.id,
    };

    const address = await Address.create(addressData);

    // Add address to user's addresses array
    await User.findByIdAndUpdate(req.user.id, {
      $push: { addresses: address._id },
    });

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: address,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding address',
      error: error.message,
    });
  }
};

/**
 * @desc    Update address
 * @route   PUT /api/users/addresses/:id
 * @access  Private
 */
const updateAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found',
      });
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      data: updatedAddress,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating address',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete address
 * @route   DELETE /api/users/addresses/:id
 * @access  Private
 */
const deleteAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found',
      });
    }

    await Address.findByIdAndDelete(req.params.id);

    // Remove address from user's addresses array
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { addresses: req.params.id },
    });

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting address',
      error: error.message,
    });
  }
};

/**
 * @desc    Get user cart
 * @route   GET /api/users/cart
 * @access  Private
 */
const getCart = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'cart.product',
      select: 'name price images stock status',
    });

    // Calculate cart totals
    let subtotal = 0;
    const cartItems = user.cart.map((item) => {
      const itemTotal = item.product.price * item.quantity;
      subtotal += itemTotal;
      return {
        ...item.toObject(),
        itemTotal,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        items: cartItems,
        itemCount: cartItems.length,
        subtotal,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Add item to cart
 * @route   POST /api/users/cart
 * @access  Private
 */
const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, size, color } = req.body;

    const user = await User.findById(req.user.id);

    // Check if item already exists in cart
    const existingItemIndex = user.cart.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.size === size &&
        item.color === color
    );

    if (existingItemIndex > -1) {
      // Update quantity if item exists
      user.cart[existingItemIndex].quantity += quantity;
    } else {
      // Add new item to cart
      user.cart.push({
        product: productId,
        quantity,
        size,
        color,
      });
    }

    await user.save();

    // Populate cart for response
    await user.populate({
      path: 'cart.product',
      select: 'name price images stock status',
    });

    res.status(200).json({
      success: true,
      message: 'Item added to cart successfully',
      data: user.cart,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding item to cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Update cart item
 * @route   PUT /api/users/cart/:itemId
 * @access  Private
 */
const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const { itemId } = req.params;

    const user = await User.findById(req.user.id);
    const cartItem = user.cart.id(itemId);

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found',
      });
    }

    cartItem.quantity = quantity;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Cart item updated successfully',
      data: cartItem,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating cart item',
      error: error.message,
    });
  }
};

/**
 * @desc    Remove item from cart
 * @route   DELETE /api/users/cart/:itemId
 * @access  Private
 */
const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;

    const user = await User.findById(req.user.id);
    user.cart.id(itemId).remove();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Item removed from cart successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing item from cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Clear cart
 * @route   DELETE /api/users/cart
 * @access  Private
 */
const clearCart = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $set: { cart: [] },
    });

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error clearing cart',
      error: error.message,
    });
  }
};

/**
 * @desc    Get user wishlist
 * @route   GET /api/users/wishlist
 * @access  Private
 */
const getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'wishlist',
      select: 'name price images ratings status slug',
    });

    res.status(200).json({
      success: true,
      count: user.wishlist.length,
      data: user.wishlist,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching wishlist',
      error: error.message,
    });
  }
};

/**
 * @desc    Add item to wishlist
 * @route   POST /api/users/wishlist/:productId
 * @access  Private
 */
const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user.id);

    if (user.wishlist.includes(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Product already in wishlist',
      });
    }

    user.wishlist.push(productId);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Product added to wishlist successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding to wishlist',
      error: error.message,
    });
  }
};

/**
 * @desc    Remove item from wishlist
 * @route   DELETE /api/users/wishlist/:productId
 * @access  Private
 */
const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { wishlist: productId },
    });

    res.status(200).json({
      success: true,
      message: 'Product removed from wishlist successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing from wishlist',
      error: error.message,
    });
  }
};

/**
 * @desc    Get user orders
 * @route   GET /api/users/orders
 * @access  Private
 */
const getUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = { user: req.user.id };
    if (status) query.status = status;

    const total = await Order.countDocuments(query);
    const pagination = calculatePagination(page, limit, total);

    const orders = await Order.find(query)
      .populate('items.product', 'name images')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.itemsPerPage);

    res.status(200).json({
      success: true,
      count: orders.length,
      pagination,
      data: orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single order
 * @route   GET /api/users/orders/:orderId
 * @access  Private
 */
const getUserOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.id,
    }).populate('items.product', 'name images slug price');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message,
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getUserOrders,
  getUserOrder,
};
