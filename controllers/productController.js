const Product = require('../models/Product');
const Category = require('../models/Category');
const Review = require('../models/Review');
const {
  calculatePagination,
  generateSlug,
  generateSKU,
} = require('../utils/helpers');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');
dotenv.config();

// File upload utilities
const {
  saveProductImages,
  deleteProductImages,
  generateImageUrl,
} = require('../utils/imageHelpers');

/**
 * @desc    Get all products with filtering, sorting, and pagination
 * @route   GET /api/products
 * @access  Public
 */
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      subcategory,
      brand,
      minPrice,
      maxPrice,
      rating,
      sort = '-createdAt',
      search,
      status = 'active',
      featured,
    } = req.query;

    // Build query
    const query = { status };

    // Category filter
    if (category) {
      const categoryDoc = await Category.findOne({ slug: category });
      if (categoryDoc) {
        query.category = categoryDoc._id;
      }
    }

    // Subcategory filter
    if (subcategory) {
      const subcategoryDoc = await Category.findOne({ slug: subcategory });
      if (subcategoryDoc) {
        query.subcategory = subcategoryDoc._id;
      }
    }

    // Brand filter
    if (brand) {
      query.brand = new RegExp(brand, 'i');
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Rating filter
    if (rating) {
      query['ratings.average'] = { $gte: Number(rating) };
    }

    // Featured filter
    if (featured === 'true') {
      query.isFeatured = true;
    }

    // Search filter
    if (search) {
      query.$text = { $search: search };
    }

    // Get total count for pagination
    const total = await Product.countDocuments(query);
    const pagination = calculatePagination(page, limit, total);

    // Execute query with pagination and sorting
    const products = await Product.find(query)
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .select('-reviews')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.itemsPerPage);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single product
 * @route   GET /api/products/:id
 * @access  Public
 */
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('vendor', 'firstName lastName')
      .populate({
        path: 'reviews',
        populate: {
          path: 'user',
          select: 'firstName lastName avatar',
        },
        options: { sort: { createdAt: -1 }, limit: 10 },
      })
      .populate('relatedProducts', 'name price images ratings');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Increment view count
    product.viewCount += 1;
    await product.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message,
    });
  }
};

/**
 * @desc    Get product by slug
 * @route   GET /api/products/slug/:slug
 * @access  Public
 */
const getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('vendor', 'firstName lastName')
      .populate({
        path: 'reviews',
        populate: {
          path: 'user',
          select: 'firstName lastName avatar',
        },
        options: { sort: { createdAt: -1 }, limit: 10 },
      })
      .populate('relatedProducts', 'name price images ratings');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Increment view count
    product.viewCount += 1;
    await product.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message,
    });
  }
};

/**
 * @desc    Create new product
 * @route   POST /api/products
 * @access  Private (Admin/Seller)
 */
const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      shortDescription,
      price,
      comparePrice,
      costPrice,
      category,
      subcategory,
      brand,
      stock,
      lowStockThreshold,
      weight,
      dimensions,
      capacity,
      tags,
      features,
      specifications,
      seoTitle,
      seoDescription,
      variants,
      isDigital,
      shippingRequired,
      taxable,
      gst,
      taxClass,
    } = req.body;

    // Generate SKU if not provided
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category',
      });
    }

    const sku = generateSKU(name, categoryDoc.name);
    const slug = generateSlug(name);

    // Handle image uploads
    let images = [];
    if (req.files && req.files.length > 0) {
      try {
        images = await saveProductImages(req.files, {
          productName: name,
          categorySlug: categoryDoc.slug,
          sku,
        });
      } catch (uploadError) {
        return res.status(400).json({
          success: false,
          message: 'Error uploading images',
          error: uploadError.message,
        });
      }
    }

    const product = await Product.create({
      name,
      description,
      shortDescription,
      price,
      comparePrice,
      costPrice,
      category,
      subcategory,
      brand,
      sku,
      slug,
      images,
      stock,
      lowStockThreshold,
      weight,
      dimensions,
      capacity,
      tags: tags ? tags.split(',').map((tag) => tag.trim()) : [],
      features: features
        ? features.split(',').map((feature) => feature.trim())
        : [],
      specifications: specifications ? JSON.parse(specifications) : {},
      seoTitle,
      seoDescription,
      variants: variants ? JSON.parse(variants) : [],
      isDigital,
      shippingRequired,
      taxable,
      gst,
      taxClass,
      vendor: req.user.id,
    });

    await Category.findByIdAndUpdate(category, {
      $inc: { productCount: 1 }
    });

    await product.populate('category', 'name slug');

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    // Clean up uploaded files if product creation fails
    if (req.files && req.files.length > 0) {
      try {
        const categoryDoc = await Category.findById(req.body.category);
        if (categoryDoc) {
          await deleteProductImages(req.files, {
            categorySlug: categoryDoc.slug,
            sku: generateSKU(req.body.name, categoryDoc.name),
          });
        }
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded files:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message,
    });
  }
};

/**
 * @desc    Update product
 * @route   PUT /api/products/:id
 * @access  Private (Admin/Seller)
 */
const updateProduct = async (req, res) => {
  try {
    let product = await Product.findById(req.params.id).populate('category');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Check if user owns the product (for sellers)
    if (
      req.user.role === 'seller' &&
      product.vendor.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this product',
      });
    }

    // Store old images for potential cleanup
    const oldImages = [...product.images];

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      try {
        // Upload new images
        const newImages = await saveProductImages(req.files, {
          productName: req.body.name || product.name,
          categorySlug: product.category.slug,
          sku: product.sku,
        });

        req.body.images = newImages;

        // Delete old images after successful upload
        if (oldImages.length > 0) {
          await deleteProductImages(
            oldImages.map((img) => ({ filename: img.filename })),
            {
              categorySlug: product.category.slug,
              sku: product.sku,
            }
          );
        }
      } catch (uploadError) {
        return res.status(400).json({
          success: false,
          message: 'Error uploading images',
          error: uploadError.message,
        });
      }
    }

    // Update slug if name changed
    if (req.body.name && req.body.name !== product.name) {
      req.body.slug = generateSlug(req.body.name);
    }

    // Parse JSON fields
    if (req.body.tags && typeof req.body.tags === 'string') {
      req.body.tags = req.body.tags.split(',').map((tag) => tag.trim());
    }
    if (req.body.features && typeof req.body.features === 'string') {
      req.body.features = req.body.features
        .split(',')
        .map((feature) => feature.trim());
    }
    if (
      req.body.specifications &&
      typeof req.body.specifications === 'string'
    ) {
      req.body.specifications = JSON.parse(req.body.specifications);
    }
    if (req.body.variants && typeof req.body.variants === 'string') {
      req.body.variants = JSON.parse(req.body.variants);
    }

    product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('category', 'name slug');

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete product
 * @route   DELETE /api/products/:id
 * @access  Private (Admin/Seller)
 */
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Check if user owns the product (for sellers)
    if (
      req.user.role === 'seller' &&
      product.vendor.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this product',
      });
    }

    // Delete images from local storage
    if (product.images.length > 0) {
      try {
        await deleteProductImages(
          product.images.map((img) => ({ filename: img.filename })),
          {
            categorySlug: product.category.slug,
            sku: product.sku,
          }
        );
      } catch (deleteError) {
        console.error('Error deleting product images:', deleteError);
        // Continue with product deletion even if image deletion fails
      }
    }

    // Delete all reviews for this product
    await Review.deleteMany({ product: product._id });

    await Product.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message,
    });
  }
};

/**
 * @desc    Get featured products
 * @route   GET /api/products/featured
 * @access  Public
 */
const getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const products = await Product.find({
      isFeatured: true,
      status: 'active',
    })
      .populate('category', 'name slug')
      .select('-reviews')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching featured products',
      error: error.message,
    });
  }
};

/**
 * @desc    Get latest products
 * @route   GET /api/products/latest
 * @access  Public
 */
const getLatestProducts = async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const products = await Product.find({ status: 'active' })
      .populate('category', 'name slug')
      .select('-reviews')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching latest products',
      error: error.message,
    });
  }
};

/**
 * @desc    Get best selling products
 * @route   GET /api/products/best-selling
 * @access  Public
 */
const getBestSellingProducts = async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const products = await Product.find({ status: 'active' })
      .populate('category', 'name slug')
      .select('-reviews')
      .sort({ soldCount: -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching best selling products',
      error: error.message,
    });
  }
};

/**
 * @desc    Get top rated products
 * @route   GET /api/products/top-rated
 * @access  Public
 */
const getTopRatedProducts = async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const products = await Product.find({
      status: 'active',
      'ratings.count': { $gte: 5 }, // At least 5 reviews
    })
      .populate('category', 'name slug')
      .select('-reviews')
      .sort({ 'ratings.average': -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching top rated products',
      error: error.message,
    });
  }
};

/**
 * @desc    Search products
 * @route   GET /api/products/search
 * @access  Public
 */
const searchProducts = async (req, res) => {
  try {
    const { q, page = 1, limit = 12 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    const query = {
      status: 'active',
      $text: { $search: q },
    };

    const total = await Product.countDocuments(query);
    const pagination = calculatePagination(page, limit, total);

    const products = await Product.find(query, {
      score: { $meta: 'textScore' },
    })
      .populate('category', 'name slug')
      .select('-reviews')
      .sort({ score: { $meta: 'textScore' } })
      .skip(pagination.skip)
      .limit(pagination.itemsPerPage);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination,
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching products',
      error: error.message,
    });
  }
};

/**
 * @desc    Get related products
 * @route   GET /api/products/:id/related
 * @access  Public
 */
const getRelatedProducts = async (req, res) => {
  try {
    const { limit = 4 } = req.query;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const relatedProducts = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      status: 'active',
    })
      .populate('category', 'name slug')
      .select('-reviews')
      .sort({ 'ratings.average': -1 })
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: relatedProducts.length,
      data: relatedProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching related products',
      error: error.message,
    });
  }
};

module.exports = {
  getProducts,
  getProduct,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  getFeaturedProducts,
  getLatestProducts,
  getBestSellingProducts,
  getTopRatedProducts,
  searchProducts,
  getRelatedProducts,
};
