const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const corsOptions = require('./config/cors');
const { apiLimiter } = require('./config/rateLimit');
const { requestId } = require('./middleware/requestId.middleware');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const productRoutes = require('./routes/product.routes');
const mediaRoutes = require('./routes/media.routes');
const cartRoutes = require('./routes/cart.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const addressRoutes = require('./routes/address.routes');
const orderRoutes = require('./routes/order.routes');
const adminOrderRoutes = require('./routes/admin.order.routes');
const adminProductRoutes = require('./routes/admin.product.routes');
const adminDashboardRoutes = require('./routes/admin.dashboard.routes');
const paymentRoutes = require('./routes/payment.routes');
const paymentWebhookRoutes = require('./routes/paymentWebhook.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminNotificationRoutes = require('./routes/admin.notification.routes');
const couponRoutes = require('./routes/coupon.routes');
const adminCouponRoutes = require('./routes/admin.coupon.routes');
const reviewRoutes = require('./routes/review.routes');
const adminReviewRoutes = require('./routes/admin.review.routes');
const notFound = require('./middleware/notFound.middleware');
const errorHandler = require('./middleware/error.middleware');

const app = express();

// Trust the first reverse-proxy hop only in production so rate limiters and
// logs see the real client IP. In development/test the socket address is used.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(requestId);
app.use(cors(corsOptions));
// The verify callback keeps the exact raw request body available at
// req.rawBody — required for Razorpay webhook signature verification while
// JSON parsing continues to work for every other route.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buffer) => {
      req.rawBody = buffer.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

morgan.token('request-id', (req) => req.id);
app.use(
  morgan(
    process.env.NODE_ENV === 'production'
      ? ':remote-addr :method :url :status :res[content-length] - :response-time ms [:request-id]'
      : ':method :url :status :response-time ms - :request-id'
  )
);

app.get('/', (req, res) => {
  res.json({ success: true, message: 'Deer E-commerce API' });
});

app.use('/api', apiLimiter);

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/orders', adminOrderRoutes);
app.use('/api/admin/products', adminProductRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/payments/webhook', paymentWebhookRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminNotificationRoutes);
app.use('/api/admin/coupons', adminCouponRoutes);
app.use('/api/admin', adminReviewRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;