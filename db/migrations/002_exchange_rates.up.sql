CREATE TABLE gaby_acuarelas.exchange_rates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  base_currency varchar(3) NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  quote_currency varchar(3) NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
  rate numeric(18, 6) NOT NULL CHECK (rate > 0),
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 120),
  effective_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (base_currency <> quote_currency)
);

CREATE UNIQUE INDEX exchange_rates_one_active_pair_idx
  ON gaby_acuarelas.exchange_rates(base_currency, quote_currency)
  WHERE active;

CREATE INDEX exchange_rates_pair_effective_at_idx
  ON gaby_acuarelas.exchange_rates(base_currency, quote_currency, effective_at DESC);
