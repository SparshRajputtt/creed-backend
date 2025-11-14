const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/userController");
const { protect } = require("../middleware/auth");
const { validateObjectId } = require("../middleware/validation");
const upload = require("../middleware/upload");

/**
 * @route   GET /api/users/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get("/profile", protect, getProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put("/profile", protect, updateProfile);

/**
 * @route   POST /api/users/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post("/avatar", protect, upload.single("avatar"), uploadAvatar);

// Address routes
/**
 * @route   GET /api/users/addresses
 * @desc    Get user addresses
 * @access  Private
 */
router.get("/addresses", protect, getAddresses);

/**
 * @route   POST /api/users/addresses
 * @desc    Add new address
 * @access  Private
 */
router.post("/addresses", protect, addAddress);

/**
 * @route   PUT /api/users/addresses/:id
 * @desc    Update address
 * @access  Private
 */
router.put("/addresses/:id", protect, validateObjectId(), updateAddress);

/**
 * @route   DELETE /api/users/addresses/:id
 * @desc    Delete address
 * @access  Private
 */
router.delete("/addresses/:id", protect, validateObjectId(), deleteAddress);

// Cart routes
/**
 * @route   GET /api/users/cart
 * @desc    Get user cart
 * @access  Private
 */
router.get("/cart", protect, getCart);

/**
 * @route   POST /api/users/cart
 * @desc    Add item to cart
 * @access  Private
 */
router.post("/cart", protect, addToCart);

/**
 * @route   PUT /api/users/cart/:itemId
 * @desc    Update cart item
 * @access  Private
 */
router.put("/cart/:itemId", protect, updateCartItem);

/**
 * @route   DELETE /api/users/cart/:itemId
 * @desc    Remove item from cart
 * @access  Private
 */
router.delete("/cart/:itemId", protect, removeFromCart);

/**
 * @route   DELETE /api/users/cart
 * @desc    Clear cart
 * @access  Private
 */
router.delete("/cart", protect, clearCart);

// Wishlist routes
/**
 * @route   GET /api/users/wishlist
 * @desc    Get user wishlist
 * @access  Private
 */
router.get("/wishlist", protect, getWishlist);

/**
 * @route   POST /api/users/wishlist/:productId
 * @desc    Add item to wishlist
 * @access  Private
 */
router.post(
  "/wishlist/:productId",
  protect,
  validateObjectId("productId"),
  addToWishlist
);

/**
 * @route   DELETE /api/users/wishlist/:productId
 * @desc    Remove item from wishlist
 * @access  Private
 */
router.delete(
  "/wishlist/:productId",
  protect,
  validateObjectId("productId"),
  removeFromWishlist
);

// Order routes
/**
 * @route   GET /api/users/orders
 * @desc    Get user orders
 * @access  Private
 */
router.get("/orders", protect, getUserOrders);

/**
 * @route   GET /api/users/orders/:orderId
 * @desc    Get single order
 * @access  Private
 */
router.get(
  "/orders/:orderId",
  protect,
  validateObjectId("orderId"),
  getUserOrder
);

module.exports = router;
