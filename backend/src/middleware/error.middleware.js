const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  let code = err.code || undefined;
  let errors = err.errors;

  if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
    code = code || 'PAYLOAD_TOO_LARGE';
  } else if (err.type === 'entity.parse.failed' || (err.type === 'charset.unsupported' && err.status === 415)) {
    status = 400;
    message = 'Invalid JSON in request body';
    code = code || 'INVALID_JSON';
  } else if (err.name === 'SyntaxError' && err.status === 400 && err.body) {
    status = 400;
    message = 'Invalid JSON in request body';
    code = code || 'INVALID_JSON';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
    code = code || 'VALIDATION_ERROR';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid id format';
    code = code || 'INVALID_ID';
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate value for a unique field';
    code = code || 'DUPLICATE_KEY';
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Not authorized, invalid or expired token';
    code = code || 'INVALID_TOKEN';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Not authorized, invalid or expired token';
    code = code || 'TOKEN_EXPIRED';
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Not authorized';
    code = code || 'UNAUTHORIZED';
  }

  if (status === 500) {
    message = isProduction ? 'Internal server error' : message;
  }

  const payload = { success: false, message };
  if (code) payload.code = code;
  if (errors) payload.errors = errors;
  if (req.id) payload.requestId = req.id;
  if (!isProduction && err.stack) payload.stack = err.stack;
  payload.timestamp = new Date().toISOString();

  res.status(status).json(payload);
};

module.exports = errorHandler;
