const test = require('node:test');
const assert = require('node:assert/strict');
const { PaymentService } = require('../src/payments/service');

const orderId = '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36';
const attemptId = '718ab4d1-2a64-49ca-a8d2-9d04128d8353';
const providerOrderId = 'PAYPALORDER123';

function makeAttempt() {
  return {
    id: attemptId,
    provider: 'paypal',
    providerReference: providerOrderId,
    status: 'pending',
    expectedCurrency: 'USD',
    expectedAmountCents: 1700,
    replayed: false,
    order: {
      id: orderId,
      status: 'pending',
      currency: 'USD',
      totalAmountCents: 1700,
      items: [
        { productId: 'curso', title: 'Curso', unitAmountCents: 1200, quantity: 1 },
        { productId: 'ebook', title: 'Ebook', unitAmountCents: 500, quantity: 1 }
      ]
    }
  };
}

function providerOrder(overrides = {}) {
  return {
    id: providerOrderId,
    status: 'COMPLETED',
    purchase_units: [{
      reference_id: orderId,
      custom_id: orderId,
      amount: { currency_code: 'USD', value: '17.00' },
      items: [
        { sku: 'ebook', quantity: '1', unit_amount: { currency_code: 'USD', value: '5.00' } },
        { sku: 'curso', quantity: '1', unit_amount: { currency_code: 'USD', value: '12.00' } }
      ]
    }],
    ...overrides
  };
}

function createFixture() {
  const attempt = makeAttempt();
  const events = new Set();
  const applied = [];
  const repository = {
    async prepareAttempt() {
      return { ...attempt, providerReference: null };
    },
    async attachProviderReference(id, reference) {
      assert.equal(id, attemptId);
      attempt.providerReference = reference;
    },
    async markAttemptError() {
      attempt.status = 'error';
    },
    async findAttemptByProviderReference(provider, reference) {
      return provider === 'paypal' && reference === providerOrderId ? attempt : null;
    },
    async hasEvent(provider, eventId) {
      return events.has(`${provider}:${eventId}`);
    },
    async applyWebhookEvent(event) {
      const key = `${event.provider}:${event.providerEventId}`;
      if (events.has(key)) return { duplicate: true, processed: false };
      events.add(key);
      applied.push(event);
      return {
        duplicate: false,
        processed: event.processingStatus === 'processed',
        processingStatus: event.processingStatus
      };
    }
  };
  const paypalClient = {
    async createOrder({ order }) {
      assert.equal(order.totalAmountCents, 1700);
      return {
        id: providerOrderId,
        approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=x'
      };
    },
    async captureOrder() {
      return { status: 'COMPLETED' };
    },
    async verifyWebhook() {
      return true;
    },
    async getOrder() {
      return providerOrder();
    }
  };
  const service = new PaymentService({
    repository,
    paypalClient,
    publicBaseUrl: 'https://sandbox.example.test'
  });
  return { service, repository, paypalClient, attempt, applied };
}

function completedEvent(id = 'WH-EVENT-1') {
  return {
    id,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource_type: 'capture',
    resource: {
      amount: { currency_code: 'USD', value: '17.00' },
      supplementary_data: { related_ids: { order_id: providerOrderId } }
    }
  };
}

test('inicia PayPal sólo desde una orden interna y rechaza importes del navegador', async () => {
  const { service } = createFixture();
  const checkout = await service.createPayPalCheckout({ orderId });
  assert.equal(checkout.providerOrderId, providerOrderId);
  assert.equal(checkout.replayed, false);

  await assert.rejects(() => service.createPayPalCheckout({
    orderId,
    totalAmountCents: 1,
    currency: 'ARS'
  }), (error) => error.code === 'payment_error' && /campos no permitidos/.test(error.message));
});

test('capturar no aprueba la orden: espera el webhook conciliado', async () => {
  const { service, attempt } = createFixture();
  const result = await service.capturePayPalOrder({ orderId, providerOrderId });
  assert.equal(result.providerStatus, 'COMPLETED');
  assert.equal(result.status, 'pending_webhook');
  assert.equal(attempt.order.status, 'pending');
});

test('procesa un webhook firmado, conciliado e idempotente', async () => {
  const { service, applied } = createFixture();
  const event = completedEvent();
  const first = await service.processPayPalWebhook({
    headers: {},
    event,
    rawBody: Buffer.from(JSON.stringify(event))
  });
  const repeated = await service.processPayPalWebhook({
    headers: {},
    event,
    rawBody: Buffer.from(JSON.stringify(event))
  });

  assert.equal(first.processed, true);
  assert.equal(repeated.duplicate, true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].attemptStatus, 'approved');
  assert.equal(applied[0].orderStatus, 'approved');
  assert.match(applied[0].payloadSha256, /^[0-9a-f]{64}$/);
});

test('rechaza firma inválida y diferencias de importe antes de aprobar', async () => {
  const invalidSignature = createFixture();
  invalidSignature.paypalClient.verifyWebhook = async () => false;
  const event = completedEvent('WH-EVENT-2');
  await assert.rejects(() => invalidSignature.service.processPayPalWebhook({
    headers: {},
    event,
    rawBody: Buffer.from(JSON.stringify(event))
  }), (error) => error.code === 'invalid_webhook_signature');
  assert.equal(invalidSignature.applied.length, 0);

  const mismatch = createFixture();
  mismatch.paypalClient.getOrder = async () => providerOrder({
    purchase_units: [{
      reference_id: orderId,
      custom_id: orderId,
      amount: { currency_code: 'USD', value: '0.01' },
      items: []
    }]
  });
  await assert.rejects(() => mismatch.service.processPayPalWebhook({
    headers: {},
    event: completedEvent('WH-EVENT-3'),
    rawBody: Buffer.from('{}')
  }), (error) => error.code === 'payment_reconciliation_failed');
  assert.equal(mismatch.applied.length, 0);
});
