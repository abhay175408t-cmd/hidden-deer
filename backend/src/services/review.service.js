const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');
const notificationService = require('./notification.service');

const {
  MAX_REVIEW_COMMENT_LENGTH,
  MAX_REPORT_REASON_LENGTH,
} = require('../models/Review');

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const serializePublicReview = (review) => ({
  id: review._id,
  rating: review.rating,
  comment: review.comment,
  isVerifiedPurchase: review.isVerifiedPurchase,
  helpfulCount: review.helpfulCount,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  user: review.user
    ? { id: review.user._id, name: review.user.name }
    : null,
});

const serializeMyReview = (review) => ({
  id: review._id,
  product: String(review.product),
  order: String(review.order),
  rating: review.rating,
  comment: review.comment,
  status: review.status,
  isVerifiedPurchase: review.isVerifiedPurchase,
  helpfulCount: review.helpfulCount,
  editedAt: review.editedAt,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

const serializeAdminReview = (review) => ({
  id: review._id,
  product: String(review.product),
  order: String(review.order),
  rating: review.rating,
  comment: review.comment,
  status: review.status,
  isVerifiedPurchase: review.isVerifiedPurchase,
  helpfulCount: review.helpfulCount,
  reportCount: review.reportCount,
  reports: review.reports || [],
  editedAt: review.editedAt,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  user: review.user
    ? { id: review.user._id, name: review.user.name, email: review.user.email }
    : null,
});

// ---------------------------------------------------------------------------
// Purchase verification
// ---------------------------------------------------------------------------

// A product is reviewable only if the user has a non-cancelled order that
// includes it. Online orders count only once paid; COD orders count as soon
// as they are placed (they are confirmed immediately).
const verifyPurchasedProduct = async (userId, productId) => {
  if (!mongoose.isValidObjectId(productId)) return null;
  const order = await Order.findOne({
    user: userId,
    orderStatus: { $ne: 'cancelled' },
    'items.product': productId,
  })
    .sort({ placedAt: -1 })
    .select('_id paymentMethod paymentStatus orderStatus')
    .lean();
  if (!order) return null;
  if (order.paymentMethod === 'online' && order.paymentStatus !== 'paid') {
    return null;
  }
  return order;
};

// ---------------------------------------------------------------------------
// Customer actions
// ---------------------------------------------------------------------------

const validateRating = (rating) => {
  const num = Number(rating);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    throw new AppError('rating must be an integer between 1 and 5', 400);
  }
  return num;
};

const validateComment = (comment) => {
  if (typeof comment !== 'string' || !comment.trim()) {
    throw new AppError('comment is required', 400);
  }
  if (comment.trim().length > MAX_REVIEW_COMMENT_LENGTH) {
    throw new AppError(
      `comment cannot exceed ${MAX_REVIEW_COMMENT_LENGTH} characters`,
      400
    );
  }
  return comment.trim();
};

const createReview = async ({ userId, productId, rating, comment }) => {
  if (!mongoose.isValidObjectId(productId)) {
    throw new AppError('Invalid product id', 400);
  }
  const ratingNum = validateRating(rating);
  const commentText = validateComment(comment);

  const product = await Product.findById(productId).select('name isActive').lean();
  if (!product || !product.isActive) throw new AppError('Product not found', 404);

  const order = await verifyPurchasedProduct(userId, productId);
  if (!order) {
    throw new AppError('You can only review a product you have purchased', 403);
  }

  const existing = await Review.findOne({ user: userId, product: productId }).lean();
  if (existing) throw new AppError('You have already reviewed this product', 409);

  try {
    const review = await Review.create({
      user: userId,
      product: productId,
      order: order._id,
      rating: ratingNum,
      comment: commentText,
    });
    return serializeMyReview(review);
  } catch (error) {
    if (error && error.code === 11000) {
      throw new AppError('You have already reviewed this product', 409);
    }
    throw error;
  }
};

const editReview = async ({ userId, reviewId, rating, comment }) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError('Invalid review id', 400);

  const review = await Review.findOne({ _id: reviewId, user: userId });
  if (!review) throw new AppError('Review not found', 404);

  if (rating !== undefined) review.rating = validateRating(rating);
  if (comment !== undefined) review.comment = validateComment(comment);

  // An edit sends the review back through the moderation queue so previously
  // approved content can be re-checked after modification.
  const wasApproved = review.status === 'approved';
  review.status = 'pending';
  review.editedAt = new Date();
  await review.save();

  if (wasApproved) {
    await recomputeProductRating(review.product);
  }

  return serializeMyReview(review);
};

const deleteReview = async ({ userId, reviewId }) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError('Invalid review id', 400);

  const review = await Review.findOne({ _id: reviewId, user: userId }).lean();
  if (!review) throw new AppError('Review not found', 404);

  const wasApproved = review.status === 'approved';
  await Review.deleteOne({ _id: reviewId, user: userId });
  if (wasApproved) {
    await recomputeProductRating(review.product);
  }
  return { deleted: true };
};

const listReviews = async ({ productId, page = 1, limit = 10 }) => {
  if (!mongoose.isValidObjectId(productId)) throw new AppError('Invalid product id', 400);

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const filter = { product: productId, status: 'approved' };
  const skip = (pageNum - 1) * limitNum;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Review.countDocuments(filter),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
  return {
    reviews: reviews.map(serializePublicReview),
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

const listMyReviews = async ({ userId, page = 1, limit = 10 }) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const filter = { user: userId };
  const skip = (pageNum - 1) * limitNum;

  const [reviews, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Review.countDocuments(filter),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
  return {
    reviews: reviews.map(serializeMyReview),
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

const markHelpful = async ({ userId, reviewId }) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError('Invalid review id', 400);

  const review = await Review.findById(reviewId).select('_id').lean();
  if (!review) throw new AppError('Review not found', 404);

  const updated = await Review.findOneAndUpdate(
    { _id: reviewId, helpful: { $ne: userId } },
    { $addToSet: { helpful: userId }, $inc: { helpfulCount: 1 } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new AppError('You already marked this review as helpful', 400);
  return { helpfulCount: updated.helpfulCount };
};

const reportReview = async ({ userId, reviewId, reason }) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError('Invalid review id', 400);

  const review = await Review.findById(reviewId).select('_id').lean();
  if (!review) throw new AppError('Review not found', 404);

  const reasonText =
    typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, MAX_REPORT_REASON_LENGTH)
      : '';

  const updated = await Review.findOneAndUpdate(
    { _id: reviewId, 'reports.user': { $ne: userId } },
    {
      $push: { reports: { user: userId, reason: reasonText } },
      $inc: { reportCount: 1 },
    },
    { returnDocument: 'after' }
  );
  if (!updated) throw new AppError('You already reported this review', 400);
  return { reportCount: updated.reportCount };
};

// ---------------------------------------------------------------------------
// Rating aggregation
// ---------------------------------------------------------------------------

// Recomputes the product rating and review count from approved reviews only.
// Rounded to one decimal, e.g. [5,5,4,3,1] -> 3.6.
const recomputeProductRating = async (productId) => {
  const result = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  const row = result && result[0];
  const rating = row ? Math.round(row.avg * 10) / 10 : 0;
  const reviewCount = row ? row.n : 0;
  await Product.updateOne(
    { _id: productId },
    { $set: { rating, reviewCount } }
  );
};

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

const listReviewsForAdmin = async ({ status, productId, reported, page = 1, limit = 10 }) => {
  const filter = {};
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    filter.status = status;
  }
  if (productId && mongoose.isValidObjectId(productId)) {
    filter.product = productId;
  }
  if (reported === 'true') filter.reportCount = { $gt: 0 };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Review.countDocuments(filter),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
  return {
    reviews: reviews.map(serializeAdminReview),
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

const moderateReview = async ({ reviewId, status }) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError('Invalid review id', 400);
  if (!['approved', 'rejected'].includes(status)) {
    throw new AppError('status must be "approved" or "rejected"', 400);
  }

  const review = await Review.findById(reviewId);
  if (!review) throw new AppError('Review not found', 404);
  if (review.status === status) return serializeAdminReview(review);

  const wasApproved = review.status === 'approved';
  review.status = status;
  await review.save();

  if (status === 'approved') {
    const product = await Product.findById(review.product).select('name').lean();
    await notificationService.notifyReviewApproved({
      userId: review.user,
      review: {
        _id: review._id,
        productId: String(review.product),
        productName: product ? product.name : 'product',
      },
    });
    await recomputeProductRating(review.product);
  } else if (wasApproved) {
    await recomputeProductRating(review.product);
  }

  return serializeAdminReview(review);
};

const adminDeleteReview = async ({ reviewId }) => {
  if (!mongoose.isValidObjectId(reviewId)) throw new AppError('Invalid review id', 400);

  const review = await Review.findById(reviewId).lean();
  if (!review) throw new AppError('Review not found', 404);

  const wasApproved = review.status === 'approved';
  await Review.deleteOne({ _id: reviewId });
  if (wasApproved) {
    await recomputeProductRating(review.product);
  }
  return { deleted: true };
};

module.exports = {
  createReview,
  editReview,
  deleteReview,
  listReviews,
  listMyReviews,
  markHelpful,
  reportReview,
  listReviewsForAdmin,
  moderateReview,
  adminDeleteReview,
  recomputeProductRating,
  verifyPurchasedProduct,
};
