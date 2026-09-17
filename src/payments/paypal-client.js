const { PaymentError } = require('./errors');

const SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
const REQUEST_TIMEOUT_MS = 10000;

function centsToDecimal(cents) {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new PaymentError('El importe interno no es válido.', {
      code: 'invalid_internal_amount',
      status: 500
    });
  }
  return (cents / 100).toFixed(2);
}

function requiredWebhookHeaders(headers) {
  const normalized = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time']
  };

  if (Object.values(normalized).some((value) => typeof value !== 'string' || !value)) {
    throw new PaymentError('Faltan encabezados de autenticación del webhook.', {
      code: 'invalid_webhook_headers'
    });
  }

  let certUrl;
  try {
    certUrl = new URL(normalized.cert_url);
  } catch {
    throw new PaymentError('El certificado informado por PayPal no es válido.', {
      code: 'invalid_webhook_certificate'
    });
  }

  const trustedHost = certUrl.hostname === 'paypal.com'
    || certUrl.hostname.endsWith('.paypal.com');
  if (certUrl.protocol !== 'https:' || !trustedHost) {
    throw new PaymentError('El certificado informado por PayPal no es confiable.', {
      code: 'invalid_webhook_certificate'
    });
  }

  return normalized;
}

class PayPalClient {
  constructor({ clientId, clientSecret, webhookId, fetchImpl = fetch, now = Date.now }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.webhookId = webhookId;
    this.fetch = fetchImpl;
    this.now = now;
    this.baseUrl = SANDBOX_BASE_URL;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  async getAccessToken() {
    if (this.accessToken && this.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await this.fetchJson('/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    }, { authenticated: false });

    if (typeof response.access_token !== 'string' || !response.access_token) {
      throw new PaymentError('PayPal no devolvió un token de acceso válido.', {
        code: 'paypal_invalid_response',
        status: 502
      });
    }

    const expiresIn = Number(response.expires_in);
    const safeLifetimeMs = Number.isFinite(expiresIn)
      ? Math.max(0, expiresIn - 60) * 1000
      : 0;
    this.accessToken = response.access_token;
    this.accessTokenExpiresAt = this.now() + safeLifetimeMs;
    return this.accessToken;
  }

  async fetchJson(path, options, { authenticated = true } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers = { Accept: 'application/json', ...options.headers };
      if (authenticated) {
        headers.Authorization = `Bearer ${await this.getAccessToken()}`;
      }

      const response = await this.fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal
      });
      const text = await response.text();
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new PaymentError('PayPal devolvió una respuesta no válida.', {
            code: 'paypal_invalid_response',
            status: 502
          });
        }
      }

      if (!response.ok) {
        throw new PaymentError('PayPal no pudo procesar la solicitud.', {
          code: 'paypal_request_failed',
          status: 502
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError('No se pudo comunicar con PayPal.', {
        code: 'paypal_unavailable',
        status: 502
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async createOrder({ order, attemptId, returnUrl, cancelUrl }) {
    const amount = {
      currency_code: order.currency,
      value: centsToDecimal(order.totalAmountCents)
    };
    const items = order.items.map((item) => ({
      name: item.title.slice(0, 127),
      sku: item.productId.slice(0, 127),
      quantity: String(item.quantity),
      category: 'DIGITAL_GOODS',
      unit_amount: {
        currency_code: order.currency,
        value: centsToDecimal(item.unitAmountCents)
      }
    }));

    const payload = await this.fetchJson('/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PayPal-Request-Id': attemptId
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: order.id,
          custom_id: order.id,
          invoice_id: order.id,
          description: 'Clases y recursos digitales de Gaby Acuarelas',
          amount: {
            ...amount,
            breakdown: { item_total: amount }
          },
          items
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Gaby Acuarelas',
              locale: 'es-AR',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: returnUrl,
              cancel_url: cancelUrl
            }
          }
        }
      })
    });

    const approval = payload.links?.find((link) => ['payer-action', 'approve'].includes(link.rel));
    if (typeof payload.id !== 'string' || !approval?.href) {
      throw new PaymentError('PayPal no devolvió una orden aprobable.', {
        code: 'paypal_invalid_response',
        status: 502
      });
    }

    return { id: payload.id, status: payload.status, approveUrl: approval.href };
  }

  async getOrder(providerOrderId) {
    return this.fetchJson(`/v2/checkout/orders/${encodeURIComponent(providerOrderId)}`, {
      method: 'GET'
    });
  }

  async captureOrder(providerOrderId, attemptId) {
    return this.fetchJson(`/v2/checkout/orders/${encodeURIComponent(providerOrderId)}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `${attemptId}-capture`
      },
      body: '{}'
    });
  }

  async verifyWebhook(headers, webhookEvent) {
    const verificationHeaders = requiredWebhookHeaders(headers);
    const payload = await this.fetchJson('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...verificationHeaders,
        webhook_id: this.webhookId,
        webhook_event: webhookEvent
      })
    });
    return payload.verification_status === 'SUCCESS';
  }
}

function createPayPalClient(env = process.env, options = {}) {
  const values = [env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET, env.PAYPAL_WEBHOOK_ID];
  const configuredCount = values.filter(Boolean).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== values.length) {
    throw new Error('La configuración PayPal sandbox está incompleta.');
  }
  if (env.PAYPAL_ENV !== 'sandbox') {
    throw new Error('Durante la etapa 4 PAYPAL_ENV debe ser sandbox.');
  }

  return new PayPalClient({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    webhookId: env.PAYPAL_WEBHOOK_ID,
    ...options
  });
}

module.exports = {
  PayPalClient,
  createPayPalClient,
  centsToDecimal,
  requiredWebhookHeaders
};
