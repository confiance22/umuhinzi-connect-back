const db = require('../db');
const { asyncHandler, ok, ApiError } = require('../utils/http');

const getBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { rows } = await db.query(
    `SELECT slug, title, content, meta, updated_at
     FROM pages
     WHERE slug = $1`,
    [slug]
  );

  if (!rows.length) throw new ApiError(404, 'Page not found.');
  return ok(res, rows[0]);
});

const list = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT slug, title, updated_at FROM pages ORDER BY slug`
  );
  return ok(res, rows);
});

module.exports = {
  getBySlug,
  list
};