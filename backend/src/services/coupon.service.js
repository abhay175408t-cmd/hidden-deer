const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');

const CODE_REGEX = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

// Admin-facing full representation.
const serializeCoupon = (coupon) => ({
  id: coupon._id,
  code: coupon.code,
  description: coupon.description,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  maxDiscount: coupon.maxDiscount,
  minCartValue: coupon.minCartValue,
  firstOrderOnly: coupon.firstOrderOnly,
  applicableProducts: coupon.applicableProducts || [],
  applicableCategories: coupon.applicableCategories || [],
  excludedProducts: coupon.excludedProducts || [],
  excludedCategories: coupon.excludedCategories || [],
  expiresAt: coupon.expiresAt,
  usageLimit: coupon.usageLimit,
  usageCount: coupon.usageCount,
  isActive: coupon.isActive,
  createdAt: coupon.createdAt,
  updatedAt: coupon.updatedAt,
});

// Customer-facing shape returned by the validate endpoint (never reveals
// usage counters or admin-only scoping internals).
const serializeCouponPreview = (coupon) => ({
  code: coupon.code,
  description: coupon.description,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  maxDiscount: coupon.maxDiscount,
  minCartValue: coupon.minCartValue,
  expiresAt: coupon.expiresAt,
});

// ---------------------------------------------------------------------------
// Discount calculation
// ---------------------------------------------------------------------------

const asIds = (values) =>
  (values || []).map((value) => String(value));

const inList = (values, value) => asIds(values).includes(String(value));

// Determines which line items are eligible for the coupon and computes the
// discount. Throws AppError when the cart does not meet the coupon's
// requirements.
const calculateDiscount = (coupon, lines) => {
  const eligibleLines = (lines || []).filter((line) => {
    if (inList(coupon.excludedProducts, line.product)) return false;
    if (inList(coupon.excludedCategories, line.category)) return false;
    if (
      coupon.applicableProducts.length > 0 &&
      !inList(coupon.applicableProducts, line.product)
    ) {
      return false;
    }
    if (
      coupon.applicableCategories.length > 0 &&
      !inList(coupon.applicableCategories, line.category)
    ) {
      return false;
    }
    return true;
  });

  const eligibleSubtotal = eligibleLines.reduce(
    (sum, line) => sum + Number(line.price) * Number(line.quantity),
    0
  );

  if (coupon.minCartValue && eligibleSubtotal < coupon.minCartValue) {
    throw new AppError(
      `Coupon ${coupon.code} requires a minimum order value of ₹${coupon.minCartValue}`,
      400
    );
  }

  let discount;
  if (coupon.discountType === 'percent') {
    discount = (eligibleSubtotal * coupon.discountValue) / 100;
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = coupon.discountValue;
  }

  // A discount can never exceed the value of the items it applies to, and it
  // is floored to the paisa so the store never loses fractional money.
  discount = Math.min(discount, eligibleSubtotal);
  discount = Math.floor(discount * 100) / 100;

  return { eligibleSubtotal, discount };
};

// ---------------------------------------------------------------------------
// Customer-facing validation
// ---------------------------------------------------------------------------

// Validates a coupon against a user + cart line items. Returns
// { coupon, discount, eligibleSubtotal } or null when no code is supplied.
// Throws AppError with a user-friendly message for any invalid state. Never
// records usage.
const evaluateCoupon = async ({ code, userId, lines, session }) => {
  if (!code) return null;

  const coupon = await Coupon.findOne(
    { code: String(code).trim().toUpperCase() },
    null,
    session ? { session } : {}
  );
  if (!coupon) throw new AppError('Invalid coupon code', 400);
  if (!coupon.isActive) throw new AppError('Coupon is inactive', 400);
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new AppError('Coupon has expired', 400);
  }
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    throw new AppError('Coupon usage limit reached', 400);
  }
  if ((coupon.usedBy || []).some((id) => String(id) === String(userId))) {
    throw new AppError('Coupon already used by you', 400);
  }

  if (coupon.firstOrderOnly) {
    const previousOrders = await Order.countDocuments(
      { user: userId },
      session ? { session } : {}
    );
    if (previousOrders > 0) {
      throw new AppError('Coupon is valid only for your first order', 400);
    }
  }

  const { eligibleSubtotal, discount } = calculateDiscount(coupon, lines);
  return { coupon, discount, eligibleSubtotal };
};

// Atomically records usage by a user. Throws when the user already used it
// (guarded by the filter) so concurrent orders cannot both consume it.
const markUsed = async (coupon, userId, session) => {
  const result = await Coupon.updateOne(
    { _id: coupon._id, usedBy: { $ne: userId } },
    { $addToSet: { usedBy: userId }, $inc: { usageCount: 1 } },
    session ? { session } : {}
  );
  if (result.modifiedCount === 0) {
    throw new AppError('Coupon already used by you', 400);
  }
};

// Releases a previously recorded usage (order cancelled / failed).
const release = async (couponId, userId, session) => {
  await Coupon.updateOne(
    { _id: couponId },
    { $pull: { usedBy: userId }, $inc: { usageCount: -1 } },
    session ? { session } : {}
  );
};

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const validateCouponData = (data) => {
  if (data.code !== undefined) {
    if (!CODE_REGEX.test(normalizeCode(data.code))) {
      throw new AppError(
        'Code must be 3-20 uppercase letters, digits or dashes',
        400
      );
    }
  }

  if (data.discountType !== undefined && !['fixed', 'percent'].includes(data.discountType)) {
    throw new AppError('discountType must be "fixed" or "percent"', 400);
  }

  if (data.discountValue !== undefined) {
    if (!Number.isFinite(Number(data.discountValue))) {
      throw new AppError('discountValue must be a number', 400);
    }
    if (Number(data.discountValue) < 1) {
      throw new AppError('discountValue must be at least 1', 400);
    }
    if (
      (data.discountType || 'fixed') === 'percent' &&
      Number(data.discountValue) > 100
    ) {
      throw new AppError('Percent discount cannot exceed 100', 400);
    }
  }

  if (data.maxDiscount !== undefined && data.maxDiscount !== null) {
    if (!Number.isFinite(Number(data.maxDiscount)) || Number(data.maxDiscount) < 1) {
      throw new AppError('maxDiscount must be at least 1', 400);
    }
  }

  if (data.minCartValue !== undefined && data.minCartValue !== null) {
    if (!Number.isFinite(Number(data.minCartValue)) || Number(data.minCartValue) < 0) {
      throw new AppError('minCartValue cannot be negative', 400);
    }
  }

  if (data.expiresAt !== undefined && data.expiresAt !== null) {
    const parsed = new Date(data.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError('expiresAt must be a valid date', 400);
    }
  }

  if (data.usageLimit !== undefined && data.usageLimit !== null) {
    if (!Number.isInteger(Number(data.usageLimit)) || Number(data.usageLimit) < 1) {
      throw new AppError('usageLimit must be a positive integer', 400);
    }
  }

  for (const field of [
    'applicableProducts',
    'applicableCategories',
    'excludedProducts',
    'excludedCategories',
  ]) {
    if (data[field] !== undefined) {
      if (!Array.isArray(data[field])) {
        throw new AppError(`${field} must be an array`, 400);
      }
      for (const value of data[field]) {
        if (!mongoose.isValidObjectId(value)) {
          throw new AppError(`${field} contains an invalid id`, 400);
        }
      }
    }
  }

  if (data.firstOrderOnly !== undefined && typeof data.firstOrderOnly !== 'boolean') {
    throw new AppError('firstOrderOnly must be a boolean', 400);
  }
  if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
    throw new AppError('isActive must be a boolean', 400);
  }
};

const handleDuplicateKey = (error) => {
  if (error && error.code === 11000 && error.keyPattern && error.keyPattern.code) {
    return new AppError('Coupon code already exists', 409);
  }
  return null;
};

const createCoupon = async (data) => {
  validateCouponData(data);
  if (!data.code) throw new AppError('code is required', 400);

  const payload = {
    code: normalizeCode(data.code),
    description: data.description !== undefined ? String(data.description).trim() : '',
    discountType: data.discountType || 'fixed',
    discountValue: Number(data.discountValue),
    maxDiscount: data.maxDiscount === undefined || data.maxDiscount === null ? null : Number(data.maxDiscount),
    minCartValue: data.minCartValue === undefined || data.minCartValue === null ? null : Number(data.minCartValue),
    firstOrderOnly: data.firstOrderOnly === true,
    applicableProducts: data.applicableProducts || [],
    applicableCategories: data.applicableCategories || [],
    excludedProducts: data.excludedProducts || [],
    excludedCategories: data.excludedCategories || [],
    expiresAt: data.expiresAt === undefined || data.expiresAt === null ? null : new Date(data.expiresAt),
    usageLimit: data.usageLimit === undefined || data.usageLimit === null ? null : Number(data.usageLimit),
    usageCount: 0,
    usedBy: [],
    isActive: data.isActive === undefined ? true : data.isActive,
  };

  try {
    const coupon = await Coupon.create(payload);
    return serializeCoupon(coupon);
  } catch (error) {
    const duplicateError = handleDuplicateKey(error);
    if (duplicateError) throw duplicateError;
    throw error;
  }
};

const listCoupons = async ({ page = 1, limit = 10, isActive, search } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const filter = {};
  if (isActive === 'true') filter.isActive = true;
  if (isActive === 'false') filter.isActive = false;
  if (search) filter.code = new RegExp(String(search).trim(), 'i');

  const skip = (pageNum - 1) * limitNum;
  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Coupon.countDocuments(filter),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
  return {
    coupons: coupons.map(serializeCoupon),
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

const getCouponById = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid coupon id', 400);
  const coupon = await Coupon.findById(id).lean();
  if (!coupon) throw new AppError('Coupon not found', 404);
  return serializeCoupon(coupon);
};

const updateCoupon = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid coupon id', 400);
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError('Coupon not found', 404);

  validateCouponData(data);

  const allowedFields = [
    'code',
    'description',
    'discountType',
    'discountValue',
    'maxDiscount',
    'minCartValue',
    'firstOrderOnly',
    'applicableProducts',
    'applicableCategories',
    'excludedProducts',
    'excludedCategories',
    'expiresAt',
    'usageLimit',
    'isActive',
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) coupon[field] = data[field];
  }
  if (data.code !== undefined) coupon.code = normalizeCode(data.code);
  if (data.discountValue !== undefined) coupon.discountValue = Number(data.discountValue);
  if (data.maxDiscount !== undefined) {
    coupon.maxDiscount = data.maxDiscount === null ? null : Number(data.maxDiscount);
  }
  if (data.minCartValue !== undefined) {
    coupon.minCartValue = data.minCartValue === null ? null : Number(data.minCartValue);
  }
  if (data.usageLimit !== undefined) {
    coupon.usageLimit = data.usageLimit === null ? null : Number(data.usageLimit);
  }
  if (data.expiresAt !== undefined) {
    coupon.expiresAt = data.expiresAt === null ? null : new Date(data.expiresAt);
  }

  try {
    await coupon.save();
  } catch (error) {
    const duplicateError = handleDuplicateKey(error);
    if (duplicateError) throw duplicateError;
    throw error;
  }
  return serializeCoupon(coupon);
};

const deactivateCoupon = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid coupon id', 400);
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  coupon.isActive = false;
  await coupon.save();
  return serializeCoupon(coupon);
};

module.exports = {
  serializeCoupon,
  serializeCouponPreview,
  evaluateCoupon,
  markUsed,
  release,
  createCoupon,
  listCoupons,
  getCouponById,
  updateCoupon,
  deactivateCoupon,
};
