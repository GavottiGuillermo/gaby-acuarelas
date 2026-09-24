function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function reconciliationConfig(env = process.env) {
  const disabled = ['false', '0', 'no'].includes(
    String(env.PAYMENT_RECONCILIATION_ENABLED || '').toLowerCase()
  );
  return {
    enabled: !disabled,
    intervalMs: boundedInteger(
      env.PAYMENT_RECONCILIATION_INTERVAL_MINUTES,
      5,
      1,
      1440
    ) * 60 * 1000,
    batchSize: boundedInteger(env.PAYMENT_RECONCILIATION_BATCH_SIZE, 50, 1, 200),
    graceMs: boundedInteger(
      env.PAYMENT_RECONCILIATION_GRACE_MINUTES,
      15,
      5,
      1440
    ) * 60 * 1000,
    alertAgeMs: boundedInteger(
      env.PAYMENT_RECONCILIATION_ALERT_HOURS,
      24,
      1,
      720
    ) * 60 * 60 * 1000
  };
}

function logReconciliationResult(logger, summary) {
  for (const event of summary.events) {
    if (event.kind === 'failed') {
      logger.warn('mercadopago_scheduled_reconciliation_failed', {
        orderId: event.orderId,
        code: event.code
      });
      continue;
    }
    logger.info('mercadopago_scheduled_reconciliation', event);
  }

  const { events, errorCodes, ...counts } = summary;
  logger.info('mercadopago_reconciliation_batch', counts);
  if (summary.alertRequired) {
    logger.warn('mercadopago_reconciliation_alert', {
      failed: summary.failed,
      overdue: summary.overdue,
      errorCodes
    });
  }
}

async function runPaymentReconciliation({
  paymentService,
  env = process.env,
  logger = console,
  now = new Date()
}) {
  const config = reconciliationConfig(env);
  const summary = await paymentService.reconcilePendingMercadoPagoPayments({
    limit: config.batchSize,
    now,
    graceMs: config.graceMs,
    alertAgeMs: config.alertAgeMs
  });
  logReconciliationResult(logger, summary);
  return summary;
}

function startPaymentReconciliationScheduler({
  paymentService,
  env = process.env,
  logger = console
}) {
  const config = reconciliationConfig(env);
  let timer = null;
  let running = false;
  let stopped = false;

  async function runOnce() {
    if (running || stopped) return null;
    running = true;
    try {
      return await runPaymentReconciliation({ paymentService, env, logger });
    } catch (error) {
      logger.error('mercadopago_reconciliation_batch_failed', {
        code: error?.code || 'unknown'
      });
      return null;
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (!config.enabled || timer || stopped) return;
      void runOnce();
      timer = setInterval(() => void runOnce(), config.intervalMs);
      timer.unref?.();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
    runOnce,
    config
  };
}

module.exports = {
  reconciliationConfig,
  logReconciliationResult,
  runPaymentReconciliation,
  startPaymentReconciliationScheduler
};
