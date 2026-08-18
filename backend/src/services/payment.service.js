const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const WebhookEvent = require('../models/WebhookEvent');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');
const paymentUtil = require('../utils/payment.util');
const razorpayService = require('./razorpay.service');
const { withTransaction } = require('../utils/transaction.util');
const notificationService = require('./notification.service');

const PROVIDER = 'razorpay';

// ---------------------------------------------------------------------------
// Serialization — only safe fields, never secrets.
// ---------------------------------------------------------------------------
const serializePayment = (payment) => ({
  id: payment._id,
  order: payment.order,
  provider: payment.provider,
  providerOrderId: payment.providerOrderId,
  providerPaymentId: payment.providerPaymentId || null,
  amount: payment.amount,
  currency: payment.currency,
  status: payment.status,
  method: payment.method || null,
  failureReason: payment.failureReason || null,
  signatureVerified: payment.signatureVerified,
  webhookVerified: payment.webhookVerified,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
});

const recordAnomaly = (payment, type, detail) => {
  payment.metadata = {
    ...(payment.metadata || {}),
    anomalies: [...(payment.metadata?.anomalies || []), { type, detail, at: new Date() }],
  };
};

// ---------------------------------------------------------------------------
// 1. Create payment order (idempotent retry support)
// ---------------------------------------------------------------------------
const createPaymentOrder = async ({ userId, orderId }) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError('Invalid order id', 400);
  }

  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError('Order not found', 404);

  if (order.paymentMethod === 'cod') {
    throw new AppError('COD orders do not require online payment', 400);
  }
  if (order.orderStatus === 'cancelled') {
    throw new AppError('Cannot pay for a cancelled order', 400);
  }
  if (order.orderStatus === 'delivered') {
    throw new AppError('Cannot pay for a delivered order', 400);
  }
  if (order.paymentStatus === 'paid') {
    throw new AppError('Order is already paid', 400);
  }
  if (order.paymentStatus === 'refunded') {
    throw new AppError('Order payment has been refunded', 400);
  }

  // Idempotency / duplicate protection: reuse an active (created/pending)
  // payment order for this order instead of creating another Razorpay order.
  const active = await Payment.findOne({
    order: order._id,
    provider: PROVIDER,
    status: { $in: ['created', 'pending', 'authorized'] },
  }).sort({ createdAt: -1 });

  if (active && active.providerOrderId) {
    return {
      payment: active,
      order,
      reused: true,
    };
  }

  const amountPaise = paymentUtil.toSmallestCurrencyUnit(order.total);
  const rzOrder = await razorpayService.createOrder({
    amount: amountPaise,
    currency: paymentUtil.CURRENCY,
    receipt: order.orderNumber,
  });

  const payment = await Payment.create({
    order: order._id,
    user: userId,
    provider: PROVIDER,
    providerOrderId: rzOrder.id,
    amount: order.total, // rupees; verified against provider paise later
    currency: paymentUtil.CURRENCY,
    status: 'created',
    metadata: { receipt: order.orderNumber },
  });

  return { payment, order, reused: false };
};

// ---------------------------------------------------------------------------
// 2. Verify payment (signature + ownership + amount + currency + matching)
// ---------------------------------------------------------------------------
const verifyPayment = async ({ userId, orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  // 1) Signature first — nothing may be processed without authentication.
  razorpayService.verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });

  // 2) Ownership — the order must belong to the authenticated user.
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError('Order not found', 404);

  // 3) The razorpay order id must belong to this order's payment records.
  const payment = await Payment.findOne({
    order: order._id,
    provider: PROVIDER,
    providerOrderId: razorpayOrderId,
  });
  if (!payment) {
    throw new AppError('Payment attempt not found for this order', 404);
  }

  // 4) Idempotent: a previously verified captured payment stays captured.
  if (payment.status === 'captured' && payment.providerPaymentId === razorpayPaymentId) {
    return { payment, order, alreadyVerified: true };
  }

  // 5) Fetch authoritative payment state from the provider. Never trust the
  //    client's claims about amount, status or payment id.
  const rzPayment = await razorpayService.fetchPayment(razorpayPaymentId);

  // 6) Matching: provider payment must reference our razorpay order.
  if (rzPayment.order_id !== razorpayOrderId) {
    await recordAnomalyAndSave(payment, 'payment_order_mismatch', {
      paymentOrderId: rzPayment.order_id,
    });
    throw new AppError('Payment does not belong to this order', 400);
  }

  // 7) Amount validation against the internal order total (paise).
  const expectedPaise = paymentUtil.toSmallestCurrencyUnit(order.total);
  if (rzPayment.amount !== expectedPaise) {
    await recordAnomalyAndSave(payment, 'amount_mismatch', {
      expected: expectedPaise,
      received: rzPayment.amount,
    });
    throw new AppError('Payment amount does not match order total', 400);
  }

  // 8) Currency validation.
  if (rzPayment.currency !== paymentUtil.CURRENCY) {
    await recordAnomalyAndSave(payment, 'currency_mismatch', {
      expected: paymentUtil.CURRENCY,
      received: rzPayment.currency,
    });
    throw new AppError('Payment currency mismatch', 400);
  }

  // 9) State transition according to the provider's authoritative status.
  const providerStatus = rzPayment.status;
  payment.providerPaymentId = rzPayment.id;
  payment.method = rzPayment.method || payment.method;
  payment.signatureVerified = true;

  const targetState = providerStatus === 'captured' ? 'captured'
    : providerStatus === 'authorized' ? 'authorized'
    : providerStatus === 'failed' ? 'failed'
    : 'pending';

  // Stale guard: never downgrade an already-captured paid state.
  if (payment.status === 'captured') {
    return { payment, order, alreadyVerified: true };
  }
  if (payment.status === 'failed' && targetState !== 'captured') {
    // Retry order: this is a NEW payment document, so a failed old doc would
    // not appear here; a failed current doc stays failed unless captured.
    return { payment, order, alreadyVerified: false };
  }

  await withTransaction(async (session) => {
    if (targetState === 'captured') {
      if (paymentUtil.canUpgradePayment(payment.status, 'captured')) {
        payment.status = 'captured';
        order.paymentStatus = 'paid';
      } else {
        recordAnomaly(payment, 'stale_capture', payment.status);
      }
    } else if (targetState === 'failed') {
      if (payment.status === 'captured') {
        recordAnomaly(payment, 'stale_failure', 'late failure after capture ignored');
      } else if (order.paymentStatus === 'paid') {
        recordAnomaly(payment, 'stale_failure', 'order already paid; late failure ignored');
      } else {
        payment.status = 'failed';
        payment.failureReason = paymentUtil.sanitizeFailureReason(
          rzPayment.error_description || rzPayment.error_code || 'Payment failed'
        );
        order.paymentStatus = 'failed';
      }
    } else {
      if (paymentUtil.canUpgradePayment(payment.status, targetState)) {
        payment.status = targetState;
      }
    }

    order.paymentStatus = paymentUtil.syncOrderPaymentStatus(payment);

    await order.save(session ? { session } : {});
    await payment.save(session ? { session } : {});
  });

  if (order.paymentStatus === 'paid') {
    await notificationService.notifyPaymentSuccess({ order, userId });
  } else if (order.paymentStatus === 'failed') {
    await notificationService.notifyPaymentFailed({ order, userId });
  }

  return { payment, order, alreadyVerified: false };
};

const recordAnomalyAndSave = async (payment, type, detail) => {
  recordAnomaly(payment, type, detail);
  await payment.save();
};

// ---------------------------------------------------------------------------
// 3. Webhook handling
// ---------------------------------------------------------------------------
const SUPPORTED_EVENTS = new Set(['payment.captured', 'payment.failed', 'order.paid']);

const handleWebhook = async ({ rawBody, signature }) => {
  // 1) Never trust the payload before signature verification.
  razorpayService.verifyWebhookSignature(rawBody, signature);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new AppError('Invalid webhook payload', 400);
  }

  const result = await withTransaction(async (session) => {
    // 2) Idempotency: unique (provider, eventId) index dedupes deliveries.
    //    Create the event record before processing so concurrent duplicates
    //    cannot double-apply.
    let webhookEvent;
    try {
      [webhookEvent] = await WebhookEvent.create(
        [
          {
            provider: PROVIDER,
            eventId: event.id || event.event_id,
            eventType: event.type || event.event,
            payloadHash: WebhookEvent.sha256(rawBody),
          },
        ],
        session ? { session } : {}
      );
    } catch (error) {
      if (error && error.code === 11000) {
        return { duplicate: true, acknowledged: true };
      }
      throw error;
    }

    try {
      if (!SUPPORTED_EVENTS.has(webhookEvent.eventType)) {
        // Acknowledged but not processed; mark so future lookups are complete.
        webhookEvent.processed = true;
        webhookEvent.processedAt = new Date();
        await webhookEvent.save(session ? { session } : {});
        return { eventType: webhookEvent.eventType, ignored: true, acknowledged: true, processed: true };
      }

      const entity = event.payload?.payment?.entity || event.payload?.order?.entity;
      if (!entity) {
        return { eventType: webhookEvent.eventType, ignored: true, reason: 'no entity', acknowledged: true };
      }

      // 3) Locate the payment via provider identifiers only — never trust
      //    arbitrary order ids from the payload.
      const providerOrderId = entity.order_id || entity.id;
      const payment = await Payment.findOne({ provider: PROVIDER, providerOrderId }, null, session ? { session } : {});

      if (!payment) {
        return { eventType: webhookEvent.eventType, ignored: true, reason: 'no matching payment', acknowledged: true };
      }

      const order = await Order.findById(payment.order, null, session ? { session } : {});

      const outcome = await applyWebhookEvent({
        eventType: webhookEvent.eventType,
        entity,
        order,
        payment,
        session,
      });

      webhookEvent.processed = true;
      webhookEvent.processedAt = new Date();
      await webhookEvent.save(session ? { session } : {});

      return {
        eventType: webhookEvent.eventType,
        acknowledged: true,
        ...outcome,
      };
    } catch (error) {
      // Let failures bubble; in transaction mode the event record rolls back
      // so the provider can redeliver.
      throw error;
    }
  });

  if (result && result.stateChanged && result.processed && result.orderId) {
    const order = await Order.findById(result.orderId);
    if (order) {
      const userId = order.user;
      if (result.eventType === 'payment.captured' || result.eventType === 'order.paid') {
        await notificationService.notifyPaymentSuccess({ order, userId });
      } else if (result.eventType === 'payment.failed') {
        await notificationService.notifyPaymentFailed({ order, userId });
      }
    }
  }

  return result;
};

const applyWebhookEvent = async ({ eventType, entity, order, payment, session }) => {
  const expectedPaise = paymentUtil.toSmallestCurrencyUnit(order.total);

  // 4) Amount + currency validation from the authoritative payload.
  const amountOk = entity.amount === expectedPaise;
  const currencyOk = !entity.currency || entity.currency === paymentUtil.CURRENCY;

  if (!amountOk || !currencyOk) {
    recordAnomaly(payment, 'webhook_amount_currency_mismatch', {
      expected: expectedPaise,
      received: entity.amount,
      currency: entity.currency,
    });
    await payment.save(session ? { session } : {});
    return {
      verified: false,
      reason: 'amount or currency mismatch',
      eventId: eventType,
      processed: true,
      stateChanged: false,
      commitStateChanged: false,
    };
  }

  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    // 5) Captured: upgrade only; never downgrade; never reprocess old capture
    //    over a refunded state.
    if (payment.status === 'captured') {
      return {
        verified: true,
        reason: 'already captured',
        eventId: eventType,
        processed: true,
        stateChanged: false,
        commitStateChanged: false,
      };
    }
    if (!paymentUtil.canUpgradePayment(payment.status, 'captured')) {
      recordAnomaly(payment, 'stale_capture_webhook', payment.status);
      await payment.save(session ? { session } : {});
      return {
        verified: false,
        reason: 'stale captured event',
        eventId: eventType,
        processed: true,
        stateChanged: false,
        commitStateChanged: false,
      };
    }

    payment.status = 'captured';
    payment.webhookVerified = true;
    payment.providerPaymentId = entity.id || payment.providerPaymentId;
    payment.method = entity.method || payment.method;
    order.paymentStatus = 'paid'; // synchronized via util below
    order.paymentStatus = paymentUtil.syncOrderPaymentStatus(payment);
    await order.save(session ? { session } : {});
    await payment.save(session ? { session } : {});
    return {
      verified: true,
      reason: 'payment captured',
      eventId: eventType,
      processed: true,
      stateChanged: true,
      commitStateChanged: true,
      orderId: String(order._id),
    };
  }

  if (eventType === 'payment.failed') {
    // 6) Stale-event guard: a late failed webhook must not downgrade a paid
    //    order or overwrite a captured payment.
    if (payment.status === 'captured' || order.paymentStatus === 'paid') {
      recordAnomaly(payment, 'stale_failure_webhook', { paymentStatus: payment.status, orderStatus: order.paymentStatus });
      await payment.save(session ? { session } : {});
      return {
        verified: false,
        reason: 'stale failure ignored',
        eventId: eventType,
        processed: true,
        stateChanged: false,
        commitStateChanged: false,
      };
    }

    payment.status = 'failed';
    payment.webhookVerified = true;
    payment.providerPaymentId = entity.id || payment.providerPaymentId;
    payment.method = entity.method || payment.method;
    payment.failureReason = paymentUtil.sanitizeFailureReason(
      entity.error_description || entity.error_code || 'Payment failed'
    );
    order.paymentStatus = paymentUtil.syncOrderPaymentStatus(payment);
    await order.save(session ? { session } : {});
    await payment.save(session ? { session } : {});
    return {
      verified: true,
      reason: 'payment failed',
      eventId: eventType,
      processed: true,
      stateChanged: true,
      commitStateChanged: true,
      orderId: String(order._id),
    };
  }

  return { verified: false, reason: 'unsupported event', eventId: eventType };
};

// ---------------------------------------------------------------------------
// 4. Lookups
// ---------------------------------------------------------------------------
const getPaymentForOrder = async ({ userId, orderId }) => {
  if (!mongoose.isValidObjectId(orderId)) throw new AppError('Invalid order id', 400);
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw new AppError('Order not found', 404);

  const payment = await Payment.findOne({ order: orderId }).sort({ createdAt: -1 }).lean();
  if (!payment) throw new AppError('No payment attempt found', 404);
  return serializePayment(payment);
};

const getPaymentAttempts = async ({ userId, orderId }) => {
  if (!mongoose.isValidObjectId(orderId)) throw new AppError('Invalid order id', 400);
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw new AppError('Order not found', 404);

  const payments = await Payment.find({ order: orderId }).sort({ createdAt: 1 }).lean();
  return payments.map(serializePayment);
};

const getPaymentsForAdmin = async (orderId) => {
  const payments = await Payment.find({ order: orderId }).sort({ createdAt: -1 }).lean();
  return payments.map(serializePayment);
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  getPaymentForOrder,
  getPaymentAttempts,
  getPaymentsForAdmin,
  serializePayment,
};