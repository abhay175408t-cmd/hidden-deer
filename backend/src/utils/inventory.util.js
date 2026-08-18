const { DEFAULT_LOW_STOCK_THRESHOLD } = require('../config/constants');

const getLowStockThreshold = () => {
  const value = Number(process.env.LOW_STOCK_THRESHOLD);
  return Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_LOW_STOCK_THRESHOLD;
};

const calculateProductStock = (product) => {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.reduce(
      (sum, variant) => sum + (Number(variant.stock) || 0),
      0
    );
  }
  return Number(product.stock) || 0;
};

const getStockStatus = (stock, threshold = getLowStockThreshold()) => {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
};

const getVariantStock = (variant) => Number(variant?.stock) || 0;

const isInStock = (stock) => stock > 0;

module.exports = {
  calculateProductStock,
  getStockStatus,
  getVariantStock,
  isInStock,
  getLowStockThreshold,
};