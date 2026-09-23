const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const catalog = require('../src/catalog');
const { createApp } = require('../src/app');
const { OrderService } = require('../src/orders/service');

const publicDir = path.join(__dirname, '..', 'public');

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('mantiene la API de órdenes cerrada cuando PostgreSQL no está configurado', async () => {
  const app = createApp({ catalog, publicDir });

  await withServer(app, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
    assert.equal(health.orderPersistence, 'not-configured');

    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 503);
  });
});

test('obliga a revalidar los recursos críticos de la interfaz', async () => {
  const app = createApp({ catalog, publicDir });

  await withServer(app, async (baseUrl) => {
    for (const resource of ['/', '/js/app.js', '/css/styles.css', '/catalog.json']) {
      const response = await fetch(`${baseUrl}${resource}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
    }
  });
});

test('publica precios ARS calculados por el servidor sin caché', async () => {
  const pricingService = {
    async getPublicPricing() {
      return {
        baseCurrency: 'USD',
        quoteCurrency: 'ARS',
        rate: 1535,
        rounding: 'up-to-next-100',
        products: [{ productId: 'ebook-10-acuarelas-botanicas', amount: 7700 }]
      };
    }
  };
  const app = createApp({ catalog, pricingService, publicDir });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pricing`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(payload.pricing.products[0].amount, 7700);
  });
});

test('crea una orden validada y devuelve 201 sin aceptar precios del navegador', async () => {
  const repository = {
    async create(request) {
      return {
        id: request.id,
        status: 'pending',
        currency: request.currency,
        totalAmountCents: request.totalAmountCents,
        items: request.items,
        replayed: false
      };
    },
    async findById() {
      return null;
    }
  };
  const orderService = new OrderService({ repository, catalog });
  const app = createApp({ catalog, orderService, publicDir });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'api-prueba-001'
      },
      body: JSON.stringify({
        customer: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com' },
        items: [{ productId: 'ebook-10-acuarelas-botanicas' }]
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.order.currency, 'USD');
    assert.equal(payload.order.totalAmountCents, 500);

    repository.findById = async () => ({ ...payload.order, status: 'approved' });
    const statusResponse = await fetch(`${baseUrl}/api/orders/${payload.order.id}`);
    assert.equal(statusResponse.status, 200);
    assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
    assert.equal((await statusResponse.json()).order.status, 'approved');
  });
});

test('el checkout continúa bloqueado sin proveedores sandbox configurados', async () => {
  const app = createApp({ catalog, publicDir });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/checkout/paypal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: 'peonias-pimpollo' })
    });
    assert.equal(response.status, 503);
  });
});

test('expone checkout, captura y webhook PayPal sólo mediante el servicio configurado', async () => {
  const calls = [];
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
  const paymentService = {
    async createPayPalCheckout(body) {
      calls.push(['checkout', body]);
      return {
        orderId: body.orderId,
        providerOrderId: 'PAYPAL123',
        approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL123',
        replayed: false
      };
    },
    async capturePayPalOrder(body) {
      calls.push(['capture', body]);
      return { ...body, status: 'pending_webhook' };
    },
    async processPayPalWebhook({ event, rawBody }) {
      calls.push(['webhook', event, rawBody.toString('utf8')]);
      return { duplicate: false, processed: true, processingStatus: 'processed' };
    }
  };
  const app = createApp({ catalog, paymentService, publicDir, logger });

  await withServer(app, async (baseUrl) => {
    const checkoutResponse = await fetch(`${baseUrl}/api/checkout/paypal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36' })
    });
    assert.equal(checkoutResponse.status, 201);

    const captureResponse = await fetch(`${baseUrl}/api/payments/paypal/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36',
        providerOrderId: 'PAYPAL123'
      })
    });
    assert.equal(captureResponse.status, 202);

    const webhookBody = JSON.stringify({
      id: 'WH-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED'
    });
    const webhookResponse = await fetch(`${baseUrl}/api/webhooks/paypal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: webhookBody
    });
    assert.equal(webhookResponse.status, 200);
    assert.equal(calls[2][2], webhookBody);
    assert.deepEqual(logs, [[
      'info',
      'paypal_webhook_processed',
      {
        eventId: 'WH-1',
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        duplicate: false,
        processed: true,
        processingStatus: 'processed'
      }
    ]]);
    assert.doesNotMatch(JSON.stringify(logs), /rawBody|headers|transmission/i);
  });
});

test('expone preferencia y webhook Mercado Pago sólo cuando Sandbox está configurado', async () => {
  const calls = [];
  const logger = { info() {}, warn() {}, error() {} };
  const paymentService = {
    async createMercadoPagoCheckout(body) {
      calls.push(['checkout', body]);
      return {
        orderId: body.orderId,
        preferenceId: '123-test-pref',
        approveUrl: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=x',
        replayed: false
      };
    },
    async processMercadoPagoWebhook({ event, rawBody, dataId }) {
      calls.push(['webhook', event, rawBody.toString('utf8'), dataId]);
      return { duplicate: false, processed: true, processingStatus: 'processed' };
    }
  };
  const app = createApp({
    catalog,
    paymentService,
    paymentProviders: { paypal: false, mercadopago: true },
    publicDir,
    logger
  });

  await withServer(app, async (baseUrl) => {
    const runtime = await fetch(`${baseUrl}/api/runtime`).then((result) => result.json());
    assert.equal(runtime.payments.mercadopago, 'sandbox');
    const checkoutResponse = await fetch(`${baseUrl}/api/checkout/mercadopago`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '2b7b14cc-d0c2-4d69-9e9f-35a42dd26f36' })
    });
    assert.equal(checkoutResponse.status, 201);

    const webhookBody = JSON.stringify({
      id: '10001', live_mode: false, type: 'payment', action: 'payment.updated', data: { id: '987654321' }
    });
    const webhookResponse = await fetch(`${baseUrl}/api/webhooks/mercadopago?data.id=987654321`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: webhookBody
    });
    assert.equal(webhookResponse.status, 200);
    assert.equal(calls[1][2], webhookBody);
    assert.equal(calls[1][3], '987654321');
  });
});
