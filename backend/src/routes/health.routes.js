const router = require('express').Router();

const { healthCheck, readinessCheck } = require('../controllers/health.controller');

router.get('/health', healthCheck);
router.get('/health/ready', readinessCheck);

module.exports = router;
