const { Router } = require('express');
const locationController = require('../controllers/locationController');

const router = Router();

router.get('/provinces', locationController.getProvinces);
router.get('/districts', locationController.getDistricts);
router.get('/sectors', locationController.getSectors);
router.get('/cells', locationController.getCells);
router.get('/villages', locationController.getVillages);
router.get('/village', locationController.getVillage);
router.get('/hierarchy/:code', locationController.getHierarchy);

module.exports = router;
