const router = require('express').Router();

const paymentWebhookController = require('../controllers/paymentWebhook.controller');

// Intentionally no JWT protect: Razorpay posts here.
router.post('/', paymentWebhookController.handleWebhook);

module.exports = router;