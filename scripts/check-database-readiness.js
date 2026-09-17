const path = require('path');
const { Pool } = require('pg');
const { sslConfig } = require('../src/database');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectionString = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Configurá DATABASE_MIGRATION_URL o DATABASE_URL en .env para revisar la base.');
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString,
    application_name: 'gaby-acuarelas-readiness',
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: sslConfig(process.env)
  });

  try {
    const result = await pool.query(`
      SELECT
        current_setting('server_version') AS server_version,
        current_setting('max_connections')::integer AS max_connections,
        (
          SELECT count(*)::integer
          FROM pg_stat_activity
          WHERE datname = current_database()
        ) AS current_database_connections,
        pg_database_size(current_database())::bigint AS database_size_bytes,
        has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
        (
          SELECT rolcreaterole
          FROM pg_roles
          WHERE rolname = current_user
        ) AS can_create_role,
        EXISTS (
          SELECT 1
          FROM information_schema.schemata
          WHERE schema_name = 'gaby_acuarelas'
        ) AS gaby_schema_exists,
        COALESCE((
          SELECT ssl
          FROM pg_stat_ssl
          WHERE pid = pg_backend_pid()
        ), false) AS tls_active
    `);

    const report = result.rows[0];
    console.log('Revisión PostgreSQL (sólo lectura):');
    console.log(`- Versión del servidor: ${report.server_version}`);
    console.log(`- Conexiones actuales / máximo: ${report.current_database_connections} / ${report.max_connections}`);
    console.log(`- Tamaño de la base: ${report.database_size_bytes} bytes`);
    console.log(`- TLS activo: ${report.tls_active ? 'sí' : 'no'}`);
    console.log(`- Puede crear esquema: ${report.can_create_schema ? 'sí' : 'no'}`);
    console.log(`- Puede crear rol separado: ${report.can_create_role ? 'sí' : 'no'}`);
    console.log(`- Esquema gaby_acuarelas existente: ${report.gaby_schema_exists ? 'sí' : 'no'}`);
  } catch (error) {
    console.error('No se pudo revisar PostgreSQL.', { code: error.code || 'unknown' });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
