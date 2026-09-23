const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const catalog = require('./catalog');
const { createApp } = require('./app');
const { createDatabasePool } = require('./database');
const { OrderService } = require('./orders/service');
const { PostgresOrderRepository } = require('./orders/postgres-repository');
const { createPayPalClient } = require('./payments/paypal-client');
const { createMercadoPagoClient } = require('./payments/mercadopago-client');
const { PaymentService } = require('./payments/service');
const { PostgresPaymentRepository } = require('./payments/postgres-repository');
const { PricingService } = require('./pricing/service');
const { PostgresPricingRepository } = require('./pricing/postgres-repository');

const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');
const pool = createDatabasePool();
const pricingService = pool
  ? new PricingService({
      repository: new PostgresPricingRepository(pool),
      catalog
    })
  : null;
const orderService = pool
  ? new OrderService({
      repository: new PostgresOrderRepository(pool),
      catalog,
      pricingService
    })
  : null;
const paypalClient = createPayPalClient();
const mercadoPagoClient = createMercadoPagoClient();
const paymentService = pool && (paypalClient || mercadoPagoClient)
  ? new PaymentService({
      repository: new PostgresPaymentRepository(pool),
      paypalClient,
      mercadoPagoClient,
      publicBaseUrl: process.env.PUBLIC_BASE_URL
    })
  : null;
const app = createApp({
  catalog,
  orderService,
  paymentService,
  pricingService,
  paymentProviders: {
    paypal: Boolean(paypalClient),
    mercadopago: Boolean(mercadoPagoClient)
  },
  publicDir
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Gaby Acuarelas disponible en http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`Cierre solicitado: ${signal}`);
  server.close(async () => {
    if (pool) await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
