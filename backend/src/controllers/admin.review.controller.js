const reviewService = require('../services/review.service');

const getReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const result = await reviewService.listReviewsForAdmin({
      status: req.query.status,
      productId: req.query.product,
      reported: req.query.reported,
      page,
      limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const moderateReview = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }
    const review = await reviewService.moderateReview({
      reviewId: req.params.id,
      status,
    });
    res.status(200).json({
      success: true,
      message: 'Review moderation updated',
      data: { review },
    });
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const result = await reviewService.adminDeleteReview({ reviewId: req.params.id });
    res.status(200).json({ success: true, message: 'Review deleted', data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { getReviews, moderateReview, deleteReview };
