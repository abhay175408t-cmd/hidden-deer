const router = require('express').Router();

const adminNotificationController = require('../controllers/admin.notification.controller');
const notificationService = require('../services/notification.service');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');

router.use(adminLimiter, protect, adminOnly);

router.get('/notifications', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await notificationService.getUserNotifications(req.user._id, {
      page,
      limit,
      unreadOnly: req.query.unreadOnly === 'true',
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
router.get('/emails', adminNotificationController.getEmailLogs);
router.post('/emails/:id/retry', adminNotificationController.retryEmail);

module.exports = router;
