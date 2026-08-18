const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Environment — must be present before any request (JWT signing/verifying)
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = 'test-jwt-secret-notifications';
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
} = require('./helpers');

const razorpayService = require('../src/services/razorpay.service');
const Notification = require('../src/models/Notification');
const EmailLog = require('../src/models/EmailLog');
const Order = require('../src/models/Order');

// ---------------------------------------------------------------------------
// Fake Razorpay SDK (mirrors payment.test.js)
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

const placeOrder = async ({ cookie, addressId, paymentMethod = 'cod', quantity = 1 } = {}) => {
  const res = await request('/api/orders', {
    method: 'POST',
    cookie,
    body: { items: [{ productId, quantity, variant: null }], addressId, paymentMethod },
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

const countEmailsOfType = async (email, type) =>
  EmailLog.countDocuments({ recipient: email, type });

// ---------------------------------------------------------------------------
// Order confirmation
// ---------------------------------------------------------------------------
test('placing an order creates an in-app notification and order-confirmation email', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId });

  const notification = await Notification.findOne({ user: user.user.id }).sort({ createdAt: -1 }).lean();
  assert.ok(notification);
  assert.equal(notification.type, 'ORDER');
  assert.match(notification.message, new RegExp(order.orderNumber));

  const email = await EmailLog.findOne({ recipient: user.email, type: 'ORDER_CREATED' }).select('+html').lean();
  assert.ok(email);
  assert.equal(email.status, 'sent');
  assert.equal(email.provider, 'log');
  assert.match(email.subject, new RegExp(order.orderNumber));
  assert.ok(email.html.includes(order.orderNumber));
});

test('order emails render items with customer input escaped', async () => {
  const badProduct = await seedProduct({
    categoryId,
    name: 'Cool <script>alert(1)</script> Tee',
    price: 500,
    stock: 10,
  });
  const user = await createUserWithAddress();
  const res = await request('/api/orders', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      items: [{ productId: String(badProduct._id), quantity: 1, variant: null }],
      addressId: user.addressId,
      paymentMethod: 'cod',
    },
  });
  assert.equal(res.status, 201);

  const email = await EmailLog.findOne({ recipient: user.email, type: 'ORDER_CREATED' }).select('+html').sort({ createdAt: -1 }).lean();
  assert.ok(email);
  assert.ok(!email.html.includes('<script>alert(1)</script>'));
  assert.ok(email.html.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// Payment success + idempotency
// ---------------------------------------------------------------------------
test('payment success sends PAYMENT_SUCCESS email and in-app notification once', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'online' });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE });
  const res = await verifyPayment({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signPayment(rzOrderId, paymentId),
  });
  assert.equal(res.status, 200);

  assert.equal(await countEmailsOfType(user.email, 'PAYMENT_SUCCESS'), 1);
  const notification = await Notification.findOne({ user: user.user.id, type: 'PAYMENT' }).lean();
  assert.ok(notification);
  assert.match(notification.title, /Payment successful/);

  // Idempotency: a late captured webhook must not create a second email.
  const raw = webhookEnvelope('evt_late_capture', 'payment.captured', {
    id: paymentId,
    order_id: rzOrderId,
    amount: EXPECTED_PAISE,
    currency: 'INR',
  });
  await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });
  assert.equal(await countEmailsOfType(user.email, 'PAYMENT_SUCCESS'), 1);
});

// ---------------------------------------------------------------------------
// Payment failure
// ---------------------------------------------------------------------------
test('payment failure sends PAYMENT_FAILED and does not mark order paid', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'online' });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const raw = webhookEnvelope('evt_payment_failed_notif', 'payment.failed', {
    id: 'pay_failed_notif',
    order_id: rzOrderId,
    amount: EXPECTED_PAISE,
    currency: 'INR',
    error_description: 'Card declined',
  });
  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.stateChanged, true);

  assert.equal(await countEmailsOfType(user.email, 'PAYMENT_FAILED'), 1);
  const notification = await Notification.findOne({ user: user.user.id, type: 'PAYMENT' }).lean();
  assert.ok(notification);

  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'failed');
});

// ---------------------------------------------------------------------------
// Shipping / delivery (no duplicates on repeated status)
// ---------------------------------------------------------------------------
test('shipping transition emails once; repeated shipped does not duplicate', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'cod' });

  const admin = await createUserWithAddress();
  await makeAdmin(admin.user.id);

  const setStatus = async (status) =>
    request(`/api/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status },
    });

  const shipped = await setStatus('shipped');
  assert.equal(shipped.status, 200);
  assert.equal(await countEmailsOfType(user.email, 'ORDER_SHIPPED'), 1);
  assert.equal(await Notification.countDocuments({ user: user.user.id, type: 'SHIPPING' }), 1);

  // Repeated shipped with no real transition must not notify again.
  const again = await setStatus('shipped');
  assert.equal(again.status, 200);
  assert.equal(await countEmailsOfType(user.email, 'ORDER_SHIPPED'), 1);
  assert.equal(await Notification.countDocuments({ user: user.user.id, type: 'SHIPPING' }), 1);
});

test('delivery transition sends ORDER_DELIVERED email and notification', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'cod' });

  const admin = await createUserWithAddress();
  await makeAdmin(admin.user.id);

  const setStatus = async (status) =>
    request(`/api/admin/orders/${order.id}/status`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { status },
    });

  await setStatus('shipped');
  const delivered = await setStatus('delivered');
  assert.equal(delivered.status, 200);
  assert.equal(await countEmailsOfType(user.email, 'ORDER_DELIVERED'), 1);
  assert.equal(await Notification.countDocuments({ user: user.user.id, type: 'DELIVERY' }), 1);

  const orderDoc = await Order.findById(order.id).lean();
  assert.ok(orderDoc.deliveredAt);
});

// ---------------------------------------------------------------------------
// Cancellation + refund
// ---------------------------------------------------------------------------
test('cancelling a COD order sends cancellation (no refund) notifications', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'cod' });

  const res = await request(`/api/orders/${order.id}/cancel`, {
    method: 'DELETE',
    cookie: user.cookie,
    body: { reason: 'Changed my mind' },
  });
  assert.equal(res.status, 200);

  assert.equal(await countEmailsOfType(user.email, 'ORDER_CANCELLED'), 1);
  assert.equal(await Notification.countDocuments({ user: user.user.id, type: 'ORDER' }), 2); // created + cancelled
  // COD was never paid -> no refund email.
  assert.equal(await countEmailsOfType(user.email, 'REFUND_COMPLETED'), 0);
});

test('cancelling a paid order sends REFUND_COMPLETED to customer and admin alert', async () => {
  const user = await createUserWithAddress();
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'online' });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;
  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE });
  await verifyPayment({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signPayment(rzOrderId, paymentId),
  });

  const admin = await createUserWithAddress();
  await makeAdmin(admin.user.id);

  // Paid online orders start 'pending'; confirm before the user can cancel.
  const confirm = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'confirmed' },
  });
  assert.equal(confirm.status, 200);

  const res = await request(`/api/orders/${order.id}/cancel`, {
    method: 'DELETE',
    cookie: user.cookie,
    body: { reason: 'Duplicate order' },
  });
  assert.equal(res.status, 200);

  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'refunded');

  assert.equal(await countEmailsOfType(user.email, 'ORDER_CANCELLED'), 1);
  assert.equal(await countEmailsOfType(user.email, 'REFUND_COMPLETED'), 1);
  assert.equal(await Notification.countDocuments({ user: user.user.id, type: 'REFUND' }), 1);
  // Admin in-app alert created.
  assert.equal(await Notification.countDocuments({ user: admin.user.id, type: 'REFUND' }), 1);
});

// ---------------------------------------------------------------------------
// Email failure isolation + retries
// ---------------------------------------------------------------------------
test('email provider failure does not fail the order; log records failed status', async () => {
  process.env.EMAIL_ENABLED = 'true';
  process.env.EMAIL_PROVIDER = 'smtp';
  delete process.env.SMTP_HOST;

  try {
    const user = await createUserWithAddress();
    const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId });

    // Order still placed successfully despite the email failure.
    assert.ok(order.id);

    const email = await EmailLog.findOne({ recipient: user.email, type: 'ORDER_CREATED' }).sort({ createdAt: -1 }).lean();
    assert.ok(email);
    assert.equal(email.status, 'failed');
    assert.ok(email.attempts >= 1);
    assert.match(email.lastError, /SMTP_HOST/);
    assert.ok(email.nextRetryAt);

    // In-app notification is independent of the email failure.
    assert.equal(await Notification.countDocuments({ user: user.user.id, type: 'ORDER' }), 1);
  } finally {
    delete process.env.EMAIL_ENABLED;
    delete process.env.EMAIL_PROVIDER;
  }
});

test('admin retry endpoint increments attempts and respects max retries', async () => {
  process.env.EMAIL_ENABLED = 'true';
  process.env.EMAIL_PROVIDER = 'smtp';
  delete process.env.SMTP_HOST;
  process.env.EMAIL_MAX_RETRIES = '2';

  let logId;
  try {
    const user = await createUserWithAddress();
    await placeOrder({ cookie: user.cookie, addressId: user.addressId });
    const email = await EmailLog.findOne({ recipient: user.email, type: 'ORDER_CREATED' }).sort({ createdAt: -1 }).lean();
    logId = String(email._id);
    assert.equal(email.attempts, 1);

    const admin = await createUserWithAddress();
    await makeAdmin(admin.user.id);

    const retry = await request(`/api/admin/emails/${logId}/retry`, { method: 'POST', cookie: admin.cookie });
    assert.equal(retry.status, 200);
    assert.equal(retry.json.data.email.attempts, 2);
    assert.equal(retry.json.data.email.status, 'failed');

    // Max retries reached -> further retries are no-ops.
    const retryAgain = await request(`/api/admin/emails/${logId}/retry`, { method: 'POST', cookie: admin.cookie });
    assert.equal(retryAgain.status, 200);
    assert.equal(retryAgain.json.data.email.attempts, 2);

    // Non-admin cannot retry.
    const other = await createUserWithAddress();
    const denied = await request(`/api/admin/emails/${logId}/retry`, { method: 'POST', cookie: other.cookie });
    assert.equal(denied.status, 403);
  } finally {
    delete process.env.EMAIL_ENABLED;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_MAX_RETRIES;
  }
});

// ---------------------------------------------------------------------------
// Notification API: list, unread, read-all, ownership, preferences
// ---------------------------------------------------------------------------
test('GET /api/notifications returns own notifications with pagination', async () => {
  const user = await createUserWithAddress();
  await placeOrder({ cookie: user.cookie, addressId: user.addressId });

  const res = await request('/api/notifications', { cookie: user.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.ok(res.json.data.notifications.length >= 1);
  assert.ok(res.json.data.pagination.total >= 1);
  assert.equal(res.json.data.notifications[0].isRead, false);
});

test('unread count and mark-all-read', async () => {
  const user = await createUserWithAddress();
  await placeOrder({ cookie: user.cookie, addressId: user.addressId });

  const before = await request('/api/notifications/unread-count', { cookie: user.cookie });
  assert.equal(before.status, 200);
  assert.ok(before.json.data.unreadCount >= 1);

  const markAll = await request('/api/notifications/read-all', { method: 'PATCH', cookie: user.cookie });
  assert.equal(markAll.status, 200);

  const after = await request('/api/notifications/unread-count', { cookie: user.cookie });
  assert.equal(after.json.data.unreadCount, 0);
});

test('mark-as-read and delete only work on own notifications', async () => {
  const owner = await createUserWithAddress();
  await placeOrder({ cookie: owner.cookie, addressId: owner.addressId });
  const notification = await Notification.findOne({ user: owner.user.id }).sort({ createdAt: -1 }).lean();

  const other = await createUserWithAddress();

  const readOwn = await request(`/api/notifications/${notification._id}/read`, {
    method: 'PATCH',
    cookie: owner.cookie,
  });
  assert.equal(readOwn.status, 200);
  assert.equal(readOwn.json.data.notification.isRead, true);

  const readOther = await request(`/api/notifications/${notification._id}/read`, {
    method: 'PATCH',
    cookie: other.cookie,
  });
  assert.equal(readOther.status, 404);

  const deleteOwn = await request(`/api/notifications/${notification._id}`, {
    method: 'DELETE',
    cookie: owner.cookie,
  });
  assert.equal(deleteOwn.status, 200);
  assert.equal(await Notification.countDocuments({ _id: notification._id }), 0);

  const deleteOther = await request(`/api/notifications/${notification._id}`, {
    method: 'DELETE',
    cookie: other.cookie,
  });
  assert.equal(deleteOther.status, 404);
});

test('preferences update rejects non-boolean values', async () => {
  const user = await createUserWithAddress();
  const bad = await request('/api/notifications/preferences', {
    method: 'PATCH',
    cookie: user.cookie,
    body: { emailShippingUpdates: 'yes' },
  });
  assert.equal(bad.status, 400);

  const ok = await request('/api/notifications/preferences', {
    method: 'PATCH',
    cookie: user.cookie,
    body: { emailShippingUpdates: false },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.preferences.emailShippingUpdates, false);
});

test('disabling emailShippingUpdates suppresses shipping email but keeps in-app notification', async () => {
  const user = await createUserWithAddress();
  await request('/api/notifications/preferences', {
    method: 'PATCH',
    cookie: user.cookie,
    body: { emailShippingUpdates: false },
  });
  const order = await placeOrder({ cookie: user.cookie, addressId: user.addressId });

  const admin = await createUserWithAddress();
  await makeAdmin(admin.user.id);
  const res = await request(`/api/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'shipped' },
  });
  assert.equal(res.status, 200);

  assert.equal(await countEmailsOfType(user.email, 'ORDER_SHIPPED'), 0);
  assert.equal(await Notification.countDocuments({ user: user.user.id, type: 'SHIPPING' }), 1);
});

test('notification endpoints require authentication', async () => {
  const res = await request('/api/notifications');
  assert.equal(res.status, 401);
});
