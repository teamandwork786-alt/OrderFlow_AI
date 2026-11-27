CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    oidc_subject varchar(255) NOT NULL,
    name varchar(200) NOT NULL,
    email varchar(320) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT users_oidc_subject_key UNIQUE (oidc_subject)
);

CREATE TABLE roles (
    id varchar(50) PRIMARY KEY,
    description varchar(200) NOT NULL
);

CREATE TABLE permissions (
    id varchar(100) PRIMARY KEY,
    description varchar(200) NOT NULL
);

CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    role_id varchar(50) NOT NULL REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_id_user_id_idx ON user_roles(role_id, user_id);

CREATE TABLE role_permissions (
    role_id varchar(50) NOT NULL REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    permission_id varchar(100) NOT NULL REFERENCES permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_id_role_id_idx ON role_permissions(permission_id, role_id);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type varchar(100) NOT NULL,
    actor_type varchar(20) NOT NULL CHECK (actor_type IN ('USER', 'SYSTEM')),
    actor_id uuid REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    correlation_id varchar(100) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_at_idx ON audit_events(created_at);
CREATE INDEX audit_events_actor_id_created_at_idx ON audit_events(actor_id, created_at);

CREATE FUNCTION reject_modification() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_modification();

CREATE FUNCTION prevent_mixed_customer_roles() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    new_role varchar(50);
BEGIN
    PERFORM 1 FROM users WHERE id = NEW.user_id FOR UPDATE;
    SELECT id INTO new_role FROM roles WHERE id = NEW.role_id;

    IF EXISTS (
        SELECT 1
        FROM user_roles existing
        WHERE existing.user_id = NEW.user_id
          AND ((new_role = 'customer' AND existing.role_id <> 'customer')
            OR (new_role <> 'customer' AND existing.role_id = 'customer'))
    ) THEN
        RAISE EXCEPTION 'customer and staff roles cannot be combined'
            USING ERRCODE = '23514', CONSTRAINT = 'user_roles_customer_staff_exclusion';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER user_roles_customer_staff_exclusion
BEFORE INSERT OR UPDATE OF role_id, user_id ON user_roles
FOR EACH ROW EXECUTE FUNCTION prevent_mixed_customer_roles();

INSERT INTO roles (id, description) VALUES
    ('owner', 'Owner'),
    ('admin', 'Admin'),
    ('staff_picker_packer', 'Staff picker and packer'),
    ('staff_inspector', 'Staff inspector'),
    ('staff_full', 'Full staff'),
    ('cap_dispatch', 'Dispatch capability'),
    ('cap_delivery', 'Delivery capability'),
    ('cap_report', 'Report capability'),
    ('cap_order_intake', 'Order intake capability'),
    ('customer', 'Customer');

INSERT INTO permissions (id, description) VALUES
    ('orders.read', 'Read staff orders'),
    ('order.address.read', 'Read order addresses'),
    ('order.address.update', 'Apply or decline customer address requests'),
    ('dispatch.create', 'Dispatch an order'),
    ('delivery.confirm', 'Confirm delivery'),
    ('refund.apply', 'Submit refund applications'),
    ('refund.read', 'Read refund applications'),
    ('refund.review', 'Review refund applications'),
    ('order.exception.record', 'Record order exceptions'),
    ('report.view', 'View reports'),
    ('audit.read', 'Read audit history'),
    ('users.manage', 'Manage users and roles'),
    ('system.manage', 'Manage system settings'),
    ('checklist.steps_1_2', 'Perform checklist steps one and two'),
    ('checklist.steps_3_5', 'Perform checklist steps three to five'),
    ('orders.create', 'Create manual orders'),
    ('payment.confirm', 'Confirm payment'),
    ('order.cancel', 'Cancel orders'),
    ('products.manage', 'Manage products'),
    ('product.stock.report', 'Report product stock issues'),
    ('product.stock.review', 'Review product stock issues'),
    ('settings.owner', 'Change Owner-only settings'),
    ('customer.order.create', 'Create customer orders'),
    ('customer.order.read_own', 'Read own customer orders'),
    ('customer.address_request.create', 'Request an address change');

WITH role_map(role_id, permission_ids) AS (
    VALUES
        ('owner', ARRAY[
            'orders.read', 'order.address.read', 'order.address.update', 'dispatch.create',
            'delivery.confirm', 'refund.apply', 'refund.read', 'refund.review',
            'order.exception.record', 'report.view', 'audit.read', 'users.manage',
            'system.manage', 'checklist.steps_1_2', 'checklist.steps_3_5', 'orders.create',
            'payment.confirm', 'order.cancel', 'products.manage', 'product.stock.report',
            'product.stock.review', 'settings.owner'
        ]::varchar[]),
        ('admin', ARRAY[
            'orders.read', 'order.address.read', 'order.address.update', 'dispatch.create',
            'delivery.confirm', 'refund.apply', 'refund.read', 'refund.review',
            'order.exception.record', 'report.view', 'audit.read', 'users.manage',
            'system.manage', 'checklist.steps_1_2', 'checklist.steps_3_5', 'orders.create',
            'payment.confirm', 'order.cancel', 'products.manage', 'product.stock.report',
            'product.stock.review'
        ]::varchar[]),
        ('staff_picker_packer', ARRAY[
            'orders.read', 'order.address.read', 'checklist.steps_1_2', 'refund.apply',
            'refund.read', 'order.exception.record', 'product.stock.report'
        ]::varchar[]),
        ('staff_inspector', ARRAY[
            'orders.read', 'order.address.read', 'checklist.steps_3_5', 'refund.apply',
            'refund.read', 'order.exception.record', 'product.stock.report'
        ]::varchar[]),
        ('staff_full', ARRAY[
            'orders.read', 'order.address.read', 'checklist.steps_1_2', 'checklist.steps_3_5',
            'refund.apply', 'refund.read', 'order.exception.record', 'product.stock.report'
        ]::varchar[]),
        ('cap_dispatch', ARRAY['dispatch.create']::varchar[]),
        ('cap_delivery', ARRAY['delivery.confirm']::varchar[]),
        ('cap_report', ARRAY['report.view']::varchar[]),
        ('cap_order_intake', ARRAY['orders.create']::varchar[]),
        ('customer', ARRAY[
            'customer.order.create', 'customer.order.read_own', 'customer.address_request.create'
        ]::varchar[])
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT role_id, permission_id
FROM role_map
CROSS JOIN LATERAL unnest(permission_ids) AS permissions(permission_id);
