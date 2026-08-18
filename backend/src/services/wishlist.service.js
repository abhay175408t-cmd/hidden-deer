const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const { calculateProductStock, getStockStatus, isInStock } = require('../utils/inventory.util');

const serializeWishlist = (wishlist) => {
  const products = (wishlist?.products || []).map((entry) => {
    const product = entry.product;

    if (!product) {
      return {
        id: entry.product,
        available: false,
        availableStock: 0,
        addedAt: entry.addedAt,
      };
    }

    const primaryImage =
      (product.images || []).find((image) => image.isPrimary) ||
      (product.images || [])[0] ||
      null;

    const stock = calculateProductStock(product);
    const categoryActive = product.category?.isActive !== false;
    const available =
      product.isActive !== false && categoryActive && isInStock(stock);

    return {
      id: product._id,
      name: product.name,
      slug: product.slug,
      image: primaryImage
        ? { url: primaryImage.url, alt: primaryImage.alt ?? null }
        : null,
      price: product.price,
      discountPrice: product.discountPrice ?? null,
      colors: product.colors,
      sizes: product.sizes,
      rating: product.rating,
      reviewCount: product.reviewCount,
      stockStatus: getStockStatus(stock),
      isActive: product.isActive !== false,
      available,
      availableStock: stock,
      addedAt: entry.addedAt,
    };
  });

  return { products, itemCount: products.length };
};

const getWishlist = async (userId) => {
  const wishlist = await Wishlist.findOne({ user: userId })
    .populate({
      path: 'products.product',
      select:
        'name slug images price discountPrice colors sizes stock rating reviewCount isActive variants stock category',
      populate: { path: 'category', select: 'isActive' },
    })
    .lean();

  if (!wishlist) {
    return { products: [], itemCount: 0 };
  }
  return serializeWishlist(wishlist);
};

const addProduct = async (userId, { productId }) => {
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

  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = new Wishlist({ user: userId });
  }

  const alreadyAdded = wishlist.products.some(
    (entry) => entry.product.toString() === product._id.toString()
  );
  if (alreadyAdded) {
    throw new AppError('Product already in wishlist', 409);
  }

  wishlist.products.push({ product: product._id });
  await wishlist.save();
  return getWishlist(userId);
};

const removeProduct = async (userId, productId) => {
  if (!mongoose.isValidObjectId(productId)) {
    throw new AppError('Invalid product id', 400);
  }

  const wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    throw new AppError('Product not in wishlist', 404);
  }

  const index = wishlist.products.findIndex(
    (entry) => entry.product.toString() === productId
  );
  if (index === -1) {
    throw new AppError('Product not in wishlist', 404);
  }

  wishlist.products.splice(index, 1);
  await wishlist.save();
  return getWishlist(userId);
};

module.exports = { getWishlist, addProduct, removeProduct };