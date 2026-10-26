const { Router } = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  adminUserCreateRules,
  adminUserUpdateRules,
  adminProfileRules,
  adminPasswordRules,
  rolePermissionsRules,
  handleValidation
} = require('../utils/validate');

const router = Router();

router.use(requireAuth, requireRole('super_admin'));

router.get('/users', adminController.getUsers);
router.post('/users', adminUserCreateRules, handleValidation, adminController.createUser);
router.put(
  '/users/:id',
  adminUserUpdateRules,
  handleValidation,
  adminController.updateUser
);
router.patch('/users/:id', adminController.updateUserStatus);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/:id/block', adminController.blockUser);
router.post('/users/:id/unblock', adminController.unblockUser);

router.get('/roles', adminController.getRoles);
router.put(
  '/roles/:id/permissions',
  rolePermissionsRules,
  handleValidation,
  adminController.assignRolePermissions
);
router.get('/permissions', adminController.getPermissions);

router.put(
  '/me/profile',
  adminProfileRules,
  handleValidation,
  adminController.updateSelf
);
router.post(
  '/me/password',
  adminPasswordRules,
  handleValidation,
  adminController.changePassword
);

module.exports = router;
