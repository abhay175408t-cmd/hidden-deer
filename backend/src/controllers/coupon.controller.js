const couponService = require('../services/coupon.service');
const orderService = require('../services/order.service');

// Validates a coupon against the caller's cart so the frontend can show the
// discount before checkout. The same rules the order flow enforces: the
// server always recomputes the discount at order time.
const validateCoupon = async (req, res, next) => {
  try {
    const { code, items } = req.body;
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'code is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }

    const lines = await orderService.buildLineItems(items);
    const result = await couponService.evaluateCoupon({
      code,
      userId: req.user._id,
      lines,
    });

    if (!result) {
      return res.status(400).json({ success: false, message: 'Invalid coupon code' });
    }

    res.status(200).json({
      success: true,
      data: {
        ...couponService.serializeCouponPreview(result.coupon),
        eligibleSubtotal: result.eligibleSubtotal,
        discount: result.discount,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { validateCoupon };
