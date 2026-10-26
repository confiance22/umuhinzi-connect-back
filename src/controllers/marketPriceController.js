const db = require('../db');
const { asyncHandler, ok, ApiError } = require('../utils/http');

const list = asyncHandler(async (req, res) => {
  const crop = String(req.query.crop || '').trim();
  const district = String(req.query.district || '').trim();
  const market = String(req.query.market || '').trim();
  const search = String(req.query.search || req.query.q || '').trim();

  const params = [];
  const conditions = ['1=1'];

  if (crop && crop !== 'all') {
    params.push(`%${crop}%`);
    conditions.push(`crop_name ILIKE $${params.length}`);
  }
  if (district && district !== 'all') {
    params.push(`%${district}%`);
    conditions.push(`district ILIKE $${params.length}`);
  }
  if (market && market !== 'all') {
    params.push(`%${market}%`);
    conditions.push(`market ILIKE $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const pIndex = params.length;
    conditions.push(`(crop_name ILIKE $${pIndex} OR market ILIKE $${pIndex} OR district ILIKE $${pIndex})`);
  }

  const { rows } = await db.query(
    `SELECT
       id, crop_name, crop_key, market, district, unit,
       price, previous_price, change_percent, series, updated_at
     FROM market_prices
     WHERE ${conditions.join(' AND ')}
     ORDER BY crop_name ASC, market ASC`,
    params
  );

  const formattedRows = rows.map((r) => {
    const priceNum = Number(r.price) || 0;
    const changeNum = Number(r.change_percent) || 0;
    const seriesData = Array.isArray(r.series) && r.series.length
      ? r.series
      : [priceNum * 0.95, priceNum * 0.97, priceNum * 0.98, priceNum * 0.96, priceNum * 0.99, priceNum];

    return {
      id: r.id,
      crop_name: r.crop_name,
      cropName: r.crop_name,
      crop_key: r.crop_key || `harvests.crops.${r.crop_name.toLowerCase().replace(/\s+/g, '_')}`,
      cropKey: r.crop_key || `harvests.crops.${r.crop_name.toLowerCase().replace(/\s+/g, '_')}`,
      market: r.market,
      district: r.district,
      unit: r.unit || 'kg',
      price: priceNum,
      previous_price: Number(r.previous_price) || priceNum,
      change: changeNum,
      change_percent: changeNum,
      series: seriesData,
      updated_at: r.updated_at
    };
  });

  const averagePrice = formattedRows.length
    ? Math.round(formattedRows.reduce((sum, r) => sum + r.price, 0) / formattedRows.length)
    : 0;

  const topGainer = formattedRows.length
    ? [...formattedRows].sort((a, b) => b.change - a.change)[0]
    : null;

  const topDropper = formattedRows.length
    ? [...formattedRows].sort((a, b) => a.change - b.change)[0]
    : null;

  return ok(res, {
    items: formattedRows,
    summary: {
      averagePrice,
      topGainer,
      topDropper,
      totalMonitored: formattedRows.length
    }
  });
});

const getDistricts = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT DISTINCT district FROM market_prices ORDER BY district`
  );
  return ok(res, ['all', ...rows.map(r => r.district)]);
});

const getMarkets = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT DISTINCT market FROM market_prices ORDER BY market`
  );
  return ok(res, rows.map(r => r.market));
});

const getCrops = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT DISTINCT crop_name FROM market_prices ORDER BY crop_name`
  );
  return ok(res, rows.map(r => r.crop_name));
});

module.exports = {
  list,
  getDistricts,
  getMarkets,
  getCrops
};