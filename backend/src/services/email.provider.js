// ---------------------------------------------------------------------------
// Email provider abstraction. The rest of the application talks to
// `sendEmail` via email.service.js and never couples to a concrete provider.
// Providers are selected with EMAIL_PROVIDER:
//   - 'log'  (default): safe console logging, no real delivery
//   - 'smtp': real delivery via nodemailer using SMTP_* env vars
// ---------------------------------------------------------------------------

const logProvider = ({ to, subject, type }) => {
  // Development only: log enough to debug without leaking sensitive data.
  // The email BODY may contain customer order data, so it is never printed.
  const safeTo = String(to || '').toLowerCase();
  console.log(
    `[email:log] type=${type || 'unknown'} to=${safeTo} subject="${subject || ''}" (not actually sent — EMAIL_ENABLED=false or provider=log)`
  );
  return { provider: 'log', providerMessageId: null };
};

const smtpProvider = async ({ to, subject, html, from }) => {
  if (!process.env.SMTP_HOST) {
    throw new Error('SMTP_HOST not configured for EMAIL_PROVIDER=smtp');
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('nodemailer is not installed; cannot use the SMTP provider');
  }

  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  const info = await transport.sendMail({
    from: from || process.env.EMAIL_FROM || 'Deer Clothing <no-reply@deer.example>',
    to,
    subject,
    html,
  });
  return { provider: 'smtp', providerMessageId: info?.messageId || null };
};

// Returns the configured provider name used for EmailLog.provider.
const getProviderName = () => {
  if (process.env.EMAIL_ENABLED === 'true') {
    return process.env.EMAIL_PROVIDER || 'smtp';
  }
  return 'log';
};

// Dispatches to the configured provider. Never throws for configuration
// problems that should be recorded as a failed send — it always throws upward
// and the email service converts it into a failed EmailLog.
const providerSend = async ({ to, subject, html }) => {
  const provider = process.env.EMAIL_PROVIDER || 'log';

  if (provider === 'log') {
    return logProvider({ to, subject });
  }
  if (provider === 'smtp') {
    return smtpProvider({ to, subject, html });
  }
  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
};

module.exports = { providerSend, getProviderName, logProvider };
