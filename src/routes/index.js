const { Router } = require('express');
const db = require('../db');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');

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

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
