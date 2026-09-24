const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  MercadoPagoClient,
  createMercadoPagoClient,
  verifyWebhookSignature
} = require('../src/payments/mercadopago-client');

const orderId = '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36';
const attemptId = '718ab4d1-2a64-49ca-a8d2-9d04128d8353';

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('crea una preferencia ARS sólo con la orden interna y usa el punto Sandbox', async () => {
  let request;
  const client = new MercadoPagoClient({
    accessToken: 'token-de-prueba',
    webhookSecret: 'firma-de-prueba',
    async fetchImpl(url, options) {
      request = { url, options };
      return response({
        id: '123456789-test-pref',
        sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=x'
      }, 201);
    }
  });
  const result = await client.createPreference({
    order: {
      id: orderId,
      currency: 'ARS',
      totalAmountCents: 1850000,
      items: [{
        productId: 'peonias-pimpollo',
        title: 'Peonías: pimpollo',
        quantity: 1,
        unitAmountCents: 1850000
      }]
    },
    attemptId,
    returnBaseUrl: 'https://sandbox.example.test'
  });
  const body = JSON.parse(request.options.body);

  assert.equal(result.id, '123456789-test-pref');
  assert.equal(request.url, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(request.options.headers['X-Idempotency-Key'], attemptId);
  assert.equal(body.external_reference, orderId);
  assert.equal(body.metadata.payment_attempt_id, attemptId);
  assert.equal(body.items[0].currency_id, 'ARS');
  assert.equal(body.items[0].unit_price, 18500);
  assert.equal(body.notification_url, undefined);
  assert.doesNotMatch(request.options.body, /access_token|webhookSecret/i);
});

test('verifica la firma HMAC oficial y rechaza cualquier alteración', () => {
  const secret = 'clave-webhook-secreta';
  const timestamp = '1742505638683';
  const dataId = '123456789';
  const requestId = '2066ca19-c6f1-498a-be75-1923005edd06';
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const signature = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const input = {
    xSignature: `ts=${timestamp},v1=${signature}`,
    xRequestId: requestId,
    dataId,
    secret
  };

  assert.equal(verifyWebhookSignature(input), true);
  assert.equal(verifyWebhookSignature({ ...input, dataId: '987654321' }), false);
  assert.equal(verifyWebhookSignature({ ...input, xSignature: `ts=${timestamp},v1=${'0'.repeat(64)}` }), false);
});

test('busca pagos por referencia interna sin aceptar importes del navegador', async () => {
  let requestedUrl;
  const client = new MercadoPagoClient({
    accessToken: 'token-de-prueba',
    webhookSecret: 'firma-de-prueba',
    async fetchImpl(url) {
      requestedUrl = url;
      return response({ results: [{ id: 987654321, external_reference: orderId }] });
    }
  });

  const results = await client.searchPaymentsByExternalReference(orderId);
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/v1/payments/search');
  assert.equal(url.searchParams.get('external_reference'), orderId);
  assert.equal(results[0].id, 987654321);
});

test('sólo habilita el cliente con configuración Sandbox completa', () => {
  assert.equal(createMercadoPagoClient({}), null);
  assert.throws(() => createMercadoPagoClient({
    MERCADOPAGO_ENV: 'sandbox',
    MERCADOPAGO_ACCESS_TOKEN: 'token'
  }), /incompleta/);
  assert.throws(() => createMercadoPagoClient({
    MERCADOPAGO_ENV: 'production',
    MERCADOPAGO_ACCESS_TOKEN: 'token',
    MERCADOPAGO_WEBHOOK_SECRET: 'secret'
  }), /debe ser sandbox/);
  assert.ok(createMercadoPagoClient({
    MERCADOPAGO_ENV: 'sandbox',
    MERCADOPAGO_ACCESS_TOKEN: 'token',
    MERCADOPAGO_WEBHOOK_SECRET: 'secret'
  }));
});
