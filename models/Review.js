const mongoose = require("mongoose")

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    title: {
      type: String,
      maxlength: [100, "Review title cannot exceed 100 characters"],
    },
    comment: {
      type: String,
      required: [true, "Review comment is required"],
      maxlength: [1000, "Review comment cannot exceed 1000 characters"],
    },
    images: [
      {
        public_id: String,
        url: String,
        alt: String,
      },
    ],
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
    helpfulVotes: {
      type: Number,
      default: 0,
    },
    votedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        vote: {
          type: String,
          enum: ["helpful", "not_helpful"],
        },
      },
    ],
    response: {
      message: String,
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      respondedAt: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Compound index to ensure one review per user per product
reviewSchema.index({ user: 1, product: 1 }, { unique: true })
reviewSchema.index({ product: 1, isApproved: 1 })
reviewSchema.index({ rating: 1 })

// Post-save middleware to update product ratings
reviewSchema.post("save", async function () {
  await this.constructor.calculateAverageRating(this.product)
})

// Post-remove middleware to update product ratings
reviewSchema.post("remove", async function () {
  await this.constructor.calculateAverageRating(this.product)
})

// Static method to calculate average rating
reviewSchema.statics.calculateAverageRating = async function (productId) {
  const stats = await this.aggregate([
    {
      $match: { product: productId, isApproved: true },
    },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ])

  if (stats.length > 0) {
    await mongoose.model("Product").findByIdAndUpdate(productId, {
      "ratings.average": Math.round(stats[0].averageRating * 10) / 10,
      "ratings.count": stats[0].totalReviews,
    })
  } else {
    await mongoose.model("Product").findByIdAndUpdate(productId, {
      "ratings.average": 0,
      "ratings.count": 0,
    })
  }
}

module.exports = mongoose.model("Review", reviewSchema)
