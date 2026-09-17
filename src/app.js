const path = require('path');
const express = require('express');
const { OrderError } = require('./orders/errors');
const { PaymentError } = require('./payments/errors');

function createApp({ catalog, orderService = null, paymentService = null, publicDir }) {
  const app = express();

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.post('/api/webhooks/paypal', express.raw({
    type: 'application/json',
    limit: '100kb'
  }), async (req, res, next) => {
    if (!paymentService) {
      return res.status(503).json({
        error: 'PayPal sandbox todavía no está configurado.',
        code: 'payment_provider_unavailable'
      });
    }

    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const event = JSON.parse(rawBody.toString('utf8'));
      const result = await paymentService.processPayPalWebhook({
        headers: req.headers,
        event,
        rawBody
      });
      return res.status(200).json({ received: true, duplicate: result.duplicate });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'El JSON enviado no es válido.', code: 'invalid_json' });
      }
      return next(error);
    }
  });

  app.use(express.json({ limit: '100kb' }));

  app.use(express.static(publicDir, {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
  }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'gaby-acuarelas',
      orderPersistence: orderService ? 'configured' : 'not-configured',
      paypalSandbox: paymentService ? 'configured' : 'not-configured'
    });
  });

  app.get('/api/catalogo', (_req, res) => {
    res.json({ courses: catalog });
  });

  app.get('/api/runtime', (_req, res) => {
    res.json({
      payments: {
        paypal: paymentService ? 'sandbox' : 'disabled',
        mercadopago: 'disabled'
      }
    });
  });

  app.post('/api/orders', async (req, res, next) => {
    if (!orderService) {
      return res.status(503).json({
        error: 'La persistencia de órdenes todavía no está configurada.',
        code: 'order_persistence_unavailable'
      });
    }

    try {
      const order = await orderService.create({
        body: req.body,
        idempotencyKey: req.get('Idempotency-Key')
      });
      return res.status(order.replayed ? 200 : 201).json({ order });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/orders/:id', async (req, res, next) => {
    if (!orderService) {
      return res.status(503).json({
        error: 'La persistencia de órdenes todavía no está configurada.',
        code: 'order_persistence_unavailable'
      });
    }

    try {
      const order = await orderService.findById(req.params.id);
      return res.json({ order });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/checkout/paypal', async (req, res, next) => {
    if (!paymentService) {
      return res.status(503).json({
        error: 'PayPal sandbox todavía no está configurado.',
        code: 'payment_provider_unavailable'
      });
    }
    try {
      const checkout = await paymentService.createPayPalCheckout(req.body);
      return res.status(checkout.replayed ? 200 : 201).json({ checkout });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/payments/paypal/capture', async (req, res, next) => {
    if (!paymentService) {
      return res.status(503).json({
        error: 'PayPal sandbox todavía no está configurado.',
        code: 'payment_provider_unavailable'
      });
    }
    try {
      const payment = await paymentService.capturePayPalOrder(req.body);
      return res.status(202).json({ payment });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/checkout/mercadopago', (_req, res) => {
    return res.status(503).json({
      error: 'Mercado Pago sigue bloqueado hasta confirmar los importes en ARS.',
      code: 'ars_prices_unavailable'
    });
  });

  app.post('/api/checkout/:provider', (_req, res) => {
    return res.status(404).json({
      error: 'Proveedor de pago no válido.',
      code: 'payment_provider_not_found'
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Recurso de API no encontrado.', code: 'not_found' });
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof OrderError || error instanceof PaymentError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }

    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El JSON enviado no es válido.', code: 'invalid_json' });
    }

    console.error('request_error', { name: error?.name || 'Error', code: error?.code || 'unknown' });
    return res.status(500).json({ error: 'Ocurrió un error interno.', code: 'internal_error' });
  });

  app.use((_req, res) => {
    res.status(404).sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

module.exports = { createApp };
