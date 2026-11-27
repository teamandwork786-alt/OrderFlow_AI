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

## Customer sign-in mode follow-up

Date: 2026-11-27
Branch: `feat/customer-sign-in-modes`

| Command or check | Actual result |
|---|---|
| `npm run api:types` | Passed; regenerated the OpenAPI query types for `portal` and `mode`. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run format:check` | Passed. |
| `npm test` | Passed: 34 tests across 6 files, including mode forwarding and mode-specific mock pages. |
| `npm run test:e2e` | Passed: 13 browser tests, including customer sign-in and sign-up screen routing. |
| `docker compose --env-file .env.example up --build -d mock-oidc api web` | Rebuilt successfully; API, mock OIDC, web, and PostgreSQL reported healthy. |

The customer CTA tests verify that Email, Google, and Apple use `portal=customer&mode=sign-in`, and account creation uses `portal=customer&mode=sign-up`. The mock issuer renders only the selected form; an omitted mode retains both forms. The internal staff portal remains unchanged.

---

# Slice 1B test evidence (customer places an order)

Date: 2026-11-27
Branch: `slice/1B-customer-order`
Environment label: **native run** (sandbox, 2 vCPU, Node 22.23.5, PostgreSQL 16.15 started natively, system Google Chrome for Playwright). Docker is not available in this sandbox, so the Docker Compose rebuild is **not verified** here and is listed as a human task below.
Method: tests were written first and run red (the SQL tests failed with `relation "orders" does not exist`, the API tests failed because the products table and routes were missing, the money test failed on the missing module), then the implementation was added.

## Quality gate results

| Command or check | Actual result |
|---|---|
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run format:check` | Passed. |
| `npm test` | Passed: 73 tests in 8 files (44 from Slice 1A, 24 API tests for 1B, 5 web money unit tests). |
| `npm run test:sql` | Passed: 17 tests in 2 files (6 from Slice 1A, 11 for 1B). |
| `npm run test:e2e` (system Chrome, API restarted first to reset the sign-in limiter) | Passed: 16 tests (14 from Slice 1A, 2 for 1B; the 1B journey test has six named steps). |
| Public product list latency (`GET /api/v1/storefront/products`, 8 products, 200 sequential requests, local) | p50 2.6 ms, p95 5.4 ms, max 41.4 ms. Local, single machine; this is not a load test. |

## Slice 1B cases

| Case / Scenario | Condition | Result |
|---|---|---|
| 1B-S01 | `0002_orders` exists; deploy twice | PASS: one completed migration record. |
| 1B-S02 | Order numbers unique `OF-NNNNNN`; set-once | PASS |
| 1B-S03 / Sc65 | `total = subtotal + delivery`; non-negative money | PASS |
| 1B-S04 | STOREFRONT needs customer and email; MANUAL has no customer; source set | PASS |
| 1B-S05 | Token format, unique, set-once; customer set-once | PASS |
| 1B-S06 | Lifecycle graph: all 8 allowed pairs succeed, every other pair is rejected | PASS |
| 1B-S07 | Item `line_total = unit_price x quantity`, quantity 1..20 | PASS |
| 1B-S08 | Checklist step 1..5, unique per order, completion flag consistent | PASS |
| 1B-S09 | `(actor, request_id)` unique | PASS |
| 1B-S10 | App role: insert and `FOR SHARE` read only; no UPDATE, DELETE or TRUNCATE; RO role has no base table access | PASS |
| 1B-S11 / Sc65 | Timestamp CHECKs (dispatch needs payment time and order, delivery needs dispatch and deliverer) | PASS |
| 1B-A01 | Public list hides `HIDDEN`, shows `OUT_OF_STOCK` | PASS |
| 1B-A02 / Sc1 | Order from server prices, 5 checklist rows, audit allowlist, token not returned | PASS |
| 1B-A03 | Anonymous create returns 401 | PASS |
| 1B-A04 | Missing or wrong CSRF returns 403 | PASS |
| 1B-A05 / Sc2 | Client prices and totals ignored | PASS |
| 1B-A06, A07 | `PRICE_CHANGED` with `current_total`, decimal comparison | PASS |
| 1B-A08 / Sc47 | Hidden, out-of-stock and unknown products return 422 with ids; nothing created | PASS |
| 1B-A09, A10 | 14 invalid bodies return 400; boundary values accepted | PASS |
| 1B-A11 to A15 | Idempotent replay, different payload 409, 5 concurrent duplicates create one order, no PII stored, failures not stored | PASS |
| 1B-A16 | Per-user rate limit (10 per hour), other users unaffected | PASS |
| 1B-A17 / Sc17 | `/my/orders` returns only own orders | PASS |
| 1B-A18, A19 | Foreign and unknown order number give an identical 404; customer DTO has no internal fields | PASS |
| 1B-A20 to A22 / Sc31 | 401 without session; staff roles get 403 on customer routes and on create; customer gets 403 on a staff permission | PASS |
| 1B-A23 / Sc37 (part) | No customer edit route after submission | PASS |
| 1B-A24 | Idempotency hash is a 64-character digest | PASS |
| 1B-W01 | Client money helper (BigInt minor units) | PASS |
| 1B-E01 | Browse, filter, search, cm/in toggle, quick view, no internal wording | PASS |
| 1B-E02 to E06 | Bag survives reload, sign-in return to checkout, `PRICE_CHANGED` and `PRODUCT_UNAVAILABLE` messages (responses stubbed in the browser), single order on double click, awaiting-payment page with read-only address, other customer sees "Order not found", sign-out empties the bag | PASS |

## Not verified here (be explicit)

- Docker Compose rebuild with `--env-file .env.example` (human task; sandbox has no Docker). The grants file and migration were applied and re-applied natively through `npm run db:migrate`.
- Manual checkout in a real browser by a person, and a review of the drafted product descriptions.
- Scenario 37 second half (address request on another customer's order) belongs to Slice 4A by decision D12; 1B covers "no customer edit after submission".
- Web fonts: the sandbox is offline, so screenshots show the Georgia fallback. The Google Fonts link is in `index.html` with `display=swap`.
- The slide-out drawer and quick-view dialogs close with Escape and restore focus; they do not trap Tab focus. No assistive-technology testing was done.

