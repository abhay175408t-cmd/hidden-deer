const router = require('express').Router();

const {
  createProduct,
  getProducts,
  getProductFilters,
  getProductBySlug,
  updateProduct,
  deleteProduct,
} = require('../controllers/product.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.get('/', getProducts);
router.get('/filters', getProductFilters);
router.get('/:slug', getProductBySlug);
router.post('/', adminLimiter, protect, adminOnly, createProduct);
router.patch('/:id', adminLimiter, protect, adminOnly, updateProduct);
router.delete('/:id', adminLimiter, protect, adminOnly, deleteProduct);

module.exports = router;