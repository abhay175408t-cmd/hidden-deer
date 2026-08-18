const mongoose = require('mongoose');
const EmailLog = require('../models/EmailLog');
const emailTemplateService = require('./emailTemplate.service');
const emailProvider = require('./email.provider');
const {
  EMAIL_STATUSES,
  EMAIL_TYPES,
  RETRY_BACKOFF_SECONDS,
  getEmailMaxRetries,
} = require('../config/notification.constants');

// ---------------------------------------------------------------------------
// Email service — central point for template loading/rendering, provider
// dispatch, delivery logging, and retry handling.
//
// Failure isolation: `sendEmail` NEVER throws to its caller for provider
// errors — provider failures are recorded on the EmailLog (status=failed) so
// the triggering business operation (order/payment) is never rolled back.
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = (email) => {
  if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    throw new Error('Invalid email recipient');
  }
  return email.trim().toLowerCase();
};

const serializeEmailLog = (log) => ({
  id: log._id,
  type: log.type,
  recipient: log.recipient,
  subject: log.subject,
  provider: log.provider,
  status: log.status,
  providerMessageId: log.providerMessageId,
  attempts: log.attempts,
  lastError: log.lastError,
  nextRetryAt: log.nextRetryAt,
  sentAt: log.sentAt,
  order: log.order,
  user: log.user,
  createdAt: log.createdAt,
  updatedAt: log.updatedAt,
});

// Performs one delivery attempt. `html` is captured on the EmailLog so retries
// re-send the identical rendered body (never re-rendered from live data).
const sendAttempt = async (log) => {
  if (log.attempts >= getEmailMaxRetries()) return log;

  log.status = EMAIL_STATUSES.SENDING;
  log.attempts += 1;
  log.lastError = null;
  log.nextRetryAt = null;
  await log.save();

  try {
    if (process.env.EMAIL_ENABLED !== 'true') {
      // Development mode: never send a real email; log the intended send safely.
      emailProvider.logProvider({
        type: log.type,
        to: log.recipient,
        subject: log.subject,
      });
      log.status = EMAIL_STATUSES.SENT;
      log.provider = 'log';
      log.sentAt = new Date();
    } else {
      const result = await emailProvider.providerSend({
        to: log.recipient,
        subject: log.subject,
        html: log.html,
      });
      log.status = EMAIL_STATUSES.SENT;
      log.provider = result.provider;
      log.providerMessageId = result.providerMessageId || null;
      log.sentAt = new Date();
    }
  } catch (error) {
    log.status = EMAIL_STATUSES.FAILED;
    log.lastError = String(error?.message || 'Email send failed').slice(0, 300);
    log.nextRetryAt = new Date(Date.now() + RETRY_BACKOFF_SECONDS(log.attempts) * 1000);
  }
  await log.save();
  return log;
};

// Public entry point. `data` must be a trusted server snapshot (order/payment
// records), never client input. `key` is the deterministic idempotency key;
// a duplicate key short-circuits without sending again.
const sendEmail = async ({ to, type, data, key, user, order }) => {
  if (!Object.values(EMAIL_TYPES).includes(type)) {
    throw new Error(`Unsupported email type: ${type}`);
  }

  const recipient = validateEmail(to);
  const subject = emailTemplateService.getSubject(type, data || {});
  const html = emailTemplateService.renderTemplate(type, data || {});

  let log;
  try {
    [log] = await EmailLog.create([
      {
        user: user || null,
        order: order || null,
        type,
        key: key || null,
        recipient,
        subject,
        html,
        provider: emailProvider.getProviderName(),
        status: EMAIL_STATUSES.QUEUED,
      },
    ]);
  } catch (error) {
    if (error && error.code === 11000) {
      // Duplicate idempotency key: the same business event was already logged.
      const existing = await EmailLog.findOne({ key });
      return existing || null;
    }
    throw error;
  }

  return sendAttempt(log);
};

// Retries a single failed email. No-op unless the log is failed and attempts
// remain. Permanently failing emails are not retried indefinitely: attempts
// never exceed the configured maximum.
const retryEmail = async (emailLogId) => {
  if (!mongoose.isValidObjectId(emailLogId)) return null;
  const log = await EmailLog.findById(emailLogId);
  if (!log) return null;
  if (log.status !== EMAIL_STATUSES.FAILED) return log;
  if (log.attempts >= getEmailMaxRetries()) return log;
  return sendAttempt(log);
};

// Retries all due failed emails (attempts remaining and backoff elapsed).
// Intended for a background worker in production.
const retryDueEmails = async () => {
  const logs = await EmailLog.find({
    status: EMAIL_STATUSES.FAILED,
    attempts: { $lt: getEmailMaxRetries() },
    nextRetryAt: { $lte: new Date() },
  });
  const results = [];
  for (const log of logs) {
    results.push(await sendAttempt(log));
  }
  return results;
};

const getEmailLogsForAdmin = async ({ page = 1, limit = 20, status, type } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    EmailLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    EmailLog.countDocuments(filter),
  ]);
  return {
    logs: logs.map(serializeEmailLog),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
};

module.exports = {
  sendEmail,
  retryEmail,
  retryDueEmails,
  getEmailLogsForAdmin,
  serializeEmailLog,
  validateEmail,
};
