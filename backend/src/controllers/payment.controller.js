const paymentService = require('../services/payment.service');
const razorpayService = require('../services/razorpay.service');

// POST /api/payments/create
const createPayment = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const { payment, order, reused } = await paymentService.createPaymentOrder({
      userId: req.user._id,
      orderId,
    });

    res.status(reused ? 200 : 201).json({
      success: true,
      message: reused ? 'Existing payment order reused' : 'Payment order created',
      data: {
        payment: {
          keyId: razorpayService.getKeyId(),
          razorpayOrderId: payment.providerOrderId,
          orderId: String(order._id),
          amount: paymentUtilToPaise(payment.amount),
          currency: payment.currency,
          status: payment.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

const paymentUtilToPaise = (amount) => Math.round(Number(amount) * 100);

// POST /api/payments/verify
const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const { payment, order, alreadyVerified } = await paymentService.verifyPayment({
      userId: req.user._id,
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    res.status(200).json({
      success: true,
      message: alreadyVerified ? 'Payment already verified' : 'Payment verified',
      data: {
        payment: {
          id: payment._id,
          orderId: String(order._id),
          razorpayOrderId: payment.providerOrderId,
          providerPaymentId: payment.providerPaymentId,
          status: payment.status,
          signatureVerified: payment.signatureVerified,
          method: payment.method,
          failureReason: payment.failureReason,
        },
        order: {
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
          total: order.total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/payments/order/:orderId
const getPaymentStatus = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentForOrder({
      userId: req.user._id,
      orderId: req.params.orderId,
    });
    res.status(200).json({ success: true, data: { payment } });
  } catch (error) {
    next(error);
  }
};

module.exports = { createPayment, verifyPayment, getPaymentStatus };