const paymentService = require('../services/payment.service');

// POST /api/payments/webhook
// No JWT — Razorpay calls this directly; signature is verified in the service
// and invalid signatures are rejected with HTTP 400 before any processing.
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.get('x-razorpay-signature');
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const result = await paymentService.handleWebhook({ rawBody, signature });

    res.status(200).json({ success: true, received: true, ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = { handleWebhook };