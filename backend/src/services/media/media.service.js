// Media service — secure browser-originated image upload/delete.
//
// The old server-path upload contract (a client-supplied `filePath` on the
// backend machine) is intentionally gone: the API now only accepts a
// multipart/form-data file buffer. No client-supplied filesystem path,
// public id or Cloudinary folder is ever trusted.
//
// Validation happens in layers:
//   1. multer middleware: single file, 5 MB cap, MIME allowlist
//   2. this service: content magic-byte inspection per declared MIME type
//   3. this service: server-generated publicId, allowlisted Cloudinary folder
//
// Deletes are guarded: a publicId referenced by an existing Product image
// (product level or variant level) cannot be removed and returns 409 so
// products never end up with broken images.

const crypto = require('crypto');
const Product = require('../../models/Product');
const AppError = require('../../utils/AppError');
const {
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} = require('../../middleware/upload.middleware');

const DEFAULT_FOLDER = 'deer/products';
// Strictly allowlisted destination folders. Clients may request one of these
// but can never choose arbitrary Cloudinary paths.
const ALLOWED_FOLDERS = ['deer/products', 'deer/categories', 'deer/misc'];

const getProvider = () => process.env.MEDIA_PROVIDER || 'dev';

const assertProviderConfigured = () => {
  if (getProvider() !== 'cloudinary') {
    throw new AppError(
      'Media uploads are unavailable: no media provider is configured. Set MEDIA_PROVIDER=cloudinary and provide CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      501,
      'MEDIA_PROVIDER_NOT_CONFIGURED'
    );
  }
};

// ---------------------------------------------------------------------------
// Content verification (magic bytes)
// ---------------------------------------------------------------------------

const hasPrefix = (buffer, prefix) => {
  if (buffer.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (buffer[i] !== prefix[i]) return false;
  }
  return true;
};

const MAGIC_BYTE_CHECKS = {
  'image/jpeg': (buffer) => hasPrefix(buffer, [0xff, 0xd8, 0xff]),
  'image/png': (buffer) =>
    hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (buffer) =>
    buffer.length >= 12 &&
    hasPrefix(buffer, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    hasPrefix(buffer.slice(8), [0x57, 0x45, 0x42, 0x50]), // "WEBP"
};

const assertImageContent = (buffer, mimetype) => {
  const check = MAGIC_BYTE_CHECKS[mimetype];
  if (!check) {
    throw new AppError(
      'Only JPEG, PNG and WebP images are allowed',
      400,
      'UNSUPPORTED_FILE_TYPE'
    );
  }
  if (!check(buffer)) {
    throw new AppError(
      'File content does not match the declared image type',
      400,
      'INVALID_IMAGE_CONTENT'
    );
  }
};

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

const normalizeFolder = (folder) => {
  if (!folder || typeof folder !== 'string' || !folder.trim()) {
    return DEFAULT_FOLDER;
  }
  const candidate = folder.trim().replace(/\/+$/, '');
  if (!ALLOWED_FOLDERS.includes(candidate)) {
    throw new AppError(
      `folder must be one of: ${ALLOWED_FOLDERS.join(', ')}`,
      400,
      'INVALID_FOLDER'
    );
  }
  return candidate;
};

// Server-generated publicId: timestamp + cryptographically random suffix.
// Never derived from client filenames, so path traversal and malicious
// filenames are structurally impossible.
const generatePublicId = () =>
  `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

const uploadImage = async ({ file, folder } = {}) => {
  assertProviderConfigured();

  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppError(
      'No file provided. Upload an image using the "file" field',
      400,
      'NO_FILE'
    );
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new AppError(
      'Image exceeds the maximum size of 5 MB',
      413,
      'FILE_TOO_LARGE'
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError(
      'Only JPEG, PNG and WebP images are allowed',
      400,
      'UNSUPPORTED_FILE_TYPE'
    );
  }

  assertImageContent(file.buffer, file.mimetype);

  const targetFolder = normalizeFolder(folder);
  const publicId = generatePublicId();

  let result;
  try {
    result = await require('./cloudinary.provider').uploadBuffer({
      buffer: file.buffer,
      folder: targetFolder,
      publicId,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Cloudinary upload failed: ${error.message}`,
      502,
      'CLOUDINARY_UPLOAD_FAILED'
    );
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
};

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

const findProductImageReference = async (publicId) => {
  const product = await Product.findOne({
    $or: [
      { 'images.publicId': publicId },
      { 'variants.images.publicId': publicId },
    ],
  })
    .select('name slug images')
    .lean();
  return product || null;
};

const deleteImage = async (publicId) => {
  assertProviderConfigured();

  if (!publicId || typeof publicId !== 'string' || !publicId.trim()) {
    throw new AppError('publicId is required', 400, 'INVALID_PUBLIC_ID');
  }
  const trimmed = publicId.trim();

  const referencedBy = await findProductImageReference(trimmed);
  if (referencedBy) {
    throw new AppError(
      `Image is in use by product "${referencedBy.name}". Remove it from the product before deleting.`,
      409,
      'IMAGE_IN_USE'
    );
  }

  let result;
  try {
    result = await require('./cloudinary.provider').deleteImage(trimmed);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Cloudinary delete failed: ${error.message}`,
      502,
      'CLOUDINARY_DELETE_FAILED'
    );
  }

  return result;
};

module.exports = {
  uploadImage,
  deleteImage,
  ALLOWED_FOLDERS,
  DEFAULT_FOLDER,
  MAX_IMAGE_SIZE_BYTES,
};