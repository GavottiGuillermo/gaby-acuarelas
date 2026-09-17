CREATE SCHEMA IF NOT EXISTS gaby_acuarelas;

CREATE TABLE gaby_acuarelas.products (
  id text PRIMARY KEY,
  product_type text NOT NULL CHECK (product_type IN ('course', 'ebook')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gaby_acuarelas.prices (
  id uuid PRIMARY KEY,
  product_id text NOT NULL REFERENCES gaby_acuarelas.products(id),
  currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, currency)
);

CREATE TABLE gaby_acuarelas.customers (
  id uuid PRIMARY KEY,
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 80),
  email_normalized text NOT NULL UNIQUE CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND length(email_normalized) <= 254
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gaby_acuarelas.orders (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES gaby_acuarelas.customers(id),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded')
  ),
  currency varchar(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_amount_cents integer NOT NULL CHECK (total_amount_cents >= 0),
  idempotency_key varchar(128) NOT NULL UNIQUE,
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gaby_acuarelas.order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES gaby_acuarelas.orders(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES gaby_acuarelas.products(id),
  price_id uuid NOT NULL REFERENCES gaby_acuarelas.prices(id),
  product_type_snapshot text NOT NULL CHECK (product_type_snapshot IN ('course', 'ebook')),
  title_snapshot text NOT NULL CHECK (length(btrim(title_snapshot)) > 0),
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents > 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_amount_cents integer NOT NULL CHECK (
    line_amount_cents = unit_amount_cents * quantity
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id)
);

CREATE TABLE gaby_acuarelas.payment_attempts (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES gaby_acuarelas.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('mercadopago', 'paypal')),
  provider_reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'error')
  ),
  expected_currency varchar(3) NOT NULL CHECK (expected_currency ~ '^[A-Z]{3}$'),
  expected_amount_cents integer NOT NULL CHECK (expected_amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_reference)
);

CREATE TABLE gaby_acuarelas.payment_events (
  id uuid PRIMARY KEY,
  payment_attempt_id uuid REFERENCES gaby_acuarelas.payment_attempts(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('mercadopago', 'paypal')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text NOT NULL DEFAULT 'received' CHECK (
    processing_status IN ('received', 'processed', 'ignored', 'failed')
  ),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE gaby_acuarelas.deliveries (
  id uuid PRIMARY KEY,
  order_item_id uuid NOT NULL UNIQUE REFERENCES gaby_acuarelas.order_items(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX orders_customer_id_idx
  ON gaby_acuarelas.orders(customer_id);

CREATE INDEX order_items_order_id_idx
  ON gaby_acuarelas.order_items(order_id);

CREATE INDEX payment_attempts_order_id_idx
  ON gaby_acuarelas.payment_attempts(order_id);

CREATE INDEX payment_events_attempt_id_idx
  ON gaby_acuarelas.payment_events(payment_attempt_id);

