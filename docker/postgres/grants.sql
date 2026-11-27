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
