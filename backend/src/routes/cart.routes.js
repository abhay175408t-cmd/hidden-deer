const router = require('express').Router();

const {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require('../controllers/cart.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/', protect, getCart);
router.post('/items', protect, addCartItem);
router.patch('/items/:itemId', protect, updateCartItem);
router.delete('/items/:itemId', protect, removeCartItem);
router.delete('/', protect, clearCart);

module.exports = router;