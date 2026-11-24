-- 0001_init: OrderFlow schema (architecture section 8.2 and 8.3).
-- Enumerations are TEXT with CHECK constraints so Prisma maps them as String.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_subject  TEXT NOT NULL UNIQUE,
  email         TEXT,
  display_name  TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE permissions (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key  TEXT NOT NULL UNIQUE
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id),
  permission_id UUID NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE orders (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id              TEXT NOT NULL UNIQUE,
  shopify_order_number          TEXT NOT NULL,
  -- Shopify snapshot (written only by the sync module)
  customer_name                 TEXT,
  customer_email                TEXT,
  customer_phone                TEXT,
  shopify_shipping_address      JSONB,
  currency                      TEXT NOT NULL,
  subtotal_amount               NUMERIC(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  shipping_amount               NUMERIC(12,2) NOT NULL CHECK (shipping_amount >= 0),
  total_amount                  NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  shopify_financial_status      TEXT NOT NULL,
  shopify_fulfillment_status    TEXT,
  shopify_cancelled_at          TIMESTAMPTZ,
  shopify_updated_at            TIMESTAMPTZ NOT NULL,
  last_synced_at                TIMESTAMPTZ NOT NULL,
  -- Eligibility (written only by sync)
  eligibility_status            TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
                                CHECK (eligibility_status IN ('PENDING_VERIFICATION','ELIGIBLE','INELIGIBLE')),
  eligibility_reason_code       TEXT
                                CHECK (eligibility_reason_code IS NULL OR eligibility_reason_code IN
                                ('NOT_PAID','CANCELLED','ALREADY_FULFILLED','CURRENCY_MISMATCH','AMOUNT_MISMATCH',
                                 'TEST_TRANSACTION','REFUNDED_OR_VOIDED','COD_NOT_SUPPORTED','GATEWAY_NOT_ALLOWED')),
  -- OrderFlow lifecycle (written only by the lifecycle module)
  lifecycle_status              TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                                CHECK (lifecycle_status IN ('PENDING_PAYMENT','PAID','PREPARING','DISPATCH_PENDING',
                                                            'DISPATCHED','DELIVERED','CANCELLED')),
  order_version                 INTEGER NOT NULL DEFAULT 1 CHECK (order_version >= 1),
  payment_verified_at           TIMESTAMPTZ,
  dispatched_at                 TIMESTAMPTZ,
  delivered_at                  TIMESTAMPTZ,
  delivered_by                  UUID REFERENCES users(id),
  -- Operational address override
  address_override              JSONB,
  address_override_by           UUID REFERENCES users(id),
  address_override_at           TIMESTAMPTZ,
  address_override_reason       VARCHAR(200),
  -- Conflict
  shopify_conflict_flag         BOOLEAN NOT NULL DEFAULT FALSE,
  shopify_conflict_reviewed_at  TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_lifecycle_idx ON orders (lifecycle_status);
CREATE INDEX orders_eligibility_idx ON orders (eligibility_status);
CREATE INDEX orders_created_idx ON orders (created_at DESC, id);

CREATE TABLE order_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id),
  shopify_line_item_id TEXT NOT NULL,
  product_id           TEXT,
  variant_id           TEXT,
  product_title        TEXT NOT NULL,
  variant_title        TEXT,
  sku                  TEXT,
  quantity             INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price           NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total           NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  UNIQUE (order_id, shopify_line_item_id)
);

CREATE TABLE checklist_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id),
  step_number  INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 5),
  step_key     TEXT NOT NULL,
  label        TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, step_number)
);

CREATE TABLE dispatches (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES orders(id),
  request_id               UUID NOT NULL UNIQUE,
  request_hash             TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('PENDING','PENDING_CONFIRMATION','SUCCEEDED','FAILED')),
  tracking_number          TEXT CHECK (tracking_number IS NULL OR tracking_number ~ '^[A-Za-z0-9-]{6,30}$'),
  shopify_fulfillment_id   TEXT UNIQUE,
  attempt_count            INTEGER NOT NULL DEFAULT 0,
  last_error_code          TEXT,
  last_error_message       TEXT,
  requested_by             UUID NOT NULL REFERENCES users(id),
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at             TIMESTAMPTZ,
  last_checked_at          TIMESTAMPTZ,
  negative_check_count     INTEGER NOT NULL DEFAULT 0,
  precheck_fulfillment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_note            VARCHAR(200)
);
CREATE UNIQUE INDEX dispatches_one_active_per_order
  ON dispatches (order_id) WHERE status IN ('PENDING','PENDING_CONFIRMATION');
CREATE UNIQUE INDEX dispatches_one_success_per_order
  ON dispatches (order_id) WHERE status = 'SUCCEEDED';

CREATE TABLE webhook_inbox (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_webhook_id    TEXT NOT NULL UNIQUE,
  shopify_event_id      TEXT,
  topic                 TEXT NOT NULL,
  shop_domain           TEXT NOT NULL,
  api_version           TEXT,
  shopify_triggered_at  TIMESTAMPTZ,
  resource_id           TEXT,
  payload               JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'RECEIVED'
                        CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','DEAD_LETTER')),
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at          TIMESTAMPTZ,
  next_retry_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until          TIMESTAMPTZ,
  last_error_code       TEXT,
  last_error_message    TEXT
);
CREATE INDEX webhook_inbox_claim_idx ON webhook_inbox (status, next_retry_at);

CREATE TABLE refund_applications (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                      UUID NOT NULL REFERENCES orders(id),
  application_number            TEXT NOT NULL UNIQUE,
  application_type              TEXT NOT NULL CHECK (application_type IN ('APPLICATION','INQUIRY')),
  status                        TEXT NOT NULL DEFAULT 'SUBMITTED'
                                CHECK (status IN ('SUBMITTED','UNDER_REVIEW','APPROVED_MANUALLY','DECLINED','CLOSED')),
  reason_code                   TEXT NOT NULL,
  customer_reason               TEXT,
  requested_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by                  UUID NOT NULL REFERENCES users(id),
  request_id                    UUID NOT NULL UNIQUE,
  request_hash                  TEXT NOT NULL,
  reviewed_by                   UUID REFERENCES users(id),
  reviewed_at                   TIMESTAMPTZ,
  review_note                   TEXT,
  manual_delivery_charge_amount NUMERIC(12,2) CHECK (manual_delivery_charge_amount IS NULL OR manual_delivery_charge_amount >= 0),
  manual_approved_amount        NUMERIC(12,2) CHECK (manual_approved_amount IS NULL OR manual_approved_amount >= 0),
  currency                      TEXT NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refund_application_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_application_id  UUID NOT NULL REFERENCES refund_applications(id),
  order_item_id          UUID REFERENCES order_items(id),
  product_title_snapshot TEXT NOT NULL,
  variant_title_snapshot TEXT,
  sku_snapshot           TEXT,
  requested_quantity     INTEGER NOT NULL CHECK (requested_quantity >= 1),
  reason_note            TEXT
);

CREATE TABLE order_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id),
  kind       TEXT NOT NULL CHECK (kind IN ('EXCEPTION','CONFLICT_REVIEW','DELIVERY_CORRECTION')),
  note       VARCHAR(500) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES orders(id),
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('USER','SYSTEM','SHOPIFY')),
  actor_id    UUID REFERENCES users(id),
  event_type  TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_order_idx ON audit_events (order_id, created_at, id);

CREATE TABLE integration_state (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE worker_heartbeats (
  worker_name  TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL
);

-- Mock mode only: shared simulated-Shopify state so API and worker processes see the same mock.
CREATE TABLE mock_shopify_orders (
  shopify_order_id TEXT PRIMARY KEY,
  data             JSONB NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mock_controls (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Integrity triggers (architecture 8.3, items 4 to 6)
-- ---------------------------------------------------------------------------

CREATE FUNCTION orders_set_once_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.payment_verified_at IS NOT NULL AND NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at THEN
    RAISE EXCEPTION 'payment_verified_at is set once' USING ERRCODE = '23514';
  END IF;
  IF OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at THEN
    RAISE EXCEPTION 'dispatched_at is set once' USING ERRCODE = '23514';
  END IF;
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    RAISE EXCEPTION 'delivered_at is set once' USING ERRCODE = '23514';
  END IF;
  IF OLD.delivered_by IS NOT NULL AND NEW.delivered_by IS DISTINCT FROM OLD.delivered_by THEN
    RAISE EXCEPTION 'delivered_by is set once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_set_once BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_set_once_guard();

CREATE FUNCTION orders_lifecycle_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    IF OLD.lifecycle_status IN ('DELIVERED','CANCELLED') THEN
      RAISE EXCEPTION 'lifecycle_status cannot leave %', OLD.lifecycle_status USING ERRCODE = '23514';
    END IF;
    IF OLD.lifecycle_status IN ('DISPATCHED','DELIVERED') AND NEW.lifecycle_status = 'CANCELLED' THEN
      RAISE EXCEPTION 'a dispatched order cannot be cancelled' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_lifecycle BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_lifecycle_guard();

CREATE FUNCTION reject_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
CREATE TRIGGER order_notes_append_only BEFORE UPDATE OR DELETE ON order_notes
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
