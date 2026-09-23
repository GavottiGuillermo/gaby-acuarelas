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
