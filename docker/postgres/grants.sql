-- Applied after migrations, as orderflow_owner. Idempotent.

-- Append-only tables: the app may read and insert, never update or delete.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, order_notes FROM orderflow_app;
GRANT SELECT, INSERT ON audit_events, order_notes TO orderflow_app;

-- The app role can never delete or truncate anything.
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM orderflow_app;

-- Analytics read-only role: column-restricted, no sensitive tables.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orderflow_ro;

GRANT SELECT (
  id, shopify_order_id, shopify_order_number, customer_name, customer_email,
  currency, subtotal_amount, shipping_amount, total_amount, shopify_financial_status,
  shopify_fulfillment_status, shopify_cancelled_at, shopify_updated_at, last_synced_at,
  eligibility_status, eligibility_reason_code, lifecycle_status, order_version,
  payment_verified_at, dispatched_at, delivered_at, delivered_by,
  shopify_conflict_flag, shopify_conflict_reviewed_at, created_at, updated_at
) ON orders TO orderflow_ro;

GRANT SELECT ON order_items, refund_applications, refund_application_items TO orderflow_ro;

GRANT SELECT (
  id, order_id, request_id, status, tracking_number, shopify_fulfillment_id,
  requested_by, requested_at, confirmed_at
) ON dispatches TO orderflow_ro;
