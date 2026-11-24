-- Runs once on first start of the postgres container (docker-entrypoint-initdb.d).
-- Creates the three database roles (architecture 8.5). Passwords here are DEMO values only.
-- Table grants that depend on migrated tables live in docker/postgres/grants.sql,
-- which `npm run db:migrate` applies after the migrations.

CREATE ROLE orderflow_owner LOGIN PASSWORD 'owner_demo_password' CREATEDB;
CREATE ROLE orderflow_app   LOGIN PASSWORD 'app_demo_password';
CREATE ROLE orderflow_ro    LOGIN PASSWORD 'ro_demo_password';

CREATE DATABASE orderflow OWNER orderflow_owner;
\connect orderflow

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO orderflow_owner, orderflow_app, orderflow_ro;
GRANT CREATE ON SCHEMA public TO orderflow_owner;

-- Tables the owner creates later are readable and writable by the app role,
-- but never deletable. grants.sql tightens audit tables and adds column-limited read access.
ALTER DEFAULT PRIVILEGES FOR ROLE orderflow_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO orderflow_app;
