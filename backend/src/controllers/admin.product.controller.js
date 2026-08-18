const productService = require('../services/product.service');

const getProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await productService.findAllForAdmin({
      page,
      limit,
      search: req.query.search,
      category: req.query.category,
      isActive: req.query.isActive,
      sort: req.query.sort,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const product = await productService.findByIdForAdmin(req.params.id);
    res.status(200).json({ success: true, data: { product } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProducts, getProductById };
