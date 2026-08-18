const cartService = require('../services/cart.service');

const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user._id);
    res.status(200).json({ success: true, data: { cart } });
  } catch (error) {
    next(error);
  }
};

const addCartItem = async (req, res, next) => {
  try {
    const cart = await cartService.addItem(req.user._id, req.body);
    res.status(200).json({
      success: true,
      message: 'Item added to cart',
      data: { cart },
    });
  } catch (error) {
    next(error);
  }
};

const updateCartItem = async (req, res, next) => {
  try {
    const cart = await cartService.updateItem(
      req.user._id,
      req.params.itemId,
      req.body
    );
    res.status(200).json({
      success: true,
      message: 'Cart item updated',
      data: { cart },
    });
  } catch (error) {
    next(error);
  }
};

const removeCartItem = async (req, res, next) => {
  try {
    const cart = await cartService.removeItem(req.user._id, req.params.itemId);
    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: { cart },
    });
  } catch (error) {
    next(error);
  }
};

const clearCart = async (req, res, next) => {
  try {
    await cartService.clearCart(req.user._id);
    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: { cart: { items: [], subtotal: 0, itemCount: 0, totalQuantity: 0 } },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCart, addCartItem, updateCartItem, removeCartItem, clearCart };