// Multipart upload middleware for browser-originated image uploads.
//
// - Accepts exactly one file field named "file".
// - Memory storage (the buffer is validated and forwarded to Cloudinary; it is
//   never written to the local filesystem).
// - Hard size cap and MIME allowlist enforced by multer; the media service
//   additionally verifies content magic bytes so a forged extension/MIME is
//   rejected server-side.
// - Multer errors are normalized into AppError so the centralized error
//   handler returns the standard response envelope.

const multer = require('multer');
const AppError = require('../utils/AppError');

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new AppError(
        'Only JPEG, PNG and WebP images are allowed',
        400,
        'UNSUPPORTED_FILE_TYPE'
      )
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
  fileFilter,
});

const uploadSingleImage = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new AppError(
            'Image exceeds the maximum size of 5 MB',
            413,
            'FILE_TOO_LARGE'
          )
        );
      }
      return next(
        new AppError(`Upload failed: ${err.message}`, 400, 'UPLOAD_ERROR')
      );
    }
    next(err);
  });
};

module.exports = { uploadSingleImage, MAX_IMAGE_SIZE_BYTES, ALLOWED_MIME_TYPES };