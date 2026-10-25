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

const normalizePhone = (value) => String(value || '').trim().replace(/[\s-]/g, '');

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
    .withMessage('Sector must be at most 60 characters.')
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
  normalizePhone,
  phoneOk,
  emailOk,
  passwordOk,
  roleOk
};
