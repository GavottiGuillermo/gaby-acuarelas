const { OrderError } = require('./errors');

const ORDER_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['approved', 'rejected', 'cancelled']),
  approved: Object.freeze(['refunded']),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([]),
  refunded: Object.freeze([])
});

const DELIVERY_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['sent', 'failed']),
  failed: Object.freeze(['pending', 'sent']),
  sent: Object.freeze([])
});

function assertTransition(transitions, from, to, entityLabel) {
  if (!Object.hasOwn(transitions, from) || !transitions[from].includes(to)) {
    throw new OrderError(
      `Transición de ${entityLabel} no permitida: ${from} → ${to}.`,
      { code: 'invalid_state_transition', status: 409 }
    );
  }
}

function assertOrderTransition(from, to) {
  assertTransition(ORDER_TRANSITIONS, from, to, 'orden');
}

function assertDeliveryTransition(from, to) {
  assertTransition(DELIVERY_TRANSITIONS, from, to, 'entrega');
}

module.exports = {
  ORDER_TRANSITIONS,
  DELIVERY_TRANSITIONS,
  assertOrderTransition,
  assertDeliveryTransition
};

