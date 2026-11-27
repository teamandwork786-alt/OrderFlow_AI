\getenv app_password ORDERFLOW_APP_PASSWORD
\getenv ro_password ORDERFLOW_RO_PASSWORD
\getenv test_database IDENTITY_TEST_DATABASE_NAME

SELECT format('CREATE ROLE orderflow_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orderflow_app')
\gexec

SELECT format('ALTER ROLE orderflow_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'app_password')
\gexec

SELECT format('CREATE ROLE orderflow_ro LOGIN PASSWORD %L', :'ro_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orderflow_ro')
\gexec

SELECT format('ALTER ROLE orderflow_ro WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'ro_password')
\gexec

ALTER ROLE orderflow_owner WITH LOGIN;

SELECT format('CREATE DATABASE %I OWNER orderflow_owner', :'test_database')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_database')
\gexec
