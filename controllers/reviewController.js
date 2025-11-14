const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { calculatePagination } = require('../utils/helpers');
const cloudinary = require('../config/cloudinary');
const dotenv = require('dotenv');
dotenv.config();

/**
 * @desc    Get all reviews for a product
 * @route   GET /api/products/:productId/reviews
 * @access  Public
 */
const getProductReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, rating, sort = '-createdAt' } = req.query;
    const { productId } = req.params;

    const query = {
      product: productId,
      isApproved: true,
    };

    // Filter by rating
    if (rating) {
      query.rating = Number(rating);
    }

    const total = await Review.countDocuments(query);
    const pagination = calculatePagination(page, limit, total);

    const reviews = await Review.find(query)
      .populate('user', 'firstName lastName avatar')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.itemsPerPage);

    res.status(200).json({
      success: true,
      count: reviews.length,
      pagination,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews',
      error: error.message,
    });
  }
};

/**
 * @desc    Get review statistics for a product
 * @route   GET /api/products/:productId/reviews/stats
 * @access  Public
 */
const getReviewStats = async (req, res) => {
  try {
    const { productId } = req.params;

    const stats = await Review.aggregate([
      {
        $match: {
          product: new require('mongoose').Types.ObjectId(productId),
          isApproved: true,
        },
      },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ]);

    const totalReviews = stats.reduce((sum, stat) => sum + stat.count, 0);
    const averageRating =
      stats.reduce((sum, stat) => sum + stat._id * stat.count, 0) /
        totalReviews || 0;

    const ratingDistribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };

    stats.forEach((stat) => {
      ratingDistribution[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: {
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10,
        ratingDistribution,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching review statistics',
      error: error.message,
    });
  }
};

/**
 * @desc    Create new review
 * @route   POST /api/products/:productId/reviews
 * @access  Private
 */
const createReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      user: req.user.id,
      product: productId,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product',
      });
    }

    // Check if user purchased this product
    const userOrder = await Order.findOne({
      user: req.user.id,
      'items.product': productId,
      status: 'delivered',
    });

    // Handle image uploads
    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        // const result = await cloudinary.uploader.upload(file.path, {
        //   folder: 'reviews',
        //   quality: 'auto',
        //   fetch_format: 'auto',
        // });

        images.push({
          public_id: result.public_id,
          url: result.secure_url,
          alt: `Review image for ${product.name}`,
        });
      }
    }

    const review = await Review.create({
      user: req.user.id,
      product: productId,
      order: userOrder?._id,
      rating,
      title,
      comment,
      images,
      isVerifiedPurchase: !!userOrder,
    });

    await review.populate('user', 'firstName lastName avatar');

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating review',
      error: error.message,
    });
  }
};

/**
 * @desc    Update review
 * @route   PUT /api/reviews/:id
 * @access  Private
 */
const updateReview = async (req, res) => {
  try {
    const { rating, title, comment } = req.body;

    let review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Check if user owns the review
    if (review.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this review',
      });
    }

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      // Delete old images from cloudinary
      // for (const image of review.images) {
      //   if (image.public_id) {
      //     await cloudinary.uploader.destroy(image.public_id);
      //   }
      // }

      // Upload new images
      const images = [];
      for (const file of req.files) {
        // const result = await cloudinary.uploader.upload(file.path, {
        //   folder: 'reviews',
        //   quality: 'auto',
        //   fetch_format: 'auto',
        // });

        images.push({
          public_id: result.public_id,
          url: result.secure_url,
          alt: `Review image`,
        });
      }
      req.body.images = images;
    }

    review = await Review.findByIdAndUpdate(
      req.params.id,
      { rating, title, comment, ...req.body },
      {
        new: true,
        runValidators: true,
      }
    ).populate('user', 'firstName lastName avatar');

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating review',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete review
 * @route   DELETE /api/reviews/:id
 * @access  Private
 */
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Check if user owns the review or is admin
    if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review',
      });
    }

    // Delete images from cloudinary
    // for (const image of review.images) {
    //   if (image.public_id) {
    //     await cloudinary.uploader.destroy(image.public_id);
    //   }
    // }

    await Review.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting review',
      error: error.message,
    });
  }
};

/**
 * @desc    Vote on review helpfulness
 * @route   POST /api/reviews/:id/vote
 * @access  Private
 */
const voteOnReview = async (req, res) => {
  try {
    const { vote } = req.body; // 'helpful' or 'not_helpful'
    const reviewId = req.params.id;

    if (!['helpful', 'not_helpful'].includes(vote)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vote type',
      });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Check if user already voted
    const existingVoteIndex = review.votedBy.findIndex(
      (v) => v.user.toString() === req.user.id
    );

    if (existingVoteIndex > -1) {
      // Update existing vote
      const oldVote = review.votedBy[existingVoteIndex].vote;
      review.votedBy[existingVoteIndex].vote = vote;

      // Update helpful votes count
      if (oldVote === 'helpful' && vote === 'not_helpful') {
        review.helpfulVotes -= 1;
      } else if (oldVote === 'not_helpful' && vote === 'helpful') {
        review.helpfulVotes += 1;
      }
    } else {
      // Add new vote
      review.votedBy.push({
        user: req.user.id,
        vote,
      });

      if (vote === 'helpful') {
        review.helpfulVotes += 1;
      }
    }

    await review.save();

    res.status(200).json({
      success: true,
      message: 'Vote recorded successfully',
      data: {
        helpfulVotes: review.helpfulVotes,
        userVote: vote,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error recording vote',
      error: error.message,
    });
  }
};

/**
 * @desc    Respond to review (Admin/Seller)
 * @route   POST /api/reviews/:id/respond
 * @access  Private (Admin/Seller)
 */
const respondToReview = async (req, res) => {
  try {
    const { message } = req.body;

    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    review.response = {
      message,
      respondedBy: req.user.id,
      respondedAt: new Date(),
    };

    await review.save();
    await review.populate('response.respondedBy', 'firstName lastName');

    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error responding to review',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all reviews (Admin)
 * @route   GET /api/reviews
 * @access  Private (Admin)
 */
const getAllReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20, isApproved, rating, product } = req.query;

    const query = {};

    if (isApproved !== undefined) {
      query.isApproved = isApproved === 'true';
    }

    if (rating) {
      query.rating = Number(rating);
    }

    if (product) {
      query.product = product;
    }

    const total = await Review.countDocuments(query);
    const pagination = calculatePagination(page, limit, total);

    const reviews = await Review.find(query)
      .populate('user', 'firstName lastName email')
      .populate('product', 'name images')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.itemsPerPage);

    res.status(200).json({
      success: true,
      count: reviews.length,
      pagination,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews',
      error: error.message,
    });
  }
};

/**
 * @desc    Approve/Disapprove review
 * @route   PUT /api/reviews/:id/approve
 * @access  Private (Admin)
 */
const approveReview = async (req, res) => {
  try {
    const { isApproved } = req.body;

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isApproved },
      { new: true }
    ).populate('user', 'firstName lastName');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    res.status(200).json({
      success: true,
      message: `Review ${isApproved ? 'approved' : 'disapproved'} successfully`,
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating review approval',
      error: error.message,
    });
  }
};

module.exports = {
  getProductReviews,
  getReviewStats,
  createReview,
  updateReview,
  deleteReview,
  voteOnReview,
  respondToReview,
  getAllReviews,
  approveReview,
};
