const router = require('express').Router();

const reviewController = require('../controllers/review.controller');
const { protect } = require('../middleware/auth.middleware');
const { reviewLimiter } = require('../config/rateLimit');

// Public — approved reviews only, no auth required.
router.get('/', reviewController.getPublicReviews);

// Authenticated review actions.
router.post('/', protect, reviewLimiter, reviewController.createReview);
router.get('/mine', protect, reviewController.getMyReviews);
router.patch('/:id', protect, reviewController.editReview);
router.delete('/:id', protect, reviewController.deleteReview);
router.post('/:id/helpful', protect, reviewController.markHelpful);
router.post('/:id/report', protect, reviewController.reportReview);

module.exports = router;
