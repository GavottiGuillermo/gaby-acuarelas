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
