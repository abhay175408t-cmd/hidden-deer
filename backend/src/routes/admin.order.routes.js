const router = require('express').Router();

const adminOrderController = require('../controllers/admin.order.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.use(adminLimiter, protect, adminOnly);

router.get('/', adminOrderController.getOrders);
router.get('/:id', adminOrderController.getOrder);
router.patch('/:id/status', adminOrderController.updateOrderStatus);

module.exports = router;