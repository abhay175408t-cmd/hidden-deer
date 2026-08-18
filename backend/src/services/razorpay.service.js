const crypto = require('crypto');
const Razorpay = require('razorpay');
const AppError = require('../utils/AppError');

// ---------------------------------------------------------------------------
// Official SDK interface. Razorpay instances exposed here; controllers and the
// payment service should never call the SDK directly.
// ---------------------------------------------------------------------------

let instance = null;

const getKeyId = () => process.env.RAZORPAY_KEY_ID;
const getKeySecret = () => process.env.RAZORPAY_KEY_SECRET;
const getWebhookSecret = () => process.env.RAZORPAY_WEBHOOK_SECRET;

const getInstance = () => {
  if (!instance) {
    instance = new Razorpay({
      key_id: getKeyId(),
      key_secret: getKeySecret(),
    });
  }
  return instance;
};

// Allow test suites to inject a fake provider transport.
const __setInstance = (fake) => {
  instance = fake;
};

const createOrder = async ({ amount, currency, receipt }) => {
  try {
    const order = await getInstance().orders.create({
      amount, // smallest currency unit, e.g. INR paise
      currency,
      receipt,
    });
    return order; // { id, entity, amount, amount_paid, currency, receipt, status }
  } catch (error) {
    throw new AppError(`Razorpay order creation failed: ${error.message}`, 502);
  }
};

const fetchOrder = async (orderId) => {
  try {
    return await getInstance().orders.fetch(orderId);
  } catch (error) {
    throw new AppError(`Razorpay order fetch failed: ${error.message}`, 502);
  }
};

const fetchPayment = async (paymentId) => {
  try {
    return await getInstance().payments.fetch(paymentId);
  } catch (error) {
    throw new AppError(`Razorpay payment fetch failed: ${error.message}`, 502);
  }
};

const timingSafeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

// Payment signature verification using Razorpay's documented scheme:
// HMAC-SHA256 over `${paymentId}|${orderId}` with the API key secret.
// This is the official verification mechanism, not a custom hash.
const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new AppError('orderId, paymentId and signature are required', 400);
  }
  const expected = crypto
    .createHmac('sha256', getKeySecret())
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  if (!timingSafeEqualHex(expected, razorpaySignature)) {
    throw new AppError('Invalid payment signature', 400);
  }
  return true;
};

// Webhook signature verification. Razorpay's webhook secret is distinct from
// the API key secret; 400 means "do not process this payload".
const verifyWebhookSignature = (rawBody, signature) => {
  if (!signature) {
    throw new AppError('Webhook signature header is missing', 400);
  }
  const expected = crypto
    .createHmac('sha256', getWebhookSecret())
    .update(rawBody)
    .digest('hex');
  if (!timingSafeEqualHex(expected, signature)) {
    throw new AppError('Invalid webhook signature', 400);
  }
  return true;
};

module.exports = {
  __setInstance,
  getKeyId,
  createOrder,
  fetchOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
};