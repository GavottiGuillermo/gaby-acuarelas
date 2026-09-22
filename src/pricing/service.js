const { PricingError } = require('./errors');

const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const ALERT_RATE_AGE_MS = 10 * 24 * 60 * 60 * 1000;

function roundUpToHundred(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PricingError('No se pudo calcular un precio ARS válido.');
  }
  return Math.ceil(value / 100) * 100;
}

class PricingService {
  constructor({ repository, catalog, now = () => Date.now() }) {
    this.repository = repository;
    this.catalog = catalog;
    this.now = now;
  }

  async getPublicPricing() {
    const stored = await this.repository.findActiveUsdArsRate();
    if (!stored) {
      throw new PricingError('Todavía no hay una cotización USD/ARS activa.');
    }

    const rate = Number(stored.rate);
    const effectiveAt = new Date(stored.effective_at);
    if (!Number.isFinite(rate) || rate <= 0 || Number.isNaN(effectiveAt.getTime())) {
      throw new PricingError('La cotización USD/ARS almacenada no es válida.');
    }

    const ageMs = this.now() - effectiveAt.getTime();
    if (ageMs < -FUTURE_TOLERANCE_MS) {
      throw new PricingError('La cotización USD/ARS tiene una fecha futura inválida.');
    }

    return {
      baseCurrency: 'USD',
      quoteCurrency: 'ARS',
      rate,
      source: stored.source,
      effectiveAt: effectiveAt.toISOString(),
      stale: ageMs > ALERT_RATE_AGE_MS,
      rounding: 'up-to-next-100',
      products: this.catalog.map((product) => ({
        productId: product.id,
        amount: roundUpToHundred(Number(product.priceUsd) * rate)
      }))
    };
  }
}

module.exports = { PricingService, roundUpToHundred };
