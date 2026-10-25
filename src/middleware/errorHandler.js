const { ApiError } = require('../utils/http');

const notFound = (req, res) =>
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found.`
  });

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
      ...(err.errors && { errors: err.errors })
    });
  }

  // PostgreSQL unique violation -> 409 so the UI can say "already exists".
  if (err && err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'A record with that value already exists.'
    });
  }

  // PostgreSQL check-constraint violation -> 422.
  if (err && err.code === '23514') {
    return res.status(422).json({
      success: false,
      error: 'A value violates a database constraint.'
    });
  }

  // PostgreSQL invalid input syntax / malformed UUID, etc. -> 400.
  if (err && (err.code === '22P02' || err.code === '22007')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input value.'
    });
  }

  console.error('[error]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
};

module.exports = { notFound, errorHandler };
