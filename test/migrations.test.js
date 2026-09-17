const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

test('la migración inicial define todas las entidades de la etapa 3', () => {
  const up = fs.readFileSync(path.join(migrationsDir, '001_order_core.up.sql'), 'utf8');
  const down = fs.readFileSync(path.join(migrationsDir, '001_order_core.down.sql'), 'utf8');
  const tables = [
    'products',
    'prices',
    'customers',
    'orders',
    'order_items',
    'payment_attempts',
    'payment_events',
    'deliveries'
  ];

  for (const table of tables) {
    assert.match(up, new RegExp(`CREATE TABLE gaby_acuarelas\\.${table}\\b`));
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS gaby_acuarelas\\.${table}\\b`));
  }
});

test('la migración declara restricciones de idempotencia y entrega única', () => {
  const up = fs.readFileSync(path.join(migrationsDir, '001_order_core.up.sql'), 'utf8');

  assert.match(up, /idempotency_key varchar\(128\) NOT NULL UNIQUE/);
  assert.match(up, /UNIQUE \(provider, provider_event_id\)/);
  assert.match(up, /order_item_id uuid NOT NULL UNIQUE/);
});
