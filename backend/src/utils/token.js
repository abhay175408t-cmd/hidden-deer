const jwt = require('jsonwebtoken');

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const cookieOptions = () => {
  const expiresInDays = Number(process.env.COOKIE_EXPIRES_DAYS) || 7;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: expiresInDays * 24 * 60 * 60 * 1000,
  };
};

const setAuthCookie = (res, token) => {
  res.cookie('auth_token', token, cookieOptions());
};

const clearAuthCookie = (res) => {
  res.clearCookie('auth_token', cookieOptions());
};

module.exports = { generateToken, setAuthCookie, clearAuthCookie, cookieOptions };