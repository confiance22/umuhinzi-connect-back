const { Router } = require('express');
const db = require('../db');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const locationRoutes = require('./locationRoutes');
const harvestRoutes = require('./harvestRoutes');
const publicRoutes = require('./publicRoutes');
const marketPriceRoutes = require('./marketPriceRoutes');
const pageRoutes = require('./pageRoutes');

const router = Router();

router.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ success: true, db: 'connected' });
  } catch (err) {
    console.error('[health] database ping failed:', err.message);
    return res.status(503).json({
      success: false,
      db: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

router.use('/public', publicRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/locations', locationRoutes);
router.use('/harvests', harvestRoutes);
router.use('/market-prices', marketPriceRoutes);
router.use('/pages', pageRoutes);

module.exports = router;
