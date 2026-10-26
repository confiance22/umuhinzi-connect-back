const { Router } = require('express');
const pageController = require('../controllers/pageController');

const router = Router();

router.get('/', pageController.list);
router.get('/:slug', pageController.getBySlug);

module.exports = router;