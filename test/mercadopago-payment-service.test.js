const test = require('node:test');
const assert = require('node:assert/strict');
const { PaymentService } = require('../src/payments/service');

const orderId = '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36';
const attemptId = '718ab4d1-2a64-49ca-a8d2-9d04128d8353';
const preferenceId = '123456789-test-pref';
const paymentId = '987654321';

function makeAttempt() {
  return {
    id: attemptId,
    provider: 'mercadopago',
    providerReference: preferenceId,
    status: 'pending',
    expectedCurrency: 'ARS',
    expectedAmountCents: 2620000,
    replayed: false,
    order: {
      id: orderId,
      status: 'pending',
      currency: 'ARS',
      totalAmountCents: 2620000,
      items: [
        { productId: 'curso', title: 'Curso', unitAmountCents: 1850000, quantity: 1 },
        { productId: 'ebook', title: 'Ebook', unitAmountCents: 770000, quantity: 1 }
      ]
    }
  };
}

function preference(attempt) {
  return {
    id: preferenceId,
    external_reference: orderId,
    metadata: { order_id: orderId, payment_attempt_id: attemptId },
    sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=x',
    items: [
      { id: 'ebook', quantity: 1, currency_id: 'ARS', unit_price: 7700 },
      { id: 'curso', quantity: 1, currency_id: 'ARS', unit_price: 18500 }
    ]
  };
}

function payment(status = 'approved', overrides = {}) {
  return {
    id: Number(paymentId),
    live_mode: false,
    status,
    currency_id: 'ARS',
    transaction_amount: 26200,
    external_reference: orderId,
    metadata: { order_id: orderId, payment_attempt_id: attemptId },
    ...overrides
  };
}

function event(id = '10001') {
  return {
    id,
    live_mode: false,
    type: 'payment',
    action: 'payment.updated',
    data: { id: paymentId }
  };
}

function fixture() {
  const attempt = makeAttempt();
  const events = new Set();
  const applied = [];
  const repository = {
    async prepareAttempt(_orderId, provider) {
      assert.equal(provider, 'mercadopago');
      return { ...attempt, providerReference: null };
    },
    async attachProviderReference(id, reference) {
      assert.equal(id, attemptId);
      attempt.providerReference = reference;
    },
    async markAttemptError() {
      attempt.status = 'error';
    },
    async findAttemptById(provider, id) {
      return provider === 'mercadopago' && id === attemptId ? attempt : null;
    },
    async hasEvent(provider, id) {
      return events.has(`${provider}:${id}`);
    },
    async applyWebhookEvent(payload) {
      const key = `${payload.provider}:${payload.providerEventId}`;
      if (events.has(key)) return { duplicate: true, processed: false };
      events.add(key);
      applied.push(payload);
      return {
        duplicate: false,
        processed: payload.processingStatus === 'processed',
        processingStatus: payload.processingStatus
      };
    }
  };
  const mercadoPagoClient = {
    async createPreference({ order }) {
      assert.equal(order.currency, 'ARS');
      return { id: preferenceId, sandboxInitPoint: preference(attempt).sandbox_init_point };
    },
    async getPreference() {
      return preference(attempt);
    },
    async getPayment() {
      return payment();
    },
    async searchPaymentsByExternalReference() {
      return [payment()];
    },
    verifyWebhook() {
      return true;
    }
  };
  const service = new PaymentService({
    repository,
    mercadoPagoClient,
    publicBaseUrl: 'https://sandbox.example.test'
  });
  return { service, repository, mercadoPagoClient, attempt, applied };
}

test('crea una preferencia desde una orden ARS y rechaza importes del navegador', async () => {
  const { service, attempt } = fixture();
  const checkout = await service.createMercadoPagoCheckout({ orderId });
  assert.equal(checkout.preferenceId, preferenceId);
  assert.equal(attempt.providerReference, preferenceId);

  await assert.rejects(() => service.createMercadoPagoCheckout({
    orderId,
    totalAmountCents: 1
  }), /campos no permitidos/);
});

test('aprueba sólo un webhook firmado y completamente conciliado', async () => {
  const { service, applied } = fixture();
  const webhook = event();
  const first = await service.processMercadoPagoWebhook({
    headers: {},
    event: webhook,
    rawBody: Buffer.from(JSON.stringify(webhook)),
    dataId: paymentId
  });
  const repeated = await service.processMercadoPagoWebhook({
    headers: {},
    event: webhook,
    rawBody: Buffer.from(JSON.stringify(webhook)),
    dataId: paymentId
  });

  assert.equal(first.processed, true);
  assert.equal(repeated.duplicate, true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].attemptStatus, 'approved');
  assert.equal(applied[0].orderStatus, 'approved');
  assert.match(applied[0].payloadSha256, /^[0-9a-f]{64}$/);
});

test('concilia activamente el retorno consultando el pago autenticado', async () => {
  const direct = fixture();
  const directResult = await direct.service.reconcileMercadoPagoPayment({
    orderId,
    paymentId
  });
  assert.equal(directResult.processed, true);
  assert.equal(directResult.providerStatus, 'approved');
  assert.equal(direct.applied[0].orderStatus, 'approved');

  const recovered = fixture();
  recovered.mercadoPagoClient.getPayment = async () => payment('pending');
  const recoveredResult = await recovered.service.reconcileMercadoPagoPayment({ orderId });
  assert.equal(recoveredResult.processed, true);
  assert.equal(recoveredResult.providerStatus, 'pending');
  assert.equal(recovered.applied[0].attemptStatus, 'pending');
  assert.equal(recovered.applied[0].orderStatus, null);

  await assert.rejects(() => recovered.service.reconcileMercadoPagoPayment({
    orderId,
    paymentId,
    amount: 1
  }), /campos no permitidos/);
  await assert.rejects(() => recovered.service.reconcileMercadoPagoPayment({
    orderId,
    paymentId: 'null'
  }), (error) => error.code === 'invalid_mercadopago_payment_id');
});

test('cancela en forma idempotente una preferencia vencida sin ningún pago', async () => {
  const current = fixture();
  current.attempt.createdAt = new Date('2026-09-24T10:00:00.000Z');
  current.repository.listPendingAttempts = async () => [current.attempt];
  current.mercadoPagoClient.preferenceExpirationMinutes = 30;
  current.mercadoPagoClient.searchPaymentsByExternalReference = async () => [];
  current.mercadoPagoClient.getPreference = async () => ({
    ...preference(current.attempt),
    expires: true,
    expiration_date_to: '2026-09-24T10:30:00.000Z'
  });

  const result = await current.service.reconcilePendingMercadoPagoPayments({
    now: new Date('2026-09-24T11:00:00.000Z'),
    graceMs: 15 * 60 * 1000,
    alertAgeMs: 30 * 60 * 1000
  });

  assert.equal(result.scanned, 1);
  assert.equal(result.cancelledExpired, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.overdue, 0);
  assert.equal(result.alertRequired, false);
  assert.equal(current.applied[0].attemptStatus, 'cancelled');
  assert.equal(current.applied[0].orderStatus, 'cancelled');
  assert.equal(current.applied[0].eventType, 'preference:expired-without-payment');
});

test('programa el vencimiento de preferencias anteriores antes de cancelarlas', async () => {
  const current = fixture();
  current.attempt.createdAt = new Date('2026-09-24T10:00:00.000Z');
  current.repository.listPendingAttempts = async () => [current.attempt];
  current.mercadoPagoClient.preferenceExpirationMinutes = 30;
  current.mercadoPagoClient.searchPaymentsByExternalReference = async () => [];
  let expiration;
  current.mercadoPagoClient.setPreferenceExpiration = async (_preferenceId, value) => {
    expiration = value;
  };

  const result = await current.service.reconcilePendingMercadoPagoPayments({
    now: new Date('2026-09-24T11:00:00.000Z'),
    graceMs: 15 * 60 * 1000
  });

  assert.equal(result.expirationsScheduled, 1);
  assert.equal(result.cancelledExpired, 0);
  assert.equal(expiration.startsAt.toISOString(), '2026-09-24T11:00:00.000Z');
  assert.equal(expiration.expiresAt.toISOString(), '2026-09-24T11:15:00.000Z');
  assert.equal(current.applied.length, 0);
});

test('traduce estados y no aprueba con firma o importe inválidos', async () => {
  for (const [providerStatus, attemptStatus, orderStatus] of [
    ['pending', 'pending', null],
    ['rejected', 'rejected', 'rejected'],
    ['cancelled', 'cancelled', 'cancelled']
  ]) {
    const current = fixture();
    current.mercadoPagoClient.getPayment = async () => payment(providerStatus);
    await current.service.processMercadoPagoWebhook({
      headers: {},
      event: event(`event-${providerStatus}`),
      rawBody: Buffer.from('{}'),
      dataId: paymentId
    });
    assert.equal(current.applied[0].attemptStatus, attemptStatus);
    assert.equal(current.applied[0].orderStatus, orderStatus);
  }

  const invalidSignature = fixture();
  invalidSignature.mercadoPagoClient.verifyWebhook = () => false;
  await assert.rejects(() => invalidSignature.service.processMercadoPagoWebhook({
    headers: {}, event: event('20001'), rawBody: Buffer.from('{}'), dataId: paymentId
  }), (error) => error.code === 'invalid_webhook_signature');
  assert.equal(invalidSignature.applied.length, 0);

  const mismatch = fixture();
  mismatch.mercadoPagoClient.getPayment = async () => payment('approved', { transaction_amount: 1 });
  await assert.rejects(() => mismatch.service.processMercadoPagoWebhook({
    headers: {}, event: event('20002'), rawBody: Buffer.from('{}'), dataId: paymentId
  }), (error) => error.code === 'payment_reconciliation_failed');
  assert.equal(mismatch.applied.length, 0);
});

test('distingue fallos estructurales del webhook sin registrar el cuerpo', async () => {
  const cases = [
    [{ ...event('30001'), type: '' }, paymentId, 'invalid_webhook_type'],
    [{ ...event('30002'), live_mode: 'false' }, paymentId, 'invalid_webhook_live_mode'],
    [{ ...event('30003'), id: '' }, paymentId, 'invalid_webhook_event_id'],
    [{ ...event('30004'), data: { id: 'not-a-payment' } }, 'not-a-payment', 'invalid_webhook_payment_id'],
    [event('30005'), '111111111', 'invalid_webhook_data_id']
  ];

  for (const [webhook, dataId, code] of cases) {
    const current = fixture();
    await assert.rejects(() => current.service.processMercadoPagoWebhook({
      headers: {},
      event: webhook,
      rawBody: Buffer.from(JSON.stringify(webhook)),
      dataId
    }), (error) => error.code === code);
    assert.equal(current.applied.length, 0);
  }
});

test('ignora otros tópicos y usa el pago autenticado como autoridad del entorno', async () => {
  const ignored = fixture();
  const merchantOrder = {
    ...event('40001'),
    type: 'merchant_order',
    action: 'merchant_order.updated',
    live_mode: true,
    data: { id: '123456789' }
  };
  const ignoredResult = await ignored.service.processMercadoPagoWebhook({
    headers: {},
    event: merchantOrder,
    rawBody: Buffer.from(JSON.stringify(merchantOrder)),
    dataId: '123456789'
  });
  assert.equal(ignoredResult.processingStatus, 'ignored');
  assert.equal(ignored.applied[0].attemptId, null);

  const liveFlaggedTest = fixture();
  liveFlaggedTest.mercadoPagoClient.getPayment = async () => payment('approved', { live_mode: true });
  const liveEvent = { ...event('40002'), live_mode: true };
  const processed = await liveFlaggedTest.service.processMercadoPagoWebhook({
    headers: {},
    event: liveEvent,
    rawBody: Buffer.from(JSON.stringify(liveEvent)),
    dataId: paymentId
  });
  assert.equal(processed.processed, true);
  assert.equal(liveFlaggedTest.applied[0].orderStatus, 'approved');

  const simulatorMode = fixture();
  simulatorMode.mercadoPagoClient.getPayment = async () => payment('approved', { live_mode: true });
  const simulatorEvent = event('40003');
  const simulatorResult = await simulatorMode.service.processMercadoPagoWebhook({
    headers: {},
    event: simulatorEvent,
    rawBody: Buffer.from(JSON.stringify(simulatorEvent)),
    dataId: paymentId
  });
  assert.equal(simulatorResult.processed, true);

  const missingProviderMode = fixture();
  missingProviderMode.mercadoPagoClient.getPayment = async () => payment('approved', {
    live_mode: undefined
  });
  await assert.rejects(() => missingProviderMode.service.processMercadoPagoWebhook({
    headers: {},
    event: event('40004'),
    rawBody: Buffer.from('{}'),
    dataId: paymentId
  }), (error) => error.code === 'payment_reconciliation_failed');
  assert.equal(missingProviderMode.applied.length, 0);
});
