const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    // 'fixed' discounts a flat amount; 'percent' discounts a percentage of the
    // eligible subtotal.
    discountType: {
      type: String,
      enum: ['fixed', 'percent'],
      default: 'fixed',
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1,
      // percent coupons are capped at 100% by the service validation
    },
    // Cap for percent coupons (fixed coupons are capped by the eligible
    // subtotal itself). null means no cap.
    maxDiscount: {
      type: Number,
      default: null,
      min: 1,
    },
    // Minimum eligible subtotal required for the coupon to apply.
    minCartValue: {
      type: Number,
      default: null,
      min: 0,
    },
    // Only usable on the user's very first order.
    firstOrderOnly: {
      type: Boolean,
      default: false,
    },
    // Product/category scoping. Empty arrays mean "no restriction". A product
    // must be in an applicable list AND not in an excluded list to contribute
    // to the eligible subtotal.
    applicableProducts: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Product',
      default: [],
    },
    applicableCategories: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Category',
      default: [],
    },
    excludedProducts: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Product',
      default: [],
    },
    excludedCategories: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Category',
      default: [],
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('Coupon', couponSchema);
