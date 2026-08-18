const reviewService = require('../services/review.service');

const getPublicReviews = async (req, res, next) => {
  try {
    const result = await reviewService.listReviews({
      productId: req.query.product,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const createReview = async (req, res, next) => {
  try {
    const { productId, rating, comment } = req.body;
    const review = await reviewService.createReview({
      userId: req.user._id,
      productId,
      rating,
      comment,
    });
    res.status(201).json({
      success: true,
      message: 'Review submitted for moderation',
      data: { review },
    });
  } catch (error) {
    next(error);
  }
};

const getMyReviews = async (req, res, next) => {
  try {
    const result = await reviewService.listMyReviews({
      userId: req.user._id,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const editReview = async (req, res, next) => {
  try {
    const review = await reviewService.editReview({
      userId: req.user._id,
      reviewId: req.params.id,
      rating: req.body.rating,
      comment: req.body.comment,
    });
    res.status(200).json({
      success: true,
      message: 'Review updated and queued for moderation',
      data: { review },
    });
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const result = await reviewService.deleteReview({
      userId: req.user._id,
      reviewId: req.params.id,
    });
    res.status(200).json({ success: true, message: 'Review deleted', data: result });
  } catch (error) {
    next(error);
  }
};

const markHelpful = async (req, res, next) => {
  try {
    const result = await reviewService.markHelpful({
      userId: req.user._id,
      reviewId: req.params.id,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const reportReview = async (req, res, next) => {
  try {
    const result = await reviewService.reportReview({
      userId: req.user._id,
      reviewId: req.params.id,
      reason: req.body.reason,
    });
    res.status(200).json({
      success: true,
      message: 'Review reported to moderators',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPublicReviews,
  createReview,
  getMyReviews,
  editReview,
  deleteReview,
  markHelpful,
  reportReview,
};
