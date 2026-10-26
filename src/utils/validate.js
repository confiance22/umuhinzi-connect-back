const { body, validationResult } = require('express-validator');
const { ApiError } = require('./http');

const handleValidation = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = {};
  result.array().forEach((entry) => {
    if (!errors[entry.path]) errors[entry.path] = entry.msg;
  });

  return next(new ApiError(422, Object.values(errors)[0], errors));
};

const normalizePhone = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('2500') && digits.length === 13) {
    return `+250${digits.slice(4)}`;
  }
  if (digits.startsWith('250') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+250${digits.slice(1)}`;
  }
  if (digits.length === 9) {
    return `+250${digits}`;
  }

  return `+${digits}`;
};

const phoneSearchVariants = (value) => {
  const raw = String(value || '').trim();
  const normalized = normalizePhone(raw);
  const variants = new Set();

  if (raw) {
    variants.add(raw);
    variants.add(raw.replace(/[\s-]/g, ''));
  }

  if (normalized) {
    variants.add(normalized);

    const digits = normalized.replace(/\D/g, '');
    if (digits.startsWith('250') && digits.length === 12) {
      const local = digits.slice(3);
      variants.add(digits);
      variants.add(`0${local}`);
      variants.add(local);
    }
  }

  return [...variants].filter(Boolean);
};

const phoneOk = (value) => /^\+?[0-9]{9,15}$/.test(normalizePhone(value));

const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const passwordOk = (value) => typeof value === 'string' && value.length >= 6;

const roleOk = (value) => ['farmer', 'buyer'].includes(value);

const registerRules = [
  body('full_name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required.')
    .isLength({ max: 120 })
    .withMessage('Full name must be at most 120 characters.'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .custom((value) => phoneOk(value))
    .withMessage('Enter a valid phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Email must be at most 150 characters.')
    .custom((value) => emailOk(value))
    .withMessage('Enter a valid email address.'),
  body('password')
    .isString()
    .withMessage('Password is required.')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  body('role')
    .notEmpty()
    .withMessage('Role is required.')
    .custom((value) => roleOk(value))
    .withMessage('Role must be farmer or buyer.'),
  body('district')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('District must be at most 60 characters.'),
  body('sector')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('Sector must be at most 60 characters.'),
  body('village_code')
    .trim()
    .notEmpty()
    .withMessage('Select your village.')
    .isLength({ max: 20 })
    .withMessage('Select a valid village.')
];

const loginRules = [
  body('phone').trim().notEmpty().withMessage('Phone number is required.'),
  body('password').notEmpty().withMessage('Password is required.')
];

const forgotPasswordRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .custom((value) => emailOk(value))
    .withMessage('Enter a valid email address.')
];

const verifyResetOtpRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .custom((value) => emailOk(value))
    .withMessage('Enter a valid email address.'),
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('Enter the 6-digit code.')
    .matches(/^\d{6}$/)
    .withMessage('Enter the 6-digit code.')
];

const adminRoleOk = (value) => ['farmer', 'buyer', 'super_admin'].includes(value);

const adminUserCreateRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required.')
    .isLength({ max: 120 })
    .withMessage('Full name must be at most 120 characters.'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .custom((value) => phoneOk(value))
    .withMessage('Enter a valid phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Email must be at most 150 characters.')
    .custom((value) => emailOk(value))
    .withMessage('Enter a valid email address.'),
  body('password')
    .isString()
    .withMessage('Password is required.')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.'),
  body('role')
    .notEmpty()
    .withMessage('Role is required.')
    .custom((value) => adminRoleOk(value))
    .withMessage('Role must be farmer, buyer or super_admin.'),
  body('district')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('District must be at most 60 characters.'),
  body('sector')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('Sector must be at most 60 characters.')
];

const adminUserUpdateRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required.')
    .isLength({ max: 120 })
    .withMessage('Full name must be at most 120 characters.'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .custom((value) => phoneOk(value))
    .withMessage('Enter a valid phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Email must be at most 150 characters.')
    .custom((value) => emailOk(value))
    .withMessage('Enter a valid email address.'),
  body('role')
    .optional()
    .custom((value) => adminRoleOk(value))
    .withMessage('Role must be farmer, buyer or super_admin.'),
  body('district')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('District must be at most 60 characters.'),
  body('sector')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('Sector must be at most 60 characters.'),
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be true or false.')
];

const adminProfileRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required.')
    .isLength({ max: 120 })
    .withMessage('Full name must be at most 120 characters.'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .custom((value) => phoneOk(value))
    .withMessage('Enter a valid phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Email must be at most 150 characters.')
    .custom((value) => emailOk(value))
    .withMessage('Enter a valid email address.')
];

const adminPasswordRules = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required.'),
  body('newPassword')
    .isString()
    .withMessage('New password is required.')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters.')
];

const harvestStatuses = ['active', 'sold', 'expired', 'hidden'];

const harvestRules = [
  body('crop_name')
    .trim()
    .notEmpty()
    .withMessage('Crop name is required.')
    .isLength({ max: 80 })
    .withMessage('Crop name must be at most 80 characters.'),
  body('quantity_kg')
    .notEmpty()
    .withMessage('Quantity is required.')
    .isFloat({ gt: 0 })
    .withMessage('Quantity must be greater than zero.'),
  body('price_per_kg')
    .notEmpty()
    .withMessage('Price per kg is required.')
    .isFloat({ gt: 0 })
    .withMessage('Price per kg must be greater than zero.'),
  body('harvest_date')
    .notEmpty()
    .withMessage('Harvest date is required.')
    .isISO8601()
    .withMessage('Enter a valid harvest date.'),
  body('district')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('District must be at most 60 characters.'),
  body('sector')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('Sector must be at most 60 characters.'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be at most 2000 characters.'),
  body('image_url')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Image URL must be at most 1000 characters.')
    .custom((value) => /^https?:\/\/\S+$/i.test(value))
    .withMessage('Enter a valid image URL.'),
  body('status')
    .optional()
    .custom((value) => harvestStatuses.includes(value))
    .withMessage('Choose a valid harvest status.')
];

const profileUpdateRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required.')
    .isLength({ max: 120 })
    .withMessage('Full name must be at most 120 characters.'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .custom((value) => phoneOk(value))
    .withMessage('Enter a valid phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Email must be at most 150 characters.')
    .custom((value) => emailOk(value))
    .withMessage('Enter a valid email address.')
];

const passwordChangeRules = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required.'),
  body('newPassword')
    .isString()
    .withMessage('New password is required.')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters.')
];

const rolePermissionsRules = [
  body('permissionIds')
    .isArray()
    .withMessage('Permission ids must be an array.')
];

const resetPasswordRules = [
  body('resetToken')
    .trim()
    .notEmpty()
    .withMessage('Reset token is required.'),
  body('newPassword')
    .isString()
    .withMessage('Password is required.')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  body('confirmPassword')
    .notEmpty()
    .withMessage('Please confirm your password.')
];

module.exports = {
  handleValidation,
  registerRules,
  loginRules,
  forgotPasswordRules,
  verifyResetOtpRules,
  resetPasswordRules,
  adminUserCreateRules,
  adminUserUpdateRules,
  adminProfileRules,
  adminPasswordRules,
  harvestRules,
  profileUpdateRules,
  passwordChangeRules,
  rolePermissionsRules,
  normalizePhone,
  phoneSearchVariants,
  phoneOk,
  emailOk,
  passwordOk,
  roleOk,
  adminRoleOk
};
