class PostgresPricingRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findActiveUsdArsRate() {
    const result = await this.pool.query(`
      SELECT id, rate::text, source, effective_at
      FROM gaby_acuarelas.exchange_rates
      WHERE base_currency = 'USD'
        AND quote_currency = 'ARS'
        AND active
      LIMIT 1
    `);

    return result.rows[0] || null;
  }
}

module.exports = { PostgresPricingRepository };
