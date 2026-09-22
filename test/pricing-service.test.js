const test = require('node:test');
const assert = require('node:assert/strict');
const { PricingService, roundUpToHundred } = require('../src/pricing/service');

test('redondea hacia arriba al siguiente múltiplo de cien', () => {
  assert.equal(roundUpToHundred(7675), 7700);
  assert.equal(roundUpToHundred(18420), 18500);
  assert.equal(roundUpToHundred(25000), 25000);
});

test('calcula precios ARS desde la cotización persistida', async () => {
  const service = new PricingService({
    repository: {
      async findActiveUsdArsRate() {
        return {
          rate: '1535.000000',
          source: 'dolarapi:oficial:venta',
          effective_at: '2026-09-22T16:00:00.000Z'
        };
      }
    },
    catalog: [
      { id: 'ebook', priceUsd: 5 },
      { id: 'simple', priceUsd: 12 }
    ],
    now: () => Date.parse('2026-09-22T18:00:00.000Z')
  });

  const pricing = await service.getPublicPricing();
  assert.equal(pricing.rate, 1535);
  assert.equal(pricing.rounding, 'up-to-next-100');
  assert.deepEqual(pricing.products, [
    { productId: 'ebook', amount: 7700 },
    { productId: 'simple', amount: 18500 }
  ]);
});

test('rechaza cotizaciones ausentes pero conserva una cotización antigua', async () => {
  const withoutRate = new PricingService({
    repository: { async findActiveUsdArsRate() { return null; } },
    catalog: []
  });
  await assert.rejects(() => withoutRate.getPublicPricing(), /no hay una cotización/);

  const staleRate = new PricingService({
    repository: {
      async findActiveUsdArsRate() {
        return { rate: '1535', source: 'test', effective_at: '2026-09-01T00:00:00.000Z' };
      }
    },
    catalog: [],
    now: () => Date.parse('2026-09-22T18:00:00.000Z')
  });
  const pricing = await staleRate.getPublicPricing();
  assert.equal(pricing.rate, 1535);
  assert.equal(pricing.stale, true);
});

test('rechaza una cotización con fecha futura aunque exista en la base', async () => {
  const service = new PricingService({
    repository: {
      async findActiveUsdArsRate() {
        return { rate: '1535', source: 'test', effective_at: '2026-09-23T00:00:00.000Z' };
      }
    },
    catalog: [],
    now: () => Date.parse('2026-09-22T18:00:00.000Z')
  });

  await assert.rejects(() => service.getPublicPricing(), /fecha futura inválida/);
});
