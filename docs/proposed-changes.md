# Proposed changes to the specification (found while building S1)

| # | Conflict | What I did | Needs your decision |
|---|----------|-----------|---------------------|
| 1 | Role grants cannot all live in `docker/postgres/init.sql`: tables do not exist when it runs. | Added `docker/postgres/grants.sql`, applied by `scripts/db-migrate.sh` after migrations. | Accept, then update architecture 8.5. |
| 2 | "order_items replaced by sync" conflicts with the app role having no DELETE. | Items are upserted, never deleted. | Accept, or grant DELETE on order_items. |
| 3 | Tests use `node:test` via `tsx`, not Vitest (no package installs in the authoring sandbox). | 90 tests written to be portable. | Migrate to Vitest once packages install, if the PRD requires it. |
| 4 | The PRD does not name the default list view. | Default filter is `pending`. | Confirm. |
