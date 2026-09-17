const crypto = require('crypto');
const { PaymentError } = require('./errors');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYPAL_ID_PATTERN = /^[A-Z0-9]{1,36}$/;

const PAYPAL_EVENT_OUTCOMES = Object.freeze({
  'PAYMENT.CAPTURE.COMPLETED': { attemptStatus: 'approved', orderStatus: 'approved' },
  'PAYMENT.CAPTURE.DENIED': { attemptStatus: 'rejected', orderStatus: 'rejected' },
  'PAYMENT.CAPTURE.PENDING': { attemptStatus: 'pending', orderStatus: null },
  'CHECKOUT.PAYMENT-APPROVAL.REVERSED': { attemptStatus: 'cancelled', orderStatus: 'cancelled' },
  'CHECKOUT.ORDER.VOIDED': { attemptStatus: 'cancelled', orderStatus: 'cancelled' }
});

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

class PaymentService {
  constructor({ repository, paypalClient, publicBaseUrl }) {
    this.repository = repository;
    this.paypalClient = paypalClient;
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
}

module.exports = {
  PaymentService,
  PAYPAL_EVENT_OUTCOMES,
  assertReconciledOrder,
  decimalToCents,
  providerOrderIdFromEvent
};
