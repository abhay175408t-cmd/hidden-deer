const mongoose = require('mongoose');
const app = require('../src/app');
const path = require('path');

let server = null;
let baseUrl = null;

// Generate a unique database name per test file to ensure isolation
const getTestDbName = () => {
  const testFile = process.argv[1] || '';
  const fileName = path.basename(testFile, '.test.js');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `clothing_store_test_${fileName}_${suffix}`;
};

const TEST_DB_URI = () =>
  `mongodb://127.0.0.1:27017/${getTestDbName()}`;

const connectTestDb = async () => {
  await mongoose.connect(TEST_DB_URI());
  // dropDatabase wipes indexes; rebuild them so unique constraints
  // (WebhookEvent provider+eventId, Payment providerOrderId) apply.
  await mongoose.syncIndexes();
};

const disconnectTestDb = async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
};

const startServer = async () => {
  if (server) return baseUrl;
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
};

const stopServer = async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
};

const request = async (path, { method = 'GET', body, rawBody, cookie, headers = {} } = {}) => {
  const url = `${baseUrl}${path}`;
  const options = { method, headers: { ...headers } };
  if (cookie) options.headers.Cookie = cookie;
  if (rawBody !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = rawBody;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  return { status: response.status, json, headers: response.headers };
};

const extractCookie = (headers) => {
  const setCookie = headers.getSetCookie ? headers.getSetCookie() : [headers.get('set-cookie')];
  const cookieLine = (Array.isArray(setCookie) ? setCookie : []).find((c) => c.startsWith('auth_token='));
  if (!cookieLine) return null;
  return cookieLine.split(';')[0];
};

const registerUser = async ({ name = 'Test User', email, password = 'password123', phone = '9876543210' } = {}) => {
  const uniqueEmail = email || `user_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`;
  const res = await request('/api/auth/register', {
    method: 'POST',
    body: { name, email: uniqueEmail, password, phone },
  });
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.json)}`);
  }
  return {
    cookie: extractCookie(res.headers),
    user: res.json.user,
    email: uniqueEmail,
    password,
  };
};

const loginUser = async (email, password) => {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.json)}`);
  }
  return extractCookie(res.headers);
};

const makeAdmin = async (userId) => {
  const User = require('../src/models/User');
  await User.findByIdAndUpdate(userId, { role: 'admin' });
};

const seedCategory = async () => {
  const Category = require('../src/models/Category');
  const category = await Category.create({
    name: 'Test Category',
    slug: `test-category-${Date.now()}`,
    isActive: true,
  });
  return category;
};

const seedProduct = async ({
  categoryId,
  name = 'Test Product',
  price = 1000,
  discountPrice,
  stock = 10,
  images = [],
} = {}) => {
  const Product = require('../src/models/Product');
  const primaryImage = images.length
    ? [{ url: images[0], isPrimary: true, position: 0 }, ...images.slice(1).map((url, i) => ({ url, position: i + 1 }))]
    : [{ url: 'https://example.com/t-shirt.jpg', isPrimary: true, position: 0 }];
  const product = await Product.create({
    name,
    slug: `test-product-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    description: 'A product used for testing.',
    category: categoryId,
    price,
    discountPrice,
    images: primaryImage,
    stock,
    isActive: true,
  });
  return product;
};

const seedAddressPayload = (overrides = {}) => ({
  fullName: 'Test User',
  phone: '9876543210',
  addressLine1: '42 Test Street',
  addressLine2: 'Second Floor',
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: '400001',
  country: 'India',
  addressType: 'home',
  isDefault: false,
  ...overrides,
});

const seedCoupon = async ({ code = `SAVE${Date.now()}`, discountValue = 100 } = {}) => {
  const Coupon = require('../src/models/Coupon');
  return Coupon.create({
    code,
    discountValue,
    description: 'Test coupon',
    isActive: true,
    usageLimit: null,
    expiresAt: null,
  });
};

module.exports = {
  connectTestDb,
  disconnectTestDb,
  startServer,
  stopServer,
  request,
  extractCookie,
  registerUser,
  loginUser,
  makeAdmin,
  seedCategory,
  seedProduct,
  seedAddressPayload,
  seedCoupon,
};