const crypto = require('crypto');
const path = require('path');
const { createDatabasePool } = require('../src/database');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL es obligatoria para verificar la conexión de la aplicación.');
  process.exit(1);
}

async function main() {
  const pool = createDatabasePool(process.env);
  let client;
  const suffix = crypto.randomUUID();
  const productId = `permission-probe-${suffix}`;
  const productUuid = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const orderId = crypto.randomUUID();

  try {
    client = await pool.connect();
    const identityResult = await client.query(`
      SELECT current_user AS current_user,
             current_schema() AS current_schema
    `);
    if (identityResult.rows[0].current_user !== 'gaby_acuarelas_app') {
      throw new Error('DATABASE_URL no usa el rol limitado esperado.');
    }
    if (identityResult.rows[0].current_schema !== 'gaby_acuarelas') {
      throw new Error('El search_path no prioriza el esquema esperado.');
    }

    await client.query('BEGIN');
    await client.query(`
      INSERT INTO gaby_acuarelas.products (id, product_type, title)
      VALUES ($1, 'course', 'Prueba transaccional')
    `, [productId]);
    await client.query(`
      INSERT INTO gaby_acuarelas.prices (id, product_id, currency, amount_cents)
      VALUES ($1, $2, 'USD', 100)
    `, [productUuid, productId]);
    await client.query(`
      INSERT INTO gaby_acuarelas.customers (
        id, first_name, last_name, email_normalized
      ) VALUES ($1, 'Prueba', 'Transaccional', $2)
    `, [customerId, `probe-${suffix}@example.invalid`]);
    await client.query(`
      INSERT INTO gaby_acuarelas.orders (
        id, customer_id, currency, total_amount_cents,
        idempotency_key, request_fingerprint
      ) VALUES ($1, $2, 'USD', 100, $3, $4)
    `, [orderId, customerId, `permission-probe-${suffix}`, 'a'.repeat(64)]);
    await client.query(`
      INSERT INTO gaby_acuarelas.order_items (
        id, order_id, product_id, price_id, product_type_snapshot,
        title_snapshot, unit_amount_cents, quantity, line_amount_cents
      ) VALUES ($1, $2, $3, $4, 'course', 'Prueba transaccional', 100, 1, 100)
    `, [crypto.randomUUID(), orderId, productId, productUuid]);

    const orderResult = await client.query(`
      SELECT status, total_amount_cents
      FROM gaby_acuarelas.orders
      WHERE id = $1
    `, [orderId]);
    if (orderResult.rowCount !== 1 || orderResult.rows[0].total_amount_cents !== 100) {
      throw new Error('La lectura transaccional no devolvió la orden esperada.');
    }

    await client.query('ROLLBACK');

    const rollbackResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM gaby_acuarelas.products WHERE id = $1
      ) AS probe_exists
    `, [productId]);
    if (rollbackResult.rows[0].probe_exists) {
      throw new Error('El rollback dejó datos de prueba persistidos.');
    }

    console.log('Conexión de aplicación verificada:');
    console.log('- Rol limitado activo: sí');
    console.log('- search_path aislado: sí');
    console.log('- Escritura y lectura transaccional: correctas');
    console.log('- Datos persistidos después del rollback: ninguno');
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // La conexión puede haber fallado antes de iniciar la transacción.
      }
    }
    console.error('Falló la verificación de la conexión de aplicación.', {
      code: error.code || 'verification_failed'
    });
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
