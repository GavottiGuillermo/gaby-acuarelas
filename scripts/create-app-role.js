const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { sslConfig } = require('../src/database');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const adminUrl = process.env.DATABASE_MIGRATION_URL;
const appPassword = process.env.DATABASE_APP_PASSWORD;
const roleName = 'gaby_acuarelas_app';

if (!adminUrl) {
  console.error('DATABASE_MIGRATION_URL es obligatoria para crear el rol.');
  process.exit(1);
}

if (!appPassword || appPassword.length < 32 || !/^[A-Za-z0-9_-]+$/.test(appPassword)) {
  console.error('DATABASE_APP_PASSWORD debe tener al menos 32 caracteres alfanuméricos, guion o guion bajo.');
  process.exit(1);
}

function poolFor(connectionString, applicationName) {
  return new Pool({
    connectionString,
    application_name: applicationName,
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: sslConfig(process.env)
  });
}

async function createAndGrantRole() {
  const adminPool = poolFor(adminUrl, 'gaby-acuarelas-role-setup');
  const client = await adminPool.connect();

  try {
    await client.query('BEGIN');
    const roleResult = await client.query(`
      SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolconnlimit
      FROM pg_roles
      WHERE rolname = $1
    `, [roleName]);

    if (roleResult.rowCount === 0) {
      const sqlResult = await client.query(`
        SELECT format(
          'CREATE ROLE gaby_acuarelas_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 5',
          $1::text
        ) AS sql
      `, [appPassword]);
      await client.query(sqlResult.rows[0].sql);
    } else {
      const role = roleResult.rows[0];
      const safeRole = role.rolcanlogin
        && !role.rolsuper
        && !role.rolcreatedb
        && !role.rolcreaterole
        && !role.rolreplication
        && role.rolconnlimit === 5;
      if (!safeRole) throw new Error('El rol existente no cumple el perfil de seguridad esperado.');
    }

    const grantSql = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'admin', 'grant-app-role.sql'),
      'utf8'
    );
    await client.query(grantSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await adminPool.end();
  }
}

async function verifyRoleLoginAndIsolation() {
  const appUrl = new URL(adminUrl);
  appUrl.username = roleName;
  appUrl.password = appPassword;
  const appPool = poolFor(appUrl.toString(), 'gaby-acuarelas-role-verification');

  try {
    const privilegeResult = await appPool.query(`
      SELECT
        has_schema_privilege(current_user, 'gaby_acuarelas', 'USAGE') AS schema_usage,
        has_schema_privilege(current_user, 'gaby_acuarelas', 'CREATE') AS schema_create,
        has_table_privilege(current_user, 'gaby_acuarelas.orders', 'SELECT,INSERT,UPDATE') AS orders_rw,
        has_table_privilege(current_user, 'gaby_acuarelas.order_items', 'SELECT,INSERT') AS order_items_write,
        has_table_privilege(current_user, 'gaby_acuarelas.order_items', 'UPDATE,DELETE') AS order_items_mutation,
        has_table_privilege(current_user, 'gaby_acuarelas.schema_migrations', 'SELECT') AS migrations_read
    `);
    const privileges = privilegeResult.rows[0];
    if (
      !privileges.schema_usage
      || privileges.schema_create
      || !privileges.orders_rw
      || !privileges.order_items_write
      || privileges.order_items_mutation
      || privileges.migrations_read
    ) {
      throw new Error('Los permisos efectivos no coinciden con el perfil mínimo esperado.');
    }

    const externalAccessResult = await appPool.query(`
      SELECT count(*)::integer AS accessible_tables
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE relation.relkind IN ('r', 'p')
        AND namespace.nspname NOT IN ('gaby_acuarelas', 'pg_catalog', 'information_schema')
        AND namespace.nspname NOT LIKE 'pg_toast%'
        AND has_table_privilege(
          current_user,
          relation.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        )
    `);
    if (externalAccessResult.rows[0].accessible_tables !== 0) {
      throw new Error('El rol tiene acceso a tablas fuera del esquema de Gaby.');
    }

    console.log('Rol de aplicación verificado:');
    console.log('- Inicio de sesión: correcto');
    console.log('- Uso del esquema gaby_acuarelas: permitido');
    console.log('- Creación de objetos: denegada');
    console.log('- Mutación de snapshots de ítems: denegada');
    console.log('- Acceso a tablas fuera del esquema: ninguno');
  } finally {
    await appPool.end();
  }
}

async function main() {
  try {
    await createAndGrantRole();
    await verifyRoleLoginAndIsolation();
  } catch (error) {
    console.error('No se pudo preparar el rol de aplicación.', { code: error.code || 'verification_failed' });
    process.exitCode = 1;
  }
}

main();
