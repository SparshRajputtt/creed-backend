// recalculateCategoryCounts.js
// Run this script to fix existing category counts

const mongoose = require('mongoose');
require('dotenv').config();

// Import your models
const Product = require('./models/Product'); // Adjust path as needed
const Category = require('./models/Category'); // Adjust path as needed

const recalculateCategoryCounts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all categories
    const categories = await Category.find();
    console.log(`Found ${categories.length} categories`);

    let updatedCount = 0;

    for (const category of categories) {
      // Count active products in this category
      const productCount = await Product.countDocuments({
        category: category._id,
        status: 'active',
      });

      // Update the category with the correct count
      await Category.findByIdAndUpdate(category._id, {
        productCount: productCount,
      });

      console.log(
        `Updated category "${category.name}": ${productCount} products`
      );
      updatedCount++;
    }

    console.log(`\n✅ Successfully updated ${updatedCount} categories`);

    // Verify the results
    console.log('\n📊 Final category counts:');
    const updatedCategories = await Category.find().select('name productCount');
    updatedCategories.forEach((cat) => {
      console.log(`${cat.name}: ${cat.productCount} products`);
    });
  } catch (error) {
    console.error('❌ Error recalculating category counts:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

// Run the script
recalculateCategoryCounts();
