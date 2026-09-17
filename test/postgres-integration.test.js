const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');
const catalog = require('../src/catalog');
const { OrderService } = require('../src/orders/service');
const { PostgresOrderRepository } = require('../src/orders/postgres-repository');

const connectionString = process.env.TEST_DATABASE_URL;

test('PostgreSQL conserva idempotencia y restricciones de duplicados', {
  skip: connectionString ? false : 'TEST_DATABASE_URL no configurada'
}, async () => {
  const pool = new Pool({
    connectionString,
    application_name: 'gaby-acuarelas-integration-test',
    max: 2,
    ssl: false
  });
  const service = new OrderService({
    repository: new PostgresOrderRepository(pool),
    catalog
  });
  const uniqueSuffix = crypto.randomUUID();
  const idempotencyKey = `integration-${uniqueSuffix}`;
  const body = {
    customer: {
      firstName: 'Prueba',
      lastName: 'Integración',
      email: `prueba-${uniqueSuffix}@example.com`
    },
    items: [{ productId: 'peonias-pimpollo' }]
  };

  try {
    const created = await service.create({ body, idempotencyKey });
    assert.equal(created.status, 'pending');
    assert.equal(created.totalAmountCents, 1200);
    assert.equal(created.replayed, false);
    assert.equal(Object.hasOwn(created, 'email'), false);

    const replayed = await service.create({ body, idempotencyKey });
    assert.equal(replayed.id, created.id);
    assert.equal(replayed.replayed, true);

    await assert.rejects(() => service.create({
      body: {
        ...body,
        items: [{ productId: 'ebook-10-acuarelas-botanicas' }]
      },
      idempotencyKey
    }), (error) => error.code === 'idempotency_conflict' && error.status === 409);

    const fetched = await service.findById(created.id);
    assert.equal(fetched.id, created.id);
    assert.equal(Object.hasOwn(fetched, 'email'), false);

    const orderItemResult = await pool.query(`
      SELECT id
      FROM gaby_acuarelas.order_items
      WHERE order_id = $1
    `, [created.id]);
    const orderItemId = orderItemResult.rows[0].id;

    await pool.query(`
      INSERT INTO gaby_acuarelas.deliveries (id, order_item_id)
      VALUES ($1, $2)
    `, [crypto.randomUUID(), orderItemId]);
    await assert.rejects(() => pool.query(`
      INSERT INTO gaby_acuarelas.deliveries (id, order_item_id)
      VALUES ($1, $2)
    `, [crypto.randomUUID(), orderItemId]), (error) => error.code === '23505');

    const providerEventId = `event-${uniqueSuffix}`;
    await pool.query(`
      INSERT INTO gaby_acuarelas.payment_events (
        id, provider, provider_event_id, event_type, payload_sha256
      ) VALUES ($1, 'paypal', $2, 'test', $3)
    `, [crypto.randomUUID(), providerEventId, 'a'.repeat(64)]);
    await assert.rejects(() => pool.query(`
      INSERT INTO gaby_acuarelas.payment_events (
        id, provider, provider_event_id, event_type, payload_sha256
      ) VALUES ($1, 'paypal', $2, 'test', $3)
    `, [crypto.randomUUID(), providerEventId, 'b'.repeat(64)]), (error) => error.code === '23505');
  } finally {
    await pool.end();
  }
});
