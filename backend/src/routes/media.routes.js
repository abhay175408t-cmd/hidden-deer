const router = require('express').Router();

const {
  uploadImage,
  deleteImage,
} = require('../controllers/media.controller');
const { protect } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../config/rateLimit');
const { uploadSingleImage } = require('../middleware/upload.middleware');

// Auth runs before multipart parsing so unauthenticated/customer requests
// are rejected without touching the upload buffer.
router.post('/upload', adminLimiter, protect, adminOnly, uploadSingleImage, uploadImage);
router.delete('/:publicId', adminLimiter, protect, adminOnly, deleteImage);

module.exports = router;