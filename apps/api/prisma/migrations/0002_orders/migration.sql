-- Slice 1B: products, orders, order lines, checklist rows, idempotency keys.
-- Additive only. Columns for later slices (payment, cancellation, address
-- requests, phone_normalized, checklist_epoch) are created by the slice that
-- first uses them.

CREATE SEQUENCE order_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku varchar(50) NOT NULL,
    title varchar(200) NOT NULL,
    description text NOT NULL,
    category varchar(60) NOT NULL,
    finish varchar(60) NOT NULL,
    dimensions_cm varchar(50) NOT NULL,
    dimensions_in varchar(50) NOT NULL,
    badge varchar(40),
    price_pkr numeric(12,2) NOT NULL,
    availability varchar(20) NOT NULL DEFAULT 'AVAILABLE',
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT products_sku_key UNIQUE (sku),
    CONSTRAINT products_price_nonnegative CHECK (price_pkr >= 0),
    CONSTRAINT products_availability_check
        CHECK (availability IN ('AVAILABLE', 'HIDDEN', 'OUT_OF_STOCK'))
);

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number varchar(20) NOT NULL
        DEFAULT ('OF-' || lpad(nextval('order_number_seq')::text, 6, '0')),
    public_token char(32) NOT NULL,
    source varchar(20) NOT NULL,
    customer_user_id uuid REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    lifecycle_status varchar(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
    order_version integer NOT NULL DEFAULT 1,
    recipient_name varchar(200) NOT NULL,
    recipient_phone varchar(20) NOT NULL,
    recipient_email varchar(320),
    delivery_address varchar(500) NOT NULL,
    order_note varchar(500),
    subtotal_pkr numeric(12,2) NOT NULL,
    delivery_charge_pkr numeric(12,2) NOT NULL,
    total_pkr numeric(12,2) NOT NULL,
    payment_verified_at timestamptz(6),
    dispatched_at timestamptz(6),
    delivered_at timestamptz(6),
    delivered_by uuid REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT orders_order_number_key UNIQUE (order_number),
    CONSTRAINT orders_public_token_key UNIQUE (public_token),
    CONSTRAINT orders_public_token_format CHECK (public_token ~ '^[0-9a-f]{32}$'),
    CONSTRAINT orders_source_check CHECK (source IN ('STOREFRONT', 'MANUAL')),
    CONSTRAINT orders_source_requirements CHECK (
        (source = 'STOREFRONT' AND customer_user_id IS NOT NULL AND recipient_email IS NOT NULL)
        OR (source = 'MANUAL' AND customer_user_id IS NULL)
    ),
    CONSTRAINT orders_lifecycle_status_check CHECK (
        lifecycle_status IN ('PENDING_PAYMENT', 'PAID', 'PREPARING', 'DISPATCHED', 'DELIVERED', 'CANCELLED')
    ),
    CONSTRAINT orders_version_positive CHECK (order_version >= 1),
    CONSTRAINT orders_money_nonnegative CHECK (
        subtotal_pkr >= 0 AND delivery_charge_pkr >= 0 AND total_pkr >= 0
    ),
    CONSTRAINT orders_total_is_sum CHECK (total_pkr = subtotal_pkr + delivery_charge_pkr),
    CONSTRAINT orders_dispatch_after_payment CHECK (
        dispatched_at IS NULL
        OR (payment_verified_at IS NOT NULL AND dispatched_at >= payment_verified_at)
    ),
    CONSTRAINT orders_delivery_after_dispatch CHECK (
        delivered_at IS NULL
        OR (dispatched_at IS NOT NULL AND delivered_at >= dispatched_at AND delivered_by IS NOT NULL)
    ),
    CONSTRAINT orders_delivered_by_needs_delivery CHECK (
        delivered_by IS NULL OR delivered_at IS NOT NULL
    ),
    CONSTRAINT orders_status_timestamps CHECK (
        (lifecycle_status NOT IN ('PAID', 'PREPARING', 'DISPATCHED', 'DELIVERED')
            OR payment_verified_at IS NOT NULL)
        AND (lifecycle_status NOT IN ('DISPATCHED', 'DELIVERED') OR dispatched_at IS NOT NULL)
        AND (lifecycle_status <> 'DELIVERED' OR delivered_at IS NOT NULL)
    )
);
CREATE INDEX orders_customer_user_id_created_at_idx
    ON orders(customer_user_id, created_at DESC);

CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    product_id uuid NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    product_title varchar(200) NOT NULL,
    product_sku varchar(50) NOT NULL,
    quantity integer NOT NULL,
    unit_price_pkr numeric(12,2) NOT NULL,
    line_total_pkr numeric(12,2) NOT NULL,
    CONSTRAINT order_items_quantity_range CHECK (quantity BETWEEN 1 AND 20),
    CONSTRAINT order_items_price_nonnegative CHECK (unit_price_pkr >= 0),
    CONSTRAINT order_items_line_total CHECK (line_total_pkr = unit_price_pkr * quantity)
);
CREATE INDEX order_items_order_id_idx ON order_items(order_id);

CREATE TABLE checklist_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    step_number integer NOT NULL,
    is_completed boolean NOT NULL DEFAULT false,
    completed_at timestamptz(6),
    completed_by uuid REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT checklist_steps_order_step_key UNIQUE (order_id, step_number),
    CONSTRAINT checklist_steps_step_range CHECK (step_number BETWEEN 1 AND 5),
    CONSTRAINT checklist_steps_completion_consistent
        CHECK (is_completed = (completed_at IS NOT NULL))
);

CREATE TABLE idempotency_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    request_id uuid NOT NULL,
    payload_hash char(64) NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_keys_actor_request_key UNIQUE (actor_id, request_id),
    CONSTRAINT idempotency_keys_hash_format CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);

-- Set-once columns and the lifecycle graph (architecture 8.3).
CREATE FUNCTION orders_guard_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.order_number IS DISTINCT FROM OLD.order_number
       OR NEW.public_token IS DISTINCT FROM OLD.public_token
       OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'orders: this column is set-once and cannot be changed';
    END IF;
    IF (OLD.payment_verified_at IS NOT NULL AND NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at)
       OR (OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at)
       OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
       OR (OLD.delivered_by IS NOT NULL AND NEW.delivered_by IS DISTINCT FROM OLD.delivered_by) THEN
        RAISE EXCEPTION 'orders: this timestamp is set-once and cannot be changed';
    END IF;
    IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
       AND NOT ((OLD.lifecycle_status, NEW.lifecycle_status) IN (
            ('PENDING_PAYMENT', 'PAID'),
            ('PENDING_PAYMENT', 'CANCELLED'),
            ('PAID', 'PREPARING'),
            ('PAID', 'CANCELLED'),
            ('PREPARING', 'PAID'),
            ('PREPARING', 'DISPATCHED'),
            ('PREPARING', 'CANCELLED'),
            ('DISPATCHED', 'DELIVERED')
       )) THEN
        RAISE EXCEPTION 'orders: lifecycle transition % to % is not allowed',
            OLD.lifecycle_status, NEW.lifecycle_status;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER orders_guard_update_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_guard_update();
