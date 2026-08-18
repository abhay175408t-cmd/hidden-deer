const router = require('express').Router();

const {
  register,
  login,
  logout,
  getCurrentUser,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { authLimiter } = require('../config/rateLimit');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', logout);
router.get('/me', protect, getCurrentUser);

module.exports = router;