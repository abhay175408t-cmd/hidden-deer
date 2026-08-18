class AppError extends Error {
  constructor(message, status = 500, code = null, errors = undefined) {
    super(message);
    this.status = status;
    if (code) this.code = code;
    if (errors !== undefined) this.errors = errors;
  }
}

module.exports = AppError;
