const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createDatabasePool } = require('../src/database');
const { createMercadoPagoClient } = require('../src/payments/mercadopago-client');
const { PostgresPaymentRepository } = require('../src/payments/postgres-repository');
const { runPaymentReconciliation } = require('../src/payments/reconciliation');
const { PaymentService } = require('../src/payments/service');

async function main() {
  const pool = createDatabasePool();
  if (!pool) throw new Error('DATABASE_URL es obligatoria para conciliar pagos pendientes.');
  const mercadoPagoClient = createMercadoPagoClient();
  if (!mercadoPagoClient) {
    await pool.end();
    throw new Error('Las credenciales Mercado Pago Sandbox son obligatorias para conciliar pagos.');
  }

  try {
    const paymentService = new PaymentService({
      repository: new PostgresPaymentRepository(pool),
      mercadoPagoClient,
      publicBaseUrl: process.env.PUBLIC_BASE_URL
    });
    const summary = await runPaymentReconciliation({ paymentService });
    if (summary.alertRequired) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('mercadopago_reconciliation_command_failed', {
    code: error?.code || 'configuration_error'
  });
  process.exitCode = 1;
});
