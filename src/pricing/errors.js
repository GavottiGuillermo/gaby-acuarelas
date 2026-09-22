class PricingError extends Error {
  constructor(message, code = 'ars_prices_unavailable', status = 503) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { PricingError };
