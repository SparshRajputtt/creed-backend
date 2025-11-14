const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp"); // For image optimization
const { v4: uuidv4 } = require("uuid");

// Base uploads directory
const UPLOADS_BASE = path.join(process.cwd(), "uploads");

/**
 * Ensure directory exists, create if it doesn't
 */
const ensureDir = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

/**
 * Generate optimized filename with timestamp and UUID
 */
const generateFileName = (originalName, prefix = "") => {
  const timestamp = Date.now();
  const uniqueId = uuidv4().substring(0, 8);
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9]/g, "-");

  return `${
    prefix ? prefix + "-" : ""
  }${baseName}-${timestamp}-${uniqueId}${ext}`;
};

/**
 * Optimize image using Sharp
 */
const optimizeImage = async (inputPath, outputPath, options = {}) => {
  const { width = 800, quality = 85, format = "webp" } = options;

  try {
    await sharp(inputPath)
      .resize(width, null, {
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality })
      .toFile(outputPath);

    // Remove original file after optimization
    await fs.unlink(inputPath);

    return outputPath;
  } catch (error) {
    console.error("Image optimization failed:", error);
    // If optimization fails, keep original file
    return inputPath;
  }
};

/**
 * Save product images to organized folder structure
 */
const saveProductImages = async (files, metadata = {}) => {
  const { productName, categorySlug, sku } = metadata;

  if (!categorySlug) {
    throw new Error("Category slug is required for organizing product images");
  }

  // Create organized directory structure
  const productDir = path.join(
    UPLOADS_BASE,
    "products",
    categorySlug,
    sku || "general"
  );

  await ensureDir(productDir);

  const savedImages = [];

  for (const file of files) {
    try {
      const fileName = generateFileName(
        file.originalname || file.filename,
        "product"
      );
      const filePath = path.join(productDir, fileName);

      // If it's a buffer (from multer memory storage)
      if (file.buffer) {
        await fs.writeFile(filePath, file.buffer);
      }
      // If it's already saved to disk (from multer disk storage)
      else if (file.path) {
        await fs.copyFile(file.path, filePath);
        await fs.unlink(file.path); // Remove temp file
      }

      // Optimize image if it's an image file
      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
      const fileExt = path.extname(fileName).toLowerCase();

      let finalPath = filePath;
      if (imageExtensions.includes(fileExt)) {
        const optimizedFileName = fileName.replace(fileExt, ".webp");
        const optimizedPath = path.join(productDir, optimizedFileName);
        finalPath = await optimizeImage(filePath, optimizedPath);
      }

      // Generate URL for the image
      const relativePath = path.relative(UPLOADS_BASE, finalPath);
      const imageUrl = `/uploads/${relativePath.replace(/\\/g, "/")}`;

      // Return format matching Mongoose schema
      savedImages.push({
        public_id: path.basename(finalPath, path.extname(finalPath)), // Add this
        url: imageUrl,
        alt: productName || "Product image",
      });
    } catch (error) {
      console.error(`Error saving image ${file.originalname}:`, error);
      throw new Error(`Failed to save image: ${error.message}`);
    }
  }

  return savedImages;
};

/**
 * Save category images
 */
const saveCategoryImages = async (files, metadata = {}) => {
  const { categoryName, categorySlug } = metadata;

  const categoryDir = path.join(
    UPLOADS_BASE,
    "categories",
    categorySlug || "general"
  );
  await ensureDir(categoryDir);

  const savedImages = [];

  for (const file of files) {
    try {
      const fileName = generateFileName(
        file.originalname || file.filename,
        "category"
      );
      const filePath = path.join(categoryDir, fileName);

      if (file.buffer) {
        await fs.writeFile(filePath, file.buffer);
      } else if (file.path) {
        await fs.copyFile(file.path, filePath);
        await fs.unlink(file.path);
      }

      // Optimize category images (usually smaller thumbnails)
      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
      const fileExt = path.extname(fileName).toLowerCase();

      let finalPath = filePath;
      if (imageExtensions.includes(fileExt)) {
        const optimizedFileName = fileName.replace(fileExt, ".webp");
        const optimizedPath = path.join(categoryDir, optimizedFileName);
        finalPath = await optimizeImage(filePath, optimizedPath, {
          width: 400,
          quality: 90,
        });
      }

      const relativePath = path.relative(UPLOADS_BASE, finalPath);
      const imageUrl = `/uploads/${relativePath.replace(/\\/g, "/")}`;

      savedImages.push({
        filename: path.basename(finalPath),
        path: relativePath,
        url: imageUrl,
        alt: categoryName || "Category image",
        size: file.size || 0,
        mimetype: file.mimetype || "image/webp",
      });
    } catch (error) {
      console.error(`Error saving category image:`, error);
      throw new Error(`Failed to save category image: ${error.message}`);
    }
  }

  return savedImages;
};

/**
 * Save user avatar images
 */
const saveUserAvatar = async (file, metadata = {}) => {
  const { userId, userRole = "user" } = metadata;

  const avatarDir = path.join(UPLOADS_BASE, "users", "avatars");
  await ensureDir(avatarDir);

  try {
    const fileName = generateFileName(
      file.originalname || file.filename,
      `avatar-${userId}`
    );
    const filePath = path.join(avatarDir, fileName);

    if (file.buffer) {
      await fs.writeFile(filePath, file.buffer);
    } else if (file.path) {
      await fs.copyFile(file.path, filePath);
      await fs.unlink(file.path);
    }

    // Optimize avatar (small square image)
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    const fileExt = path.extname(fileName).toLowerCase();

    let finalPath = filePath;
    if (imageExtensions.includes(fileExt)) {
      const optimizedFileName = fileName.replace(fileExt, ".webp");
      const optimizedPath = path.join(avatarDir, optimizedFileName);
      finalPath = await optimizeImage(filePath, optimizedPath, {
        width: 150,
        height: 150,
        quality: 85,
        fit: "cover",
      });
    }

    const relativePath = path.relative(UPLOADS_BASE, finalPath);
    const imageUrl = `/uploads/${relativePath.replace(/\\/g, "/")}`;

    return {
      filename: path.basename(finalPath),
      path: relativePath,
      url: imageUrl,
      alt: "User avatar",
      size: file.size || 0,
      mimetype: file.mimetype || "image/webp",
    };
  } catch (error) {
    console.error(`Error saving avatar:`, error);
    throw new Error(`Failed to save avatar: ${error.message}`);
  }
};

/**
 * Delete product images
 */
const deleteProductImages = async (images, metadata = {}) => {
  const { categorySlug, sku } = metadata;

  for (const image of images) {
    try {
      let imagePath;

      if (image.path) {
        // If we have the relative path
        imagePath = path.join(UPLOADS_BASE, image.path);
      } else if (image.filename && categorySlug && sku) {
        // Construct path from metadata
        imagePath = path.join(
          UPLOADS_BASE,
          "products",
          categorySlug,
          sku,
          image.filename
        );
      } else {
        console.warn("Insufficient information to delete image:", image);
        continue;
      }

      await fs.unlink(imagePath);
    } catch (error) {
      console.error(`Error deleting image ${image.filename}:`, error);
      // Continue with other deletions even if one fails
    }
  }
};

/**
 * Delete category images
 */
const deleteCategoryImages = async (images, categorySlug) => {
  for (const image of images) {
    try {
      let imagePath;

      if (image.path) {
        imagePath = path.join(UPLOADS_BASE, image.path);
      } else if (image.filename && categorySlug) {
        imagePath = path.join(
          UPLOADS_BASE,
          "categories",
          categorySlug,
          image.filename
        );
      } else {
        continue;
      }

      await fs.unlink(imagePath);
    } catch (error) {
      console.error(`Error deleting category image:`, error);
    }
  }
};

/**
 * Delete user avatar
 */
const deleteUserAvatar = async (avatar) => {
  try {
    let imagePath;

    if (avatar.path) {
      imagePath = path.join(UPLOADS_BASE, avatar.path);
    } else if (avatar.filename) {
      imagePath = path.join(UPLOADS_BASE, "users", "avatars", avatar.filename);
    } else {
      return;
    }

    await fs.unlink(imagePath);
  } catch (error) {
    console.error(`Error deleting user avatar:`, error);
  }
};

/**
 * Generate image URL from relative path
 */
const generateImageUrl = (relativePath) => {
  if (!relativePath) return null;
  return `/uploads/${relativePath.replace(/\\/g, "/")}`;
};

/**
 * Clean up empty directories
 */
const cleanupEmptyDirectories = async (dirPath) => {
  try {
    const files = await fs.readdir(dirPath);

    if (files.length === 0) {
      await fs.rmdir(dirPath);
      console.log(`Removed empty directory: ${dirPath}`);

      // Recursively check parent directory
      const parentDir = path.dirname(dirPath);
      if (
        parentDir !== UPLOADS_BASE &&
        parentDir !== path.dirname(UPLOADS_BASE)
      ) {
        await cleanupEmptyDirectories(parentDir);
      }
    }
  } catch (error) {
    // Directory might not exist or might not be empty, which is fine
  }
};

/**
 * Get file stats and information
 */
const getFileInfo = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();

    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isImage: [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext),
      extension: ext,
      filename: path.basename(filePath),
    };
  } catch (error) {
    throw new Error(`Could not get file info: ${error.message}`);
  }
};

/**
 * Initialize upload directories
 */
const initializeUploadDirs = async () => {
  const directories = [
    "products",
    "categories",
    "users/avatars",
    "users/documents",
    "banners",
    "brands",
    "temp",
  ];

  for (const dir of directories) {
    await ensureDir(path.join(UPLOADS_BASE, dir));
  }

  console.log("Upload directories initialized successfully");
};

/**
 * Clean temporary files older than specified hours
 */
const cleanTempFiles = async (hoursOld = 24) => {
  const tempDir = path.join(UPLOADS_BASE, "temp");

  try {
    const files = await fs.readdir(tempDir);
    const cutoffTime = Date.now() - hoursOld * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);

      if (stats.birthtime.getTime() < cutoffTime) {
        await fs.unlink(filePath);
        console.log(`Cleaned temp file: ${file}`);
      }
    }
  } catch (error) {
    console.error("Error cleaning temp files:", error);
  }
};

module.exports = {
  saveProductImages,
  saveCategoryImages,
  saveUserAvatar,
  deleteProductImages,
  deleteCategoryImages,
  deleteUserAvatar,
  generateImageUrl,
  cleanupEmptyDirectories,
  getFileInfo,
  initializeUploadDirs,
  cleanTempFiles,
  ensureDir,
  generateFileName,
  optimizeImage,
};
