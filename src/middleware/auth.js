const db = require('../db');
const { verifyToken } = require('../utils/jwt');
const { ApiError, asyncHandler } = require('../utils/http');

const PUBLIC_USER_COLUMNS =
  'id, full_name, phone, email, role, district, sector, enabled, account_non_locked, last_login_at, created_at';

/** Attach req.user from a Bearer access token. */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) throw new ApiError(401, 'Missing authentication token.');

  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired token.');
  }

  const { rows } = await db.query(
    `SELECT ${PUBLIC_USER_COLUMNS}, password_hash FROM users WHERE id = $1`,
    [claims.sub]
  );

  const user = rows[0];
  if (!user) throw new ApiError(401, 'Account no longer exists.');
  if (!user.enabled) {
    throw new ApiError(403, 'This account has been disabled. Contact the platform administrator.');
  }
  if (!user.account_non_locked) {
    throw new ApiError(403, 'This account is locked. Contact the platform administrator.');
  }

  const { password_hash, ...safeUser } = user;
  req.user = safeUser;
  next();
});

/** Allow only the listed roles (farmer | buyer | super_admin). */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Missing authentication token.'));
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to do this.'));
  }
  next();
};

module.exports = { requireAuth, requireRole };
