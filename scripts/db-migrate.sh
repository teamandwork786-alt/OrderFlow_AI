#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL_OWNER:?DATABASE_URL_OWNER is required for migrations}"
export DATABASE_URL="$DATABASE_URL_OWNER"

npm run prisma --workspace @orderflow/api -- migrate deploy --schema prisma/schema.prisma
psql "$DATABASE_URL_OWNER" -v ON_ERROR_STOP=1 -f docker/postgres/grants.sql
