const router = require('express').Router();

const checkoutController = require('../controllers/checkout.controller');
const orderController = require('../controllers/order.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.post('/preview', checkoutController.getPreview);
router.post('/', checkoutController.placeOrder);
router.get('/', orderController.getMyOrders);
router.get('/:id', orderController.getOrder);
router.delete('/:id/cancel', orderController.cancelOrder);

module.exports = router;