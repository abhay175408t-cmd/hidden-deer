// Cloudinary media provider.
//
// Credentials come exclusively from environment variables (never hardcoded,
// never logged, never returned in responses). When MEDIA_PROVIDER=cloudinary
// but credentials are missing, every operation fails with a 501
// MEDIA_PROVIDER_NOT_CONFIGURED AppError so misconfiguration surfaces clearly
// without exposing any secrets.
//
// Test suites inject a fake transport via __setTransport (mirrors the
// razorpay.service __setInstance pattern) so no real credentials are required
// in automated tests.

const AppError = require('../../utils/AppError');

let cloudinary = null;
let transport = null;

const getCloudinary = () => {
  if (transport) return transport;
  if (cloudinary) return cloudinary;
  try {
    cloudinary = require('cloudinary').v2;
  } catch (error) {
    throw new AppError(
      'The cloudinary package is not installed. Run: npm install cloudinary',
      500
    );
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return cloudinary;
};

const assertConfigured = () => {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new AppError(
      'Media uploads are unavailable: Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env',
      501,
      'MEDIA_PROVIDER_NOT_CONFIGURED'
    );
  }
};

// Uploads an in-memory image buffer. publicId is always generated
// server-side; clients cannot choose arbitrary paths.
const uploadBuffer = async ({ buffer, folder, publicId }) => {
  assertConfigured();
  const result = await getCloudinary().uploader.upload(buffer, {
    folder,
    public_id: publicId,
  });
  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
};

const deleteImage = async (publicId) => {
  assertConfigured();
  const result = await getCloudinary().uploader.destroy(publicId);
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new AppError(`Cloudinary delete failed: ${result.result}`, 500);
  }
  return { success: true };
};

// Test-only injection point for a fake transport.
const __setTransport = (fake) => {
  transport = fake;
};

module.exports = { uploadBuffer, deleteImage, __setTransport };