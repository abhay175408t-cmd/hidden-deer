const emailService = require('../services/email.service');

const getEmailLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await emailService.getEmailLogsForAdmin({
      page,
      limit,
      status: req.query.status,
      type: req.query.type,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const retryEmail = async (req, res, next) => {
  try {
    const log = await emailService.retryEmail(req.params.id);
    if (!log) {
      return res.status(404).json({ success: false, message: 'Email log not found' });
    }
    res.status(200).json({
      success: true,
      message: 'Email retry attempted',
      data: { email: emailService.serializeEmailLog(log) },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getEmailLogs, retryEmail };
