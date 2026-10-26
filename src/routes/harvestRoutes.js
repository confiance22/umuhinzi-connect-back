const { Router } = require('express');
const harvestController = require('../controllers/harvestController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { harvestRules, handleValidation } = require('../utils/validate');

const router = Router();

router.use(requireAuth, requireRole('farmer'));

router.get('/overview', harvestController.overview);
router.get('/report', harvestController.report);
router.get('/', harvestController.list);
router.post('/', harvestRules, handleValidation, harvestController.create);
router.get('/:id', harvestController.getOne);
router.put('/:id', harvestRules, handleValidation, harvestController.update);
router.delete('/:id', harvestController.remove);

module.exports = router;
