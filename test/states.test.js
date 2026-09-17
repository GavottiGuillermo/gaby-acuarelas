const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertOrderTransition,
  assertDeliveryTransition
} = require('../src/orders/states');

test('permite únicamente las transiciones de orden documentadas', () => {
  assert.doesNotThrow(() => assertOrderTransition('pending', 'approved'));
  assert.doesNotThrow(() => assertOrderTransition('pending', 'cancelled'));
  assert.doesNotThrow(() => assertOrderTransition('approved', 'refunded'));
  assert.throws(
    () => assertOrderTransition('approved', 'pending'),
    /Transición de orden no permitida/
  );
  assert.throws(
    () => assertOrderTransition('refunded', 'approved'),
    /Transición de orden no permitida/
  );
});

test('una entrega enviada es terminal y una fallida puede reintentarse', () => {
  assert.doesNotThrow(() => assertDeliveryTransition('failed', 'pending'));
  assert.doesNotThrow(() => assertDeliveryTransition('failed', 'sent'));
  assert.throws(
    () => assertDeliveryTransition('sent', 'pending'),
    /Transición de entrega no permitida/
  );
});

