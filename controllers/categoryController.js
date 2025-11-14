const Category = require('../models/Category');
const Product = require('../models/Product');
const { generateSlug, calculatePagination } = require('../utils/helpers');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');
const { default: mongoose } = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

/**
 * @desc    Get all categories
 * @route   GET /api/categories
 * @access  Public
 */
const getCategories = async (req, res) => {
  try {
    const { level, parent, featured } = req.query;

    const query = { isActive: true };

    // Filter by level
    if (level !== undefined) {
      query.level = Number(level);
    }

    // Filter by parent
    if (parent) {
      if (parent === 'null') {
        query.parent = null;
      } else {
        query.parent = parent;
      }
    }

    // Filter by featured
    if (featured === 'true') {
      query.isFeatured = true;
    }

    const categories = await Category.find(query)
      .populate('parent', 'name slug')
      .populate('children', 'name slug image')
      .sort({ sortOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message,
    });
  }
};

/**
 * @desc    Get category tree (hierarchical structure)
 * @route   GET /api/categories/tree
 * @access  Public
 */
const getCategoryTree = async (req, res) => {
  try {
    // Get all root categories (level 0)
    const rootCategories = await Category.find({
      level: 0,
      isActive: true,
    })
      .populate({
        path: 'children',
        match: { isActive: true },
        populate: {
          path: 'children',
          match: { isActive: true },
        },
      })
      .sort({ sortOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      data: rootCategories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category tree',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single category
 * @route   GET /api/categories/:id
 * @access  Public
 */
const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name slug')
      .populate('children', 'name slug image');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category',
      error: error.message,
    });
  }
};

/**
 * @desc    Get category by slug
 * @route   GET /api/categories/slug/:slug
 * @access  Public
 */
const getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug })
      .populate('parent', 'name slug')
      .populate('children', 'name slug image');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category',
      error: error.message,
    });
  }
};

/**
 * @desc    Create new category
 * @route   POST /api/categories
 * @access  Private (Admin)
 */
const createCategory = async (req, res) => {
  try {
    console.log('=== CATEGORY CREATION DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request file:', req.file ? req.file : 'No file');

    const {
      name,
      description,
      parent,
      icon,
      sortOrder,
      isFeatured,
      seoTitle,
      seoDescription,
      metaKeywords,
      attributes,
    } = req.body;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    // Generate slug
    const slug = generateSlug(name);
    console.log('Generated slug:', slug);

    // Check if slug already exists
    const existingCategory = await Category.findOne({ slug });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with similar name already exists',
      });
    }

    // Handle parent ID logic
    let parentId = null;
    let categoryLevel = 0;

    if (parent && parent !== 'none' && parent !== '' && parent !== 'null') {
      if (!mongoose.Types.ObjectId.isValid(parent)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parent category ID format',
        });
      }

      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return res.status(400).json({
          success: false,
          message: 'Parent category not found',
        });
      }

      parentId = parent;
      categoryLevel = parentCategory.level + 1;
    }

    // Handle image upload - LOCAL STORAGE ONLY
    let image = {};
    if (req.file) {
      console.log('Processing file upload locally...');
      console.log('File details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      });

      try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, '..', 'uploads', 'categories');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
          console.log('Created uploads directory:', uploadsDir);
        }

        // Generate unique filename
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `${slug}-${Date.now()}${fileExtension}`;
        const newFilePath = path.join(uploadsDir, fileName);

        // Move file from temp to permanent location
        fs.renameSync(req.file.path, newFilePath);
        console.log('File moved to:', newFilePath);

        image = {
          public_id: fileName,
          url: `/uploads/categories/${fileName}`,
          alt: name,
          filename: fileName,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        };

        console.log('Image processed successfully:', fileName);
      } catch (uploadError) {
        console.error('File upload error:', uploadError);

        // Clean up temp file if it exists
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(400).json({
          success: false,
          message: 'Error processing image: ' + uploadError.message,
        });
      }
    }

    // Prepare category data
    const categoryData = {
      name: name.trim(),
      description: description?.trim() || '',
      slug,
      parent: parentId,
      image,
      icon: icon?.trim() || '',
      level: categoryLevel,
      sortOrder: parseInt(sortOrder) || 0,
      isFeatured: isFeatured === true || isFeatured === 'true',
      seoTitle: seoTitle?.trim() || '',
      seoDescription: seoDescription?.trim() || '',
      metaKeywords:
        metaKeywords && metaKeywords.trim()
          ? metaKeywords
              .split(',')
              .map((keyword) => keyword.trim())
              .filter((k) => k)
          : [],
      attributes: (() => {
        try {
          return attributes && attributes !== '' ? JSON.parse(attributes) : [];
        } catch (parseError) {
          console.log(
            'JSON parse error for attributes, using empty array:',
            parseError
          );
          return [];
        }
      })(),
    };

    console.log(
      'Creating category with data:',
      JSON.stringify(categoryData, null, 2)
    );

    // Create the category
    const category = await Category.create(categoryData);
    console.log('Category created successfully with ID:', category._id);

    // Update parent's children array if needed
    if (parentId) {
      await Category.findByIdAndUpdate(parentId, {
        $addToSet: { children: category._id },
      });
      console.log('Parent children array updated');
    }

    // Populate parent information for response
    await category.populate('parent', 'name slug level');

    console.log('=== CATEGORY CREATION SUCCESS ===');

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        ...category.toObject(),
        isRootCategory: !parentId,
      },
    });
  } catch (error) {
    console.error('=== CATEGORY CREATION ERROR ===');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    });

    // Clean up any temp files on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up temp file');
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }

    // Handle specific mongoose errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Category with this ${field} already exists`,
        field: field,
        value: error.keyValue[field],
      });
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
        value: err.value,
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating category',
      error: error.message,
    });
  }
};

/**
 * @desc    Update category
 * @route   PUT /api/categories/:id
 * @access  Private (Admin)
 */
const updateCategory = async (req, res) => {
  try {
    let category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Handle image upload
    if (req.file) {
      // Delete old image from cloudinary
      // if (category.image && category.image.public_id) {
      //   await cloudinary.uploader.destroy(category.image.public_id);
      // }

      // Upload new image
      // const result = await cloudinary.uploader.upload(req.file.path, {
      //   folder: 'categories',
      //   quality: 'auto',
      //   fetch_format: 'auto',
      // });

      req.body.image = {
        public_id: result.public_id,
        url: result.secure_url,
        alt: req.body.name || category.name,
      };
    }

    // Update slug if name changed
    if (req.body.name && req.body.name !== category.name) {
      req.body.slug = generateSlug(req.body.name);
    }

    // Parse arrays
    if (req.body.metaKeywords && typeof req.body.metaKeywords === 'string') {
      req.body.metaKeywords = req.body.metaKeywords
        .split(',')
        .map((keyword) => keyword.trim());
    }
    if (req.body.attributes && typeof req.body.attributes === 'string') {
      req.body.attributes = JSON.parse(req.body.attributes);
    }

    category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('parent', 'name slug');

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating category',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete category
 * @route   DELETE /api/categories/:id
 * @access  Private (Admin)
 */
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Check if category has products
    const productCount = await Product.countDocuments({
      category: category._id,
    });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with existing products',
      });
    }

    // Check if category has children
    const childrenCount = await Category.countDocuments({
      parent: category._id,
    });
    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with subcategories',
      });
    }

    // Delete image from cloudinary
    // if (category.image && category.image.public_id) {
    //   await cloudinary.uploader.destroy(category.image.public_id);
    // }

    await Category.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting category',
      error: error.message,
    });
  }
};

/**
 * @desc    Get category products
 * @route   GET /api/categories/:id/products
 * @access  Public
 */
const getCategoryProducts = async (req, res) => {
  try {
    const { page = 1, limit = 12, sort = '-createdAt' } = req.query;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Get all subcategory IDs
    const subcategories = await Category.find({ parent: category._id }).select(
      '_id'
    );
    const categoryIds = [category._id, ...subcategories.map((sub) => sub._id)];

    const query = {
      category: { $in: categoryIds },
      status: 'active',
    };

    const total = await Product.countDocuments(query);
    const pagination = calculatePagination(page, limit, total);

    const products = await Product.find(query)
      .populate('category', 'name slug')
      .select('-reviews')
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.itemsPerPage);

    res.status(200).json({
      success: true,
      count: products.length,
      pagination,
      category: {
        id: category._id,
        name: category.name,
        slug: category.slug,
      },
      data: products,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category products',
      error: error.message,
    });
  }
};

/**
 * @desc    Update category product count
 * @route   PUT /api/categories/:id/update-count
 * @access  Private (Admin)
 */
const updateCategoryProductCount = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const productCount = await Product.countDocuments({
      category: category._id,
      status: 'active',
    });

    category.productCount = productCount;
    await category.save();

    res.status(200).json({
      success: true,
      message: 'Category product count updated',
      data: {
        categoryId: category._id,
        productCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating category product count',
      error: error.message,
    });
  }
};

module.exports = {
  getCategories,
  getCategoryTree,
  getCategory,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryProducts,
  updateCategoryProductCount,
};
