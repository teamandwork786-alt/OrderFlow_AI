SELECT format(
    'GRANT CONNECT ON DATABASE %I TO orderflow_owner, orderflow_app, orderflow_ro',
    current_database()
)
\gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO orderflow_app, orderflow_ro;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, orderflow_app, orderflow_ro;

GRANT SELECT, INSERT ON users TO orderflow_app;
GRANT UPDATE (name, email, updated_at) ON users TO orderflow_app;
GRANT SELECT ON roles, permissions, role_permissions TO orderflow_app;
GRANT SELECT, INSERT ON user_roles TO orderflow_app;
GRANT SELECT, INSERT ON audit_events TO orderflow_app;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM orderflow_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM orderflow_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM orderflow_app, orderflow_ro;

ALTER DEFAULT PRIVILEGES FOR ROLE orderflow_owner IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC, orderflow_app, orderflow_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE orderflow_owner IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM PUBLIC, orderflow_app, orderflow_ro;

-- Slice 1B (0002_orders). The app role may insert orders, lines, checklist
-- rows and idempotency keys, and read products. UPDATE (updated_at) on
-- products is required by PostgreSQL for SELECT ... FOR SHARE. No UPDATE on
-- orders or order lines until the slice that needs it; never DELETE/TRUNCATE.
GRANT SELECT ON products TO orderflow_app;
GRANT UPDATE (updated_at) ON products TO orderflow_app;
GRANT SELECT, INSERT ON orders, order_items, checklist_steps, idempotency_keys TO orderflow_app;
GRANT USAGE ON SEQUENCE order_number_seq TO orderflow_app;
