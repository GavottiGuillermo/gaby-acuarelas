-- Ejecutar después de npm run db:migrate con el usuario administrador.
REVOKE ALL ON SCHEMA gaby_acuarelas FROM PUBLIC;
REVOKE ALL ON SCHEMA gaby_acuarelas FROM gaby_acuarelas_app;
GRANT USAGE ON SCHEMA gaby_acuarelas TO gaby_acuarelas_app;

GRANT SELECT ON
  gaby_acuarelas.exchange_rates,
  gaby_acuarelas.exchange_rate_update_status,
  gaby_acuarelas.products,
  gaby_acuarelas.prices
TO gaby_acuarelas_app;

GRANT SELECT, INSERT, UPDATE ON
  gaby_acuarelas.customers,
  gaby_acuarelas.orders,
  gaby_acuarelas.payment_attempts,
  gaby_acuarelas.payment_events,
  gaby_acuarelas.deliveries
TO gaby_acuarelas_app;

GRANT SELECT, INSERT ON
  gaby_acuarelas.order_items
TO gaby_acuarelas_app;

GRANT INSERT, UPDATE ON
  gaby_acuarelas.products,
  gaby_acuarelas.prices
TO gaby_acuarelas_app;
