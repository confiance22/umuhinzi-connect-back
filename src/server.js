require('dotenv').config();

const app = require('./app');
const db = require('./db');

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  try {
    await db.query('SELECT 1');
    console.log('Database connected');
  } catch (err) {
    console.error('Failed to connect to the database:', err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Umuhinzi Connect API listening on http://localhost:${PORT}/api`);
    console.log(`Health check:  GET http://localhost:${PORT}/api/health`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => {
      db.pool.end().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
