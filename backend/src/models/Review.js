const mongoose = require('mongoose');

const MAX_REVIEW_COMMENT_LENGTH = 1000;
const MAX_REPORT_REASON_LENGTH = 300;

const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: MAX_REPORT_REASON_LENGTH,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Order that granted the purchase verification. Reviews are only possible
    // for products the user actually bought (non-cancelled order).
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_REVIEW_COMMENT_LENGTH,
    },
    // New reviews land in the pending moderation queue. Only 'approved'
    // reviews are publicly visible and contribute to the product rating.
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: true,
    },
    helpful: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reports: {
      type: [reportSchema],
      default: [],
    },
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// One review per user per product. Also acts as a safety net for duplicate
// submission races.
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
// Public listing + rating aggregation both filter on product + status.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
// Admin moderation queue browsing.
reviewSchema.index({ status: 1, createdAt: -1 });
// "My reviews" listing.
reviewSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
module.exports.MAX_REVIEW_COMMENT_LENGTH = MAX_REVIEW_COMMENT_LENGTH;
module.exports.MAX_REPORT_REASON_LENGTH = MAX_REPORT_REASON_LENGTH;
