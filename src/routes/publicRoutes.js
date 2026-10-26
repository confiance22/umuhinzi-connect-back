const { Router } = require('express');
const harvestController = require('../controllers/harvestController');
const marketPriceController = require('../controllers/marketPriceController');
const pageController = require('../controllers/pageController');

const router = Router();

// Public harvests
router.get('/harvests', harvestController.listPublic);
router.get('/harvests/stats', harvestController.publicStats);
router.get('/harvests/:id', harvestController.getPublic);

// Market prices
router.get('/market-prices', marketPriceController.list);
router.get('/market-prices/districts', marketPriceController.getDistricts);
router.get('/market-prices/markets', marketPriceController.getMarkets);
router.get('/market-prices/crops', marketPriceController.getCrops);

// Pages content
router.get('/pages', pageController.list);
router.get('/pages/:slug', pageController.getBySlug);

module.exports = router;
