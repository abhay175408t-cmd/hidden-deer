const orderService = require('../services/order.service');

const getPreview = async (req, res, next) => {
  try {
    const { items, couponCode } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }
    const summary = await orderService.getPreviewForUser(req.user._id, items, couponCode);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

const placeOrder = async (req, res, next) => {
  try {
    const { items, addressId, couponCode, paymentMethod } = req.body;
    if (!addressId) {
      return res.status(400).json({ success: false, message: 'addressId is required' });
    }
    const order = await orderService.placeOrder({
      userId: req.user._id,
      items,
      addressId,
      couponCode,
      paymentMethod: paymentMethod || 'cod',
    });
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPreview, placeOrder };