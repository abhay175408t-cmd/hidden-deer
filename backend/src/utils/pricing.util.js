// Pricing resolution rules (shared by cart, checkout and orders):
// - A variant overrides the product price when it explicitly defines a price.
// - discountPrice applies only when present, positive and not above price.
// - Otherwise the product-level price (or discountPrice) is used.

const getEffectiveProductPrice = (product) => {
  const { price, discountPrice } = product;
  if (
    discountPrice !== undefined &&
    discountPrice !== null &&
    discountPrice > 0 &&
    discountPrice <= price
  ) {
    return discountPrice;
  }
  return price;
};

const getEffectiveVariantPrice = (product, variant) => {
  const { price, discountPrice } = variant || {};
  if (
    discountPrice !== undefined &&
    discountPrice !== null &&
    discountPrice > 0 &&
    discountPrice <= price
  ) {
    return discountPrice;
  }
  if (price !== undefined && price !== null && price > 0) {
    return price;
  }
  return getEffectiveProductPrice(product);
};

module.exports = { getEffectiveProductPrice, getEffectiveVariantPrice };