// Razorpay environment configuration.
//
// Payment functionality is OPT-IN: when RAZORPAY_ENABLED is truthy the app
// validates that all required Razorpay variables exist at startup and fails
// fast instead of running with undefined secrets. When disabled the payment
// routes reply 503 and the rest of the application works normally.

const RAZORPAY_REQUIRED_VARS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
];

const isRazorpayEnabled = () => {
  const flag = (process.env.RAZORPAY_ENABLED || '').trim().toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  // Unset flag: enable only when the full set of credentials is present.
  return RAZORPAY_REQUIRED_VARS.every((name) => Boolean(process.env[name]));
};

// Returns the list of missing Razorpay variables.
const getMissingRazorpayVars = () => {
  if (!isRazorpayEnabled()) return [];
  return RAZORPAY_REQUIRED_VARS.filter((name) => !process.env[name]);
};

// Throws when Razorpay is enabled but required variables are missing so the
// server never starts with broken payment configuration.
const validateRazorpayConfig = () => {
  const missing = getMissingRazorpayVars();
  if (missing.length === 0) return;
  throw new Error(
    `Razorpay is enabled (RAZORPAY_ENABLED) but required environment variables are missing: ${missing.join(', ')}. ` +
    'Set them (TEST keys only) or disable payments with RAZORPAY_ENABLED=false.'
  );
};

module.exports = { isRazorpayEnabled, getMissingRazorpayVars, validateRazorpayConfig, RAZORPAY_REQUIRED_VARS };