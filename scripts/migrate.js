const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { sslConfig } = require('../src/database');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
const direction = process.argv[2] || 'up';

if (!['up', 'down'].includes(direction)) {
  console.error('Uso: node scripts/migrate.js <up|down>');
  process.exit(1);
}

const migrationUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!migrationUrl) {
  console.error('DATABASE_MIGRATION_URL o DATABASE_URL es obligatoria para ejecutar migraciones.');
  process.exit(1);
}

function poolConfig() {
  return {
    connectionString: migrationUrl,
    application_name: 'gaby-acuarelas-migrations',
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: sslConfig(process.env)
  };
}

function availableMigrations() {
  return fs.readdirSync(migrationsDir)
    .filter((file) => /^\d+_[a-z0-9_-]+\.up\.sql$/.test(file))
    .sort()
    .map((file) => ({
      version: file.replace(/\.up\.sql$/, ''),
      upPath: path.join(migrationsDir, file),
      downPath: path.join(migrationsDir, file.replace(/\.up\.sql$/, '.down.sql'))
    }));
}

async function ensureMigrationsTable(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS gaby_acuarelas');
  await client.query(`
    CREATE TABLE IF NOT EXISTS gaby_acuarelas.schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function migrateUp(client) {
  const migrations = availableMigrations();
  const appliedResult = await client.query(
    'SELECT version FROM gaby_acuarelas.schema_migrations'
  );
  const applied = new Set(appliedResult.rows.map((row) => row.version));

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    const sql = fs.readFileSync(migration.upPath, 'utf8');
    await client.query(sql);
    await client.query(
      'INSERT INTO gaby_acuarelas.schema_migrations (version) VALUES ($1)',
      [migration.version]
    );
    console.log(`Migración aplicada: ${migration.version}`);
  }
}

async function migrateDown(client) {
  const result = await client.query(`
    SELECT version
    FROM gaby_acuarelas.schema_migrations
    ORDER BY applied_at DESC, version DESC
    LIMIT 1
  `);

  if (result.rowCount === 0) {
    console.log('No hay migraciones para revertir.');
    return;
  }

  const migration = availableMigrations().find(
    (candidate) => candidate.version === result.rows[0].version
  );

  if (!migration || !fs.existsSync(migration.downPath)) {
    throw new Error(`No existe rollback para ${result.rows[0].version}.`);
  }

  const sql = fs.readFileSync(migration.downPath, 'utf8');
  await client.query(sql);
  await client.query(
    'DELETE FROM gaby_acuarelas.schema_migrations WHERE version = $1',
    [migration.version]
  );
  console.log(`Migración revertida: ${migration.version}`);
}

async function main() {
  const pool = new Pool(poolConfig());
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('gaby_acuarelas_migrations'))");
    await ensureMigrationsTable(client);

    if (direction === 'up') {
      await migrateUp(client);
    } else {
      await migrateDown(client);
    }

    await client.query('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (client && transactionStarted) await client.query('ROLLBACK');
    console.error(`Falló la migración: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
