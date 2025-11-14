const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
      maxlength: [100, "Category name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    slug: {
      type: String,
      unique: true,
      required: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    children: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    image: {
      public_id: String,
      url: String,
      alt: String,
    },
    icon: String,
    level: {
      type: Number,
      default: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    seoTitle: String,
    seoDescription: String,
    metaKeywords: [String],
    productCount: {
      type: Number,
      default: 0,
    },
    attributes: [
      {
        name: String,
        type: {
          type: String,
          enum: ["text", "number", "select", "multiselect", "boolean"],
        },
        options: [String],
        required: Boolean,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for better performance
// categorySchema.index({ slug: 1 })
categorySchema.index({ parent: 1 });
categorySchema.index({ level: 1 });
categorySchema.index({ isActive: 1 });

// Virtual for full path
categorySchema.virtual("fullPath").get(function () {
  // This would need to be populated with parent data
  return this.name;
});

// Pre-save middleware to generate slug and set level
categorySchema.pre("save", async function (next) {
  if (this.isModified("name")) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  if (this.parent) {
    const parent = await this.constructor.findById(this.parent);
    if (parent) {
      this.level = parent.level + 1;
    }
  } else {
    this.level = 0;
  }

  next();
});

categorySchema.pre("save", function (next) {
  // Ensure sortOrder is a number
  if (this.sortOrder && typeof this.sortOrder === "string") {
    this.sortOrder = parseInt(this.sortOrder) || 0;
  }

  // Ensure isFeatured is boolean
  if (typeof this.isFeatured === "string") {
    this.isFeatured = this.isFeatured === "true";
  }

  next();
});

// Post-save middleware to update parent's children array
categorySchema.post("save", async function () {
  if (this.parent) {
    await this.constructor.findByIdAndUpdate(this.parent, {
      $addToSet: { children: this._id },
    });
  }
});

module.exports = mongoose.model("Category", categorySchema);
