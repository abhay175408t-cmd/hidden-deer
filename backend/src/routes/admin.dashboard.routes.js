const router = require('express').Router();

const adminDashboardController = require('../controllers/admin.dashboard.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.use(adminLimiter, protect, adminOnly);

router.get('/dashboard/stats', adminDashboardController.getStats);

module.exports = router;
