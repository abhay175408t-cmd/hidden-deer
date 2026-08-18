// Rate limiting configuration.
//
// All limits are configurable through environment variables so production
// values can be tuned without code changes:
//   RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX     general API
//   AUTH_RATE_LIMIT_WINDOW_MS / AUTH_RATE_LIMIT_MAX   auth (login/register)
//   ADMIN_RATE_LIMIT_WINDOW_MS / ADMIN_RATE_LIMIT_MAX admin routes
//
// In test environments limits are effectively disabled so automated suites
// never trip the counters; security tests exercise the factory directly.

const { rateLimit } = require('express-rate-limit');

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

// Rate limiting is a production control. In every other environment the
// limiters are effectively unbounded so development and test suites are never
// throttled by their own traffic.
const isProduction = () => process.env.NODE_ENV === 'production';

const readNumber = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Env-configurable max in production, effectively unbounded elsewhere.
const getMax = (envName, fallback) =>
  isProduction() ? readNumber(envName, fallback) : Number.MAX_SAFE_INTEGER;

const getWindow = (envName) => readNumber(envName, DEFAULT_WINDOW_MS);

const createRateLimiter = ({
  windowMs = DEFAULT_WINDOW_MS,
  max,
  message = 'Too many requests, please try again later',
  skip,
  standardHeaders = 'draft-7',
  legacyHeaders = false,
}) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders,
    legacyHeaders,
    skip,
    handler: (req, res) =>
      res.status(429).json({ success: false, message }),
  });

// General API limiter. The webhook and health endpoints are excluded: the
// webhook receives bursts of signed deliveries and health probes must never
// be throttled.
const apiLimiter = createRateLimiter({
  windowMs: getWindow('RATE_LIMIT_WINDOW_MS'),
  max: getMax('RATE_LIMIT_MAX', 300),
  skip: (req) =>
    /^\/api\/health(\/|$)/.test(req.originalUrl || '') ||
    /^\/api\/payments\/webhook(\/|$)/.test(req.originalUrl || ''),
});

// Stricter limiter for credential endpoints (login/register).
const authLimiter = createRateLimiter({
  windowMs: getWindow('AUTH_RATE_LIMIT_WINDOW_MS'),
  max: getMax('AUTH_RATE_LIMIT_MAX', 20),
  message: 'Too many authentication attempts, please try again later',
});

// Stricter limiter for administrative endpoints.
const adminLimiter = createRateLimiter({
  windowMs: getWindow('ADMIN_RATE_LIMIT_WINDOW_MS'),
  max: getMax('ADMIN_RATE_LIMIT_MAX', 100),
  message: 'Too many admin requests, please try again later',
});

// Coupon validation is a write-ish, abuse-prone operation (code guessing /
// brute forcing) so it gets its own tighter limiter.
const couponLimiter = createRateLimiter({
  windowMs: getWindow('COUPON_RATE_LIMIT_WINDOW_MS'),
  max: getMax('COUPON_RATE_LIMIT_MAX', 30),
  message: 'Too many coupon validation attempts, please try again later',
});

// Review creation is throttled to slow down spam while the pending
// moderation queue drains.
const reviewLimiter = createRateLimiter({
  windowMs: getWindow('REVIEW_RATE_LIMIT_WINDOW_MS'),
  max: getMax('REVIEW_RATE_LIMIT_MAX', 20),
  message: 'Too many review submissions, please try again later',
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  adminLimiter,
  couponLimiter,
  reviewLimiter,
};
