const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, signResetToken, verifyResetToken } = require('../utils/jwt');
const { asyncHandler, ok, ApiError } = require('../utils/http');
const { normalizePhone } = require('../utils/validate');

const RESET_OTP_TTL_MINUTES = 10;
const GENERIC_RESET_MESSAGE =
  'If an account exists for that email, a 6-digit reset code has been sent.';

const PUBLIC_COLUMNS =
  'id, full_name, phone, email, role, district, sector, created_at, updated_at';

const toPublicUser = (row) => ({
  id: row.id,
  full_name: row.full_name,
  phone: row.phone,
  email: row.email,
  role: row.role,
  district: row.district,
  sector: row.sector,
  created_at: row.created_at,
  updated_at: row.updated_at
});

const cleanOptional = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
};

/**
 * POST /api/auth/register
 * Body: full_name, phone, email?, password, role, district?, sector?
 */
const register = asyncHandler(async (req, res) => {
  const {
    full_name,
    phone,
    email,
    password,
    role,
    district,
    sector
  } = req.body;

  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = cleanOptional(email);

  const existingPhone = await db.query('SELECT id FROM users WHERE phone = $1', [
    normalizedPhone
  ]);
  if (existingPhone.rows.length) {
    throw new ApiError(409, 'This phone number is already registered.', {
      phone: 'This phone number is already registered.'
    });
  }

  if (normalizedEmail) {
    const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [
      normalizedEmail
    ]);
    if (existingEmail.rows.length) {
      throw new ApiError(409, 'This email address is already registered.', {
        email: 'This email address is already registered.'
      });
    }
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { rows } = await db.query(
    `INSERT INTO users (full_name, phone, email, password_hash, role, district, sector)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      String(full_name).trim(),
      normalizedPhone,
      normalizedEmail,
      password_hash,
      role,
      cleanOptional(district),
      cleanOptional(sector)
    ]
  );

  const user = toPublicUser(rows[0]);
  const token = signToken(user);

  return ok(res, { token, user }, 201);
});

/**
 * POST /api/auth/login
 * Body: phone, password
 */
const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const normalizedPhone = normalizePhone(phone);

  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE phone = $1`,
    [normalizedPhone]
  );

  const found = rows[0];
  if (!found) {
    throw new ApiError(401, 'Invalid phone number or password.');
  }

  const matches = await bcrypt.compare(password, found.password_hash);
  if (!matches) {
    throw new ApiError(401, 'Invalid phone number or password.');
  }

  const user = toPublicUser(found);
  const token = signToken(user);

  return ok(res, { token, user });
});

/**
 * GET /api/auth/me
 * Requires a valid Bearer token.
 */
const me = asyncHandler(async (req, res) => ok(res, { user: req.user }));

/**
 * POST /api/auth/forgot-password
 * Body: email
 *
 * Always returns the same generic message to avoid account enumeration.
 * In development the OTP is logged to the server console and returned as
 * `dev_otp` so the flow can be tested without an email provider.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const email = cleanOptional(req.body.email)?.toLowerCase();
  if (!email) return ok(res, { message: GENERIC_RESET_MESSAGE });

  const { rows } = await db.query(
    'SELECT id FROM users WHERE LOWER(email) = $1',
    [email]
  );

  if (!rows.length) {
    return ok(res, { message: GENERIC_RESET_MESSAGE });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + RESET_OTP_TTL_MINUTES * 60 * 1000);

  await db.query(
    `UPDATE users
        SET reset_otp_hash = $1, reset_otp_expires = $2, updated_at = NOW()
      WHERE id = $3`,
    [otpHash, expiresAt, rows[0].id]
  );

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[auth] Password reset OTP for ${email}: ${otp}`);
    return ok(res, { message: GENERIC_RESET_MESSAGE, dev_otp: otp });
  }

  // Email delivery is intentionally pluggable; wire an SMTP provider here.
  return ok(res, { message: GENERIC_RESET_MESSAGE });
});

/**
 * POST /api/auth/verify-password-reset-otp
 * Body: email, otp → { resetToken }
 */
const verifyPasswordResetOtp = asyncHandler(async (req, res) => {
  const email = cleanOptional(req.body.email)?.toLowerCase();
  const otp = String(req.body.otp || '').trim();

  if (!email) {
    throw new ApiError(422, 'Email is required.', { email: 'Email is required.' });
  }

  if (!/^\d{6}$/.test(otp)) {
    throw new ApiError(422, 'Enter the 6-digit code.', {
      otp: 'Enter the 6-digit code.'
    });
  }

  const { rows } = await db.query(
    `SELECT id, reset_otp_hash, reset_otp_expires
       FROM users
      WHERE LOWER(email) = $1`,
    [email]
  );

  const user = rows[0];
  if (!user || !user.reset_otp_hash || !user.reset_otp_expires) {
    throw new ApiError(401, 'Invalid or expired code.');
  }

  if (new Date(user.reset_otp_expires).getTime() < Date.now()) {
    await db.query(
      `UPDATE users
          SET reset_otp_hash = NULL, reset_otp_expires = NULL, updated_at = NOW()
        WHERE id = $1`,
      [user.id]
    );
    throw new ApiError(401, 'This code has expired. Request a new one.');
  }

  const matches = await bcrypt.compare(otp, user.reset_otp_hash);
  if (!matches) {
    throw new ApiError(401, 'Invalid or expired code.');
  }

  await db.query(
    `UPDATE users
        SET reset_otp_hash = NULL, reset_otp_expires = NULL, updated_at = NOW()
      WHERE id = $1`,
    [user.id]
  );

  const resetToken = signResetToken(user.id);
  return ok(res, { resetToken });
});

/**
 * POST /api/auth/reset-password
 * Body: resetToken, newPassword, confirmPassword
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    throw new ApiError(422, 'Passwords do not match.', {
      confirmPassword: 'Passwords do not match.'
    });
  }

  let payload;
  try {
    payload = verifyResetToken(resetToken);
  } catch {
    throw new ApiError(401, 'This reset link is invalid or has expired.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { rowCount } = await db.query(
    `UPDATE users
        SET password_hash = $1,
            reset_otp_hash = NULL,
            reset_otp_expires = NULL,
            updated_at = NOW()
      WHERE id = $2`,
    [passwordHash, payload.sub]
  );

  if (!rowCount) {
    throw new ApiError(404, 'Account not found.');
  }

  return ok(res, { message: 'Password updated successfully.' });
});

module.exports = {
  register,
  login,
  me,
  forgotPassword,
  verifyPasswordResetOtp,
  resetPassword
};
