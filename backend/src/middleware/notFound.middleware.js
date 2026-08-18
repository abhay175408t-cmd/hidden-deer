const notFound = (req, res) => {
  const payload = {
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
  };
  if (req.id) payload.requestId = req.id;
  payload.timestamp = new Date().toISOString();
  res.status(404).json(payload);
};

module.exports = notFound;
