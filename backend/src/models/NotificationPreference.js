const mongoose = require('mongoose');

// Per-user notification delivery preferences. Transactional notifications are
// enabled by default; promotional ones are opt-in and never auto-sent in this
// phase. Preferences are advisory: email sending is gated by the matching
// email* flag, in-app notification creation by the inApp* flags.
const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    emailOrderUpdates: { type: Boolean, default: true },
    emailPaymentUpdates: { type: Boolean, default: true },
    emailShippingUpdates: { type: Boolean, default: true },
    emailReviewUpdates: { type: Boolean, default: true },
    emailPromotions: { type: Boolean, default: false },
    inAppOrderUpdates: { type: Boolean, default: true },
    inAppPromotions: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
