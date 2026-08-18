const mongoose = require('mongoose');
const {
  PAYMENT_STATUSES,
  CURRENCY,
} = require('../utils/payment.util');

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['razorpay'],
      default: 'razorpay',
      required: true,
    },
    providerOrderId: {
      type: String,
      trim: true,
      index: true,
    },
    providerPaymentId: {
      type: String,
      trim: true,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: CURRENCY,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'created',
      required: true,
      index: true,
    },
    method: {
      type: String,
      default: null,
      trim: true,
    },
    failureReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    signatureVerified: {
      type: Boolean,
      default: false,
    },
    webhookVerified: {
      type: Boolean,
      default: false,
    },
    // Reconciliation notes (e.g. amount/currency anomalies) — never sensitive.
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

// Multiple attempts per order, unique per provider order id.
paymentSchema.index({ order: 1, status: 1 });
paymentSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);