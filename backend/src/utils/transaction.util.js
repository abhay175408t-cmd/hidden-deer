const mongoose = require('mongoose');

let transactionsSupported = null;

async function detectTransactionSupport() {
  if (transactionsSupported !== null) return transactionsSupported;
  try {
    const reply = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(reply.setName);
  } catch {
    transactionsSupported = false;
  }
  return transactionsSupported;
}

/**
 * Runs `fn(session)` inside a transaction when the connected MongoDB
 * deployment supports them (replica set / sharded cluster). Otherwise it
 * falls back to running `fn(null)` sequentially so single-node standalone
 * MongoDB still works.
 */
async function withTransaction(fn) {
  if (await detectTransactionSupport()) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
  return fn(null);
}

module.exports = { withTransaction, detectTransactionSupport };