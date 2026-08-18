const mongoose = require('mongoose');
const { EMAIL_STATUSES, EMAIL_TYPES } = require('../config/notification.constants');

const emailLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    type: {
      type: String,
      enum: Object.values(EMAIL_TYPES),
      required: true,
    },
    // Deterministic idempotency key, e.g. "order:ORDER_CREATED:<orderId>" or
    // "payment:PAYMENT_SUCCESS:<orderId>". The unique index guarantees the
    // same business event never produces duplicate emails.
    key: {
      type: String,
      unique: true,
      sparse: true,
    },
    recipient: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    subject: {
      type: String,
      required: true,
    },
    // Rendered HTML captured for retry delivery. Never returned by any API.
    html: {
      type: String,
      select: false,
      default: '',
    },
    provider: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(EMAIL_STATUSES),
      default: 'queued',
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

emailLogSchema.index({ recipient: 1, createdAt: -1 });
emailLogSchema.index({ status: 1, nextRetryAt: 1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);
