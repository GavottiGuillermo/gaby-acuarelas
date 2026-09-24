const test = require('node:test');
const assert = require('node:assert/strict');
const {
  reconciliationConfig,
  runPaymentReconciliation
} = require('../src/payments/reconciliation');

test('aplica límites seguros a la configuración de conciliación', () => {
  const defaults = reconciliationConfig({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.intervalMs, 5 * 60 * 1000);
  assert.equal(defaults.batchSize, 50);
  assert.equal(defaults.graceMs, 15 * 60 * 1000);
  assert.equal(defaults.alertAgeMs, 24 * 60 * 60 * 1000);

  const bounded = reconciliationConfig({
    PAYMENT_RECONCILIATION_ENABLED: 'false',
    PAYMENT_RECONCILIATION_INTERVAL_MINUTES: '0',
    PAYMENT_RECONCILIATION_BATCH_SIZE: '500'
  });
  assert.equal(bounded.enabled, false);
  assert.equal(bounded.intervalMs, defaults.intervalMs);
  assert.equal(bounded.batchSize, defaults.batchSize);
});

test('registra resultados y alertas sin cuerpos ni datos personales', async () => {
  const logs = [];
  const logger = {
    info(message, metadata) {
      logs.push(['info', message, metadata]);
    },
    warn(message, metadata) {
      logs.push(['warn', message, metadata]);
    },
    error(message, metadata) {
      logs.push(['error', message, metadata]);
    }
  };
  const summary = {
    scanned: 1,
    terminalPayments: 0,
    pendingPayments: 0,
    noPayment: 0,
    cancelledExpired: 0,
    expirationsScheduled: 0,
    duplicates: 0,
    failed: 1,
    overdue: 1,
    alertRequired: true,
    errorCodes: { mercadopago_unavailable: 1 },
    events: [{
      kind: 'failed',
      orderId: '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36',
      code: 'mercadopago_unavailable'
    }]
  };
  const paymentService = {
    async reconcilePendingMercadoPagoPayments() {
      return summary;
    }
  };

  const result = await runPaymentReconciliation({ paymentService, logger, env: {} });
  assert.equal(result, summary);
  assert.equal(logs.some((entry) => entry[1] === 'mercadopago_reconciliation_alert'), true);
  assert.doesNotMatch(JSON.stringify(logs), /email|customer|rawBody|headers|signature|secret/i);
});
