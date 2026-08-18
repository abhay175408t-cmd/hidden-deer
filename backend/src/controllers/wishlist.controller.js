const wishlistService = require('../services/wishlist.service');

const getWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.getWishlist(req.user._id);
    res.status(200).json({ success: true, data: { wishlist } });
  } catch (error) {
    next(error);
  }
};

const addWishlistItem = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.addProduct(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: 'Product added to wishlist',
      data: { wishlist },
    });
  } catch (error) {
    next(error);
  }
};

const removeWishlistItem = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.removeProduct(
      req.user._id,
      req.params.productId
    );
    res.status(200).json({
      success: true,
      message: 'Product removed from wishlist',
      data: { wishlist },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWishlist, addWishlistItem, removeWishlistItem };