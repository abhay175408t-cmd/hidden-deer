const AppError = require('./AppError');

const CURRENCY = 'INR';

const PAYMENT_STATUSES = ['created', 'pending', 'authorized', 'captured', 'failed', 'refunded'];
const ORDER_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

// Per-payment-document transitions. A failed attempt never becomes captured
// on its own document: a retry creates a NEW payment document instead.
const ALLOWED_TRANSITIONS = {
  created: ['pending', 'authorized', 'captured', 'failed'],
  pending: ['authorized', 'captured', 'failed'],
  authorized: ['captured', 'failed'],
  captured: ['captured', 'refunded'],
  failed: [],
  refunded: [],
};

// Ordered precedence so stale events can never downgrade a newer state.
const STATE_PRECEDENCE = {
  created: 0,
  pending: 1,
  authorized: 2,
  captured: 3,
  refunded: 3.5,
  failed: 2,
};

// Maps a payment state to the order-level paymentStatus it implies.
const ORDER_STATUS_FOR_PAYMENT = {
  created: 'pending',
  pending: 'pending',
  authorized: 'pending',
  captured: 'paid',
  failed: 'failed',
  refunded: 'refunded',
};

// Converts rupees -> paise. Razorpay expects amounts in the smallest currency
// unit as an integer. Math.round eliminates floating point drift (e.g. 1999.99).
const toSmallestCurrencyUnit = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    throw new AppError('Amount must be a finite number', 400);
  }
  if (value <= 0) {
    throw new AppError('Amount must be greater than zero', 400);
  }
  return Math.round(value * 100);
};

const fromSmallestCurrencyUnit = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError('Amount must be a non-negative number', 400);
  }
  return value / 100;
};

const validatePaymentStatus = (status) => {
  if (!PAYMENT_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${PAYMENT_STATUSES.join(', ')}`, 400);
  }
  return status;
};

const canTransitionPayment = (from, to) => {
  validatePaymentStatus(from);
  validatePaymentStatus(to);
  if (from === to) return true; // idempotent self-transition
  return ALLOWED_TRANSITIONS[from].includes(to);
};

// Stale-event guard: a state may only advance, never downgrade.
const canUpgradePayment = (from, to) => STATE_PRECEDENCE[to] >= STATE_PRECEDENCE[from];

// Returns the order.paymentStatus implied by the given payment state.
// Accepts either a status string ("captured") or a payment-like object with a
// `.status` field so both `syncOrderPaymentStatus('captured')` and
// `syncOrderPaymentStatus(paymentDoc)` resolve to the same order-level status.
const syncOrderPaymentStatus = (payment) => {
  const status = typeof payment === 'string' ? payment : payment?.status;
  return ORDER_STATUS_FOR_PAYMENT[validatePaymentStatus(status)] || 'pending';
};

const isTerminalPaymentStatus = (status) => ['captured', 'failed', 'refunded'].includes(status);

const sanitizeFailureReason = (reason) => {
  if (!reason) return null;
  return String(reason).slice(0, 200);
};

module.exports = {
  CURRENCY,
  PAYMENT_STATUSES,
  ORDER_PAYMENT_STATUSES,
  toSmallestCurrencyUnit,
  fromSmallestCurrencyUnit,
  validatePaymentStatus,
  canTransitionPayment,
  canUpgradePayment,
  syncOrderPaymentStatus,
  isTerminalPaymentStatus,
  sanitizeFailureReason,
};