#!/usr/bin/env bash
# Apply migrations (prisma migrate deploy only; NEVER `prisma db push`), then the post-migration grants.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL_OWNER:?DATABASE_URL_OWNER must be set (the owner role runs migrations)}"
DATABASE_URL="$DATABASE_URL_OWNER" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
psql "$DATABASE_URL_OWNER" -v ON_ERROR_STOP=1 -q -f docker/postgres/grants.sql
echo "migrations and grants applied"
