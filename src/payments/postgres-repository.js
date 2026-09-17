const crypto = require('crypto');
const { PaymentError } = require('./errors');

function mapOrder(orderRow, itemRows) {
  return {
    id: orderRow.id,
    status: orderRow.order_status,
    currency: orderRow.currency,
    totalAmountCents: orderRow.total_amount_cents,
    items: itemRows.map((row) => ({
      productId: row.product_id,
      title: row.title_snapshot,
      unitAmountCents: row.unit_amount_cents,
      quantity: row.quantity,
      lineAmountCents: row.line_amount_cents
    }))
  };
}

async function loadItems(queryable, orderId) {
  const result = await queryable.query(`
    SELECT product_id, title_snapshot, unit_amount_cents, quantity, line_amount_cents
    FROM gaby_acuarelas.order_items
    WHERE order_id = $1
    ORDER BY product_id
  `, [orderId]);
  return result.rows;
}

class PostgresPaymentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async prepareAttempt(orderId, provider) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(`
        SELECT id, status AS order_status, currency, total_amount_cents
        FROM gaby_acuarelas.orders
        WHERE id = $1
        FOR UPDATE
      `, [orderId]);
      if (orderResult.rowCount === 0) {
        throw new PaymentError('La orden no existe.', {
          code: 'order_not_found',
          status: 404
        });
      }
      const orderRow = orderResult.rows[0];
      if (orderRow.order_status !== 'pending') {
        throw new PaymentError('La orden ya no admite nuevos intentos de pago.', {
          code: 'order_not_payable',
          status: 409
        });
      }
      if (provider === 'paypal' && orderRow.currency !== 'USD') {
        throw new PaymentError('PayPal sólo puede procesar esta orden en USD.', {
          code: 'invalid_payment_currency',
          status: 409
        });
      }

      const existingResult = await client.query(`
        SELECT id, provider_reference, status, expected_currency, expected_amount_cents
        FROM gaby_acuarelas.payment_attempts
        WHERE order_id = $1 AND provider = $2 AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `, [orderId, provider]);
      const itemRows = await loadItems(client, orderId);
      const order = mapOrder(orderRow, itemRows);

      if (existingResult.rowCount > 0) {
        const existing = existingResult.rows[0];
        if (!existing.provider_reference) {
          throw new PaymentError('La creación del pago ya está en curso.', {
            code: 'payment_attempt_in_progress',
            status: 409
          });
        }
        await client.query('COMMIT');
        return {
          id: existing.id,
          provider,
          providerReference: existing.provider_reference,
          status: existing.status,
          expectedCurrency: existing.expected_currency,
          expectedAmountCents: existing.expected_amount_cents,
          order,
          replayed: true
        };
      }

      const attempt = {
        id: crypto.randomUUID(),
        provider,
        providerReference: null,
        status: 'pending',
        expectedCurrency: order.currency,
        expectedAmountCents: order.totalAmountCents,
        order,
        replayed: false
      };
      await client.query(`
        INSERT INTO gaby_acuarelas.payment_attempts (
          id, order_id, provider, expected_currency, expected_amount_cents
        ) VALUES ($1, $2, $3, $4, $5)
      `, [attempt.id, order.id, provider, attempt.expectedCurrency, attempt.expectedAmountCents]);
      await client.query('COMMIT');
      return attempt;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async attachProviderReference(attemptId, providerReference) {
    const result = await this.pool.query(`
      UPDATE gaby_acuarelas.payment_attempts
      SET provider_reference = $2, updated_at = now()
      WHERE id = $1 AND status = 'pending' AND provider_reference IS NULL
      RETURNING id
    `, [attemptId, providerReference]);
    if (result.rowCount !== 1) {
      throw new PaymentError('No se pudo asociar la referencia de PayPal.', {
        code: 'payment_attempt_conflict',
        status: 409
      });
    }
  }

  async markAttemptError(attemptId) {
    await this.pool.query(`
      UPDATE gaby_acuarelas.payment_attempts
      SET status = 'error', updated_at = now()
      WHERE id = $1 AND status = 'pending'
    `, [attemptId]);
  }

  async findAttemptByProviderReference(provider, providerReference) {
    const result = await this.pool.query(`
      SELECT pa.id, pa.provider, pa.provider_reference, pa.status,
             pa.expected_currency, pa.expected_amount_cents,
             o.id AS order_id, o.status AS order_status,
             o.currency, o.total_amount_cents
      FROM gaby_acuarelas.payment_attempts pa
      JOIN gaby_acuarelas.orders o ON o.id = pa.order_id
      WHERE pa.provider = $1 AND pa.provider_reference = $2
    `, [provider, providerReference]);
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    const itemRows = await loadItems(this.pool, row.order_id);
    return {
      id: row.id,
      provider: row.provider,
      providerReference: row.provider_reference,
      status: row.status,
      expectedCurrency: row.expected_currency,
      expectedAmountCents: row.expected_amount_cents,
      order: mapOrder({
        id: row.order_id,
        order_status: row.order_status,
        currency: row.currency,
        total_amount_cents: row.total_amount_cents
      }, itemRows)
    };
  }

  async hasEvent(provider, providerEventId) {
    const result = await this.pool.query(`
      SELECT 1
      FROM gaby_acuarelas.payment_events
      WHERE provider = $1 AND provider_event_id = $2
    `, [provider, providerEventId]);
    return result.rowCount > 0;
  }

  async applyWebhookEvent(event) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(`
        INSERT INTO gaby_acuarelas.payment_events (
          id, payment_attempt_id, provider, provider_event_id,
          event_type, payload_sha256, processing_status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'received')
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id
      `, [
        crypto.randomUUID(),
        event.attemptId,
        event.provider,
        event.providerEventId,
        event.eventType,
        event.payloadSha256
      ]);
      if (inserted.rowCount === 0) {
        await client.query('COMMIT');
        return { duplicate: true, processed: false };
      }

      let finalStatus = event.processingStatus;
      if (event.attemptId && event.attemptStatus) {
        const attemptResult = await client.query(`
          SELECT pa.status AS attempt_status, o.id AS order_id, o.status AS order_status
          FROM gaby_acuarelas.payment_attempts pa
          JOIN gaby_acuarelas.orders o ON o.id = pa.order_id
          WHERE pa.id = $1
          FOR UPDATE OF pa, o
        `, [event.attemptId]);
        if (attemptResult.rowCount !== 1) {
          finalStatus = 'failed';
        } else {
          const current = attemptResult.rows[0];
          const terminalAttempt = ['approved', 'rejected', 'cancelled', 'refunded'];
          if (terminalAttempt.includes(current.attempt_status)
              && current.attempt_status !== event.attemptStatus) {
            finalStatus = 'ignored';
          } else {
            await client.query(`
              UPDATE gaby_acuarelas.payment_attempts
              SET status = $2, updated_at = now()
              WHERE id = $1
            `, [event.attemptId, event.attemptStatus]);
            if (event.orderStatus && current.order_status === 'pending') {
              await client.query(`
                UPDATE gaby_acuarelas.orders
                SET status = $2, updated_at = now()
                WHERE id = $1 AND status = 'pending'
              `, [current.order_id, event.orderStatus]);
            } else if (event.orderStatus && current.order_status !== event.orderStatus) {
              finalStatus = 'ignored';
            }
          }
        }
      }

      await client.query(`
        UPDATE gaby_acuarelas.payment_events
        SET processing_status = $2, processed_at = now()
        WHERE id = $1
      `, [inserted.rows[0].id, finalStatus]);
      await client.query('COMMIT');
      return {
        duplicate: false,
        processed: finalStatus === 'processed',
        processingStatus: finalStatus
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { PostgresPaymentRepository };
