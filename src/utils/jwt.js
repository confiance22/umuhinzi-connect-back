const jwt = require('jsonwebtoken');
require('dotenv').config();

const WEAK_SECRETS = new Set([
  'change_me_to_a_long_random_string',
  'change-me-to-a-long-random-string',
  'dev-secret-change-me',
  'secret'
]);

const JWT_SECRET = process.env.JWT_SECRET || '';

if (!JWT_SECRET || WEAK_SECRETS.has(JWT_SECRET)) {
  throw new Error('JWT_SECRET must be set to a long, random value in your .env file.');
}

const signToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
      phone: user.phone
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '3d' }
  );

const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

const signResetToken = (userId) =>
  jwt.sign(
    { sub: userId, purpose: 'password_reset' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

const verifyResetToken = (token) => {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== 'password_reset') {
    throw new Error('Invalid reset token purpose');
  }
  return payload;
};

module.exports = { signToken, verifyToken, signResetToken, verifyResetToken };
