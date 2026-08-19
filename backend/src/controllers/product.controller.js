const productService = require('../services/product.service');
const productSearchService = require('../services/productSearch.service');

const createProduct = async (req, res, next) => {
  try {
    const product = await productService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const result = await productSearchService.searchProducts(req.query);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getProductFilters = async (req, res, next) => {
  try {
    const filters = await productSearchService.getProductFilters(req.query);
    res.status(200).json({
      success: true,
      data: { filters },
    });
  } catch (error) {
    next(error);
  }
};

const getProductBySlug = async (req, res, next) => {
  try {
    const product = await productService.findBySlug(req.params.slug);
    res.status(200).json({
      success: true,
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const product = await productService.update(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    await productService.deactivate(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Product deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductFilters,
  getProductBySlug,
  updateProduct,
  deleteProduct,
};