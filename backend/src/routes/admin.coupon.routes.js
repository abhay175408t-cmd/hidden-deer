const router = require('express').Router();

const adminCouponController = require('../controllers/admin.coupon.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.use(adminLimiter, protect, adminOnly);

router.get('/', adminCouponController.listCoupons);
router.post('/', adminCouponController.createCoupon);
router.get('/:id', adminCouponController.getCoupon);
router.patch('/:id', adminCouponController.updateCoupon);
router.delete('/:id', adminCouponController.deleteCoupon);

module.exports = router;
