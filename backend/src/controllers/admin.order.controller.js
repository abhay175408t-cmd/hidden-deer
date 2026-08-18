const orderService = require('../services/order.service');

const getOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const result = await orderService.getOrdersForAdmin({
      status: req.query.status,
      paymentStatus: req.query.paymentStatus,
      search: req.query.search,
      page,
      limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }
    const order = await orderService.updateOrderStatus(req.params.id, status);
    res.status(200).json({
      success: true,
      message: 'Order status updated',
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrderForAdmin(req.params.id);
    res.status(200).json({ success: true, data: { order } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOrders, updateOrderStatus, getOrder };