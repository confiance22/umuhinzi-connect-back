const { Router } = require('express');
const marketPriceController = require('../controllers/marketPriceController');

const router = Router();

router.get('/', marketPriceController.list);
router.get('/districts', marketPriceController.getDistricts);
router.get('/markets', marketPriceController.getMarkets);
router.get('/crops', marketPriceController.getCrops);

module.exports = router;