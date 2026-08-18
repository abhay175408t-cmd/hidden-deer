const router = require('express').Router();

const adminReviewController = require('../controllers/admin.review.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.use(adminLimiter, protect, adminOnly);

router.get('/reviews', adminReviewController.getReviews);
router.patch('/reviews/:id/status', adminReviewController.moderateReview);
router.delete('/reviews/:id', adminReviewController.deleteReview);

module.exports = router;
