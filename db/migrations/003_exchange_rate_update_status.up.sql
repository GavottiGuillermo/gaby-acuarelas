CREATE TABLE gaby_acuarelas.exchange_rate_update_status (
  base_currency varchar(3) NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  quote_currency varchar(3) NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code varchar(64),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base_currency, quote_currency),
  CHECK (base_currency <> quote_currency)
);

INSERT INTO gaby_acuarelas.exchange_rate_update_status (
  base_currency,
  quote_currency
) VALUES ('USD', 'ARS');
