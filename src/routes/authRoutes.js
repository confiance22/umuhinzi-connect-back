const { Router } = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  verifyResetOtpRules,
  resetPasswordRules,
  profileUpdateRules,
  passwordChangeRules,
  handleValidation
} = require('../utils/validate');

const router = Router();

router.post('/register', registerRules, handleValidation, authController.register);
router.post('/login', loginRules, handleValidation, authController.login);
router.get('/me', requireAuth, authController.me);
router.put(
  '/profile',
  requireAuth,
  profileUpdateRules,
  handleValidation,
  authController.updateProfile
);
router.post(
  '/password',
  requireAuth,
  passwordChangeRules,
  handleValidation,
  authController.changePassword
);

router.post(
  '/forgot-password',
  forgotPasswordRules,
  handleValidation,
  authController.forgotPassword
);
router.post(
  '/verify-password-reset-otp',
  verifyResetOtpRules,
  handleValidation,
  authController.verifyPasswordResetOtp
);
router.post(
  '/reset-password',
  resetPasswordRules,
  handleValidation,
  authController.resetPassword
);

module.exports = router;
