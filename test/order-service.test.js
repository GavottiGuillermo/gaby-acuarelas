const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/catalog');
const { OrderService, buildOrderRequest } = require('../src/orders/service');

function validBody(overrides = {}) {
  return {
    customer: {
      firstName: '  Ana  María ',
      lastName: ' Pérez ',
      email: ' ANA@example.com '
    },
    items: [{ productId: 'peonias-pimpollo' }],
    ...overrides
  };
}

test('construye el precio y la moneda desde el catálogo del servidor', () => {
  const request = buildOrderRequest({
    body: validBody(),
    idempotencyKey: 'pedido-prueba-001',
    catalog
  });

  assert.equal(request.currency, 'USD');
  assert.equal(request.totalAmountCents, 1200);
  assert.equal(request.items[0].unitAmountCents, 1200);
  assert.equal(request.customer.firstName, 'Ana María');
  assert.equal(request.customer.email, 'ana@example.com');
  assert.match(request.requestFingerprint, /^[0-9a-f]{64}$/);
});

test('rechaza importes y monedas enviados por el cliente', () => {
  assert.throws(() => buildOrderRequest({
    body: validBody({ currency: 'ARS', totalAmountCents: 1 }),
    idempotencyKey: 'pedido-prueba-002',
    catalog
  }), /campos no permitidos/);

  assert.throws(() => buildOrderRequest({
    body: validBody({
      items: [{ productId: 'peonias-pimpollo', unitAmountCents: 1 }]
    }),
    idempotencyKey: 'pedido-prueba-003',
    catalog
  }), /campos no permitidos/);
});

test('rechaza correo inválido, producto inexistente y productos repetidos', () => {
  assert.throws(() => buildOrderRequest({
    body: validBody({
      customer: { firstName: 'Ana', lastName: 'Pérez', email: 'incorrecto' }
    }),
    idempotencyKey: 'pedido-prueba-004',
    catalog
  }), /correo no es válido/);

  assert.throws(() => buildOrderRequest({
    body: validBody({ items: [{ productId: 'producto-inexistente' }] }),
    idempotencyKey: 'pedido-prueba-005',
    catalog
  }), /no existe en el catálogo/);

  assert.throws(() => buildOrderRequest({
    body: validBody({
      items: [
        { productId: 'peonias-pimpollo' },
        { productId: 'peonias-pimpollo' }
      ]
    }),
    idempotencyKey: 'pedido-prueba-006',
    catalog
  }), /está repetido/);
});

test('la huella idempotente no depende del orden de los productos', () => {
  const first = buildOrderRequest({
    body: validBody({
      items: [
        { productId: 'peonias-pimpollo' },
        { productId: 'ebook-10-acuarelas-botanicas' }
      ]
    }),
    idempotencyKey: 'pedido-prueba-007',
    catalog
  });
  const second = buildOrderRequest({
    body: validBody({
      items: [
        { productId: 'ebook-10-acuarelas-botanicas' },
        { productId: 'peonias-pimpollo' }
      ]
    }),
    idempotencyKey: 'pedido-prueba-007',
    catalog
  });

  assert.equal(first.requestFingerprint, second.requestFingerprint);
});

test('el servicio delega la creación y no expone consultas con UUID inválido', async () => {
  let captured;
  const repository = {
    async create(request) {
      captured = request;
      return { id: request.id, replayed: false };
    },
    async findById() {
      throw new Error('no debe ejecutarse');
    }
  };
  const service = new OrderService({ repository, catalog });
  const result = await service.create({
    body: validBody(),
    idempotencyKey: 'pedido-prueba-008'
  });

  assert.equal(result.id, captured.id);
  await assert.rejects(() => service.findById('no-es-un-uuid'), /no es válido/);
});

