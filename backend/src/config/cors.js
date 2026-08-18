const cors = require('cors');
const AppError = require('../utils/AppError');

// Origins may be configured via ALLOWED_ORIGINS (comma separated); CLIENT_URL
// is honoured as a fallback for backwards compatibility.
const source =
  process.env.ALLOWED_ORIGINS ||
  process.env.CLIENT_URL ||
  'http://localhost:5173';

const allowedOrigins = source
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Non-browser clients (curl, servers) may omit the Origin header.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new AppError('Not allowed by CORS', 403, 'CORS_DENIED'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-Id',
  ],
  credentials: true,
  maxAge: 86400,
};

module.exports = corsOptions;
