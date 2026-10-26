const fs = require('fs');
const path = require('path');
const db = require('./index');
const { seedDatabase } = require('./seed');

const LOCK_KEY = 728341;
let bootstrapPromise = null;

async function runBootstrap() {
  const client = await db.pool.connect();
  let locked = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    locked = true;

    const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schema);
    await seedDatabase(client);

    console.log('Database schema and seed data are ready');
  } finally {
    if (locked) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      } catch {
        // The client may already be disconnected; release below still runs.
      }
    }
    client.release();
  }
}

function ensureDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

module.exports = { ensureDatabase };
