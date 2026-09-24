const path = require('path');
const express = require('express');
const { OrderError } = require('./orders/errors');
const { PaymentError } = require('./payments/errors');
const { PricingError } = require('./pricing/errors');

function createApp({
  catalog,
  orderService = null,
  paymentService = null,
  pricingService = null,
  paymentProviders = null,
  publicDir,
  logger = console
}) {
  const app = express();
  const paypalEnabled = paymentProviders?.paypal ?? Boolean(paymentService);
  const mercadoPagoEnabled = paymentProviders?.mercadopago ?? false;

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
    if (!paymentService || !paypalEnabled) {
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
      logger.info('paypal_webhook_processed', {
        eventId: event.id,
        eventType: event.event_type,
        duplicate: Boolean(result.duplicate),
        processed: Boolean(result.processed),
        processingStatus: result.processingStatus || (result.duplicate ? 'duplicate' : 'unknown')
      });
      return res.status(200).json({ received: true, duplicate: result.duplicate });
    } catch (error) {
      logger.warn('paypal_webhook_rejected', {
        code: error instanceof SyntaxError ? 'invalid_json' : (error?.code || 'unknown')
      });
      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'El JSON enviado no es válido.', code: 'invalid_json' });
      }
      return next(error);
    }
  });

  app.post('/api/webhooks/mercadopago', express.raw({
    type: 'application/json',
    limit: '100kb'
  }), async (req, res, next) => {
    if (!paymentService || !mercadoPagoEnabled) {
      return res.status(503).json({
        error: 'Mercado Pago Sandbox todavía no está configurado.',
        code: 'payment_provider_unavailable'
      });
    }

    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const event = JSON.parse(rawBody.toString('utf8'));
      const dataId = typeof req.query['data.id'] === 'string' ? req.query['data.id'] : '';
      const result = await paymentService.processMercadoPagoWebhook({
        headers: req.headers,
        event,
        rawBody,
        dataId
      });
      logger.info('mercadopago_webhook_processed', {
        eventId: String(event.id || ''),
        eventType: event.action || event.type || 'unknown',
        duplicate: Boolean(result.duplicate),
        processed: Boolean(result.processed),
        processingStatus: result.processingStatus || (result.duplicate ? 'duplicate' : 'unknown')
      });
      return res.status(200).json({ received: true, duplicate: result.duplicate });
    } catch (error) {
      logger.warn('mercadopago_webhook_rejected', {
        code: error instanceof SyntaxError ? 'invalid_json' : (error?.code || 'unknown')
      });
      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'El JSON enviado no es válido.', code: 'invalid_json' });
      }
      return next(error);
    }
  });

  app.use(express.json({ limit: '100kb' }));

  app.use(express.static(publicDir, {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(response, filePath) {
      const extension = path.extname(filePath).toLowerCase();
      if (['.html', '.js', '.css', '.json'].includes(extension)) {
        response.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'gaby-acuarelas',
      orderPersistence: orderService ? 'configured' : 'not-configured',
      paypalSandbox: paypalEnabled ? 'configured' : 'not-configured',
      mercadoPagoSandbox: mercadoPagoEnabled ? 'configured' : 'not-configured',
      arsPricing: pricingService ? 'configured' : 'not-configured'
    });
  });

  app.get('/api/catalogo', (_req, res) => {
    res.json({ courses: catalog });
  });

  app.get('/api/runtime', (_req, res) => {
    res.json({
      payments: {
        paypal: paypalEnabled ? 'sandbox' : 'disabled',
        mercadopago: mercadoPagoEnabled ? 'sandbox' : 'disabled'
      }
    });
  });

  app.get('/api/pricing', async (_req, res, next) => {
    if (!pricingService) {
      return res.status(503).json({
        error: 'Los precios en ARS todavía no están disponibles.',
        code: 'ars_prices_unavailable'
      });
    }

    try {
      const pricing = await pricingService.getPublicPricing();
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ pricing });
    } catch (error) {
      return next(error);
    }
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
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ order });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/checkout/paypal', async (req, res, next) => {
    if (!paymentService || !paypalEnabled) {
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
    if (!paymentService || !paypalEnabled) {
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

  app.post('/api/checkout/mercadopago', async (req, res, next) => {
    if (!paymentService || !mercadoPagoEnabled) {
      return res.status(503).json({
        error: 'Mercado Pago Sandbox todavía no está configurado.',
        code: 'payment_provider_unavailable'
      });
    }
    try {
      const checkout = await paymentService.createMercadoPagoCheckout(req.body);
      return res.status(checkout.replayed ? 200 : 201).json({ checkout });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/payments/mercadopago/reconcile', async (req, res, next) => {
    if (!paymentService || !mercadoPagoEnabled) {
      return res.status(503).json({
        error: 'Mercado Pago Sandbox todavía no está configurado.',
        code: 'payment_provider_unavailable'
      });
    }
    try {
      const payment = await paymentService.reconcileMercadoPagoPayment(req.body);
      return res.status(payment.status === 'pending_provider' ? 202 : 200).json({ payment });
    } catch (error) {
      return next(error);
    }
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
    if (error instanceof OrderError || error instanceof PaymentError || error instanceof PricingError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }

    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El JSON enviado no es válido.', code: 'invalid_json' });
    }

    logger.error('request_error', { name: error?.name || 'Error', code: error?.code || 'unknown' });
    return res.status(500).json({ error: 'Ocurrió un error interno.', code: 'internal_error' });
  });

  app.use((_req, res) => {
    res.status(404).sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

module.exports = { createApp };
