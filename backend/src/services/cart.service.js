const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Category = require('../models/Category');
const AppError = require('../utils/AppError');
const { getEffectiveProductPrice, getEffectiveVariantPrice } = require('../utils/pricing.util');
const { getVariantStock, calculateProductStock, getStockStatus } = require('../utils/inventory.util');

const validateQuantity = (value) => {
  if (value === undefined || value === null || value === '') {
    throw new AppError('Quantity is required', 400);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) {
    throw new AppError('Quantity must be a positive integer', 400);
  }
  return num;
};

const resolveVariantForProduct = (product, variantId) => {
  if (product.variants.length > 0) {
    if (!variantId) {
      throw new AppError('Variant is required for this product', 400);
    }
    if (!mongoose.isValidObjectId(variantId)) {
      throw new AppError('Invalid variant id', 400);
    }
    const variant = product.variants.id(variantId);
    if (!variant) {
      throw new AppError('Product variant not found', 400);
    }
    return variant;
  }
  if (variantId) {
    throw new AppError('This product does not have variants', 400);
  }
  return null;
};

const resolveAvailableProduct = async (productId) => {
  if (!mongoose.isValidObjectId(productId)) {
    throw new AppError('Invalid product id', 400);
  }
  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  if (!product.isActive) {
    throw new AppError('Product is not available', 400);
  }
  const category = await Category.findById(product.category).select('isActive').lean();
  if (!category || !category.isActive) {
    throw new AppError('Product is not available', 400);
  }
  return product;
};

const getItemStock = (product, variant) =>
  product.variants.length > 0
    ? getVariantStock(variant)
    : calculateProductStock(product);

const getItemCurrentPrice = (product, variant) =>
  product.variants.length > 0
    ? getEffectiveVariantPrice(product, variant)
    : getEffectiveProductPrice(product);

const serializeCart = (cart) => {
  let subtotal = 0;
  let totalQuantity = 0;

  const items = cart.items.map((item) => {
    const product = item.product;
    totalQuantity += item.quantity;

    if (!product) {
      return {
        id: item._id,
        product: null,
        quantity: item.quantity,
        available: false,
        availableStock: 0,
      };
    }

    const primaryImage =
      (product.images || []).find((image) => image.isPrimary) ||
      (product.images || [])[0] ||
      null;

    const variant = item.variantId
      ? (product.variants || []).find(
          (v) => String(v._id) === String(item.variantId)
        )
      : null;

    const variantMissing = (product.variants || []).length > 0 && !variant;
    const productAvailable = product.isActive !== false && product.category?.isActive !== false;

    const stock = variantMissing
      ? 0
      : getItemStock(product, variant);

    const currentPrice = variantMissing
      ? null
      : getItemCurrentPrice(product, variant);

    const available = !!productAvailable && !variantMissing && stock >= item.quantity;
    const priceChanged = currentPrice !== null && currentPrice !== item.priceAtAddition;

    const lineTotal = available ? currentPrice * item.quantity : 0;
    if (available) subtotal += lineTotal;

    return {
      id: item._id,
      product: {
        id: product._id,
        name: product.name,
        slug: product.slug,
        isActive: product.isActive !== false,
        image: primaryImage
          ? { url: primaryImage.url, alt: primaryImage.alt ?? null }
          : null,
      },
      variant: variant
        ? {
            id: variant._id,
            color: variant.color,
            size: variant.size,
            sku: variant.sku,
          }
        : null,
      selectedColor: item.selectedColor ?? null,
      selectedSize: item.selectedSize ?? null,
      quantity: item.quantity,
      priceAtAddition: item.priceAtAddition,
      currentPrice,
      lineTotal,
      priceChanged,
      previousPrice: item.priceAtAddition,
      available,
      availableStock: stock,
      stockStatus: variantMissing ? 'out_of_stock' : getStockStatus(stock),
    };
  });

  return {
    items,
    subtotal,
    itemCount: items.length,
    totalQuantity,
  };
};

const getCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId })
    .populate({
      path: 'items.product',
      select:
        'name slug images price discountPrice isActive colors sizes stock variants category',
      populate: { path: 'category', select: 'name isActive' },
    })
    .lean();

  if (!cart) {
    return { items: [], subtotal: 0, itemCount: 0, totalQuantity: 0 };
  }
  return serializeCart(cart);
};

const addItem = async (userId, { productId, variantId, quantity }) => {
  const qty = validateQuantity(quantity);
  const product = await resolveAvailableProduct(productId);
  const variant = resolveVariantForProduct(product, variantId);

  const stock = getItemStock(product, variant);
  if (stock < qty) {
    throw new AppError(`Only ${stock} items are available`, 409);
  }

  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId });
  }

  const existing = cart.items.find(
    (item) =>
      item.product.toString() === product._id.toString() &&
      String(item.variantId || '') === String(variant?._id || '')
  );

  if (existing) {
    const combined = existing.quantity + qty;
    if (stock < combined) {
      throw new AppError(`Only ${stock} items are available`, 409);
    }
    existing.quantity = combined;
  } else {
    cart.items.push({
      product: product._id,
      variantId: variant?._id ?? null,
      quantity: qty,
      selectedColor: variant?.color ?? null,
      selectedSize: variant?.size ?? null,
      priceAtAddition: getItemCurrentPrice(product, variant),
    });
  }

  await cart.save();
  return getCart(userId);
};

const updateItem = async (userId, itemId, { quantity }) => {
  if (!mongoose.isValidObjectId(itemId)) {
    throw new AppError('Invalid cart item id', 400);
  }
  const qty = validateQuantity(quantity);

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new AppError('Cart item not found', 404);
  }
  const item = cart.items.id(itemId);
  if (!item) {
    throw new AppError('Cart item not found', 404);
  }

  const product = await Product.findById(item.product);
  if (!product || !product.isActive) {
    throw new AppError('Product is not available', 400);
  }
  const variant = item.variantId ? product.variants.id(item.variantId) : null;
  if (product.variants.length > 0 && !variant) {
    throw new AppError('Product variant not found', 400);
  }

  const stock = getItemStock(product, variant);
  if (stock < qty) {
    throw new AppError(`Only ${stock} items are available`, 409);
  }

  item.quantity = qty;
  await cart.save();
  return getCart(userId);
};

const removeItem = async (userId, itemId) => {
  if (!mongoose.isValidObjectId(itemId)) {
    throw new AppError('Invalid cart item id', 400);
  }

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new AppError('Cart item not found', 404);
  }
  const item = cart.items.id(itemId);
  if (!item) {
    throw new AppError('Cart item not found', 404);
  }

  item.deleteOne();
  await cart.save();
  return getCart(userId);
};

const clearCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    return { items: [], subtotal: 0, itemCount: 0, totalQuantity: 0 };
  }
  cart.items = [];
  await cart.save();
  return getCart(userId);
};

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };