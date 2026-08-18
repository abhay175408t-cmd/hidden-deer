const crypto = require('crypto');
const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['razorpay'],
      required: true,
    },
    eventId: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    processed: {
      type: Boolean,
      default: false,
    },
    payloadHash: {
      type: String,
      default: null,
      trim: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Idempotency guard — the same provider event may be delivered multiple times.
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
module.exports.sha256 = sha256;