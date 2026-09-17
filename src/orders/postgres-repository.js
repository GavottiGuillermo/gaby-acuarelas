const { OrderError } = require('./errors');

function mapOrder(orderRow, itemRows) {
  if (!orderRow) return null;
  return {
    id: orderRow.id,
    status: orderRow.status,
    currency: orderRow.currency,
    totalAmountCents: orderRow.total_amount_cents,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
    items: itemRows.map((row) => ({
      productId: row.product_id,
      productType: row.product_type_snapshot,
      title: row.title_snapshot,
      unitAmountCents: row.unit_amount_cents,
      quantity: row.quantity,
      lineAmountCents: row.line_amount_cents
    }))
  };
}

async function findById(queryable, id) {
  const orderResult = await queryable.query(`
    SELECT id, status, currency, total_amount_cents, request_fingerprint, created_at, updated_at
    FROM gaby_acuarelas.orders
    WHERE id = $1
  `, [id]);

  if (orderResult.rowCount === 0) return null;

  const itemResult = await queryable.query(`
    SELECT product_id, product_type_snapshot, title_snapshot,
           unit_amount_cents, quantity, line_amount_cents
    FROM gaby_acuarelas.order_items
    WHERE order_id = $1
    ORDER BY created_at, id
  `, [id]);

  return {
    order: mapOrder(orderResult.rows[0], itemResult.rows),
    requestFingerprint: orderResult.rows[0].request_fingerprint
  };
}

class PostgresOrderRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create(request) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        request.idempotencyKey
      ]);

      const existingResult = await client.query(`
        SELECT id, request_fingerprint
        FROM gaby_acuarelas.orders
        WHERE idempotency_key = $1
      `, [request.idempotencyKey]);

      if (existingResult.rowCount > 0) {
        const existing = existingResult.rows[0];
        if (existing.request_fingerprint !== request.requestFingerprint) {
          throw new OrderError(
            'La clave de idempotencia ya fue utilizada para otro pedido.',
            { code: 'idempotency_conflict', status: 409 }
          );
        }

        const replay = await findById(client, existing.id);
        await client.query('COMMIT');
        return { ...replay.order, replayed: true };
      }

      const customerResult = await client.query(`
        INSERT INTO gaby_acuarelas.customers (
          id, first_name, last_name, email_normalized
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (email_normalized) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          updated_at = now()
        RETURNING id
      `, [
        request.customer.id,
        request.customer.firstName,
        request.customer.lastName,
        request.customer.email
      ]);

      const persistedItems = [];
      for (const item of request.items) {
        await client.query(`
          INSERT INTO gaby_acuarelas.products (id, product_type, title)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET
            product_type = EXCLUDED.product_type,
            title = EXCLUDED.title,
            active = true,
            updated_at = now()
        `, [item.productId, item.productType, item.title]);

        const priceResult = await client.query(`
          INSERT INTO gaby_acuarelas.prices (
            id, product_id, currency, amount_cents
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (product_id, currency) DO UPDATE SET
            amount_cents = EXCLUDED.amount_cents,
            updated_at = now()
          RETURNING id
        `, [item.priceId, item.productId, item.currency, item.unitAmountCents]);

        persistedItems.push({ ...item, priceId: priceResult.rows[0].id });
      }

      await client.query(`
        INSERT INTO gaby_acuarelas.orders (
          id, customer_id, currency, total_amount_cents,
          idempotency_key, request_fingerprint
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        request.id,
        customerResult.rows[0].id,
        request.currency,
        request.totalAmountCents,
        request.idempotencyKey,
        request.requestFingerprint
      ]);

      for (const item of persistedItems) {
        await client.query(`
          INSERT INTO gaby_acuarelas.order_items (
            id, order_id, product_id, price_id, product_type_snapshot,
            title_snapshot, unit_amount_cents, quantity, line_amount_cents
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          item.id,
          request.id,
          item.productId,
          item.priceId,
          item.productType,
          item.title,
          item.unitAmountCents,
          item.quantity,
          item.lineAmountCents
        ]);
      }

      const created = await findById(client, request.id);
      await client.query('COMMIT');
      return { ...created.order, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id) {
    const result = await findById(this.pool, id);
    return result?.order || null;
  }
}

module.exports = { PostgresOrderRepository };
