const router = require('express').Router();

const {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
} = require('../controllers/wishlist.controller');
const { protect } = require('../middleware/auth.middleware');

router.get('/', protect, getWishlist);
router.post('/items', protect, addWishlistItem);
router.delete('/items/:productId', protect, removeWishlistItem);

module.exports = router;