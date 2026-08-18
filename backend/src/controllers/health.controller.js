const healthCheck = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
};

// Readiness probe: reports 200 only when the database connection is up so
// orchestrators know when traffic may be routed to this instance.
const readinessCheck = (req, res) => {
  const mongoose = require('mongoose');
  const dbReady = mongoose.connection.readyState === 1;

  const body = {
    success: dbReady,
    status: dbReady ? 'ready' : 'not_ready',
    database: dbReady ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  res.status(dbReady ? 200 : 503).json(body);
};

module.exports = { healthCheck, readinessCheck };
