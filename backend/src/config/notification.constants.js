// ---------------------------------------------------------------------------
// Notification & email constants — single source of truth for event types,
// notification categories, and preference gating. Do not scatter raw strings
// across the codebase.
// ---------------------------------------------------------------------------

// In-app notification categories (Notification.type).
const NOTIFICATION_TYPES = {
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  SHIPPING: 'SHIPPING',
  DELIVERY: 'DELIVERY',
  REFUND: 'REFUND',
  REVIEW: 'REVIEW',
  ACCOUNT: 'ACCOUNT',
  PROMOTION: 'PROMOTION',
};

// Email event types (EmailLog.type / template key).
const EMAIL_TYPES = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ORDER_SHIPPED: 'ORDER_SHIPPED',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  REFUND_INITIATED: 'REFUND_INITIATED',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  REVIEW_APPROVED: 'REVIEW_APPROVED',
  ADMIN_PAYMENT_FAILED: 'ADMIN_PAYMENT_FAILED',
  ADMIN_REFUND: 'ADMIN_REFUND',
};

const EMAIL_STATUSES = {
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
};

// Email preferences are advisory. Defaults: transactional email on,
// promotional off. A user's saved NotificationPreference document overrides
// these defaults.
const DEFAULT_PREFERENCES = {
  emailOrderUpdates: true,
  emailPaymentUpdates: true,
  emailShippingUpdates: true,
  emailReviewUpdates: true,
  emailPromotions: false,
  inAppOrderUpdates: true,
  inAppPromotions: false,
};

const ALLOWED_PREFERENCE_FIELDS = Object.keys(DEFAULT_PREFERENCES);

// Maps an email event type to the preference flag that gates it.
const EMAIL_PREF_FOR_TYPE = {
  [EMAIL_TYPES.ORDER_CREATED]: 'emailOrderUpdates',
  [EMAIL_TYPES.ORDER_CONFIRMED]: 'emailOrderUpdates',
  [EMAIL_TYPES.PAYMENT_SUCCESS]: 'emailPaymentUpdates',
  [EMAIL_TYPES.PAYMENT_FAILED]: 'emailPaymentUpdates',
  [EMAIL_TYPES.ORDER_SHIPPED]: 'emailShippingUpdates',
  [EMAIL_TYPES.ORDER_DELIVERED]: 'emailShippingUpdates',
  [EMAIL_TYPES.ORDER_CANCELLED]: 'emailOrderUpdates',
  [EMAIL_TYPES.REFUND_INITIATED]: 'emailPaymentUpdates',
  [EMAIL_TYPES.REFUND_COMPLETED]: 'emailPaymentUpdates',
  [EMAIL_TYPES.REVIEW_APPROVED]: 'emailReviewUpdates',
  [EMAIL_TYPES.ADMIN_PAYMENT_FAILED]: null, // admins, not preference gated
  [EMAIL_TYPES.ADMIN_REFUND]: null,
};

// Maps an in-app notification category to the preference flag that gates it.
const IN_APP_PREF_FOR_TYPE = {
  [NOTIFICATION_TYPES.ORDER]: 'inAppOrderUpdates',
  [NOTIFICATION_TYPES.PAYMENT]: 'inAppOrderUpdates',
  [NOTIFICATION_TYPES.SHIPPING]: 'inAppOrderUpdates',
  [NOTIFICATION_TYPES.DELIVERY]: 'inAppOrderUpdates',
  [NOTIFICATION_TYPES.REFUND]: 'inAppOrderUpdates',
  [NOTIFICATION_TYPES.REVIEW]: 'inAppOrderUpdates',
  [NOTIFICATION_TYPES.ACCOUNT]: 'inAppOrderUpdates',
  [NOTIFICATION_TYPES.PROMOTION]: 'inAppPromotions',
};

// Backoff delays between retry attempts (seconds). attempt 1 -> 60s,
// attempt 2 -> 5m, attempt 3 -> 30m. Never retries forever.
const RETRY_BACKOFF_SECONDS = (attempt) =>
  [60, 300, 1800][Math.min(attempt - 1, 2)] || 3600;

// Maximum email send attempts (env-overridable via EMAIL_MAX_RETRIES).
const getEmailMaxRetries = () =>
  Math.max(1, parseInt(process.env.EMAIL_MAX_RETRIES, 10) || 3);

module.exports = {
  NOTIFICATION_TYPES,
  EMAIL_TYPES,
  EMAIL_STATUSES,
  DEFAULT_PREFERENCES,
  ALLOWED_PREFERENCE_FIELDS,
  EMAIL_PREF_FOR_TYPE,
  IN_APP_PREF_FOR_TYPE,
  RETRY_BACKOFF_SECONDS,
  getEmailMaxRetries,
};
