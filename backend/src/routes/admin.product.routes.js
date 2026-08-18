const router = require('express').Router();

const adminProductController = require('../controllers/admin.product.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.use(adminLimiter, protect, adminOnly);

router.get('/', adminProductController.getProducts);
router.get('/:id', adminProductController.getProductById);

module.exports = router;
