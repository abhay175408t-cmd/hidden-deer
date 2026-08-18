const couponService = require('../services/coupon.service');

const createCoupon = async (req, res, next) => {
  try {
    const coupon = await couponService.createCoupon(req.body);
    res.status(201).json({ success: true, message: 'Coupon created', data: { coupon } });
  } catch (error) {
    next(error);
  }
};

const listCoupons = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const result = await couponService.listCoupons({
      page,
      limit,
      isActive: req.query.isActive,
      search: req.query.search,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getCoupon = async (req, res, next) => {
  try {
    const coupon = await couponService.getCouponById(req.params.id);
    res.status(200).json({ success: true, data: { coupon } });
  } catch (error) {
    next(error);
  }
};

const updateCoupon = async (req, res, next) => {
  try {
    const coupon = await couponService.updateCoupon(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Coupon updated', data: { coupon } });
  } catch (error) {
    next(error);
  }
};

const deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await couponService.deactivateCoupon(req.params.id);
    res.status(200).json({ success: true, message: 'Coupon deactivated', data: { coupon } });
  } catch (error) {
    next(error);
  }
};

module.exports = { createCoupon, listCoupons, getCoupon, updateCoupon, deleteCoupon };
