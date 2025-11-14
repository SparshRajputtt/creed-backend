const express = require('express');
const router = express.Router();
const {
  getProductReviews,
  getReviewStats,
  createReview,
  updateReview,
  deleteReview,
  voteOnReview,
  respondToReview,
  getAllReviews,
  approveReview,
} = require('../controllers/reviewController');
const { protect, restrictTo } = require('../middleware/auth');
const {
  validateReview,
  validateObjectId,
} = require('../middleware/validation');
const upload = require('../middleware/upload');

/**
 * @route   GET /api/reviews
 * @desc    Get all reviews (Admin)
 * @access  Private (Admin)
 */
router.get('/', protect, restrictTo('admin'), getAllReviews);

/**
 * @route   PUT /api/reviews/:id/approve
 * @desc    Approve/Disapprove review
 * @access  Private (Admin)
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('admin'),
  validateObjectId(),
  approveReview
);

/**
 * @route   PUT /api/reviews/:id
 * @desc    Update review
 * @access  Private
 */
router.put(
  '/:id',
  protect,
  validateObjectId(),
  upload.array('images', 3),
  updateReview
);

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete review
 * @access  Private
 */
router.delete('/:id', protect, validateObjectId(), deleteReview);

/**
 * @route   POST /api/reviews/:id/vote
 * @desc    Vote on review helpfulness
 * @access  Private
 */
router.post('/:id/vote', protect, validateObjectId(), voteOnReview);

/**
 * @route   POST /api/reviews/:id/respond
 * @desc    Respond to review
 * @access  Private (Admin/Seller)
 */
router.post(
  '/:id/respond',
  protect,
  restrictTo('admin', 'seller'),
  validateObjectId(),
  respondToReview
);

module.exports = router;
