const { Pool } = require('pg');

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sslConfig(env) {
  if (env.DATABASE_SSL_MODE === 'require') return { rejectUnauthorized: true };
  if (env.DATABASE_SSL_MODE === 'disable') return false;
  return undefined;
}

function createDatabasePool(env = process.env) {
  if (!env.DATABASE_URL) return null;

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    application_name: 'gaby-acuarelas',
    max: positiveInteger(env.DATABASE_POOL_MAX, 5),
    connectionTimeoutMillis: positiveInteger(env.DATABASE_CONNECT_TIMEOUT_MS, 5000),
    idleTimeoutMillis: 10000,
    options: '-c search_path=gaby_acuarelas,public',
    ssl: sslConfig(env)
  });

  pool.on('error', (error) => {
    console.error('database_pool_error', { code: error.code || 'unknown' });
  });

  return pool;
}

module.exports = { createDatabasePool, sslConfig };
