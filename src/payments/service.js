const crypto = require('crypto');
const { PaymentError } = require('./errors');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYPAL_ID_PATTERN = /^[A-Z0-9]{1,36}$/;
const MERCADOPAGO_REFERENCE_PATTERN = /^[A-Za-z0-9-]{1,128}$/;
const MERCADOPAGO_PAYMENT_ID_PATTERN = /^\d{1,32}$/;

const PAYPAL_EVENT_OUTCOMES = Object.freeze({
  'PAYMENT.CAPTURE.COMPLETED': { attemptStatus: 'approved', orderStatus: 'approved' },
  'PAYMENT.CAPTURE.DENIED': { attemptStatus: 'rejected', orderStatus: 'rejected' },
  'PAYMENT.CAPTURE.PENDING': { attemptStatus: 'pending', orderStatus: null },
  'CHECKOUT.PAYMENT-APPROVAL.REVERSED': { attemptStatus: 'cancelled', orderStatus: 'cancelled' },
  'CHECKOUT.ORDER.VOIDED': { attemptStatus: 'cancelled', orderStatus: 'cancelled' }
});

const MERCADOPAGO_STATUS_OUTCOMES = Object.freeze({
  approved: { attemptStatus: 'approved', orderStatus: 'approved' },
  pending: { attemptStatus: 'pending', orderStatus: null },
  in_process: { attemptStatus: 'pending', orderStatus: null },
  authorized: { attemptStatus: 'pending', orderStatus: null },
  rejected: { attemptStatus: 'rejected', orderStatus: 'rejected' },
  cancelled: { attemptStatus: 'cancelled', orderStatus: 'cancelled' },
  refunded: { attemptStatus: 'refunded', orderStatus: 'refunded' },
  charged_back: { attemptStatus: 'refunded', orderStatus: 'refunded' }
});
const MERCADOPAGO_PENDING_STATUSES = new Set(['pending', 'in_process', 'authorized']);

function preferenceExpirationTime(preference) {
  const parsed = Date.parse(preference?.expiration_date_to || '');
  if (preference?.preference_expired === true) {
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (preference?.expires !== true || !Number.isFinite(parsed)) return null;
  return parsed;
}

function assertOnlyKeys(object, allowedKeys) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new PaymentError('El cuerpo de la solicitud no es válido.');
  }
  const extra = Object.keys(object).filter((key) => !allowedKeys.includes(key));
  if (extra.length > 0) {
    throw new PaymentError(`La solicitud contiene campos no permitidos: ${extra.join(', ')}.`);
  }
}

function assertUuid(value, label = 'orden') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new PaymentError(`El identificador de ${label} no es válido.`);
  }
}

function assertPayPalId(value) {
  if (typeof value !== 'string' || !PAYPAL_ID_PATTERN.test(value)) {
    throw new PaymentError('La referencia de PayPal no es válida.');
  }
}

function decimalToCents(value) {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) return null;
  const [units, decimals] = value.split('.');
  const cents = Number(units) * 100 + Number(decimals);
  return Number.isSafeInteger(cents) ? cents : null;
}

function numberToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) < 0.000001
    ? cents
    : null;
}

function providerOrderIdFromEvent(event) {
  return event?.resource?.supplementary_data?.related_ids?.order_id
    || (event?.resource_type === 'checkout-order' ? event?.resource?.id : null);
}

function assertReconciledOrder(providerOrder, attempt) {
  const purchaseUnits = providerOrder?.purchase_units;
  if (!Array.isArray(purchaseUnits) || purchaseUnits.length !== 1) {
    throw new PaymentError('La orden de PayPal no coincide con la compra interna.', {
      code: 'payment_reconciliation_failed',
      status: 409
    });
  }

  const purchase = purchaseUnits[0];
  const amountMatches = purchase.amount?.currency_code === attempt.expectedCurrency
    && decimalToCents(purchase.amount?.value) === attempt.expectedAmountCents;
  const identityMatches = purchase.reference_id === attempt.order.id
    && purchase.custom_id === attempt.order.id;

  const expectedItems = attempt.order.items
    .map((item) => ({
      sku: item.productId,
      quantity: String(item.quantity),
      currency: attempt.expectedCurrency,
      amountCents: item.unitAmountCents
    }))
    .sort((left, right) => left.sku.localeCompare(right.sku));
  const providerItems = Array.isArray(purchase.items)
    ? purchase.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        currency: item.unit_amount?.currency_code,
        amountCents: decimalToCents(item.unit_amount?.value)
      })).sort((left, right) => String(left.sku).localeCompare(String(right.sku)))
    : [];

  if (!amountMatches || !identityMatches
      || JSON.stringify(expectedItems) !== JSON.stringify(providerItems)) {
    throw new PaymentError('La orden de PayPal no coincide con importe, moneda o productos.', {
      code: 'payment_reconciliation_failed',
      status: 409
    });
  }
}

function assertEventAmount(event, attempt) {
  const amount = event?.resource?.amount;
  if (!amount) return;
  if (amount.currency_code !== attempt.expectedCurrency
      || decimalToCents(amount.value) !== attempt.expectedAmountCents) {
    throw new PaymentError('El webhook de PayPal informa un importe o moneda diferente.', {
      code: 'payment_reconciliation_failed',
      status: 409
    });
  }
}

function approvalUrl(providerOrder) {
  return providerOrder?.links?.find((link) => ['payer-action', 'approve'].includes(link.rel))?.href;
}

function assertReconciledMercadoPagoPreference(preference, attempt) {
  const identityMatches = preference?.id === attempt.providerReference
    && preference?.external_reference === attempt.order.id
    && preference?.metadata?.order_id === attempt.order.id
    && preference?.metadata?.payment_attempt_id === attempt.id;
  const expectedItems = attempt.order.items.map((item) => ({
    id: item.productId,
    quantity: item.quantity,
    currency: attempt.expectedCurrency,
    amountCents: item.unitAmountCents
  })).sort((left, right) => left.id.localeCompare(right.id));
  const providerItems = Array.isArray(preference?.items)
    ? preference.items.map((item) => ({
        id: item.id,
        quantity: Number(item.quantity),
        currency: item.currency_id,
        amountCents: numberToCents(item.unit_price)
      })).sort((left, right) => String(left.id).localeCompare(String(right.id)))
    : [];

  if (!identityMatches || JSON.stringify(expectedItems) !== JSON.stringify(providerItems)) {
    throw new PaymentError('La preferencia de Mercado Pago no coincide con la compra interna.', {
      code: 'payment_reconciliation_failed',
      status: 409
    });
  }
}

function assertReconciledMercadoPagoPayment(payment, paymentId, attempt) {
  const identityMatches = String(payment?.id) === paymentId
    && payment?.external_reference === attempt.order.id
    && payment?.metadata?.order_id === attempt.order.id
    && payment?.metadata?.payment_attempt_id === attempt.id;
  const environmentIsDeclared = typeof payment?.live_mode === 'boolean';
  const amountMatches = payment?.currency_id === attempt.expectedCurrency
    && numberToCents(payment?.transaction_amount) === attempt.expectedAmountCents;
  if (!identityMatches || !environmentIsDeclared || !amountMatches) {
    throw new PaymentError('El pago de Mercado Pago no coincide con referencia, importe o moneda.', {
      code: 'payment_reconciliation_failed',
      status: 409
    });
  }
}

class PaymentService {
  constructor({ repository, paypalClient = null, mercadoPagoClient = null, publicBaseUrl }) {
    this.repository = repository;
    this.paypalClient = paypalClient;
    this.mercadoPagoClient = mercadoPagoClient;
    this.publicBaseUrl = String(publicBaseUrl || '').replace(/\/$/, '');
    let parsedBaseUrl;
    try {
      parsedBaseUrl = new URL(this.publicBaseUrl);
    } catch {
      throw new Error('PUBLIC_BASE_URL debe ser una URL válida para habilitar PayPal.');
    }
    const localHttp = parsedBaseUrl.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(parsedBaseUrl.hostname);
    if (parsedBaseUrl.protocol !== 'https:' && !localHttp) {
      throw new Error('PUBLIC_BASE_URL debe usar HTTPS fuera del desarrollo local.');
    }
  }

  async createPayPalCheckout(body) {
    assertOnlyKeys(body, ['orderId']);
    assertUuid(body.orderId);

    const attempt = await this.repository.prepareAttempt(body.orderId, 'paypal');
    if (attempt.replayed) {
      const providerOrder = await this.paypalClient.getOrder(attempt.providerReference);
      const approveUrl = approvalUrl(providerOrder);
      if (!approveUrl) {
        throw new PaymentError('El intento de PayPal ya no admite aprobación.', {
          code: 'paypal_order_not_approvable',
          status: 409
        });
      }
      return {
        orderId: attempt.order.id,
        providerOrderId: attempt.providerReference,
        approveUrl,
        replayed: true
      };
    }

    try {
      const providerOrder = await this.paypalClient.createOrder({
        order: attempt.order,
        attemptId: attempt.id,
        returnUrl: `${this.publicBaseUrl}/?paypal=return&orderId=${attempt.order.id}`,
        cancelUrl: `${this.publicBaseUrl}/?paypal=cancel&orderId=${attempt.order.id}`
      });
      await this.repository.attachProviderReference(attempt.id, providerOrder.id);
      return {
        orderId: attempt.order.id,
        providerOrderId: providerOrder.id,
        approveUrl: providerOrder.approveUrl,
        replayed: false
      };
    } catch (error) {
      await this.repository.markAttemptError(attempt.id);
      throw error;
    }
  }

  async createMercadoPagoCheckout(body) {
    assertOnlyKeys(body, ['orderId']);
    assertUuid(body.orderId);

    const attempt = await this.repository.prepareAttempt(body.orderId, 'mercadopago');
    if (attempt.replayed) {
      const preference = await this.mercadoPagoClient.getPreference(attempt.providerReference);
      if (typeof preference?.sandbox_init_point !== 'string' || !preference.sandbox_init_point) {
        throw new PaymentError('La preferencia de Mercado Pago ya no admite una prueba Sandbox.', {
          code: 'mercadopago_preference_not_approvable',
          status: 409
        });
      }
      return {
        orderId: attempt.order.id,
        preferenceId: attempt.providerReference,
        approveUrl: preference.sandbox_init_point,
        replayed: true
      };
    }

    try {
      const preference = await this.mercadoPagoClient.createPreference({
        order: attempt.order,
        attemptId: attempt.id,
        returnBaseUrl: this.publicBaseUrl
      });
      if (!MERCADOPAGO_REFERENCE_PATTERN.test(preference.id)) {
        throw new PaymentError('Mercado Pago devolvió una referencia no válida.', {
          code: 'mercadopago_invalid_response',
          status: 502
        });
      }
      await this.repository.attachProviderReference(attempt.id, preference.id);
      return {
        orderId: attempt.order.id,
        preferenceId: preference.id,
        approveUrl: preference.sandboxInitPoint,
        replayed: false
      };
    } catch (error) {
      await this.repository.markAttemptError(attempt.id);
      throw error;
    }
  }

  async capturePayPalOrder(body) {
    assertOnlyKeys(body, ['orderId', 'providerOrderId']);
    assertUuid(body.orderId);
    assertPayPalId(body.providerOrderId);
    const attempt = await this.repository.findAttemptByProviderReference(
      'paypal',
      body.providerOrderId
    );
    if (!attempt || attempt.order.id !== body.orderId) {
      throw new PaymentError('El intento de PayPal no corresponde a la orden.', {
        code: 'payment_attempt_not_found',
        status: 404
      });
    }
    if (attempt.status !== 'pending') {
      throw new PaymentError('El intento de PayPal ya fue procesado.', {
        code: 'payment_attempt_already_processed',
        status: 409
      });
    }

    const result = await this.paypalClient.captureOrder(body.providerOrderId, attempt.id);
    return {
      orderId: attempt.order.id,
      providerOrderId: body.providerOrderId,
      providerStatus: result.status,
      status: 'pending_webhook'
    };
  }

  async applyMercadoPagoPayment({ payment, paymentId, providerEventId, eventType, payloadSha256 }) {
    const attemptId = payment?.metadata?.payment_attempt_id;
    if (typeof attemptId !== 'string' || !UUID_PATTERN.test(attemptId)) {
      return this.repository.applyWebhookEvent({
        provider: 'mercadopago',
        providerEventId,
        eventType,
        payloadSha256,
        attemptId: null,
        processingStatus: 'ignored'
      });
    }

    const attempt = await this.repository.findAttemptById('mercadopago', attemptId);
    if (!attempt || !attempt.providerReference) {
      return this.repository.applyWebhookEvent({
        provider: 'mercadopago',
        providerEventId,
        eventType,
        payloadSha256,
        attemptId: null,
        processingStatus: 'ignored'
      });
    }

    const preference = await this.mercadoPagoClient.getPreference(attempt.providerReference);
    assertReconciledMercadoPagoPreference(preference, attempt);
    assertReconciledMercadoPagoPayment(payment, paymentId, attempt);
    const outcome = MERCADOPAGO_STATUS_OUTCOMES[payment.status];
    return this.repository.applyWebhookEvent({
      provider: 'mercadopago',
      providerEventId,
      eventType: `${eventType}:${payment.status || 'unknown'}`,
      payloadSha256,
      attemptId: attempt.id,
      attemptStatus: outcome?.attemptStatus,
      orderStatus: outcome?.orderStatus,
      processingStatus: outcome ? 'processed' : 'ignored'
    });
  }

  async reconcileMercadoPagoPayment(body) {
    assertOnlyKeys(body, ['orderId', 'paymentId']);
    assertUuid(body.orderId);
    if (body.paymentId !== undefined
        && (typeof body.paymentId !== 'string'
          || !MERCADOPAGO_PAYMENT_ID_PATTERN.test(body.paymentId))) {
      throw new PaymentError('La referencia de pago de Mercado Pago no es válida.', {
        code: 'invalid_mercadopago_payment_id'
      });
    }

    let paymentId = body.paymentId;
    if (!paymentId) {
      const candidates = await this.mercadoPagoClient.searchPaymentsByExternalReference(body.orderId);
      const candidate = candidates.find((item) => (
        String(item?.external_reference || '') === body.orderId
        && MERCADOPAGO_PAYMENT_ID_PATTERN.test(String(item?.id || ''))
      ));
      paymentId = candidate ? String(candidate.id) : null;
    }

    if (!paymentId) {
      return {
        orderId: body.orderId,
        status: 'pending_provider',
        processed: false
      };
    }

    const payment = await this.mercadoPagoClient.getPayment(paymentId);
    if (payment?.external_reference !== body.orderId) {
      throw new PaymentError('El pago de Mercado Pago no corresponde a la orden.', {
        code: 'payment_reconciliation_failed',
        status: 409
      });
    }
    const providerEventId = `reconcile:${paymentId}:${payment.status || 'unknown'}`;
    const payloadSha256 = crypto.createHash('sha256')
      .update(`${body.orderId}:${paymentId}:${payment.status || 'unknown'}`)
      .digest('hex');
    const result = await this.applyMercadoPagoPayment({
      payment,
      paymentId,
      providerEventId,
      eventType: 'authenticated-return',
      payloadSha256
    });
    return {
      orderId: body.orderId,
      paymentId,
      providerStatus: payment.status,
      status: result.processingStatus || (result.duplicate ? 'duplicate' : 'unknown'),
      processed: Boolean(result.processed),
      duplicate: Boolean(result.duplicate)
    };
  }

  async reconcilePendingMercadoPagoPayments({
    limit = 50,
    now = new Date(),
    graceMs = 15 * 60 * 1000,
    alertAgeMs = 24 * 60 * 60 * 1000
  } = {}) {
    if (!this.mercadoPagoClient || typeof this.repository.listPendingAttempts !== 'function') {
      throw new PaymentError('La conciliación programada de Mercado Pago no está disponible.', {
        code: 'payment_reconciliation_unavailable',
        status: 503
      });
    }
    const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
    if (!Number.isFinite(nowMs)) {
      throw new PaymentError('La fecha de conciliación no es válida.', {
        code: 'invalid_reconciliation_time',
        status: 500
      });
    }

    const attempts = await this.repository.listPendingAttempts('mercadopago', limit);
    const summary = {
      scanned: attempts.length,
      terminalPayments: 0,
      pendingPayments: 0,
      noPayment: 0,
      cancelledExpired: 0,
      expirationsScheduled: 0,
      duplicates: 0,
      failed: 0,
      overdue: 0,
      alertRequired: false,
      errorCodes: {},
      events: []
    };
    const defaultExpirationMs = this.mercadoPagoClient.preferenceExpirationMinutes
      * 60 * 1000;

    for (const attempt of attempts) {
      const createdAtMs = new Date(attempt.createdAt).getTime();
      const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, nowMs - createdAtMs) : 0;
      if (ageMs >= alertAgeMs) summary.overdue += 1;

      try {
        const result = await this.reconcileMercadoPagoPayment({ orderId: attempt.order.id });
        if (result.paymentId) {
          if (result.duplicate) summary.duplicates += 1;
          else if (MERCADOPAGO_PENDING_STATUSES.has(result.providerStatus)) {
            summary.pendingPayments += 1;
          } else {
            summary.terminalPayments += 1;
            if (result.status === 'processed' && ageMs >= alertAgeMs) {
              summary.overdue -= 1;
            }
          }
          if (!result.duplicate) {
            summary.events.push({
              kind: 'payment',
              orderId: result.orderId,
              paymentId: result.paymentId,
              providerStatus: result.providerStatus,
              processingStatus: result.status
            });
          }
          continue;
        }

        const preference = await this.mercadoPagoClient.getPreference(
          attempt.providerReference
        );
        assertReconciledMercadoPagoPreference(preference, attempt);
        const expiresAtMs = preferenceExpirationTime(preference);

        if (expiresAtMs === null) {
          if (ageMs < defaultExpirationMs) {
            summary.noPayment += 1;
            continue;
          }
          const startsAt = new Date(nowMs);
          const expiresAt = new Date(nowMs + graceMs);
          await this.mercadoPagoClient.setPreferenceExpiration(
            attempt.providerReference,
            { startsAt, expiresAt }
          );
          summary.expirationsScheduled += 1;
          summary.events.push({
            kind: 'expiration_scheduled',
            orderId: attempt.order.id,
            preferenceId: attempt.providerReference,
            expiresAt: expiresAt.toISOString()
          });
          continue;
        }

        if (nowMs < expiresAtMs + graceMs) {
          summary.noPayment += 1;
          continue;
        }

        const expiration = preference.expiration_date_to || 'provider-expired';
        const providerEventId = `expiration:${attempt.providerReference}:${expiration}`;
        const payloadSha256 = crypto.createHash('sha256')
          .update(`${attempt.order.id}:${attempt.id}:${providerEventId}`)
          .digest('hex');
        const outcome = await this.repository.applyWebhookEvent({
          provider: 'mercadopago',
          providerEventId,
          eventType: 'preference:expired-without-payment',
          payloadSha256,
          attemptId: attempt.id,
          attemptStatus: 'cancelled',
          orderStatus: 'cancelled',
          processingStatus: 'processed'
        });
        if (outcome.duplicate) summary.duplicates += 1;
        else if (outcome.processed) {
          summary.cancelledExpired += 1;
          if (ageMs >= alertAgeMs) summary.overdue -= 1;
        }
        summary.events.push({
          kind: 'cancelled_expired',
          orderId: attempt.order.id,
          preferenceId: attempt.providerReference,
          processingStatus: outcome.processingStatus || (outcome.duplicate ? 'duplicate' : 'unknown')
        });
      } catch (error) {
        const code = error?.code || 'unknown';
        summary.failed += 1;
        summary.errorCodes[code] = (summary.errorCodes[code] || 0) + 1;
        summary.events.push({
          kind: 'failed',
          orderId: attempt.order.id,
          code
        });
      }
    }

    summary.alertRequired = summary.failed > 0 || summary.overdue > 0;
    return summary;
  }

  async processPayPalWebhook({ headers, event, rawBody }) {
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || typeof event.id !== 'string' || typeof event.event_type !== 'string') {
      throw new PaymentError('El webhook de PayPal no es válido.', {
        code: 'invalid_webhook'
      });
    }

    const verified = await this.paypalClient.verifyWebhook(headers, event);
    if (!verified) {
      throw new PaymentError('La firma del webhook de PayPal no es válida.', {
        code: 'invalid_webhook_signature'
      });
    }

    const payloadSha256 = crypto.createHash('sha256').update(rawBody).digest('hex');
    if (await this.repository.hasEvent('paypal', event.id)) {
      return { duplicate: true, processed: false };
    }

    const outcome = PAYPAL_EVENT_OUTCOMES[event.event_type];
    const providerOrderId = providerOrderIdFromEvent(event);
    if (!outcome || !providerOrderId || !PAYPAL_ID_PATTERN.test(providerOrderId)) {
      return this.repository.applyWebhookEvent({
        provider: 'paypal',
        providerEventId: event.id,
        eventType: event.event_type,
        payloadSha256,
        attemptId: null,
        processingStatus: 'ignored'
      });
    }

    const attempt = await this.repository.findAttemptByProviderReference('paypal', providerOrderId);
    if (!attempt) {
      return this.repository.applyWebhookEvent({
        provider: 'paypal',
        providerEventId: event.id,
        eventType: event.event_type,
        payloadSha256,
        attemptId: null,
        processingStatus: 'ignored'
      });
    }

    const providerOrder = await this.paypalClient.getOrder(providerOrderId);
    assertReconciledOrder(providerOrder, attempt);
    assertEventAmount(event, attempt);

    return this.repository.applyWebhookEvent({
      provider: 'paypal',
      providerEventId: event.id,
      eventType: event.event_type,
      payloadSha256,
      attemptId: attempt.id,
      attemptStatus: outcome.attemptStatus,
      orderStatus: outcome.orderStatus,
      processingStatus: 'processed'
    });
  }

  async processMercadoPagoWebhook({ headers, event, rawBody, dataId }) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new PaymentError('El webhook de Mercado Pago no es válido.', {
        code: 'invalid_webhook_envelope'
      });
    }

    const eventId = String(event?.id || '');
    const resourceId = String(event?.data?.id || '');

    if (typeof event.type !== 'string' || !event.type) {
      throw new PaymentError('El webhook de Mercado Pago no es válido.', {
        code: 'invalid_webhook_type'
      });
    }
    if (typeof event.live_mode !== 'boolean') {
      throw new PaymentError('El webhook de Mercado Pago no informa un entorno válido.', {
        code: 'invalid_webhook_live_mode'
      });
    }
    if (!eventId) {
      throw new PaymentError('El webhook de Mercado Pago no es válido.', {
        code: 'invalid_webhook_event_id'
      });
    }
    if (!resourceId || resourceId.length > 256
        || typeof dataId !== 'string' || dataId.toLowerCase() !== resourceId.toLowerCase()) {
      throw new PaymentError('La referencia URL del webhook de Mercado Pago no coincide.', {
        code: 'invalid_webhook_data_id'
      });
    }
    if (!this.mercadoPagoClient.verifyWebhook({ headers, dataId })) {
      throw new PaymentError('La firma del webhook de Mercado Pago no es válida.', {
        code: 'invalid_webhook_signature'
      });
    }

    const payloadSha256 = crypto.createHash('sha256').update(rawBody).digest('hex');
    if (await this.repository.hasEvent('mercadopago', eventId)) {
      return { duplicate: true, processed: false };
    }

    if (event.type !== 'payment') {
      return this.repository.applyWebhookEvent({
        provider: 'mercadopago',
        providerEventId: eventId,
        eventType: `${event.type}:${event.action || 'unknown'}`,
        payloadSha256,
        attemptId: null,
        processingStatus: 'ignored'
      });
    }

    const paymentId = resourceId;
    if (!MERCADOPAGO_PAYMENT_ID_PATTERN.test(paymentId)) {
      throw new PaymentError('El webhook de Mercado Pago no contiene un pago válido.', {
        code: 'invalid_webhook_payment_id'
      });
    }

    const payment = await this.mercadoPagoClient.getPayment(paymentId);
    return this.applyMercadoPagoPayment({
      payment,
      paymentId,
      providerEventId: eventId,
      eventType: `${event.type}:${event.action || 'unknown'}`,
      payloadSha256
    });
  }
}

module.exports = {
  PaymentService,
  PAYPAL_EVENT_OUTCOMES,
  MERCADOPAGO_STATUS_OUTCOMES,
  preferenceExpirationTime,
  assertReconciledOrder,
  assertReconciledMercadoPagoPreference,
  assertReconciledMercadoPagoPayment,
  decimalToCents,
  numberToCents,
  providerOrderIdFromEvent
};
