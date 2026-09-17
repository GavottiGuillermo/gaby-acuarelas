class PaymentError extends Error {
  constructor(message, { code = 'payment_error', status = 400 } = {}) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { PaymentError };
