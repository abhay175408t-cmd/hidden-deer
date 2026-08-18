const crypto = require('crypto');

// Assigns a stable request id (honouring a client-supplied x-request-id,
// otherwise a random uuid) and echoes it back in the response headers so
// clients, logs and error payloads can be correlated.
const requestId = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{1,64}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

module.exports = { requestId };
