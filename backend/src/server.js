require('dotenv').config();

const mongoose = require('mongoose');

const app = require('./app');
const connectDatabase = require('./config/db');
const { validateRazorpayConfig } = require('./config/razorpay');
const { validateConfig } = require('./config/env');

const startServer = async () => {
  try {
    validateConfig();
    validateRazorpayConfig();
    await connectDatabase();

    const port = process.env.PORT || 5000;
    const server = app.listen(port, () => {
      console.log(
        `Server running in ${process.env.NODE_ENV || 'development'} mode on port ${port}`
      );
    });

    const shutdown = (signal) => {
      console.log(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await mongoose.disconnect();
        console.log('Closed out remaining connections');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();