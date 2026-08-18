const router = require('express').Router();

const couponController = require('../controllers/coupon.controller');
const { protect } = require('../middleware/auth.middleware');
const { couponLimiter } = require('../config/rateLimit');

router.use(protect, couponLimiter);

router.post('/validate', couponController.validateCoupon);

module.exports = router;
