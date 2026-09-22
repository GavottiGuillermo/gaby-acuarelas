const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateAlertState,
  fetchOfficialSaleRate,
  parseOfficialSaleRate,
  updateErrorCode
} = require('../scripts/update-exchange-rate');

const now = Date.parse('2026-09-22T18:00:00.000Z');

test('valida la venta oficial de DolarApi y normaliza la cotización', () => {
  const quote = parseOfficialSaleRate({
    moneda: 'USD',
    casa: 'oficial',
    venta: 1535,
    fechaActualizacion: '2026-09-22T16:00:00.000Z'
  }, now);

  assert.deepEqual(quote, {
    rate: '1535.000000',
    effectiveAt: '2026-09-22T16:00:00.000Z',
    source: 'dolarapi:oficial:venta'
  });
});

test('rechaza cotizaciones inválidas, futuras o con más de siete días', () => {
  assert.throws(() => parseOfficialSaleRate({
    moneda: 'USD', casa: 'oficial', venta: 0, fechaActualizacion: '2026-09-22T16:00:00.000Z'
  }, now), /cotización de venta inválida/);
  assert.throws(() => parseOfficialSaleRate({
    moneda: 'USD', casa: 'oficial', venta: 1535, fechaActualizacion: '2026-09-23T16:00:00.000Z'
  }, now), /fecha futura/);
  assert.throws(() => parseOfficialSaleRate({
    moneda: 'USD', casa: 'oficial', venta: 1535, fechaActualizacion: '2026-09-14T16:00:00.000Z'
  }, now), /siete días/);
});

test('rechaza respuestas HTTP fallidas antes de interpretar datos', async () => {
  await assert.rejects(() => fetchOfficialSaleRate(async () => ({
    ok: false,
    status: 503
  }), now), /HTTP 503/);
});

test('solicita alerta por tres fallos consecutivos o más de diez días', () => {
  assert.equal(evaluateAlertState({
    consecutiveFailures: 2,
    effectiveAt: '2026-09-22T16:00:00.000Z'
  }, now).alertRequired, false);
  assert.equal(evaluateAlertState({
    consecutiveFailures: 3,
    effectiveAt: '2026-09-22T16:00:00.000Z'
  }, now).repeatedFailures, true);
  assert.equal(evaluateAlertState({
    consecutiveFailures: 0,
    effectiveAt: '2026-09-11T16:00:00.000Z'
  }, now).staleForAlert, true);
});

test('clasifica fallos sin guardar mensajes ni respuestas externas', () => {
  assert.equal(updateErrorCode(new Error('DolarApi respondió HTTP 503.')), 'source_http_error');
  assert.equal(updateErrorCode(new Error('cotización inválida')), 'invalid_source_data');
  assert.equal(updateErrorCode(new Error('detalle potencialmente sensible')), 'rate_update_failed');
});
