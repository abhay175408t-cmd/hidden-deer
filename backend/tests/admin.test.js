const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Environment — must be present before any request (JWT signing/verifying)
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = 'test-jwt-secret-admin';
process.env.JWT_EXPIRES_IN = '7d';
process.env.COOKIE_EXPIRES_DAYS = '7';
process.env.NODE_ENV = 'test';
process.env.LOW_STOCK_THRESHOLD = '5';
process.env.RAZORPAY_KEY_ID = 'rzp_test_unitkeyid';
process.env.RAZORPAY_KEY_SECRET = 'test-key-secret-abcdef123456';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret-987654';
delete process.env.EMAIL_ENABLED;
delete process.env.EMAIL_PROVIDER;
delete process.env.EMAIL_MAX_RETRIES;
delete process.env.ADMIN_NOTIFICATION_EMAIL;

const {
  connectTestDb,
  disconnectTestDb,
  startServer,
  stopServer,
  request,
  registerUser,
  makeAdmin,
} = require('./helpers');

const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const User = require('../src/models/User');
const Order = require('../src/models/Order');
const Payment = require('../src/models/Payment');
const Review = require('../src/models/Review');

const clean = (...models) => Promise.all(models.map((m) => m.deleteMany({})));

const makeCategory = async (name = 'Admin Cat', slug) =>
  Category.create({ name, slug: slug || `admin-cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, isActive: true });

const makeProduct = async ({ category, name = 'Admin Product', price = 100, discountPrice, stock = 10, isActive = true, brand, variants = [] } = {}) =>
  Product.create({
    name,
    slug: `admin-prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Admin test product.',
    category,
    price,
    discountPrice,
    brand: brand ?? null,
    images: [{ url: 'https://example.com/admin.jpg', isPrimary: true, position: 0 }],
    stock,
    variants,
    isActive,
  });

const makeOrder = async ({ user, orderNumber, total, paymentMethod = 'online', paymentStatus = 'pending', orderStatus = 'pending', placedAt = new Date() } = {}) =>
  Order.create({
    orderNumber,
    user,
    items: [
      {
        product: new mongoose.Types.ObjectId(),
        title: 'Admin Item',
        image: null,
        price: total,
        mrp: total,
        quantity: 1,
        variant: null,
      },
    ],
    subtotal: total,
    discountAmount: 0,
    couponDiscount: 0,
    shippingFee: 0,
    codFee: 0,
    total,
    paymentMethod,
    paymentStatus,
    orderStatus,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      addressLine1: '42 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'India',
    },
    placedAt,
  });

const makePayment = async ({ order, user, amount, status = 'captured', providerOrderId } = {}) =>
  Payment.create({
    order,
    user,
    provider: 'razorpay',
    providerOrderId,
    providerPaymentId: `pay_test_${Date.now()}`,
    amount,
    currency: 'INR',
    status,
    method: 'card',
  });

before(async () => {
  await connectTestDb();
  await startServer();
});

after(async () => {
  await stopServer();
  await disconnectTestDb();
});

// ---------------------------------------------------------------------------
// Auth guards
// ---------------------------------------------------------------------------

test('admin product list requires authentication (401)', async () => {
  const res = await request('/api/admin/products');
  assert.equal(res.status, 401);
  assert.equal(res.json.success, false);
});

test('admin product list rejects a customer (403)', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/admin/products', { cookie });
  assert.equal(res.status, 403);
  assert.equal(res.json.message, 'Admin access required');
});

test('dashboard stats requires authentication (401)', async () => {
  const res = await request('/api/admin/dashboard/stats');
  assert.equal(res.status, 401);
});

test('dashboard stats rejects a customer (403)', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/admin/dashboard/stats', { cookie });
  assert.equal(res.status, 403);
});

test('admin order detail requires authentication (401)', async () => {
  const res = await request('/api/admin/orders/507f1f77bcf86cd799439011');
  assert.equal(res.status, 401);
});

test('admin order detail rejects a customer (403)', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/admin/orders/507f1f77bcf86cd799439011', { cookie });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Admin product list
// ---------------------------------------------------------------------------

test('admin product list returns active and inactive products', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  await clean(Product, Category);
  const category = await makeCategory();
  const active1 = await makeProduct({ category: category._id, name: 'Alpha Shirt', price: 200, stock: 10 });
  const active2 = await makeProduct({ category: category._id, name: 'Beta Shirt', price: 300, stock: 2 });
  const inactive = await makeProduct({ category: category._id, name: 'Gamma Shirt', price: 400, isActive: false });

  const all = await request('/api/admin/products', { cookie: admin.cookie });
  assert.equal(all.status, 200);
  assert.equal(all.json.success, true);
  assert.equal(all.json.data.pagination.total, 3);
  assert.equal(all.json.data.products.length, 3);

  const byName = Object.fromEntries(all.json.data.products.map((p) => [p.name, p]));
  assert.ok(byName['Alpha Shirt'].isActive);
  assert.ok(!byName['Gamma Shirt'].isActive);
  assert.equal(byName['Beta Shirt'].stock, 2);
  assert.equal(byName['Beta Shirt'].stockStatus, 'low_stock');
  assert.equal(byName['Alpha Shirt'].category.name, 'Admin Cat');
  assert.equal(byName['Alpha Shirt'].imagesCount, 1);

  const activeOnly = await request('/api/admin/products?isActive=true', { cookie: admin.cookie });
  assert.equal(activeOnly.json.data.pagination.total, 2);

  const inactiveOnly = await request('/api/admin/products?isActive=false', { cookie: admin.cookie });
  assert.equal(inactiveOnly.json.data.pagination.total, 1);
  assert.equal(inactiveOnly.json.data.products[0].name, 'Gamma Shirt');

  await clean(Product);
  await clean(Category);
});

test('admin product list supports pagination', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  await clean(Product, Category);
  const category = await makeCategory();
  await makeProduct({ category: category._id, name: 'Page A' });
  await makeProduct({ category: category._id, name: 'Page B' });
  await makeProduct({ category: category._id, name: 'Page C' });

  const page1 = await request('/api/admin/products?limit=2&page=1', { cookie: admin.cookie });
  assert.equal(page1.json.data.products.length, 2);
  assert.equal(page1.json.data.pagination.total, 3);
  assert.equal(page1.json.data.pagination.totalPages, 2);
  assert.equal(page1.json.data.pagination.hasNextPage, true);

  const page2 = await request('/api/admin/products?limit=2&page=2', { cookie: admin.cookie });
  assert.equal(page2.json.data.products.length, 1);
  assert.equal(page2.json.data.pagination.hasPreviousPage, true);

  await clean(Product);
  await clean(Category);
});

test('admin product list supports search and category filters', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  await clean(Product, Category);
  const catA = await makeCategory('Cat A');
  const catB = await makeCategory('Cat B');
  await makeProduct({ category: catA._id, name: 'Searchable Denim Jacket', brand: 'Levis' });
  await makeProduct({ category: catA._id, name: 'Plain Tee' });
  await makeProduct({ category: catB._id, name: 'Loose Fit Jeans' });

  const bySearch = await request('/api/admin/products?search=denim', { cookie: admin.cookie });
  assert.equal(bySearch.json.data.pagination.total, 1);
  assert.equal(bySearch.json.data.products[0].name, 'Searchable Denim Jacket');

  const byBrand = await request('/api/admin/products?search=levis', { cookie: admin.cookie });
  assert.equal(byBrand.json.data.pagination.total, 1);

  const byCategory = await request(`/api/admin/products?category=${catA._id}`, { cookie: admin.cookie });
  assert.equal(byCategory.json.data.pagination.total, 2);

  const unknownCategory = await request(
    `/api/admin/products?category=${new mongoose.Types.ObjectId()}`,
    { cookie: admin.cookie }
  );
  assert.equal(unknownCategory.json.data.pagination.total, 0);
  assert.equal(unknownCategory.json.data.products.length, 0);

  await clean(Product);
  await clean(Category);
});

test('admin product list supports sorting', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  await clean(Product, Category);
  const category = await makeCategory();
  await makeProduct({ category: category._id, name: 'Cheap', price: 100 });
  await makeProduct({ category: category._id, name: 'Pricey', price: 900 });

  const sorted = await request('/api/admin/products?sort=price_asc', { cookie: admin.cookie });
  assert.equal(sorted.json.data.products[0].price, 100);

  const desc = await request('/api/admin/products?sort=price_desc', { cookie: admin.cookie });
  assert.equal(desc.json.data.products[0].price, 900);

  await clean(Product);
  await clean(Category);
});

// ---------------------------------------------------------------------------
// Admin product by id
// ---------------------------------------------------------------------------

test('admin product by id returns full product with variants, images and category', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  await clean(Product, Category);
  const category = await makeCategory('Jackets');
  const product = await makeProduct({
    category: category._id,
    name: 'Leather Jacket',
    price: 5000,
    discountPrice: 4500,
    stock: 0,
    variants: [
      { color: 'Black', size: 'M', sku: 'LJ-BLK-M', price: 5000, discountPrice: 4500, stock: 3, images: [{ url: 'https://example.com/v.jpg', position: 0 }] },
      { color: 'Black', size: 'L', sku: 'LJ-BLK-L', price: 5000, discountPrice: 4500, stock: 4, images: [] },
    ],
  });

  const res = await request(`/api/admin/products/${product._id}`, { cookie: admin.cookie });
  assert.equal(res.status, 200);
  const body = res.json.data.product;
  assert.equal(body.name, 'Leather Jacket');
  assert.equal(body.category.name, 'Jackets');
  assert.equal(body.variants.length, 2);
  assert.equal(body.images.length, 1);
  assert.equal(body.stock, 7);
  assert.equal(body.stockStatus, 'in_stock');
  assert.equal(body.discountPrice, 4500);
  assert.ok(body.createdAt);

  await clean(Product);
  await clean(Category);
});

test('admin product by id returns an inactive product', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  await clean(Product, Category);
  const category = await makeCategory();
  const product = await makeProduct({ category: category._id, name: 'Hidden Item', isActive: false });

  const res = await request(`/api/admin/products/${product._id}`, { cookie: admin.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.product.isActive, false);
  assert.equal(res.json.data.product.name, 'Hidden Item');

  await clean(Product);
  await clean(Category);
});

test('admin product by id rejects an invalid id (400)', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const res = await request('/api/admin/products/not-an-object-id', { cookie: admin.cookie });
  assert.equal(res.status, 400);
});

test('admin product by id returns 404 for a missing product', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const res = await request(`/api/admin/products/${new mongoose.Types.ObjectId()}`, { cookie: admin.cookie });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

test('dashboard stats report real product counts including low/out of stock', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  await clean(Product, Category);
  const category = await makeCategory();
  await makeProduct({ category: category._id, stock: 10 });
  await makeProduct({ category: category._id, stock: 2 });
  await makeProduct({ category: category._id, stock: 0 });
  await makeProduct({ category: category._id, stock: 8, isActive: false });

  const res = await request('/api/admin/dashboard/stats', { cookie: admin.cookie });
  assert.equal(res.status, 200);
  const stats = res.json.data;
  assert.equal(stats.products.total, 4);
  assert.equal(stats.products.active, 3);
  assert.equal(stats.products.inactive, 1);
  assert.equal(stats.products.lowStock, 1);
  assert.equal(stats.products.outOfStock, 1);

  await clean(Product);
  await clean(Category);
});

test('dashboard stats report order status counts', async () => {
  await clean(Order, Payment, User);
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const customer = await registerUser();
  let seq = 1;
  const orders = [
    { orderStatus: 'pending', paymentStatus: 'pending', paymentMethod: 'cod', total: 500 },
    { orderStatus: 'confirmed', paymentStatus: 'paid', paymentMethod: 'online', total: 1000 },
    { orderStatus: 'shipped', paymentStatus: 'paid', paymentMethod: 'online', total: 400 },
    { orderStatus: 'delivered', paymentStatus: 'paid', paymentMethod: 'online', total: 300 },
    { orderStatus: 'cancelled', paymentStatus: 'refunded', paymentMethod: 'online', total: 200 },
    { orderStatus: 'cancelled', paymentStatus: 'pending', paymentMethod: 'cod', total: 250 },
  ];
  for (const o of orders) {
    await makeOrder({ user: customer.user.id, orderNumber: `ADM${Date.now()}${seq++}`, ...o });
  }

  const res = await request('/api/admin/dashboard/stats', { cookie: admin.cookie });
  const stats = res.json.data;
  assert.equal(stats.orders.total, 6);
  assert.equal(stats.orders.pending, 1);
  assert.equal(stats.orders.confirmed, 1);
  assert.equal(stats.orders.shipped, 1);
  assert.equal(stats.orders.delivered, 1);
  assert.equal(stats.orders.cancelled, 2);
  assert.equal(stats.customers.total, 1);

  await clean(Order);
  await clean(Payment);
  await clean(User);
});

test('dashboard revenue counts only paid orders', async () => {
  await clean(Order, Payment, User);
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const customer = await registerUser();
  await makeOrder({ user: customer.user.id, orderNumber: 'REV1', total: 1000, paymentMethod: 'online', paymentStatus: 'paid' });
  await makeOrder({ user: customer.user.id, orderNumber: 'REV2', total: 500, paymentMethod: 'online', paymentStatus: 'failed' });
  await makeOrder({ user: customer.user.id, orderNumber: 'REV3', total: 700, paymentMethod: 'online', paymentStatus: 'pending' });
  await makeOrder({ user: customer.user.id, orderNumber: 'REV4', total: 300, paymentMethod: 'online', paymentStatus: 'refunded' });

  const res = await request('/api/admin/dashboard/stats', { cookie: admin.cookie });
  const sales = res.json.data.sales;
  assert.equal(sales.revenue, 1000);
  assert.equal(sales.orderCount, 1);
  assert.equal(sales.averageOrderValue, 1000);

  await clean(Order);
  await clean(Payment);
  await clean(User);
});

test('dashboard sales series includes today and recent orders/reviews', async () => {
  await clean(Order, Payment, User, Review, Product, Category);
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const customer = await registerUser();
  await makeOrder({ user: customer.user.id, orderNumber: 'SERIES1', total: 1000, paymentMethod: 'online', paymentStatus: 'paid' });

  const category = await makeCategory();
  const product = await makeProduct({ category: category._id });
  const order = await makeOrder({ user: customer.user.id, orderNumber: 'SERIES2', total: 50, paymentMethod: 'cod', paymentStatus: 'pending' });
  await Review.create({
    user: customer.user.id,
    product: product._id,
    order: order._id,
    rating: 5,
    comment: 'Great product!',
    status: 'approved',
  });

  const res = await request('/api/admin/dashboard/stats', { cookie: admin.cookie });
  const stats = res.json.data;

  const today = new Date().toISOString().slice(0, 10);
  const last7 = stats.sales.last7Days;
  assert.equal(last7.length, 7);
  const todayBucket = last7.find((d) => d.date === today);
  assert.ok(todayBucket, 'expected a bucket labelled with today UTC date');
  assert.equal(todayBucket.orders, 1);
  assert.equal(todayBucket.revenue, 1000);
  assert.equal(stats.sales.last30Days.length, 30);

  assert.equal(stats.recent.orders.length, 2);
  const orderNumbers = stats.recent.orders.map((o) => o.orderNumber);
  assert.ok(orderNumbers.includes('SERIES1'));
  assert.equal(stats.recent.reviews.length, 1);
  assert.equal(stats.recent.reviews[0].rating, 5);
  assert.equal(stats.recent.reviews[0].product.name, 'Admin Product');

  await clean(Order);
  await clean(Payment);
  await clean(User);
  await clean(Review);
  await clean(Product);
  await clean(Category);
});

// ---------------------------------------------------------------------------
// Admin order detail
// ---------------------------------------------------------------------------

test('admin order detail returns the order with user and safe payment info', async () => {
  await clean(Order, Payment, User);
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const customer = await registerUser();
  const order = await makeOrder({ user: customer.user.id, orderNumber: 'ORDETAIL1', total: 1200, paymentMethod: 'online', paymentStatus: 'paid' });
  await makePayment({ order: order._id, user: customer.user.id, amount: 1200, providerOrderId: `rzp_order_${Date.now()}` });

  const res = await request(`/api/admin/orders/${order._id}`, { cookie: admin.cookie });
  assert.equal(res.status, 200);
  const body = res.json.data.order;
  assert.equal(body.orderNumber, 'ORDETAIL1');
  assert.equal(body.totals.total, 1200);
  assert.equal(body.user.email, customer.email);
  assert.equal(body.payments.length, 1);
  assert.equal(body.payments[0].amount, 1200);
  assert.equal(body.payments[0].provider, 'razorpay');
  assert.equal(body.payments[0].status, 'captured');

  await clean(Order);
  await clean(Payment);
  await clean(User);
});

test('admin order detail rejects an invalid id (400)', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const res = await request('/api/admin/orders/not-an-object-id', { cookie: admin.cookie });
  assert.equal(res.status, 400);
});

test('admin order detail returns 404 for a missing order', async () => {
  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const res = await request(`/api/admin/orders/${new mongoose.Types.ObjectId()}`, { cookie: admin.cookie });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Public endpoints unchanged
// ---------------------------------------------------------------------------

test('public product list still returns only active products', async () => {
  await clean(Product, Category);
  const category = await makeCategory();
  await makeProduct({ category: category._id, name: 'Public Active', isActive: true });
  await makeProduct({ category: category._id, name: 'Public Hidden', isActive: false });

  const res = await request('/api/products');
  assert.equal(res.status, 200);
  assert.equal(res.json.data.products.length, 1);
  assert.equal(res.json.data.products[0].name, 'Public Active');

  await clean(Product);
  await clean(Category);
});
