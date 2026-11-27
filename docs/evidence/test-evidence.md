# Slice 1A test evidence

Date: 2026-11-27
Branch: `slice/1A-sign-in`
Environment: Node 22.23.5, Docker 29.10, Docker Compose 5.8.0, PostgreSQL 16.

## Quality gate results

| Command or check | Actual result |
|---|---|
| `docker compose --env-file .env.example up --build -d` | Completed successfully. PostgreSQL, API, mock OIDC, and web reported healthy; the one-shot `migrate` service exited with code 0. |
| `ALLOW_DESTRUCTIVE_SEED=true npm run db:seed` | Completed successfully; upserted the Owner and six demo identities in the configured database. |
| `npm test` | Passed: 22 tests across 5 files. |
| `npm run test:sql` | Passed: 6 SQL tests. |
| `npm run test:e2e` | Passed: 10 browser tests, including all seven demo accounts and a newly created customer. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run format:check` | Passed. |
| `npm run build` | Passed. Vite emitted non-fatal dependency bundler warnings. |
| `npm audit --omit=dev` | Passed; zero vulnerabilities found. |
| `git diff --check` | Passed. |

The test database was migrated from empty during the first test setup; subsequent Prisma deploys reported no pending migrations. The final Compose stack remains running. `docker compose down -v` was not run.

## Slice 1A cases

| Slice / Req | Test Type | Input / Condition | Expected Result | Actual Result | Pass / Fail |
|---|---|---|---|---|---|
| 1A-01 / Sc32 | F | Sign in as Owner, Admin, each staff profile, and both customers; read `/me`; sign out. | Seeded roles are preserved; staff land on `/orders`, customers on `/shop`; sign-out ends the session. | All seven demo sign-ins landed correctly; sign-out succeeded and `/me` returned 401. | PASS |
| 1A-02 / Sc32 | F | Create a new account through mock OIDC and sign in. | One customer role; `/me` returns the token name and customer permissions. | New-account E2E passed; provisioned as customer and landed on `/shop`. | PASS |
| 1A-03 / FR-05 | F | Call `/me` for Picker, Inspector, Full, Admin, and Owner. | Allowed steps are 1–2, 3–5, 1–5, none, and 1–5 respectively. | Returned checklist-step sets matched for every role. | PASS |
| 1A-04 / §2.2 | F | Compare shared permission map and migrated database roles and grants. | Exact match; retired role and permission keys are absent. | Database/shared permission comparison passed. | PASS |
| 1A-05 / FR-14 | F | Call `/health` while PostgreSQL is available. | 200 healthy status with no connection details or secrets. | Returned 200 with app and database healthy; body contained no connection string or password. | PASS |
| 1A-06 / FR-13 | F | Commit an allowed audit event, then roll back another event. | Committed event remains; rolled-back event does not. | Event count increased on commit and remained unchanged after rollback. | PASS |
| 1A-07 / NFR-08 | F | Build and start Compose; run guarded seed. | PostgreSQL, migrate, API, mock OIDC, and web are available; demo identities exist. | Four long-running services healthy; migration exited 0; guarded seed completed. | PASS |
| 1A-08 / Sc28, FR-13 | N | Attempt an audit event with an unapproved `details` key. | Rejected by the per-event allowlist; no event stored. | Returned `VALIDATION_FAILED`; audit count was unchanged. | PASS |
| 1A-09 / Sc28 | N | Access `/me` without a session, with a tampered cookie, and after session expiry. | 401 `UNAUTHENTICATED`; no identity data returned. | Missing/tampered cookies returned 401; a valid session expired after 12 hours. | PASS |
| 1A-10 / NFR-04 | N | Sign out with missing, wrong, and another user's CSRF token, then the correct token. | Invalid tokens return 403 without ending the session; correct token succeeds. | Invalid attempts returned 403 and preserved the session; correct token returned 204. | PASS |
| 1A-11 / §2.4 | N | Validate expired, wrong-audience, wrong-issuer, and bad-signature ID tokens; submit wrong callback state. | Rejected; no session or new user is created. | All four tokens were rejected; wrong state returned 401 with user count unchanged. | PASS |
| 1A-12 / Sc28 | N | Exercise every seeded role against every permission key. | API allows only the PRD matrix; Admin checklist permissions are denied by default. | All role/permission endpoint combinations matched the matrix; denied requests returned 403. | PASS |
| 1A-13 / Sc32 | N / SQL | Assign customer and staff roles in both directions through service and database. | Both mixed-role assignments are rejected. | Service checks and database exclusion trigger rejected both directions. | PASS |
| 1A-14 / Sc66 | N | Concurrently provision the same new OIDC subject twice. | Both operations succeed with one user and one customer role row. | Both returned the same user ID; exactly one user and customer role row existed. | PASS |
| 1A-15 / NFR-04 | N | Inspect session cookie, browser storage, and request logs after sign-in. | HttpOnly/SameSite set, Secure configurable, no token browser storage or PII in logs. | E2E cookie flags and empty local/session storage passed; captured API logs contained no identity data. | PASS |
| 1A-16 / §2.4 | N | Customer opens `/orders` and calls a staff permission endpoint. | UI displays no-access; API returns 403. | No-access page and API `FORBIDDEN` response passed. | PASS |
| 1A-17 / Sc18 | SQL | UPDATE and DELETE audit rows as Owner and app; INSERT as app. | Updates/deletes are rejected; inserts are permitted. | Owner trigger and app privileges rejected modifications; app insert succeeded. | PASS |
| 1A-18 / §8.5 | SQL | Check app SELECT/INSERT/UPDATE grants, forbidden privileges, and read-only base-table access. | App has only intended table/column access, no DELETE/TRUNCATE; RO cannot read base tables. | Allowed app operations succeeded; forbidden operations and RO base-table SELECT were rejected. | PASS |
| 1A-19 / §8.3 | SQL | Insert two users with the same OIDC subject. | Second insert is rejected by uniqueness constraint. | Duplicate subject insert was rejected. | PASS |
| 1A-20 / §8.3 | SQL | Apply `0001_identity` to an empty test database and deploy again. | Initial migration succeeds; subsequent deploy is a no-op. | Fresh migration succeeded; repeat deploy was a no-op with one completed migration record. | PASS |
