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

test('la migración de cotizaciones conserva historial y una sola fila activa por par', () => {
  const up = fs.readFileSync(path.join(migrationsDir, '002_exchange_rates.up.sql'), 'utf8');
  const down = fs.readFileSync(path.join(migrationsDir, '002_exchange_rates.down.sql'), 'utf8');

  assert.match(up, /CREATE TABLE gaby_acuarelas\.exchange_rates\b/);
  assert.match(up, /rate numeric\(18, 6\) NOT NULL CHECK \(rate > 0\)/);
  assert.match(up, /CREATE UNIQUE INDEX exchange_rates_one_active_pair_idx/);
  assert.match(up, /WHERE active/);
  assert.match(down, /DROP TABLE IF EXISTS gaby_acuarelas\.exchange_rates\b/);
});

test('la migración de estado registra fallos consecutivos sin guardar respuestas externas', () => {
  const up = fs.readFileSync(path.join(migrationsDir, '003_exchange_rate_update_status.up.sql'), 'utf8');
  const down = fs.readFileSync(path.join(migrationsDir, '003_exchange_rate_update_status.down.sql'), 'utf8');

  assert.match(up, /CREATE TABLE gaby_acuarelas\.exchange_rate_update_status\b/);
  assert.match(up, /consecutive_failures integer NOT NULL DEFAULT 0/);
  assert.match(up, /last_error_code varchar\(64\)/);
  assert.doesNotMatch(up, /payload|response_body|error_message/);
  assert.match(down, /DROP TABLE IF EXISTS gaby_acuarelas\.exchange_rate_update_status\b/);
});
