const crypto = require('crypto');
const { PaymentError } = require('./errors');

const API_BASE_URL = 'https://api.mercadopago.com';
const REQUEST_TIMEOUT_MS = 10000;

function centsToAmount(cents) {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new PaymentError('El importe interno no es válido.', {
      code: 'invalid_internal_amount',
      status: 500
    });
  }
  return cents / 100;
}

function parseSignatureHeader(value) {
  if (typeof value !== 'string' || !value) return null;
  const fields = Object.fromEntries(value.split(',').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }));
  if (!/^\d+$/.test(fields.ts || '') || !/^[0-9a-f]{64}$/i.test(fields.v1 || '')) return null;
  return { timestamp: fields.ts, signature: fields.v1.toLowerCase() };
}

function verifyWebhookSignature({ xSignature, xRequestId, dataId, secret }) {
  if (typeof xRequestId !== 'string' || !xRequestId
      || typeof dataId !== 'string' || !dataId || typeof secret !== 'string' || !secret) {
    return false;
  }
  const parsed = parseSignatureHeader(xSignature);
  if (!parsed) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${parsed.timestamp};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const received = Buffer.from(parsed.signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

class MercadoPagoClient {
  constructor({ accessToken, webhookSecret, fetchImpl = fetch }) {
    this.accessToken = accessToken;
    this.webhookSecret = webhookSecret;
    this.fetch = fetchImpl;
  }

  async fetchJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          ...(options.headers || {})
        },
        signal: controller.signal
      });
      const text = await response.text();
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new PaymentError('Mercado Pago devolvió una respuesta no válida.', {
            code: 'mercadopago_invalid_response',
            status: 502
          });
        }
      }
      if (!response.ok) {
        throw new PaymentError('Mercado Pago no pudo procesar la solicitud.', {
          code: 'mercadopago_request_failed',
          status: 502
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError('No se pudo comunicar con Mercado Pago.', {
        code: 'mercadopago_unavailable',
        status: 502
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async createPreference({ order, attemptId, returnBaseUrl }) {
    const items = order.items.map((item) => ({
      id: item.productId.slice(0, 256),
      title: item.title.slice(0, 256),
      quantity: item.quantity,
      currency_id: order.currency,
      unit_price: centsToAmount(item.unitAmountCents)
    }));
    const payload = await this.fetchJson('/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': attemptId
      },
      body: JSON.stringify({
        items,
        external_reference: order.id,
        metadata: {
          order_id: order.id,
          payment_attempt_id: attemptId
        },
        back_urls: {
          success: `${returnBaseUrl}/?mercadopago=success&orderId=${order.id}`,
          pending: `${returnBaseUrl}/?mercadopago=pending&orderId=${order.id}`,
          failure: `${returnBaseUrl}/?mercadopago=failure&orderId=${order.id}`
        },
        notification_url: `${returnBaseUrl}/api/webhooks/mercadopago`,
        auto_return: 'approved',
        binary_mode: false
      })
    });
    if (typeof payload.id !== 'string' || !payload.id
        || typeof payload.sandbox_init_point !== 'string' || !payload.sandbox_init_point) {
      throw new PaymentError('Mercado Pago no devolvió una preferencia Sandbox válida.', {
        code: 'mercadopago_invalid_response',
        status: 502
      });
    }
    return {
      id: payload.id,
      sandboxInitPoint: payload.sandbox_init_point
    };
  }

  async getPreference(preferenceId) {
    return this.fetchJson(`/checkout/preferences/${encodeURIComponent(preferenceId)}`);
  }

  async getPayment(paymentId) {
    return this.fetchJson(`/v1/payments/${encodeURIComponent(paymentId)}`);
  }

  verifyWebhook({ headers, dataId }) {
    return verifyWebhookSignature({
      xSignature: headers['x-signature'],
      xRequestId: headers['x-request-id'],
      dataId,
      secret: this.webhookSecret
    });
  }
}

function createMercadoPagoClient(env = process.env, options = {}) {
  const values = [env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_WEBHOOK_SECRET];
  const configuredCount = values.filter(Boolean).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== values.length) {
    throw new Error('La configuración Mercado Pago Sandbox está incompleta.');
  }
  if (env.MERCADOPAGO_ENV !== 'sandbox') {
    throw new Error('Durante la etapa 4 MERCADOPAGO_ENV debe ser sandbox.');
  }
  return new MercadoPagoClient({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
    ...options
  });
}

module.exports = {
  MercadoPagoClient,
  createMercadoPagoClient,
  centsToAmount,
  parseSignatureHeader,
  verifyWebhookSignature
};
