const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Environment — must be present before any request (JWT signing/verifying)
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = 'test-jwt-secret-security';
process.env.JWT_EXPIRES_IN = '7d';
process.env.COOKIE_EXPIRES_DAYS = '7';
process.env.NODE_ENV = 'test';
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
  seedCategory,
  seedProduct,
  seedAddressPayload,
  extractCookie,
} = require('./helpers');

const razorpayService = require('../src/services/razorpay.service');
const Notification = require('../src/models/Notification');
const Payment = require('../src/models/Payment');
const Order = require('../src/models/Order');

// ---------------------------------------------------------------------------
// Fake Razorpay SDK (mirrors payment.test.js / notification.test.js)
// ---------------------------------------------------------------------------
const makeFakeRazorpay = () => {
  let orderSeq = 1000;
  let paySeq = 5000;
  const orders = new Map();
  const payments = new Map();

  return {
    orders: {
      create: async ({ amount, currency, receipt }) => {
        const id = `order_test_${orderSeq++}`;
        orders.set(id, { id, entity: 'order', amount, currency, receipt, status: 'created' });
        return orders.get(id);
      },
      fetch: async (id) => {
        const order = orders.get(id);
        if (!order) throw Object.assign(new Error(`Order not found: ${id}`), { statusCode: 404 });
        return order;
      },
    },
    payments: {
      fetch: async (id) => {
        const payment = payments.get(id);
        if (!payment) throw Object.assign(new Error(`Payment not found: ${id}`), { statusCode: 404 });
        return payment;
      },
    },
    addPayment: (orderId, overrides = {}) => {
      const id = `pay_test_${paySeq++}`;
      payments.set(id, {
        id,
        entity: 'payment',
        order_id: orderId,
        amount: 109900,
        currency: 'INR',
        status: 'captured',
        method: 'card',
        ...overrides,
      });
      return id;
    },
  };
};

const fake = makeFakeRazorpay();

const TEST_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const TEST_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const signPayment = (orderId, paymentId) =>
  crypto.createHmac('sha256', TEST_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const signWebhook = (rawBody) =>
  crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

const webhookEnvelope = (eventId, type, entity) =>
  JSON.stringify({ id: eventId, type, payload: { payment: { entity } } });

const EXPECTED_PAISE = 109900;

let categoryId;
let productId;

before(async () => {
  razorpayService.__setInstance(fake);
  await connectTestDb();
  await startServer();
  const category = await seedCategory();
  categoryId = String(category._id);
  const product = await seedProduct({ categoryId, price: 1000, stock: 100 });
  productId = String(product._id);
});

after(async () => {
  await stopServer();
  await disconnectTestDb();
});

const createUserWithAddress = async () => {
  const user = await registerUser();
  const res = await request('/api/addresses', {
    method: 'POST',
    cookie: user.cookie,
    body: seedAddressPayload(),
  });
  return { ...user, addressId: res.json.data.address.id };
};

const placeOrder = async ({ cookie, addressId, paymentMethod = 'cod', quantity = 1, itemOverrides = {} } = {}) => {
  const res = await request('/api/orders', {
    method: 'POST',
    cookie,
    body: {
      items: [{ productId, quantity, variant: null, ...itemOverrides }],
      addressId,
      paymentMethod,
    },
  });
  assert.equal(res.status, 201);
  return res.json.data.order;
};

const createPaymentOrder = async ({ cookie, orderId }) =>
  request('/api/payments/create', { method: 'POST', cookie, body: { orderId } });

const verifyPayment = async ({ cookie, orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) =>
  request('/api/payments/verify', {
    method: 'POST',
    cookie,
    body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
  });

// ---------------------------------------------------------------------------
// Authentication & authorization
// ---------------------------------------------------------------------------
test('protected endpoints require authentication', async () => {
  for (const path of ['/api/cart', '/api/orders', '/api/notifications', '/api/auth/me']) {
    const res = await request(path);
    assert.equal(res.status, 401, `${path} should require auth`);
  }
});

test('non-admin users are denied admin endpoints', async () => {
  const user = await registerUser();

  const orders = await request('/api/admin/orders', { cookie: user.cookie });
  assert.equal(orders.status, 403);

  const emails = await request('/api/admin/emails', { cookie: user.cookie });
  assert.equal(emails.status, 403);

  const status = await request('/api/admin/orders/not-a-real-id/status', {
    method: 'PATCH',
    cookie: user.cookie,
    body: { status: 'shipped' },
  });
  assert.equal(status.status, 403);
});

test('non-admin users cannot create/update/delete products', async () => {
  const user = await registerUser();

  const create = await request('/api/products', {
    method: 'POST',
    cookie: user.cookie,
    body: { name: 'x', slug: 'x', description: 'x', category: categoryId },
  });
  assert.equal(create.status, 403);

  const patch = await request(`/api/products/${productId}`, {
    method: 'PATCH',
    cookie: user.cookie,
    body: { price: 1 },
  });
  assert.equal(patch.status, 403);

  const del = await request(`/api/products/${productId}`, { method: 'DELETE', cookie: user.cookie });
  assert.equal(del.status, 403);

  const publicList = await request('/api/products');
  assert.equal(publicList.status, 200);
});

test('tampered JWT is rejected', async () => {
  const user = await registerUser();
  const token = user.cookie.split('=')[1];
  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  const res = await request('/api/auth/me', { cookie: `auth_token=${tampered}` });
  assert.equal(res.status, 401);
});

test('token signed with a different secret is rejected', async () => {
  const user = await registerUser();
  const forged = jwt.sign({ userId: user.user.id }, 'attacker-controlled-secret', { algorithm: 'HS256' });
  const res = await request('/api/auth/me', { cookie: `auth_token=${forged}` });
  assert.equal(res.status, 401);
});

test('login rejects object/operator injection in credentials', async () => {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: { email: { $ne: null }, password: { $ne: null } },
  });
  assert.equal(res.status, 400);
});

test('register rejects non-string fields without crashing', async () => {
  const res = await request('/api/auth/register', {
    method: 'POST',
    body: { name: { $gt: '' }, email: 12345, password: ['p', 'w'] },
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Query / pagination / ObjectId validation
// ---------------------------------------------------------------------------
test('operator injection in product queries is neutralised', async () => {
  const res = await request('/api/products?category[$ne]=clothing');
  assert.equal(res.status, 200);
  assert.ok(res.json.success);

  const badSort = await request('/api/products?sort[$ne]=x');
  assert.equal(badSort.status, 200);
  assert.ok(badSort.json.success);
});

test('pagination abuse is rejected or clamped', async () => {
  const overLimit = await request('/api/products?limit=1000');
  assert.equal(overLimit.status, 400);

  const zeroLimit = await request('/api/products?limit=0');
  assert.equal(zeroLimit.status, 400);

  const zeroPage = await request('/api/products?page=0');
  assert.equal(zeroPage.status, 400);

  const user = await registerUser();
  const orders = await request('/api/orders?limit=1000&page=999999', { cookie: user.cookie });
  assert.equal(orders.status, 200);
  assert.equal(orders.json.data.pagination.limit, 50);
});

test('invalid ObjectId parameters return 400', async () => {
  const user = await registerUser();

  const order = await request('/api/orders/not-a-valid-object-id', { cookie: user.cookie });
  assert.equal(order.status, 400);

  const address = await request('/api/addresses/not-a-valid-object-id', { cookie: user.cookie });
  assert.equal(address.status, 400);
});

// ---------------------------------------------------------------------------
// Ownership / horizontal privilege escalation
// ---------------------------------------------------------------------------
test('users cannot read or cancel another user\'s order', async () => {
  const owner = await createUserWithAddress();
  const order = await placeOrder({ cookie: owner.cookie, addressId: owner.addressId });

  const other = await registerUser();

  const read = await request(`/api/orders/${order.id}`, { cookie: other.cookie });
  assert.equal(read.status, 404);

  const cancel = await request(`/api/orders/${order.id}/cancel`, {
    method: 'DELETE',
    cookie: other.cookie,
    body: { reason: 'x' },
  });
  assert.equal(cancel.status, 404);

  const paymentStatus = await request(`/api/payments/order/${order.id}`, { cookie: other.cookie });
  assert.equal(paymentStatus.status, 404);
});

test('users cannot access another user\'s addresses', async () => {
  const owner = await createUserWithAddress();
  const addressId = owner.addressId;

  const other = await registerUser();

  const read = await request(`/api/addresses/${addressId}`, { cookie: other.cookie });
  assert.equal(read.status, 404);

  const patch = await request(`/api/addresses/${addressId}`, {
    method: 'PATCH',
    cookie: other.cookie,
    body: { city: 'Delhi' },
  });
  assert.equal(patch.status, 404);

  const del = await request(`/api/addresses/${addressId}`, { method: 'DELETE', cookie: other.cookie });
  assert.equal(del.status, 404);
});

test('cart contents are isolated between users', async () => {
  const userA = await createUserWithAddress();
  await request('/api/cart/items', {
    method: 'POST',
    cookie: userA.cookie,
    body: { productId, quantity: 2 },
  });

  const userB = await registerUser();
  const res = await request('/api/cart', { cookie: userB.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.cart.items.length, 0);
});

test('notifications are only visible/manageable by their owner', async () => {
  const owner = await createUserWithAddress();
  await placeOrder({ cookie: owner.cookie, addressId: owner.addressId });
  const notification = await Notification.findOne({ user: owner.user.id }).sort({ createdAt: -1 }).lean();

  const other = await registerUser();
  const read = await request(`/api/notifications/${notification._id}/read`, {
    method: 'PATCH',
    cookie: other.cookie,
  });
  assert.equal(read.status, 404);

  const list = await request('/api/notifications', { cookie: other.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.json.data.notifications.length, 0);
});

test('customers cannot change order status through any route', async () => {
  const owner = await createUserWithAddress();
  const order = await placeOrder({ cookie: owner.cookie, addressId: owner.addressId });

  const direct = await request(`/api/orders/${order.id}/status`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { status: 'delivered' },
  });
  assert.equal(direct.status, 404);

  const adminRoute = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { status: 'delivered' },
  });
  assert.equal(adminRoute.status, 403);
});

// ---------------------------------------------------------------------------
// Integrity: server-side pricing
// ---------------------------------------------------------------------------
test('client-supplied price and discountPrice are ignored at checkout', async () => {
  const user = await createUserWithAddress();

  const preview = await request('/api/orders/preview', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      items: [{ productId, quantity: 2, variant: null, price: 1, discountPrice: 1 }],
    },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.json.data.baseAmount, 2000);

  const order = await placeOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    quantity: 2,
    itemOverrides: { price: 1, discountPrice: 1 },
  });

  assert.equal(order.totals.subtotal, 2000);
  assert.equal(order.items[0].price, 1000);
  assert.equal(order.totals.total, preview.json.data.totalPayable);
});

// ---------------------------------------------------------------------------
// Webhook security
// ---------------------------------------------------------------------------
test('webhook rejects missing and invalid signatures', async () => {
  const noSignature = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: webhookEnvelope('evt_sec_nosig', 'payment.captured', { amount: EXPECTED_PAISE }),
  });
  assert.equal(noSignature.status, 400);

  const badSignature = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: webhookEnvelope('evt_sec_badsig', 'payment.captured', { amount: EXPECTED_PAISE }),
    headers: { 'x-razorpay-signature': 'deadbeef' },
  });
  assert.equal(badSignature.status, 400);
});

test('webhook ignores unknown provider order ids', async () => {
  const raw = webhookEnvelope('evt_sec_unknown', 'payment.captured', {
    id: 'pay_unknown',
    order_id: 'order_does_not_exist',
    amount: EXPECTED_PAISE,
    currency: 'INR',
  });
  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.ignored, true);
});

test('webhook amount tampering is rejected without marking order paid', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'online' });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const raw = webhookEnvelope('evt_sec_amt', 'payment.captured', {
    id: 'pay_amt_tamper',
    order_id: rzOrderId,
    amount: 100,
    currency: 'INR',
  });
  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.verified, false);
  assert.equal(res.json.stateChanged, false);

  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'pending');
});

test('webhook replay is idempotent', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'online' });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;
  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE });

  const raw = webhookEnvelope('evt_sec_replay', 'payment.captured', {
    id: paymentId,
    order_id: rzOrderId,
    amount: EXPECTED_PAISE,
    currency: 'INR',
  });
  const signature = signWebhook(raw);

  const first = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signature },
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.stateChanged, true);

  let orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'paid');

  const replay = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signature },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.duplicate, true);

  orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'paid');

  const payments = await Payment.find({ order: order.id }).lean();
  assert.equal(payments.filter((p) => p.status === 'captured').length, 1);
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
test('rate limiter returns 429 after exceeding the limit', async () => {
  const express = require('express');
  const { createRateLimiter } = require('../src/config/rateLimit');

  const app = express();
  const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
  app.use(limiter);
  app.get('/', (req, res) => res.json({ success: true }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    for (let i = 0; i < 3; i += 1) {
      const ok = await fetch(url);
      assert.equal(ok.status, 200);
    }
    const blocked = await fetch(url);
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.success, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// Payload hardening & headers
// ---------------------------------------------------------------------------
test('oversized request bodies are rejected with 413', async () => {
  const bigEmail = `${'a'.repeat(1_500_000)}@test.com`;
  const res = await request('/api/auth/login', {
    method: 'POST',
    rawBody: JSON.stringify({ email: bigEmail, password: 'password123' }),
  });
  assert.equal(res.status, 413);
  assert.equal(res.json.code, 'PAYLOAD_TOO_LARGE');
});

test('malformed JSON is rejected with 400', async () => {
  const res = await request('/api/auth/login', {
    method: 'POST',
    rawBody: '{ this is not valid json',
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'INVALID_JSON');
});

test('responses carry an x-request-id header', async () => {
  const res = await request('/api/products');
  const requestId = res.headers.get('x-request-id');
  assert.ok(requestId && requestId.length > 0);
});

test('security headers are set by helmet', async () => {
  const res = await request('/api/products');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('x-dns-prefetch-control'));
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
test('disallowed origins are rejected with 403 CORS_DENIED', async () => {
  const res = await request('/api/products', {
    headers: { Origin: 'http://evil.example.com' },
  });
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'CORS_DENIED');
});

// ---------------------------------------------------------------------------
// Media upload access control
// ---------------------------------------------------------------------------
test('media uploads are admin-only and rejected without a provider', async () => {
  const user = await registerUser();
  const denied = await request('/api/media/upload', {
    method: 'POST',
    cookie: user.cookie,
    body: { filePath: '/tmp/x.jpg' },
  });
  assert.equal(denied.status, 403);

  const admin = await registerUser();
  await makeAdmin(admin.user.id);
  const noProvider = await request('/api/media/upload', {
    method: 'POST',
    cookie: admin.cookie,
    body: { filePath: '/tmp/x.jpg' },
  });
  assert.equal(noProvider.status, 501);
});

// ---------------------------------------------------------------------------
// Health / readiness
// ---------------------------------------------------------------------------
test('readiness endpoint reports ready when database is connected', async () => {
  const res = await request('/api/health/ready');
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ready');
});
