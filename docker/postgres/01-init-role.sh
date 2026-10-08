#!/bin/bash
set -e

APP_USER="${APP_DB_USER:-vetos_app}"
APP_PASS="${APP_DB_PASSWORD:-vetos_app}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$APP_USER') THEN
            CREATE ROLE $APP_USER LOGIN PASSWORD '$APP_PASS' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
        ELSE
            ALTER ROLE $APP_USER WITH PASSWORD '$APP_PASS';
        END IF;
    END
    \$\$;
EOSQL
