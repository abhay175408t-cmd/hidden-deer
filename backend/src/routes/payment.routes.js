const router = require('express').Router();

const paymentController = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.post('/create', paymentController.createPayment);
router.post('/verify', paymentController.verifyPayment);
router.get('/order/:orderId', paymentController.getPaymentStatus);

module.exports = router;