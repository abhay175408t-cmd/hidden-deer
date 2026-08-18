const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  connectTestDb,
  disconnectTestDb,
  startServer,
  stopServer,
  request,
  registerUser,
  seedCategory,
  seedProduct,
  seedAddressPayload,
} = require('./helpers');

const razorpayService = require('../src/services/razorpay.service');
const paymentUtil = require('../src/utils/payment.util');

// ---------------------------------------------------------------------------
// Fake Razorpay SDK transport (shaped like the official SDK instance).
// Signature math below is real HMAC-SHA256 against the test secrets, which is
// exactly what the official SDK/crypto flow does.
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
        const order = { id, entity: 'order', amount, amount_paid: 0, currency, receipt, status: 'created', attempts: [] };
        orders.set(id, order);
        return order;
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
    // Test helper: register a provider-side payment attached to a razorpay order.
    addPayment: (orderId, overrides = {}) => {
      const id = `pay_test_${paySeq++}`;
      const payment = {
        id,
        entity: 'payment',
        order_id: orderId,
        amount: 109900, // ₹1099 = ₹1000 + ₹99 shipping? see placeOnlineOrder
        currency: 'INR',
        status: 'captured',
        method: 'card',
        ...overrides,
      };
      payments.set(id, payment);
      return id;
    },
    orderCount: () => orders.size,
  };
};

const fake = makeFakeRazorpay();

// Test secrets — must match whatever the service reads from process.env.
const TEST_KEY_ID = 'rzp_test_unitkeyid';
const TEST_KEY_SECRET = 'test-key-secret-abcdef123456';
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-987654';

const signPayment = (orderId, paymentId) =>
  crypto.createHmac('sha256', TEST_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const signWebhook = (rawBody) =>
  crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBody).digest('hex');

const webhookEnvelope = (eventId, type, entity, inOrder = false) =>
  JSON.stringify({
    id: eventId,
    type,
    payload: { [inOrder ? 'order' : 'payment']: { entity } },
  });

// Expected paise for the order the helper places: ₹1000 subtotal + ₹99 shipping.
const EXPECTED_PAISE = () => 109900;

let categoryId;
let productId;

before(async () => {
  process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
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

const placeOnlineOrder = async ({ cookie, addressId, quantity = 1, paymentMethod = 'online' } = {}) => {
  const res = await request('/api/orders', {
    method: 'POST',
    cookie,
    body: {
      items: [{ productId, quantity, variant: null }],
      addressId,
      paymentMethod,
      couponCode: undefined,
    },
  });
  assert.equal(res.status, 201);
  return res.json.data.order;
};

const createPaymentOrder = async ({ cookie, orderId }) =>
  request('/api/payments/create', { method: 'POST', cookie, body: { orderId } });

const verifyPaymentRequest = async ({ cookie, orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) =>
  request('/api/payments/verify', {
    method: 'POST',
    cookie,
    body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
  });

// ---------------------------------------------------------------------------
// Unit tests — amount conversion
// ---------------------------------------------------------------------------
test('toSmallestCurrencyUnit converts rupees to paise', () => {
  const { toSmallestCurrencyUnit } = require('../src/utils/payment.util');
  assert.equal(toSmallestCurrencyUnit(999), 99900);
  assert.equal(toSmallestCurrencyUnit(1999), 199900);
  assert.equal(toSmallestCurrencyUnit(0.5), 50);
  assert.equal(toSmallestCurrencyUnit(1), 100);
  // floating point safe rounding
  assert.equal(toSmallestCurrencyUnit(1999.99), 199999);
  assert.throws(() => toSmallestCurrencyUnit(0), /greater than zero/);
  assert.throws(() => toSmallestCurrencyUnit(-5), /greater than zero/);
  assert.throws(() => toSmallestCurrencyUnit(NaN), /finite/);
});

test('syncOrderPaymentStatus maps payment states to order states', () => {
  const { syncOrderPaymentStatus, canTransitionPayment, canUpgradePayment } = require('../src/utils/payment.util');
  assert.equal(syncOrderPaymentStatus('captured'), 'paid');
  assert.equal(syncOrderPaymentStatus('failed'), 'failed');
  assert.equal(syncOrderPaymentStatus('created'), 'pending');
  assert.equal(syncOrderPaymentStatus('pending'), 'pending');
  assert.equal(syncOrderPaymentStatus('authorized'), 'pending');
  assert.equal(syncOrderPaymentStatus('refunded'), 'refunded');

  assert.equal(canTransitionPayment('created', 'captured'), true);
  assert.equal(canTransitionPayment('captured', 'failed'), false);
  assert.equal(canTransitionPayment('failed', 'captured'), false);
  assert.equal(canTransitionPayment('captured', 'captured'), true);

  assert.equal(canUpgradePayment('created', 'captured'), true);
  assert.equal(canUpgradePayment('captured', 'failed'), false); // stale downgrade blocked
  assert.equal(canUpgradePayment('failed', 'captured'), true);
  assert.equal(canUpgradePayment('captured', 'refunded'), true);
});

// ---------------------------------------------------------------------------
// Payment order creation
// ---------------------------------------------------------------------------
test('creates razorpay payment order with server-derived amount', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });

  const res = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);

  const data = res.json.data.payment;
  assert.equal(data.keyId, TEST_KEY_ID);
  assert.match(data.razorpayOrderId, /^order_test_/);
  assert.equal(data.orderId, order.id);
  assert.equal(data.amount, EXPECTED_PAISE()); // ₹1099 -> 109900 paise
  assert.equal(data.currency, 'INR');
  // No secrets ever returned.
  assert.equal(data.keySecret, undefined);
  assert.equal(data.webhookSecret, undefined);
});

test('payment order creation is idempotent (reuses active attempt)', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const before = fake.orderCount();

  const first = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const second = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.json.message, 'Existing payment order reused');
  assert.equal(second.json.data.payment.razorpayOrderId, first.json.data.payment.razorpayOrderId);
  assert.equal(fake.orderCount(), before + 1); // only ONE razorpay order created
});

test('cannot create payment order for another user order', async () => {
  const owner = await createUserWithAddress();
  const other = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: owner.cookie, addressId: owner.addressId });

  const res = await createPaymentOrder({ cookie: other.cookie, orderId: order.id });
  assert.equal(res.status, 404);
  assert.equal(res.json.success, false);
});

test('COD orders never go through razorpay', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'cod' });

  const res = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /COD/);
});

test('cancelled or delivered orders cannot be paid', async () => {
  const Order = require('../src/models/Order');
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  await Order.findByIdAndUpdate(order.id, { orderStatus: 'cancelled' });

  const res = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /cancelled/i);
});

test('already paid orders cannot create a new payment order', async () => {
  const Order = require('../src/models/Order');
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  await Order.findByIdAndUpdate(order.id, { paymentStatus: 'paid' });

  const res = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /already paid/i);
});

// ---------------------------------------------------------------------------
// Payment verification
// ---------------------------------------------------------------------------
test('verifies payment with valid signature, amount and currency', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE() });
  const signature = signPayment(rzOrderId, paymentId);

  const res = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.json.data.payment.status, 'captured');
  assert.equal(res.json.data.payment.signatureVerified, true);

  // Order synchronized: paid, total untouched.
  const Order = require('../src/models/Order');
  const updated = await Order.findById(order.id).lean();
  assert.equal(updated.paymentStatus, 'paid');
  assert.equal(updated.total, 1099);
  assert.equal(updated.orderStatus, 'pending'); // order status untouched by payment
});

test('rejects payment with modified/invalid signature', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE() });
  const badSignature = signPayment(rzOrderId, paymentId).replace(/^.{6}/, 'aaaaaa');

  const res = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: badSignature,
  });

  assert.equal(res.status, 400);
  assert.match(res.json.message, /signature/i);

  const Payment = require('../src/models/Payment');
  const payment = await Payment.findOne({ order: order.id }).lean();
  assert.notEqual(payment.status, 'captured');
  assert.equal(payment.signatureVerified, false);
  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'pending');
});

test('rejects verification when provider amount does not match order total', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  // Provider reports ₹999 (99900 paise) instead of ₹1099.
  const paymentId = fake.addPayment(rzOrderId, { amount: 99900 });
  const signature = signPayment(rzOrderId, paymentId);

  const res = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  assert.equal(res.status, 400);
  assert.match(res.json.message, /amount/i);

  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'pending');
});

test('rejects verification when provider currency is not INR', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE(), currency: 'USD' });
  const signature = signPayment(rzOrderId, paymentId);

  const res = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  assert.equal(res.status, 400);
  assert.match(res.json.message, /currency/i);
});

test('rejects verification when provider payment belongs to a different order', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  // payment attached to a DIFFERENT razorpay order than ours
  const otherOrderId = 'order_test_999999';
  const paymentId = fake.addPayment(otherOrderId, { amount: EXPECTED_PAISE() });
  const signature = signPayment(rzOrderId, paymentId);

  const res = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  assert.equal(res.status, 400);
  assert.match(res.json.message, /does not belong/i);
});

test('verification is idempotent for an already captured payment', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;
  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE() });

  const first = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signPayment(rzOrderId, paymentId),
  });
  const second = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signPayment(rzOrderId, paymentId),
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.json.message, 'Payment already verified');

  const Payment = require('../src/models/Payment');
  const count = await Payment.countDocuments({ order: order.id });
  assert.equal(count, 1);
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
test('webhook: valid captured event marks order paid', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;
  const paymentId = 'pay_webhook_captured_1';

  const raw = webhookEnvelope('evt_captured_1', 'payment.captured', {
    id: paymentId,
    order_id: rzOrderId,
    amount: EXPECTED_PAISE(),
    currency: 'INR',
    method: 'upi',
  });

  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.json.duplicate, undefined);
  assert.equal(res.json.processed, true);

  const Payment = require('../src/models/Payment');
  const payment = await Payment.findOne({ order: order.id }).lean();
  assert.equal(payment.status, 'captured');
  assert.equal(payment.webhookVerified, true);
  assert.equal(payment.providerPaymentId, paymentId);
  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'paid');
  assert.equal(orderDoc.total, 1099);
});

test('webhook: duplicate event is acknowledged but not reprocessed', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const raw = webhookEnvelope('evt_captured_dup', 'payment.captured', {
    id: 'pay_dup',
    order_id: rzOrderId,
    amount: EXPECTED_PAISE(),
    currency: 'INR',
  });

  const first = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });
  const second = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.json.duplicate, true);

  const WebhookEvent = require('../src/models/WebhookEvent');
  const count = await WebhookEvent.countDocuments({ eventId: 'evt_captured_dup' });
  assert.equal(count, 1);
});

test('webhook: invalid signature returns 400 and changes nothing', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const raw = webhookEnvelope('evt_bad_sig', 'payment.captured', {
    id: 'pay_bad',
    order_id: rzOrderId,
    amount: EXPECTED_PAISE(),
    currency: 'INR',
  });

  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': 'invalidsignature' },
  });

  assert.equal(res.status, 400);
  const WebhookEvent = require('../src/models/WebhookEvent');
  assert.equal(await WebhookEvent.countDocuments({ eventId: 'evt_bad_sig' }), 0);
  const Payment = require('../src/models/Payment');
  const payment = await Payment.findOne({ order: order.id }).lean();
  assert.equal(payment.status, 'created');
  assert.equal(payment.webhookVerified, false);
  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'pending');
});

test('webhook: payment.failed marks payment and order failed', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const raw = webhookEnvelope('evt_failed_1', 'payment.failed', {
    id: 'pay_failed_1',
    order_id: rzOrderId,
    amount: EXPECTED_PAISE(),
    currency: 'INR',
    error_code: 'BAD_ISSUER',
    error_description: 'Bank declined the transaction',
  });

  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });

  assert.equal(res.status, 200);
  const Payment = require('../src/models/Payment');
  const payment = await Payment.findOne({ order: order.id }).lean();
  assert.equal(payment.status, 'failed');
  assert.equal(payment.webhookVerified, true);
  assert.equal(payment.failureReason, 'Bank declined the transaction');
  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'failed');
  // order stays eligible for retry, not cancelled
  assert.equal(orderDoc.orderStatus, 'pending');
});

test('stale failed webhook cannot downgrade a paid order', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;
  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE() });

  // 1) Captured via normal verification.
  await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signPayment(rzOrderId, paymentId),
  });

  // 2) An OLD failed webhook arrives afterwards.
  const raw = webhookEnvelope('evt_stale_failed', 'payment.failed', {
    id: paymentId,
    order_id: rzOrderId,
    amount: EXPECTED_PAISE(),
    currency: 'INR',
    error_code: 'OLD_FAILURE',
  });

  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.commitStateChanged, false);

  const Payment = require('../src/models/Payment');
  const payment = await Payment.findOne({ order: order.id }).lean();
  assert.equal(payment.status, 'captured'); // not downgraded
  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'paid'); // still paid
});

test('webhook captured with amount mismatch is not trusted', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;

  const raw = webhookEnvelope('evt_amount_bad', 'payment.captured', {
    id: 'pay_amount_bad',
    order_id: rzOrderId,
    amount: 5000, // wrong
    currency: 'INR',
  });

  const res = await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: raw,
    headers: { 'x-razorpay-signature': signWebhook(raw) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.processed, true);
  assert.equal(res.json.stateChanged, false);

  const Payment = require('../src/models/Payment');
  const payment = await Payment.findOne({ order: order.id }).lean();
  assert.notEqual(payment.status, 'captured');
  assert.ok(payment.metadata.anomalies.length >= 1);
  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'pending');
});

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------
test('payment retry after failure keeps old attempt and creates a new one', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });

  // Attempt 1 -> failed
  const first = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrder1 = first.json.data.payment.razorpayOrderId;
  const rawFailed = webhookEnvelope('evt_retry_fail', 'payment.failed', {
    id: 'pay_retry_fail',
    order_id: rzOrder1,
    amount: EXPECTED_PAISE(),
    currency: 'INR',
  });
  await request('/api/payments/webhook', {
    method: 'POST',
    rawBody: rawFailed,
    headers: { 'x-razorpay-signature': signWebhook(rawFailed) },
  });

  // Retry: creates a NEW razorpay order + payment document.
  const retry = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  assert.equal(retry.status, 201);
  const rzOrder2 = retry.json.data.payment.razorpayOrderId;
  assert.notEqual(rzOrder2, rzOrder1);

  const Payment = require('../src/models/Payment');
  const attempts = await Payment.find({ order: order.id }).sort({ createdAt: 1 }).lean();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].status, 'failed'); // old attempt stays failed
  assert.equal(attempts[1].status, 'created'); // new attempt eligible

  // Attempt 2 -> captured
  const paymentId2 = fake.addPayment(rzOrder2, { amount: EXPECTED_PAISE() });
  const verify = await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrder2,
    razorpayPaymentId: paymentId2,
    razorpaySignature: signPayment(rzOrder2, paymentId2),
  });
  assert.equal(verify.status, 200);
  assert.equal(verify.json.data.payment.status, 'captured');

  const Order = require('../src/models/Order');
  const orderDoc = await Order.findById(order.id).lean();
  assert.equal(orderDoc.paymentStatus, 'paid');

  const after = await Payment.find({ order: order.id }).sort({ createdAt: 1 }).lean();
  assert.equal(after[0].status, 'failed');
  assert.equal(after[1].status, 'captured');
});

// ---------------------------------------------------------------------------
// Lookups + admin visibility
// ---------------------------------------------------------------------------
test('payment status lookup returns safe data for own order only', async () => {
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  await createPaymentOrder({ cookie: user.cookie, orderId: order.id });

  const own = await request(`/api/payments/order/${order.id}`, { cookie: user.cookie });
  assert.equal(own.status, 200);
  assert.equal(own.json.data.payment.status, 'created');
  assert.equal(own.json.data.payment.provider, 'razorpay');
  assert.equal(own.json.data.payment.amount, 1099);
  assert.equal(own.json.data.payment.currency, 'INR');
  assert.equal(own.json.data.payment.keySecret, undefined);

  const other = await createUserWithAddress();
  const denied = await request(`/api/payments/order/${order.id}`, { cookie: other.cookie });
  assert.equal(denied.status, 404);
});

test('payment endpoints require authentication', async () => {
  const res = await request('/api/payments/order/000000000000000000000000');
  assert.equal(res.status, 401);
});

test('admin order endpoint exposes payment details without secrets', async () => {
  const { makeAdmin } = require('./helpers');
  const user = await createUserWithAddress();
  const order = await placeOnlineOrder({ cookie: user.cookie, addressId: user.addressId });
  const created = await createPaymentOrder({ cookie: user.cookie, orderId: order.id });
  const rzOrderId = created.json.data.payment.razorpayOrderId;
  const paymentId = fake.addPayment(rzOrderId, { amount: EXPECTED_PAISE(), method: 'netbanking' });
  await verifyPaymentRequest({
    cookie: user.cookie,
    orderId: order.id,
    razorpayOrderId: rzOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signPayment(rzOrderId, paymentId),
  });

  const admin = await createUserWithAddress();
  await makeAdmin(admin.user.id);

  const res = await request('/api/admin/orders', { cookie: admin.cookie });
  assert.equal(res.status, 200);
  const target = res.json.data.orders.find((o) => o.id === order.id);
  assert.ok(target);
  assert.ok(Array.isArray(target.payments));
  assert.equal(target.payments.length, 1);
  assert.equal(target.payments[0].status, 'captured');
  assert.equal(target.payments[0].provider, 'razorpay');
  assert.equal(target.payments[0].providerOrderId, rzOrderId);
  assert.equal(target.payments[0].providerPaymentId, paymentId);
  assert.equal(target.payments[0].keySecret, undefined);
  assert.equal(target.payments[0].webhookSecret, undefined);
});

test('no sensitive card data is stored on payments', async () => {
  const Payment = require('../src/models/Payment');
  await require('../src/services/payment.service').createPaymentOrder({
    userId: (await createUserWithAddress()).user.id,
    orderId: null,
  }).catch(() => {}); // no-op guard: document may not exist yet
  const doc = await Payment.findOne().lean();
  if (!doc) return; // payment docs are created by other tests
  const keys = Object.keys(doc);
  for (const forbidden of ['card', 'cvv', 'otp', 'pin', 'password', 'token', 'secret']) {
    const hit = keys.some((k) => k.toLowerCase().includes(forbidden));
    assert.equal(hit, false, `payment doc must not contain ${forbidden} field`);
  }
});