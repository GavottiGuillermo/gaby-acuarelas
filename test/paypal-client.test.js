const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PayPalClient,
  createPayPalClient,
  centsToDecimal,
  requiredWebhookHeaders
} = require('../src/payments/paypal-client');

function jsonResponse(payload, { ok = true } = {}) {
  return {
    ok,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('crea una orden PayPal sandbox con importe y productos resueltos por el servidor', async () => {
  const requests = [];
  const client = new PayPalClient({
    clientId: 'sandbox-client',
    clientSecret: 'sandbox-secret',
    webhookId: 'WEBHOOK123',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/v1/oauth2/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      return jsonResponse({
        id: 'PAYPALORDER123',
        status: 'PAYER_ACTION_REQUIRED',
        links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=x' }]
      });
    }
  });

  const result = await client.createOrder({
    order: {
      id: '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36',
      currency: 'USD',
      totalAmountCents: 1700,
      items: [
        { productId: 'ebook', title: 'Ebook', unitAmountCents: 500, quantity: 1 },
        { productId: 'curso', title: 'Curso', unitAmountCents: 1200, quantity: 1 }
      ]
    },
    attemptId: '718ab4d1-2a64-49ca-a8d2-9d04128d8353',
    returnUrl: 'https://example.test/return',
    cancelUrl: 'https://example.test/cancel'
  });

  assert.equal(result.id, 'PAYPALORDER123');
  assert.equal(requests.length, 2);
  const sent = JSON.parse(requests[1].options.body);
  assert.equal(sent.purchase_units[0].amount.value, '17.00');
  assert.equal(sent.purchase_units[0].amount.currency_code, 'USD');
  assert.deepEqual(sent.purchase_units[0].items.map((item) => item.sku), ['ebook', 'curso']);
  assert.equal(requests[1].options.headers['PayPal-Request-Id'], '718ab4d1-2a64-49ca-a8d2-9d04128d8353');
});

test('verifica webhooks mediante el endpoint oficial sin exponer secretos', async () => {
  const requests = [];
  const client = new PayPalClient({
    clientId: 'sandbox-client',
    clientSecret: 'sandbox-secret',
    webhookId: 'WEBHOOK123',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/v1/oauth2/token')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      return jsonResponse({ verification_status: 'SUCCESS' });
    }
  });
  const verified = await client.verifyWebhook({
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/example',
    'paypal-transmission-id': 'transmission-1',
    'paypal-transmission-sig': 'signature',
    'paypal-transmission-time': '2026-09-17T12:00:00Z'
  }, { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' });

  assert.equal(verified, true);
  assert.match(requests[1].url, /verify-webhook-signature$/);
  const body = JSON.parse(requests[1].options.body);
  assert.equal(body.webhook_id, 'WEBHOOK123');
  assert.equal(body.transmission_id, 'transmission-1');
});

test('rechaza configuración live, configuración parcial y certificados ajenos', () => {
  assert.equal(createPayPalClient({}), null);
  assert.throws(() => createPayPalClient({
    PAYPAL_ENV: 'sandbox',
    PAYPAL_CLIENT_ID: 'only-one-value'
  }), /incompleta/);
  assert.throws(() => createPayPalClient({
    PAYPAL_ENV: 'live',
    PAYPAL_CLIENT_ID: 'client',
    PAYPAL_CLIENT_SECRET: 'secret',
    PAYPAL_WEBHOOK_ID: 'webhook'
  }), /debe ser sandbox/);
  assert.throws(() => requiredWebhookHeaders({
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://attacker.example/cert',
    'paypal-transmission-id': 'id',
    'paypal-transmission-sig': 'sig',
    'paypal-transmission-time': 'time'
  }), /no es confiable/);
  assert.equal(centsToDecimal(1200), '12.00');
});
