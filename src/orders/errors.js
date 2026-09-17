class OrderError extends Error {
  constructor(message, { code = 'invalid_order', status = 400 } = {}) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { OrderError };

