const router = require('express').Router();

const {
  createCategory,
  getCategories,
  getCategoryBySlug,
  updateCategory,
  deleteCategory,
} = require('../controllers/category.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.get('/', getCategories);
router.get('/:slug', getCategoryBySlug);
router.post('/', adminLimiter, protect, adminOnly, createCategory);
router.patch('/:id', adminLimiter, protect, adminOnly, updateCategory);
router.delete('/:id', adminLimiter, protect, adminOnly, deleteCategory);

module.exports = router;