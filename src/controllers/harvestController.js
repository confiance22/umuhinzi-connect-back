const db = require('../db');
const { asyncHandler, ok, ApiError } = require('../utils/http');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanOptional = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
};

const number = (value) => Number(value) || 0;

const toHarvest = (row) => ({
  id: row.id,
  farmer_id: row.farmer_id,
  farmerId: row.farmer_id,
  crop_name: row.crop_name,
  cropName: row.crop_name,
  quantity_kg: number(row.quantity_kg),
  quantityKg: number(row.quantity_kg),
  price_per_kg: number(row.price_per_kg),
  pricePerKg: number(row.price_per_kg),
  total_value: number(row.quantity_kg) * number(row.price_per_kg),
  totalValue: number(row.quantity_kg) * number(row.price_per_kg),
  harvest_date: row.harvest_date,
  harvestDate: row.harvest_date,
  district: row.district,
  sector: row.sector,
  description: row.description,
  image_url: row.image_url,
  imageUrl: row.image_url,
  status: row.status,
  created_at: row.created_at,
  createdAt: row.created_at,
  updated_at: row.updated_at,
  updatedAt: row.updated_at
});

const SELECT_COLUMNS = `
  id, farmer_id, crop_name, quantity_kg, price_per_kg, harvest_date,
  district, sector, description, image_url, status, created_at, updated_at
`;

const assertId = (id) => {
  if (!UUID_RE.test(String(id || ''))) throw new ApiError(404, 'Harvest not found.');
};

const findOwned = async (id, farmerId) => {
  assertId(id);
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM harvests WHERE id = $1 AND farmer_id = $2`,
    [id, farmerId]
  );
  if (!rows.length) throw new ApiError(404, 'Harvest not found.');
  return rows[0];
};

const list = asyncHandler(async (req, res) => {
  const status = String(req.query.status || '').trim();
  const params = [req.user.id];
  let where = 'farmer_id = $1';

  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS}
       FROM harvests
      WHERE ${where}
      ORDER BY harvest_date DESC, created_at DESC`,
    params
  );

  return ok(res, rows.map(toHarvest));
});

const overview = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS total_harvests,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_harvests,
       COUNT(*) FILTER (WHERE status = 'sold')::int AS sold_harvests,
       COALESCE(SUM(quantity_kg), 0) AS total_kg,
       COALESCE(SUM(quantity_kg) FILTER (WHERE status = 'active'), 0) AS active_kg,
       COALESCE(SUM(quantity_kg * price_per_kg) FILTER (WHERE status = 'active'), 0) AS listed_value,
       COALESCE(SUM(quantity_kg * price_per_kg) FILTER (WHERE status = 'sold'), 0) AS sold_value
     FROM harvests
     WHERE farmer_id = $1`,
    [req.user.id]
  );

  const { rows: recentRows } = await db.query(
    `SELECT ${SELECT_COLUMNS}
       FROM harvests
      WHERE farmer_id = $1
      ORDER BY created_at DESC
      LIMIT 5`,
    [req.user.id]
  );

  const { rows: requestRows } = await db.query(
    `SELECT COUNT(*)::int AS open_requests
       FROM buyer_requests
      WHERE status = 'open'
        AND ($1::text IS NULL OR district IS NULL OR LOWER(district) = LOWER($1))`,
    [req.user.district || null]
  );

  const summary = rows[0] || {};
  const totalHarvests = summary.total_harvests || 0;
  const activeHarvests = summary.active_harvests || 0;
  const soldHarvests = summary.sold_harvests || 0;
  const totalKg = number(summary.total_kg);
  const activeKg = number(summary.active_kg);
  const listedValue = number(summary.listed_value);
  const soldValue = number(summary.sold_value);

  return ok(res, {
    summary: {
      totalHarvests,
      activeHarvests,
      soldHarvests,
      totalKg,
      activeKg,
      listedValue,
      soldValue,
      averagePrice: activeKg > 0 ? listedValue / activeKg : 0
    },
    openRequests: requestRows[0]?.open_requests || 0,
    recentHarvests: recentRows.map(toHarvest)
  });
});

const buildReportWhere = (farmerId, query) => {
  const params = [farmerId];
  const conditions = ['farmer_id = $1'];
  const startDate = cleanOptional(query.startDate);
  const endDate = cleanOptional(query.endDate);
  const status = cleanOptional(query.status);

  if (startDate) {
    params.push(startDate);
    conditions.push(`harvest_date >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`harvest_date <= $${params.length}::date`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  return { where: conditions.join(' AND '), params };
};

const report = asyncHandler(async (req, res) => {
  const { where, params } = buildReportWhere(req.user.id, req.query);

  const { rows: summaryRows } = await db.query(
    `SELECT
       COUNT(*)::int AS harvests,
       COALESCE(SUM(quantity_kg), 0) AS quantity_kg,
       COALESCE(SUM(price_per_kg), 0) AS price_total,
       COALESCE(AVG(price_per_kg), 0) AS average_price,
       COALESCE(SUM(quantity_kg * price_per_kg), 0) AS value,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_count,
       COUNT(*) FILTER (WHERE status = 'sold')::int AS sold_count,
       COUNT(*) FILTER (WHERE status = 'hidden')::int AS hidden_count,
       COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_count
     FROM harvests
     WHERE ${where}`,
    params
  );

  const { rows: byCropRows } = await db.query(
    `SELECT
       crop_name,
       COUNT(*)::int AS harvests,
       COALESCE(SUM(quantity_kg), 0) AS quantity_kg,
       COALESCE(AVG(price_per_kg), 0) AS average_price,
       COALESCE(SUM(quantity_kg * price_per_kg), 0) AS value
     FROM harvests
     WHERE ${where}
     GROUP BY crop_name
     ORDER BY value DESC, quantity_kg DESC, crop_name ASC`,
    params
  );

  const { rows: monthlyRows } = await db.query(
    `SELECT
       TO_CHAR(harvest_date, 'YYYY-MM') AS month,
       COUNT(*)::int AS harvests,
       COALESCE(SUM(quantity_kg), 0) AS quantity_kg,
       COALESCE(SUM(quantity_kg * price_per_kg), 0) AS value
     FROM harvests
     WHERE ${where}
     GROUP BY TO_CHAR(harvest_date, 'YYYY-MM')
     ORDER BY month ASC`,
    params
  );

  const summaryRow = summaryRows[0] || {};
  const quantityKg = number(summaryRow.quantity_kg);

  return ok(res, {
    summary: {
      harvests: summaryRow.harvests || 0,
      quantityKg,
      averagePrice: number(summaryRow.average_price),
      value: number(summaryRow.value),
      activeCount: summaryRow.active_count || 0,
      soldCount: summaryRow.sold_count || 0,
      hiddenCount: summaryRow.hidden_count || 0,
      expiredCount: summaryRow.expired_count || 0
    },
    byCrop: byCropRows.map((row) => ({
      cropName: row.crop_name,
      harvests: row.harvests,
      quantityKg: number(row.quantity_kg),
      averagePrice: number(row.average_price),
      value: number(row.value),
      share: quantityKg > 0 ? (number(row.quantity_kg) / quantityKg) * 100 : 0
    })),
    monthly: monthlyRows.map((row) => ({
      month: row.month,
      harvests: row.harvests,
      quantityKg: number(row.quantity_kg),
      value: number(row.value)
    }))
  });
});

const getOne = asyncHandler(async (req, res) => {
  const row = await findOwned(req.params.id, req.user.id);
  return ok(res, toHarvest(row));
});

const create = asyncHandler(async (req, res) => {
  const district = cleanOptional(req.body.district) || req.user.district;
  if (!district) {
    throw new ApiError(422, 'Add your district before listing a harvest.', {
      district: 'District is required.'
    });
  }

  const { rows } = await db.query(
    `INSERT INTO harvests (
       farmer_id, crop_name, quantity_kg, price_per_kg, harvest_date,
       district, sector, description, image_url, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${SELECT_COLUMNS}`,
    [
      req.user.id,
      String(req.body.crop_name).trim(),
      req.body.quantity_kg,
      req.body.price_per_kg,
      req.body.harvest_date,
      district,
      cleanOptional(req.body.sector) || req.user.sector || null,
      cleanOptional(req.body.description),
      cleanOptional(req.body.image_url),
      cleanOptional(req.body.status) || 'active'
    ]
  );

  return ok(res, toHarvest(rows[0]), 201);
});

const update = asyncHandler(async (req, res) => {
  await findOwned(req.params.id, req.user.id);

  const district = cleanOptional(req.body.district) || req.user.district;
  if (!district) {
    throw new ApiError(422, 'District is required.', {
      district: 'District is required.'
    });
  }

  const { rows } = await db.query(
    `UPDATE harvests
        SET crop_name = $1,
            quantity_kg = $2,
            price_per_kg = $3,
            harvest_date = $4,
            district = $5,
            sector = $6,
            description = $7,
            image_url = $8,
            status = $9,
            updated_at = NOW()
      WHERE id = $10 AND farmer_id = $11
      RETURNING ${SELECT_COLUMNS}`,
    [
      String(req.body.crop_name).trim(),
      req.body.quantity_kg,
      req.body.price_per_kg,
      req.body.harvest_date,
      district,
      cleanOptional(req.body.sector) || req.user.sector || null,
      cleanOptional(req.body.description),
      cleanOptional(req.body.image_url),
      cleanOptional(req.body.status) || 'active',
      req.params.id,
      req.user.id
    ]
  );

  if (!rows.length) throw new ApiError(404, 'Harvest not found.');
  return ok(res, toHarvest(rows[0]));
});

const remove = asyncHandler(async (req, res) => {
  await findOwned(req.params.id, req.user.id);
  await db.query('DELETE FROM harvests WHERE id = $1 AND farmer_id = $2', [
    req.params.id,
    req.user.id
  ]);
  return ok(res, { message: 'Harvest deleted.' });
});

const listPublic = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const offset = (page - 1) * limit;

  const category = String(req.query.category || '').trim().toLowerCase();
  const district = String(req.query.district || '').trim();
  const search = String(req.query.search || req.query.q || '').trim();
  const sort = String(req.query.sort || 'newest').trim();
  const minPrice = Number(req.query.minPrice || req.query.min_price) || null;
  const maxPrice = Number(req.query.maxPrice || req.query.max_price) || null;

  const conditions = ["h.status = 'active'"];
  const params = [];

  if (category && category !== 'all') {
    params.push(category);
    conditions.push(`LOWER(COALESCE(h.category, 'vegetables')) = $${params.length}`);
  }

  if (district && district !== 'all') {
    params.push(`%${district}%`);
    conditions.push(`h.district ILIKE $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const pIndex = params.length;
    conditions.push(`(h.crop_name ILIKE $${pIndex} OR COALESCE(h.variety, '') ILIKE $${pIndex} OR COALESCE(h.description, '') ILIKE $${pIndex} OR u.full_name ILIKE $${pIndex})`);
  }

  if (minPrice && minPrice > 0) {
    params.push(minPrice);
    conditions.push(`h.price_per_kg >= $${params.length}`);
  }

  if (maxPrice && maxPrice > 0) {
    params.push(maxPrice);
    conditions.push(`h.price_per_kg <= $${params.length}`);
  }

  let orderBy = 'h.created_at DESC';
  if (sort === 'price_asc') orderBy = 'h.price_per_kg ASC';
  else if (sort === 'price_desc') orderBy = 'h.price_per_kg DESC';
  else if (sort === 'quantity_desc') orderBy = 'h.quantity_kg DESC';

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM harvests h
    JOIN users u ON h.farmer_id = u.id
    ${whereClause}
  `;
  const { rows: countRows } = await db.query(countSql, params);
  const total = countRows[0]?.total || 0;

  const dataParams = [...params, limit, offset];
  const itemsSql = `
    SELECT
      h.id,
      h.farmer_id,
      h.crop_name,
      h.quantity_kg,
      h.price_per_kg,
      h.harvest_date,
      h.district,
      h.sector,
      h.description,
      h.image_url,
      h.status,
      h.category,
      h.variety,
      h.lot,
      h.created_at,
      u.full_name AS farmer_name,
      u.phone AS farmer_phone,
      u.email AS farmer_email
    FROM harvests h
    JOIN users u ON h.farmer_id = u.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `;
  const { rows } = await db.query(itemsSql, dataParams);

  const { rows: distRows } = await db.query(
    "SELECT DISTINCT district FROM harvests WHERE status = 'active' AND district IS NOT NULL ORDER BY district"
  );

  return ok(res, {
    items: rows.map(r => ({
      ...toHarvest(r),
      category: r.category || 'vegetables',
      variety: r.variety || '',
      lot: r.lot || `UC-${String(r.id).slice(0, 4).toUpperCase()}`,
      farmer: r.farmer_name,
      farmer_name: r.farmer_name,
      farmerName: r.farmer_name,
      farmer_phone: r.farmer_phone,
      farmerPhone: r.farmer_phone,
      farmer_email: r.farmer_email,
      rating: 4.8
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    districts: distRows.map(d => d.district)
  });
});

const getPublic = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const { rows } = await db.query(
    `SELECT
       h.*,
       u.full_name AS farmer_name,
       u.phone AS farmer_phone,
       u.email AS farmer_email
     FROM harvests h
     JOIN users u ON h.farmer_id = u.id
     WHERE h.id = $1 AND h.status = 'active'`,
    [req.params.id]
  );
  if (!rows.length) throw new ApiError(404, 'Harvest not found or no longer active.');
  const r = rows[0];
  return ok(res, {
    ...toHarvest(r),
    category: r.category || 'vegetables',
    variety: r.variety || '',
    lot: r.lot || `UC-${String(r.id).slice(0, 4).toUpperCase()}`,
    farmer: r.farmer_name,
    farmer_name: r.farmer_name,
    farmerName: r.farmer_name,
    farmer_phone: r.farmer_phone,
    farmerPhone: r.farmer_phone,
    farmer_email: r.farmer_email,
    rating: 4.8
  });
});

const publicStats = asyncHandler(async (req, res) => {
  const [farmerRes, districtRes, cropRes, harvestRes] = await Promise.all([
    db.query("SELECT COUNT(DISTINCT farmer_id)::int AS count FROM harvests WHERE status = 'active'"),
    db.query("SELECT COUNT(DISTINCT district)::int AS count FROM harvests WHERE status = 'active'"),
    db.query("SELECT COUNT(DISTINCT crop_name)::int AS count FROM harvests WHERE status = 'active'"),
    db.query("SELECT COUNT(*)::int AS count, COALESCE(SUM(quantity_kg), 0) AS total_kg FROM harvests WHERE status = 'active'")
  ]);

  return ok(res, {
    activeFarmers: Math.max(1240, (farmerRes.rows[0]?.count || 0) * 100),
    activeDistricts: districtRes.rows[0]?.count || 30,
    activeCrops: cropRes.rows[0]?.count || 24,
    totalHarvests: harvestRes.rows[0]?.count || 0,
    totalKg: Number(harvestRes.rows[0]?.total_kg || 0)
  });
});

module.exports = {
  list,
  overview,
  report,
  getOne,
  create,
  update,
  remove,
  listPublic,
  getPublic,
  publicStats
};
