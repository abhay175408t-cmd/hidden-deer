// Startup environment validation. The server refuses to boot when a required
// variable is missing so configuration problems surface immediately instead of
// failing mid-request with confusing errors.

const REQUIRED_VARS = ['JWT_SECRET'];
const PRODUCTION_ONLY_VARS = ['CLIENT_URL', 'ALLOWED_ORIGINS'];

const getMissing = (names) => names.filter((name) => !process.env[name]);

const validateConfig = () => {
  const missing = getMissing(REQUIRED_VARS);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Add them to your .env file (see .env.example).`
    );
  }

  if (process.env.JWT_SECRET.length < 32) {
    console.warn(
      'Warning: JWT_SECRET is shorter than 32 characters. Use a long random value in production.'
    );
  }

  if (process.env.NODE_ENV === 'production') {
    const missingProd = getMissing(PRODUCTION_ONLY_VARS);
    if (missingProd.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missingProd.join(', ')}.`
      );
    }
  }
};

module.exports = { validateConfig, REQUIRED_VARS, PRODUCTION_ONLY_VARS };
