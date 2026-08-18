const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const AppError = require('../utils/AppError');
const emailService = require('./email.service');
const emailTemplateService = require('./emailTemplate.service');
const {
  NOTIFICATION_TYPES,
  EMAIL_TYPES,
  DEFAULT_PREFERENCES,
  ALLOWED_PREFERENCE_FIELDS,
  EMAIL_PREF_FOR_TYPE,
  IN_APP_PREF_FOR_TYPE,
} = require('../config/notification.constants');

// ---------------------------------------------------------------------------
// Notification service — in-app notifications + gated transactional emails.
//
// Failure isolation: every public entry point used from order/payment flows
// is internally try/caught (`safe`). A notification/email failure must never
// fail or roll back the business operation that triggered it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------
const getOrCreatePreferences = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return { ...DEFAULT_PREFERENCES };
  let prefs = await NotificationPreference.findOne({ user: userId });
  if (!prefs) {
    prefs = await NotificationPreference.create({ user: userId });
  }
  return prefs;
};

const getPreferencesForUser = async (userId) => {
  const prefs = await getOrCreatePreferences(userId);
  const serialized = { ...DEFAULT_PREFERENCES };
  for (const field of ALLOWED_PREFERENCE_FIELDS) {
    if (typeof prefs[field] === 'boolean') serialized[field] = prefs[field];
  }
  return serialized;
};

const updatePreferencesForUser = async (userId, updates) => {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new AppError('Preferences payload must be an object', 400);
  }
  const allowed = {};
  for (const field of ALLOWED_PREFERENCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      if (typeof updates[field] !== 'boolean') {
        throw new AppError(`"${field}" must be a boolean`, 400);
      }
      allowed[field] = updates[field];
    }
  }
  if (Object.keys(allowed).length === 0) {
    throw new AppError('No valid preference fields provided', 400);
  }

  const prefs = await NotificationPreference.findOneAndUpdate(
    { user: userId },
    { $set: allowed },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  const serialized = { ...DEFAULT_PREFERENCES };
  for (const field of ALLOWED_PREFERENCE_FIELDS) {
    if (typeof prefs[field] === 'boolean') serialized[field] = prefs[field];
  }
  return serialized;
};

// ---------------------------------------------------------------------------
// Core creation
// ---------------------------------------------------------------------------
const serializeNotification = (notification) => ({
  id: notification._id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  data: notification.data || {},
  isRead: notification.isRead,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
});

// Creates an in-app notification. `key` is a deterministic idempotency key;
// a duplicate (e.g. repeated webhook delivery) is silently skipped.
const createNotification = async ({ userId, type, title, message, data = {}, key = null }) => {
  if (!mongoose.isValidObjectId(userId)) return null;
  if (!Object.values(NOTIFICATION_TYPES).includes(type)) return null;

  try {
    const [notification] = await Notification.create([
      { user: userId, type, title, message, data, key: key || undefined },
    ]);
    return notification;
  } catch (error) {
    if (error && error.code === 11000) return null;
    return null;
  }
};

// Sends a transactional email gated by the user's email preference for this
// event type. Never throws.
const sendEmailNotification = async ({ userId, email, type, data, key }) => {
  if (!Object.values(EMAIL_TYPES).includes(type)) return null;
  const prefField = EMAIL_PREF_FOR_TYPE[type];
  if (!prefField) return null; // admin/system types handled separately

  const prefs = await getOrCreatePreferences(userId);
  if (prefs[prefField] !== true) return null;

  try {
    return await emailService.sendEmail({
      to: email,
      type,
      data,
      key,
      user: userId,
      order: data && data.orderId ? data.orderId : null,
    });
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Order snapshot for emails — only safe, server-built fields. Customer values
// are escaped by emailTemplate.service before insertion.
// ---------------------------------------------------------------------------
const buildOrderSnapshot = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const discountAmount = Number(order.couponDiscount) || 0;
  const ship = order.shippingAddress || {};
  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    itemsHtml: emailTemplateService.buildItemsHtml(items),
    subtotal: emailTemplateService.formatMoney(order.subtotal),
    discountRow: discountAmount > 0,
    discountAmount: emailTemplateService.formatMoney(discountAmount),
    freeShipping: Number(order.shippingFee) === 0,
    shippingFee: emailTemplateService.formatMoney(order.shippingFee),
    total: emailTemplateService.formatMoney(order.total),
    paymentStatus: order.paymentStatus,
    city: ship.city || '',
    state: ship.state || '',
    estimatedDelivery: order.estimatedDelivery
      ? new Date(order.estimatedDelivery).toDateString()
      : null,
    failureReason: order.paymentFailureReason || null,
    refundAmount: emailTemplateService.formatMoney(order.total),
  };
};

const orderNotificationKey = (type, orderId) => `order:${type}:${orderId}`;
const notifInAppKey = (type, orderId, userId) => `notif:${type}:${orderId}:${userId}`;

// ---------------------------------------------------------------------------
// Event helpers (order/payment wiring). All are internally safe.
// ---------------------------------------------------------------------------
const safe = (fn) =>
  Promise.resolve()
    .then(fn)
    .catch(() => null);

const fetchUser = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) return null;
  return User.findById(userId).select('name email').lean();
};

const notifyOrderCreated = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    const title = `Order confirmed`;
    const message = `Your order #${order.orderNumber} has been placed successfully.`;
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.ORDER,
      title,
      message,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('ORDER_CREATED', order._id, userId),
    });
    return sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.ORDER_CREATED,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.ORDER_CREATED, order._id),
    });
  });

const notifyOrderConfirmed = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.ORDER,
      title: 'Order confirmed',
      message: `Your order #${order.orderNumber} has been confirmed.`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('ORDER_CONFIRMED', order._id, userId),
    });
    return sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.ORDER_CONFIRMED,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.ORDER_CONFIRMED, order._id),
    });
  });

const notifyPaymentSuccess = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.PAYMENT,
      title: 'Payment successful',
      message: `Payment of ₹${emailTemplateService.formatMoney(order.total)} for order #${order.orderNumber} was successful.`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('PAYMENT_SUCCESS', order._id, userId),
    });
    return sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.PAYMENT_SUCCESS,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.PAYMENT_SUCCESS, order._id),
    });
  });

const notifyPaymentFailed = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.PAYMENT,
      title: 'Payment failed',
      message: `Payment for order #${order.orderNumber} could not be completed.`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('PAYMENT_FAILED', order._id, userId),
    });
    await sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.PAYMENT_FAILED,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.PAYMENT_FAILED, order._id),
    });
    await notifyAdminsOfPaymentFailure(order, user);
  });

const notifyOrderShipped = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.SHIPPING,
      title: 'Order shipped',
      message: `Your order #${order.orderNumber} is on its way!`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('ORDER_SHIPPED', order._id, userId),
    });
    return sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.ORDER_SHIPPED,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.ORDER_SHIPPED, order._id),
    });
  });

const notifyOrderDelivered = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.DELIVERY,
      title: 'Order delivered',
      message: `Your order #${order.orderNumber} has been delivered. Enjoy!`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('ORDER_DELIVERED', order._id, userId),
    });
    return sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.ORDER_DELIVERED,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.ORDER_DELIVERED, order._id),
    });
  });

const notifyOrderCancelled = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.ORDER,
      title: 'Order cancelled',
      message: `Your order #${order.orderNumber} has been cancelled.`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('ORDER_CANCELLED', order._id, userId),
    });
    return sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.ORDER_CANCELLED,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.ORDER_CANCELLED, order._id),
    });
  });

const notifyRefundCompleted = ({ order, userId }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const snapshot = buildOrderSnapshot(order);
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.REFUND,
      title: 'Refund completed',
      message: `Refund of ₹${emailTemplateService.formatMoney(order.total)} for order #${order.orderNumber} has been completed.`,
      data: { orderId: String(order._id), orderNumber: order.orderNumber },
      key: notifInAppKey('REFUND_COMPLETED', order._id, userId),
    });
    await sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.REFUND_COMPLETED,
      data: { ...snapshot, name: user.name || 'there' },
      key: orderNotificationKey(EMAIL_TYPES.REFUND_COMPLETED, order._id),
    });
    await notifyAdminsOfRefund(order, user);
  });

// Prepared for a future review-moderation phase; NOT wired yet (Phase 12
// review models do not exist in this codebase).
const notifyReviewApproved = ({ userId, review }) =>
  safe(async () => {
    const user = await fetchUser(userId);
    if (!user) return null;
    const productName = review && review.productName ? review.productName : 'product';
    await createNotification({
      userId,
      type: NOTIFICATION_TYPES.REVIEW,
      title: 'Review approved',
      message: `Your review for "${productName}" is now live.`,
      data: review ? { productId: review.productId } : {},
      key: review && review._id ? `notif:REVIEW_APPROVED:${review._id}:${userId}` : undefined,
    });
    return sendEmailNotification({
      userId,
      email: user.email,
      type: EMAIL_TYPES.REVIEW_APPROVED,
      data: { name: user.name || 'there' },
      key: review && review._id ? `review:REVIEW_APPROVED:${review._id}` : undefined,
    });
  });

// ---------------------------------------------------------------------------
// Admin notifications
// ---------------------------------------------------------------------------
const notifyAdminsInApp = async (type, title, message, data) => {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  for (const admin of admins) {
    const key = `${type}:${data && data.orderId ? data.orderId : ''}:${admin._id}`;
    await createNotification({ userId: admin._id, type, title, message, data, key });
  }
};

const notifyAdminsOfPaymentFailure = async (order, customerUser) => {
  try {
    const snapshot = buildOrderSnapshot(order);
    const data = { orderId: String(order._id), orderNumber: order.orderNumber };
    await notifyAdminsInApp(
      NOTIFICATION_TYPES.PAYMENT,
      'Payment failed',
      `Payment failed for order #${order.orderNumber}.`,
      data
    );
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      await emailService.sendEmail({
        to: adminEmail,
        type: EMAIL_TYPES.ADMIN_PAYMENT_FAILED,
        data: {
          ...snapshot,
          name: customerUser ? customerUser.name : 'Customer',
          orderNumber: order.orderNumber,
        },
        key: `admin:${EMAIL_TYPES.ADMIN_PAYMENT_FAILED}:${order._id}`,
      });
    }
  } catch {
    /* admin alert failure must not surface */
  }
};

const notifyAdminsOfRefund = async (order, customerUser) => {
  try {
    const snapshot = buildOrderSnapshot(order);
    const data = { orderId: String(order._id), orderNumber: order.orderNumber };
    await notifyAdminsInApp(
      NOTIFICATION_TYPES.REFUND,
      'Refund processed',
      `Refund of ₹${emailTemplateService.formatMoney(order.total)} processed for order #${order.orderNumber}.`,
      data
    );
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      await emailService.sendEmail({
        to: adminEmail,
        type: EMAIL_TYPES.ADMIN_REFUND,
        data: {
          ...snapshot,
          name: customerUser ? customerUser.name : 'Customer',
          orderNumber: order.orderNumber,
        },
        key: `admin:${EMAIL_TYPES.ADMIN_REFUND}:${order._id}`,
      });
    }
  } catch {
    /* admin alert failure must not surface */
  }
};

// ---------------------------------------------------------------------------
// User-facing query API
// ---------------------------------------------------------------------------
const getUserNotifications = async (userId, { page = 1, limit = 20, unreadOnly = false } = {}) => {
  const filter = { user: userId };
  if (unreadOnly) filter.isRead = false;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Notification.countDocuments(filter),
  ]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
  return {
    notifications: notifications.map(serializeNotification),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPreviousPage: pageNum > 1,
    },
  };
};

const getUnreadCount = async (userId) =>
  Notification.countDocuments({ user: userId, isRead: false });

const markAsRead = async (userId, notificationId) => {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError('Invalid notification id', 400);
  }
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { isRead: true, readAt: new Date() },
    { returnDocument: 'after' }
  );
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }
  return serializeNotification(notification);
};

const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { user: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { updatedCount: result.modifiedCount || 0 };
};

const deleteNotification = async (userId, notificationId) => {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError('Invalid notification id', 400);
  }
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    user: userId,
  });
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }
  return { deleted: true };
};

module.exports = {
  createNotification,
  sendEmailNotification,
  getOrCreatePreferences,
  getPreferencesForUser,
  updatePreferencesForUser,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  serializeNotification,
  buildOrderSnapshot,
  // Event helpers (safe; used by order/payment wiring)
  notifyOrderCreated,
  notifyOrderConfirmed,
  notifyPaymentSuccess,
  notifyPaymentFailed,
  notifyOrderShipped,
  notifyOrderDelivered,
  notifyOrderCancelled,
  notifyRefundCompleted,
  notifyReviewApproved,
};
