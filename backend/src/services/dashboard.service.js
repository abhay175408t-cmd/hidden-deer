const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Review = require('../models/Review');
const {
  calculateProductStock,
  getStockStatus,
} = require('../utils/inventory.util');

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const getProductStats = async () => {
  const products = await Product.find({})
    .select('isActive stock variants.stock')
    .lean();

  let active = 0;
  let inactive = 0;
  let lowStock = 0;
  let outOfStock = 0;

  for (const product of products) {
    const stock = calculateProductStock(product);
    if (!product.isActive) {
      inactive += 1;
      continue;
    }
    active += 1;
    const status = getStockStatus(stock);
    if (status === 'low_stock') lowStock += 1;
    else if (status === 'out_of_stock') outOfStock += 1;
  }

  return {
    total: products.length,
    active,
    inactive,
    lowStock,
    outOfStock,
  };
};

const getOrderStats = async () => {
  const rows = await Order.aggregate([
    { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
  ]);

  const counts = { total: 0 };
  for (const status of ORDER_STATUSES) counts[status] = 0;
  for (const row of rows) {
    if (row._id && Object.prototype.hasOwnProperty.call(counts, row._id)) {
      counts[row._id] = row.count;
    }
    counts.total += row.count;
  }
  return counts;
};

// Revenue = sum of Order.total where paymentStatus === 'paid'.
// Paid online orders flip to 'refunded' when cancelled, and COD orders stay
// 'pending' until delivery, so both are naturally excluded by this definition.
const getRevenueStats = async () => {
  const rows = await Order.aggregate([
    { $match: { paymentStatus: 'paid' } },
    { $group: { _id: null, revenue: { $sum: '$total' }, orderCount: { $sum: 1 } } },
  ]);

  const row = rows[0] || { revenue: 0, orderCount: 0 };
  const revenue = Math.round((row.revenue || 0) * 100) / 100;
  const averageOrderValue =
    row.orderCount > 0
      ? Math.round((revenue / row.orderCount) * 100) / 100
      : 0;

  return { revenue, orderCount: row.orderCount, averageOrderValue };
};

const getCustomerStats = async () => {
  const total = await User.countDocuments({ role: 'customer' });
  return { total };
};

// Per-day paid-sales series. Buckets are UTC-based to stay consistent with the
// $dateToString aggregation; zero-fills days with no paid orders.
const DAY_MS = 24 * 60 * 60 * 1000;

const getSalesByDay = async (days) => {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(todayUtc - (days - 1) * DAY_MS);

  const rows = await Order.aggregate([
    { $match: { placedAt: { $gte: since }, paymentStatus: 'paid' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$total' },
      },
    },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(todayUtc - (days - 1 - i) * DAY_MS);
    const key = day.toISOString().slice(0, 10);
    const row = byDate.get(key);
    series.push({
      date: key,
      orders: row ? row.orders : 0,
      revenue: row ? Math.round(row.revenue * 100) / 100 : 0,
    });
  }
  return series;
};

const getRecentOrders = async (limit = 5) => {
  const orders = await Order.find({})
    .populate('user', 'name email')
    .sort({ placedAt: -1 })
    .limit(limit)
    .lean();

  return orders.map((order) => ({
    id: order._id,
    orderNumber: order.orderNumber,
    user: order.user
      ? { id: order.user._id, name: order.user.name, email: order.user.email }
      : null,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    placedAt: order.placedAt,
  }));
};

const getRecentReviews = async (limit = 5) => {
  const reviews = await Review.find({})
    .populate('user', 'name')
    .populate('product', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return reviews.map((review) => ({
    id: review._id,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    user: review.user
      ? { id: review.user._id, name: review.user.name }
      : null,
    product: review.product
      ? { id: review.product._id, name: review.product.name }
      : null,
    createdAt: review.createdAt,
  }));
};

const getDashboardStats = async () => {
  const [products, orders, customers, sales, recentOrders, recentReviews] =
    await Promise.all([
      getProductStats(),
      getOrderStats(),
      getCustomerStats(),
      getRevenueStats(),
      getRecentOrders(5),
      getRecentReviews(5),
    ]);

  const [last7Days, last30Days] = await Promise.all([
    getSalesByDay(7),
    getSalesByDay(30),
  ]);

  return {
    products,
    orders,
    customers,
    sales: { ...sales, last7Days, last30Days },
    recent: { orders: recentOrders, reviews: recentReviews },
    generatedAt: new Date().toISOString(),
  };
};

module.exports = { getDashboardStats };
