const crypto = require('crypto');
const { OrderError } = require('./errors');

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertPlainObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OrderError(message);
  }
}

function assertOnlyKeys(object, allowedKeys, label) {
  const extraKeys = Object.keys(object).filter((key) => !allowedKeys.includes(key));
  if (extraKeys.length > 0) {
    throw new OrderError(`${label} contiene campos no permitidos: ${extraKeys.join(', ')}.`);
  }
}

function normalizeName(value, label) {
  if (typeof value !== 'string') {
    throw new OrderError(`${label} es obligatorio.`);
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 1 || normalized.length > 80) {
    throw new OrderError(`${label} debe tener entre 1 y 80 caracteres.`);
  }
  return normalized;
}

function normalizeEmail(value) {
  if (typeof value !== 'string') {
    throw new OrderError('El correo es obligatorio.');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    throw new OrderError('El correo no es válido.');
  }
  return normalized;
}

function normalizeIdempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new OrderError(
      'Idempotency-Key es obligatorio y debe tener entre 8 y 128 caracteres seguros.',
      { code: 'invalid_idempotency_key' }
    );
  }
  return value;
}

function amountInCents(product) {
  const cents = Math.round(Number(product.priceUsd) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error(`Precio inválido en el catálogo para ${product.id}.`);
  }
  return cents;
}

function paymentProviderFromBody(body) {
  assertPlainObject(body, 'El cuerpo del pedido no es válido.');
  const provider = body.paymentProvider || 'paypal';
  if (!['paypal', 'mercadopago'].includes(provider)) {
    throw new OrderError('El proveedor de pago no es válido.');
  }
  return provider;
}

function buildOrderRequest({ body, idempotencyKey, catalog, arsPricing = null }) {
  assertPlainObject(body, 'El cuerpo del pedido no es válido.');
  assertOnlyKeys(body, ['customer', 'items', 'paymentProvider'], 'El pedido');
  assertPlainObject(body.customer, 'Los datos del comprador son obligatorios.');
  assertOnlyKeys(body.customer, ['firstName', 'lastName', 'email'], 'El comprador');
  const paymentProvider = paymentProviderFromBody(body);
  const currency = paymentProvider === 'mercadopago' ? 'ARS' : 'USD';
  const arsAmounts = new Map((arsPricing?.products || []).map((item) => [
    item.productId,
    Number(item.amount)
  ]));

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    throw new OrderError('El pedido debe contener entre 1 y 20 productos.');
  }

  const productById = new Map(catalog.map((product) => [product.id, product]));
  const seenIds = new Set();
  const items = body.items.map((item, index) => {
    assertPlainObject(item, `El producto ${index + 1} no es válido.`);
    assertOnlyKeys(item, ['productId'], `El producto ${index + 1}`);

    if (typeof item.productId !== 'string' || !item.productId) {
      throw new OrderError(`El producto ${index + 1} no tiene un identificador válido.`);
    }
    if (seenIds.has(item.productId)) {
      throw new OrderError(`El producto ${item.productId} está repetido.`);
    }

    const product = productById.get(item.productId);
    if (!product) {
      throw new OrderError(`El producto ${item.productId} no existe en el catálogo.`);
    }

    seenIds.add(item.productId);
    const unitAmountCents = currency === 'ARS'
      ? Math.round(Number(arsAmounts.get(product.id)) * 100)
      : amountInCents(product);
    if (!Number.isSafeInteger(unitAmountCents) || unitAmountCents <= 0) {
      throw new OrderError('Los precios ARS no están disponibles para todos los productos.', {
        code: 'ars_prices_unavailable',
        status: 503
      });
    }
    return {
      productId: product.id,
      productType: product.type,
      title: product.title,
      currency,
      unitAmountCents,
      quantity: 1,
      lineAmountCents: unitAmountCents
    };
  });

  const customer = {
    firstName: normalizeName(body.customer.firstName, 'El nombre'),
    lastName: normalizeName(body.customer.lastName, 'El apellido'),
    email: normalizeEmail(body.customer.email)
  };
  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  const sortedFingerprintItems = items
    .map(({ productId, quantity }) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
  const requestFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({ customer, paymentProvider, currency, items: sortedFingerprintItems }))
    .digest('hex');

  return {
    id: crypto.randomUUID(),
    customer: { id: crypto.randomUUID(), ...customer },
    currency,
    totalAmountCents: items.reduce((total, item) => total + item.lineAmountCents, 0),
    idempotencyKey: normalizedKey,
    requestFingerprint,
    items: items.map((item) => ({ id: crypto.randomUUID(), priceId: crypto.randomUUID(), ...item }))
  };
}

class OrderService {
  constructor({ repository, catalog, pricingService = null }) {
    this.repository = repository;
    this.catalog = catalog;
    this.pricingService = pricingService;
  }

  async create({ body, idempotencyKey }) {
    const paymentProvider = paymentProviderFromBody(body);
    let arsPricing = null;
    if (paymentProvider === 'mercadopago') {
      if (!this.pricingService) {
        throw new OrderError('Los precios ARS todavía no están disponibles.', {
          code: 'ars_prices_unavailable',
          status: 503
        });
      }
      arsPricing = await this.pricingService.getPublicPricing();
    }
    const request = buildOrderRequest({
      body,
      idempotencyKey,
      catalog: this.catalog,
      arsPricing
    });
    return this.repository.create(request);
  }

  async findById(id) {
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
      throw new OrderError('El identificador de orden no es válido.');
    }

    const order = await this.repository.findById(id);
    if (!order) {
      throw new OrderError('La orden no existe.', { code: 'order_not_found', status: 404 });
    }
    return order;
  }
}

module.exports = { OrderService, buildOrderRequest, paymentProviderFromBody };
