const path = require('path');
const { Pool } = require('pg');
const { sslConfig } = require('../src/database');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ENDPOINT = 'https://dolarapi.com/v1/dolares/oficial';
const SOURCE = 'dolarapi:oficial:venta';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const ALERT_AFTER_FAILURES = 3;
const ALERT_AFTER_AGE_MS = 10 * 24 * 60 * 60 * 1000;

function parseOfficialSaleRate(payload, now = Date.now()) {
  if (!payload || payload.moneda !== 'USD' || payload.casa !== 'oficial') {
    throw new Error('DolarApi no devolvió la cotización oficial USD esperada.');
  }

  const rate = Number(payload.venta);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('DolarApi devolvió una cotización de venta inválida.');
  }

  const effectiveAt = new Date(payload.fechaActualizacion);
  if (Number.isNaN(effectiveAt.getTime())) {
    throw new Error('DolarApi devolvió una fecha de actualización inválida.');
  }

  const ageMs = now - effectiveAt.getTime();
  if (ageMs < -FUTURE_TOLERANCE_MS) {
    throw new Error('La cotización de DolarApi tiene una fecha futura inesperada.');
  }
  if (ageMs > MAX_AGE_MS) {
    throw new Error('La cotización de DolarApi tiene más de siete días de antigüedad.');
  }

  return {
    rate: rate.toFixed(6),
    effectiveAt: effectiveAt.toISOString(),
    source: SOURCE
  };
}

async function fetchOfficialSaleRate(fetchImpl = fetch, now = Date.now()) {
  const response = await fetchImpl(ENDPOINT, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`DolarApi respondió HTTP ${response.status}.`);
  }

  return parseOfficialSaleRate(await response.json(), now);
}

async function storeRate(pool, quote) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('gaby_acuarelas_usd_ars_rate'))");

    const currentResult = await client.query(`
      SELECT id, rate::text, source, effective_at
      FROM gaby_acuarelas.exchange_rates
      WHERE base_currency = 'USD'
        AND quote_currency = 'ARS'
        AND active
      FOR UPDATE
    `);
    const current = currentResult.rows[0];

    if (
      current
      && Number(current.rate) === Number(quote.rate)
      && current.source === quote.source
      && new Date(current.effective_at).toISOString() === quote.effectiveAt
    ) {
      await markUpdateSuccess(client);
      await client.query('COMMIT');
      return { id: current.id, changed: false };
    }

    await client.query(`
      UPDATE gaby_acuarelas.exchange_rates
      SET active = false
      WHERE base_currency = 'USD'
        AND quote_currency = 'ARS'
        AND active
    `);

    const insertedResult = await client.query(`
      INSERT INTO gaby_acuarelas.exchange_rates (
        base_currency, quote_currency, rate, source, effective_at
      ) VALUES ('USD', 'ARS', $1, $2, $3)
      RETURNING id
    `, [quote.rate, quote.source, quote.effectiveAt]);

    await markUpdateSuccess(client);
    await client.query('COMMIT');
    return { id: insertedResult.rows[0].id, changed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markUpdateSuccess(client) {
  await client.query(`
    INSERT INTO gaby_acuarelas.exchange_rate_update_status (
      base_currency, quote_currency, consecutive_failures,
      last_attempt_at, last_success_at, last_error_code, updated_at
    ) VALUES ('USD', 'ARS', 0, now(), now(), NULL, now())
    ON CONFLICT (base_currency, quote_currency) DO UPDATE SET
      consecutive_failures = 0,
      last_attempt_at = EXCLUDED.last_attempt_at,
      last_success_at = EXCLUDED.last_success_at,
      last_error_code = NULL,
      updated_at = EXCLUDED.updated_at
  `);
}

function updateErrorCode(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'source_timeout';
  if (/HTTP \d{3}/.test(error?.message || '')) return 'source_http_error';
  if (/cotización|fecha/.test(error?.message || '')) return 'invalid_source_data';
  return 'rate_update_failed';
}

async function recordUpdateFailure(pool, errorCode) {
  await pool.query(`
    INSERT INTO gaby_acuarelas.exchange_rate_update_status (
      base_currency, quote_currency, consecutive_failures,
      last_attempt_at, last_failure_at, last_error_code, updated_at
    ) VALUES ('USD', 'ARS', 1, now(), now(), $1, now())
    ON CONFLICT (base_currency, quote_currency) DO UPDATE SET
      consecutive_failures = gaby_acuarelas.exchange_rate_update_status.consecutive_failures + 1,
      last_attempt_at = EXCLUDED.last_attempt_at,
      last_failure_at = EXCLUDED.last_failure_at,
      last_error_code = EXCLUDED.last_error_code,
      updated_at = EXCLUDED.updated_at
  `, [errorCode]);
}

function evaluateAlertState({ consecutiveFailures, effectiveAt }, now = Date.now()) {
  const parsedEffectiveAt = effectiveAt ? new Date(effectiveAt) : null;
  const rateMissing = !parsedEffectiveAt || Number.isNaN(parsedEffectiveAt.getTime());
  const staleForAlert = !rateMissing && now - parsedEffectiveAt.getTime() > ALERT_AFTER_AGE_MS;
  const repeatedFailures = consecutiveFailures >= ALERT_AFTER_FAILURES;

  return {
    alertRequired: rateMissing || staleForAlert || repeatedFailures,
    rateMissing,
    staleForAlert,
    repeatedFailures
  };
}

async function readAlertState(pool, now = Date.now()) {
  const result = await pool.query(`
    SELECT
      COALESCE(status.consecutive_failures, 0)::integer AS consecutive_failures,
      rate.effective_at
    FROM (SELECT 1) AS singleton
    LEFT JOIN gaby_acuarelas.exchange_rate_update_status AS status
      ON status.base_currency = 'USD' AND status.quote_currency = 'ARS'
    LEFT JOIN gaby_acuarelas.exchange_rates AS rate
      ON rate.base_currency = 'USD' AND rate.quote_currency = 'ARS' AND rate.active
  `);

  return evaluateAlertState({
    consecutiveFailures: result.rows[0].consecutive_failures,
    effectiveAt: result.rows[0].effective_at
  }, now);
}

async function main() {
  if (!process.env.DATABASE_MIGRATION_URL) {
    throw new Error('DATABASE_MIGRATION_URL es obligatoria para actualizar la cotización.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    application_name: 'gaby-acuarelas-rate-update',
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: sslConfig(process.env)
  });

  try {
    let quote;
    try {
      quote = await fetchOfficialSaleRate();
    } catch (error) {
      await recordUpdateFailure(pool, updateErrorCode(error));
      const alertState = await readAlertState(pool);
      if (alertState.alertRequired) {
        console.error('ALERTA: la actualización USD/ARS requiere revisión administrativa.');
      }
      throw error;
    }

    const result = await storeRate(pool, quote);
    console.log(result.changed ? 'Cotización USD/ARS actualizada.' : 'La cotización USD/ARS ya estaba actualizada.');
    console.log(`- Valor de venta: ARS ${quote.rate} por USD`);
    console.log(`- Fecha de origen: ${quote.effectiveAt}`);
    console.log(`- Fuente: ${quote.source}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`No se pudo actualizar la cotización: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  evaluateAlertState,
  fetchOfficialSaleRate,
  parseOfficialSaleRate,
  readAlertState,
  recordUpdateFailure,
  updateErrorCode,
  storeRate
};
