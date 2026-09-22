const path = require('path');
const { Pool } = require('pg');
const { sslConfig } = require('../src/database');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
const expectedTables = [
  'customers',
  'deliveries',
  'exchange_rates',
  'exchange_rate_update_status',
  'order_items',
  'orders',
  'payment_attempts',
  'payment_events',
  'prices',
  'products',
  'schema_migrations'
];

if (!connectionString) {
  console.error('Configurá DATABASE_MIGRATION_URL o DATABASE_URL en .env para verificar la base.');
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString,
    application_name: 'gaby-acuarelas-schema-verification',
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: sslConfig(process.env)
  });

  try {
    const tableResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'gaby_acuarelas'
      ORDER BY table_name
    `);
    const actualTables = tableResult.rows.map((row) => row.table_name);
    assertEqualLists(actualTables, expectedTables, 'tablas');

    const migrationResult = await pool.query(`
      SELECT version
      FROM gaby_acuarelas.schema_migrations
      ORDER BY version
    `);
    assertEqualLists(
      migrationResult.rows.map((row) => row.version),
      ['001_order_core', '002_exchange_rates', '003_exchange_rate_update_status'],
      'migraciones'
    );

    const rowCountResult = await pool.query(`
      SELECT 'customers' AS table_name, count(*)::integer AS row_count FROM gaby_acuarelas.customers
      UNION ALL SELECT 'deliveries', count(*)::integer FROM gaby_acuarelas.deliveries
      UNION ALL SELECT 'order_items', count(*)::integer FROM gaby_acuarelas.order_items
      UNION ALL SELECT 'orders', count(*)::integer FROM gaby_acuarelas.orders
      UNION ALL SELECT 'payment_attempts', count(*)::integer FROM gaby_acuarelas.payment_attempts
      UNION ALL SELECT 'payment_events', count(*)::integer FROM gaby_acuarelas.payment_events
      UNION ALL SELECT 'prices', count(*)::integer FROM gaby_acuarelas.prices
      UNION ALL SELECT 'products', count(*)::integer FROM gaby_acuarelas.products
      ORDER BY table_name
    `);
    const nonEmptyTables = rowCountResult.rows.filter((row) => row.row_count !== 0);
    if (nonEmptyTables.length > 0) {
      throw new Error(`Se esperaban tablas vacías: ${nonEmptyTables.map((row) => row.table_name).join(', ')}.`);
    }

    const constraintResult = await pool.query(`
      SELECT count(*)::integer AS constraint_count
      FROM pg_constraint
      WHERE connamespace = 'gaby_acuarelas'::regnamespace
        AND contype = 'u'
        AND conrelid IN (
          'gaby_acuarelas.orders'::regclass,
          'gaby_acuarelas.payment_events'::regclass,
          'gaby_acuarelas.deliveries'::regclass
        )
    `);
    if (constraintResult.rows[0].constraint_count < 3) {
      throw new Error('Faltan restricciones únicas críticas.');
    }

    console.log('Esquema PostgreSQL verificado:');
    console.log(`- Tablas esperadas: ${actualTables.length}`);
    console.log('- Migraciones registradas: 001_order_core, 002_exchange_rates, 003_exchange_rate_update_status');
    console.log('- Tablas de dominio vacías: sí');
    console.log('- Restricciones únicas críticas: presentes');
  } catch (error) {
    console.error(`Falló la verificación del esquema: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

function assertEqualLists(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`Las ${label} no coinciden con la definición esperada.`);
  }
}

main();
