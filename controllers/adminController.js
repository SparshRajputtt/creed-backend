const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const dotenv = require('dotenv');
dotenv.config();

// Dashboard Statistics
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Define the filter to exclude cancelled orders
  const excludeCancelledFilter = {
    status: { $in: ['delivered'] }, // Only include delivered orders
  };

  // Get basic counts (only delivered orders counted in revenue)
  const [totalUsers, totalProducts, totalOrders] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }),
    Product.countDocuments(),
    Order.countDocuments(excludeCancelledFilter),
  ]);

  // Get revenue data (excluding cancelled orders)
  const revenueData = await Order.aggregate([
    {
      $match: excludeCancelledFilter,
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$pricing.total' },
      },
    },
  ]);

  const totalRevenue = revenueData[0]?.totalRevenue || 0;

  // Current month stats (excluding cancelled orders)
  const currentMonthStats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfMonth },
        ...excludeCancelledFilter,
      },
    },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: '$pricing.total' },
      },
    },
  ]);

  // Last month stats (excluding cancelled orders)
  const lastMonthStats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        ...excludeCancelledFilter,
      },
    },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: '$pricing.total' },
      },
    },
  ]);

  const currentMonth = currentMonthStats[0] || { orders: 0, revenue: 0 };
  const lastMonth = lastMonthStats[0] || { orders: 0, revenue: 0 };

  // Calculate growth
  const orderGrowth =
    lastMonth.orders > 0
      ? ((currentMonth.orders - lastMonth.orders) / lastMonth.orders) * 100
      : 0;
  const revenueGrowth =
    lastMonth.revenue > 0
      ? ((currentMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100
      : 0;

  // Recent orders (excluding cancelled orders)
  const recentOrders = await Order.find(excludeCancelledFilter)
    .populate('user', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(5);

  // Top products (excluding cancelled orders)
  const topProducts = await Order.aggregate([
    {
      $match: excludeCancelledFilter,
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        soldCount: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'productInfo',
      },
    },
    {
      $addFields: {
        images: { $arrayElemAt: ['$productInfo.images', 0] },
        price: { $arrayElemAt: ['$productInfo.price', 0] },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ]);

  // Low stock products (this doesn't need to exclude cancelled orders as it's product-based)
  const lowStockProducts = await Product.find({
    stock: { $lte: 10 },
  })
    .select('name stock lowStockThreshold')
    .limit(5);

  // Order status stats (excluding cancelled orders from calculations, but we might want to show cancelled count separately)
  const orderStatusStats = await Order.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  // If you want to exclude cancelled from the status stats as well, use this instead:
  // const orderStatusStats = await Order.aggregate([
  //   {
  //     $match: excludeCancelledFilter,
  //   },
  //   {
  //     $group: {
  //       _id: '$status',
  //       count: { $sum: 1 },
  //     },
  //   },
  // ]);

  // Revenue by month (last 6 months, excluding cancelled orders)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const revenueByMonth = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: sixMonthsAgo },
        ...excludeCancelledFilter,
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      overview: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
      },
      currentMonth,
      lastMonth,
      growth: {
        orders: orderGrowth,
        revenue: revenueGrowth,
      },
      recentOrders,
      topProducts,
      lowStockProducts,
      orderStatusStats,
      revenueByMonth,
    },
  });
});

// Get All Orders
exports.getAllOrders = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    paymentStatus,
    startDate,
    endDate,
  } = req.query;

  // Build filter object
  const filter = {};

  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'user.firstName': { $regex: search, $options: 'i' } },
      { 'user.lastName': { $regex: search, $options: 'i' } },
      { 'user.email': { $regex: search, $options: 'i' } },
    ];
  }

  if (status) {
    filter.status = status;
  }

  if (paymentStatus) {
    filter['payment.status'] = paymentStatus;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get orders with pagination
  const orders = await Order.find(filter)
    .populate('user', 'firstName lastName email')
    .populate('items.product', 'name images')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number.parseInt(limit));

  // Get total count for pagination
  const totalItems = await Order.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  res.status(200).json({
    status: 'success',
    data: orders,
    pagination: {
      currentPage: Number.parseInt(page),
      totalPages,
      totalItems,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
});

// Update Order Status
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status, note } = req.body;

  const order = await Order.findById(id);

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  // Handle stock & payment update when delivered
  if (status === 'delivered') {
    // Reduce stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }

    // Update payment status only for COD
    if (
      order.payment.method === 'cod' &&
      order.payment.status !== 'completed'
    ) {
      order.payment.status = 'completed';
      order.payment.paidAt = new Date();
    }
  }

  // Add status history
  order.statusHistory.push({
    status,
    timestamp: new Date(),
    note: note || undefined,
  });

  order.status = status;
  await order.save();

  res.status(200).json({
    status: 'success',
    data: order,
  });
});

// Update Order Tracking
exports.updateOrderTracking = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { trackingNumber, carrier, estimatedDelivery } = req.body;

  const order = await Order.findById(id);

  if (!order) {
    return next(new AppError('Order not found', 404));
  }

  order.shipping = {
    trackingNumber,
    carrier,
    estimatedDelivery: estimatedDelivery
      ? new Date(estimatedDelivery)
      : undefined,
  };

  // If tracking is added, update status to shipped if it's not already
  if (order.status === 'processing') {
    order.status = 'shipped';
    order.statusHistory.push({
      status: 'shipped',
      timestamp: new Date(),
      note: `Tracking number: ${trackingNumber}`,
    });
  }

  await order.save();

  res.status(200).json({
    status: 'success',
    data: order,
  });
});

// Get All Users
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10, search, role, status } = req.query;

  // Build filter object
  const filter = {};

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  if (role) {
    filter.role = role;
  }

  if (status) {
    filter.isActive = status === 'active';
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Get users with pagination
  const users = await User.find(filter)
    .select('-password -refreshToken')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number.parseInt(limit));

  // Get total count for pagination
  const totalItems = await User.countDocuments(filter);
  const totalPages = Math.ceil(totalItems / limit);

  // Get user stats
  const userStats = await Promise.all(
    users.map(async (user) => {
      const orderCount = await Order.countDocuments({ user: user._id });
      const totalSpent = await Order.aggregate([
        { $match: { user: user._id } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } },
      ]);

      return {
        ...user.toObject(),
        orderCount,
        totalSpent: totalSpent[0]?.total || 0,
      };
    })
  );

  res.status(200).json({
    status: 'success',
    data: userStats,
    pagination: {
      currentPage: Number.parseInt(page),
      totalPages,
      totalItems,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
});

// Update User Role
exports.updateUserRole = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;

  const user = await User.findByIdAndUpdate(
    id,
    { role },
    { new: true, runValidators: true }
  ).select('-password -refreshToken');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: user,
  });
});

// Update User Status
exports.updateUserStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { isActive } = req.body;

  const user = await User.findByIdAndUpdate(
    id,
    { isActive },
    { new: true, runValidators: true }
  ).select('-password -refreshToken');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: user,
  });
});

// Delete User
exports.deleteUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Check if user has orders
  const orderCount = await Order.countDocuments({ user: id });

  if (orderCount > 0) {
    return next(new AppError('Cannot delete user with existing orders', 400));
  }

  await User.findByIdAndDelete(id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Get Analytics
exports.getAnalytics = catchAsync(async (req, res, next) => {
  const { timeRange = '30d' } = req.query;

  // Date range calculation
  const now = new Date();
  let startDate;
  switch (timeRange) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const deliveredFilter = { status: 'delivered' };

  // Overview stats (only delivered orders)
  const [totalRevenue, totalOrders, totalUsers, totalProducts] =
    await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate }, ...deliveredFilter } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } },
      ]),
      Order.countDocuments({
        createdAt: { $gte: startDate },
        ...deliveredFilter,
      }),
      User.countDocuments({
        createdAt: { $gte: startDate },
        role: { $ne: 'admin' },
      }),
      Product.countDocuments(),
    ]);

  // Previous period stats
  const previousStartDate = new Date(
    startDate.getTime() - (now.getTime() - startDate.getTime())
  );

  const [prevRevenue, prevOrders, prevUsers] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: previousStartDate, $lt: startDate },
          ...deliveredFilter,
        },
      },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]),
    Order.countDocuments({
      createdAt: { $gte: previousStartDate, $lt: startDate },
      ...deliveredFilter,
    }),
    User.countDocuments({
      createdAt: { $gte: previousStartDate, $lt: startDate },
      role: { $ne: 'admin' },
    }),
  ]);

  const currentRevenue = totalRevenue[0]?.total || 0;
  const previousRevenue = prevRevenue[0]?.total || 0;

  // Growth metrics
  const revenueGrowth =
    previousRevenue > 0
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
      : 0;
  const orderGrowth =
    prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;
  const userGrowth =
    prevUsers > 0 ? ((totalUsers - prevUsers) / prevUsers) * 100 : 0;

  // Revenue by day (only delivered)
  const revenueData = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate }, ...deliveredFilter } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: { date: '$_id', revenue: 1, orders: 1, _id: 0 },
    },
  ]);

  // User growth
  const userGrowthData = await User.aggregate([
    { $match: { createdAt: { $gte: startDate }, role: { $ne: 'admin' } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        users: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: { date: '$_id', users: 1, _id: 0 },
    },
  ]);

  // Category performance (only delivered)
  const categoryData = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate }, ...deliveredFilter } },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $group: {
        _id: '$category._id',
        name: { $first: '$category.name' },
        revenue: { $sum: '$items.subtotal' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  // Top products (only delivered)
  const topProducts = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate }, ...deliveredFilter } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        totalSold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'productInfo',
      },
    },
    {
      $addFields: {
        images: { $arrayElemAt: ['$productInfo.images', 0] },
        sku: { $arrayElemAt: ['$productInfo.sku', 0] },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 10 },
  ]);

  // Calculations
  const avgOrderValue = totalOrders > 0 ? currentRevenue / totalOrders : 0;
  const conversionRate = totalUsers > 0 ? (totalOrders / totalUsers) * 100 : 0;

  // Insights
  const insights = [];
  if (revenueGrowth > 10) {
    insights.push({
      type: 'positive',
      title: 'Strong Revenue Growth',
      description: `Revenue has grown by ${revenueGrowth.toFixed(
        1
      )}% compared to the previous period.`,
      action: 'View detailed revenue analytics',
    });
  }
  if (orderGrowth < -5) {
    insights.push({
      type: 'warning',
      title: 'Declining Orders',
      description: `Order count has decreased by ${Math.abs(
        orderGrowth
      ).toFixed(1)}% compared to the previous period.`,
      action: 'Review marketing strategies',
    });
  }
  if (conversionRate < 2) {
    insights.push({
      type: 'info',
      title: 'Low Conversion Rate',
      description: `Current conversion rate is ${conversionRate.toFixed(
        1
      )}%. Consider optimizing the checkout process.`,
      action: 'Optimize conversion funnel',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      overview: {
        totalRevenue: currentRevenue,
        totalOrders,
        totalUsers,
        totalProducts,
        avgOrderValue,
        conversionRate,
        newCustomers: totalUsers,
      },
      growth: {
        revenue: revenueGrowth,
        orders: orderGrowth,
        customers: userGrowth,
        avgOrderValue: 0,
      },
      revenueData,
      userGrowthData,
      categoryData,
      categoryPerformance: categoryData,
      topProducts,
      insights,
    },
  });
});

// Sales Analytics
exports.getSalesAnalytics = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const filter = {};
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // Sales by day
  const salesByDay = await Order.aggregate([
    { $match: filter },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Top selling products
  const topSellingProducts = await Order.aggregate([
    { $match: filter },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        productName: { $first: '$items.name' },
        totalSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
      },
    },
    { $sort: { totalSold: -1 } },
    { $limit: 10 },
  ]);

  // Sales by category
  const salesByCategory = await Order.aggregate([
    { $match: filter },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $group: {
        _id: '$category._id',
        categoryName: { $first: '$category.name' },
        revenue: { $sum: '$items.subtotal' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      salesByDay,
      topSellingProducts,
      salesByCategory,
    },
  });
});

// Inventory Analytics
exports.getInventoryAnalytics = catchAsync(async (req, res, next) => {
  // Low stock products
  const lowStockProducts = await Product.aggregate([
    {
      $match: {
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    {
      $addFields: {
        category: { $arrayElemAt: ['$categoryInfo.name', 0] },
      },
    },
    {
      $project: {
        name: 1,
        stock: 1,
        lowStockThreshold: 1,
        category: 1,
      },
    },
  ]);

  // Out of stock products
  const outOfStockProducts = await Product.aggregate([
    { $match: { stock: 0 } },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    {
      $addFields: {
        category: { $arrayElemAt: ['$categoryInfo.name', 0] },
      },
    },
    {
      $project: {
        name: 1,
        category: 1,
      },
    },
  ]);

  // Stock value by category
  const stockValueByCategory = await Product.aggregate([
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    { $unwind: '$categoryInfo' },
    {
      $group: {
        _id: '$category',
        categoryName: { $first: '$categoryInfo.name' },
        totalProducts: { $sum: 1 },
        totalStock: { $sum: '$stock' },
        totalValue: { $sum: { $multiply: ['$stock', '$price'] } },
      },
    },
    { $sort: { totalValue: -1 } },
  ]);

  // Top products by value
  const topProductsByValue = await Product.aggregate([
    {
      $addFields: {
        totalValue: { $multiply: ['$stock', '$price'] },
      },
    },
    {
      $project: {
        name: 1,
        stock: 1,
        price: 1,
        totalValue: 1,
      },
    },
    { $sort: { totalValue: -1 } },
    { $limit: 10 },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      lowStockProducts,
      outOfStockProducts,
      stockValueByCategory,
      topProductsByValue,
      summary: {
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
      },
    },
  });
});
