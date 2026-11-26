# OrderFlow AI: Architecture and Decision Records

**Version:** 4.3 (Standalone Web Edition) | **Date:** 26 November 2026
**Aligned to:** PRD v4.3 | **Supersedes:** architecture v4.2, v4.1, v2.1 (Shopify and native edition) and the unreviewed v4.0 draft
**Reading rule:** PRD requirement IDs (FR-xx, NFR-xx, D-xx) are used throughout. If this file and the PRD disagree, the PRD wins; record the conflict in `docs/proposed-changes.md`.

---

## 1. Purpose and scope
How OrderFlow AI is built so that the PRD's guarantees hold even when application code has a bug. One web app, one API, one analytics service, one PostgreSQL database, no external systems in the guaranteed demo path.

---

## 2. Locked decisions

| ID | Decision |
|---|---|
| L-01 | Standalone: OrderFlow owns orders, prices, payment verification and fulfilment records. No Shopify code, columns, routes or words in any new file |
| L-02 | Web only. No `apps/native`, no Expo, no React Native |
| L-03 | `PaymentAdapter` port with `MockPaymentAdapter` now; a real gateway (PayFast) is Phase 2 behind the same port |
| L-04 | Dispatch is one local atomic transaction. No `DISPATCH_PENDING`, no reconcile |
| L-05 | The database enforces integrity (triggers, CHECKs, unique indexes, grants), independently of application checks |
| L-06 | Offline: read and checklist queue; dispatch only for Owner/Admin and only with the Owner override; the server decides at sync time |
| L-07 | Four primary navigation items for staff; Orders is a two-column split pane |
| L-08 | Payment events are applied synchronously in the request; no background worker |
| L-09 | **Customers authenticate** through the same OIDC flow with a `customer` role; customer data access is filtered in the query |
| L-10 | `EmailAdapter` port with `MockEmailAdapter` writing to `email_outbox`; sending never blocks an order |
| L-11 | Product photos live on a local Docker volume; no cloud storage |
| L-12 | An address changes only by applying a customer's open request; there is no free-form address edit |
| L-13 | `apps/analytics` is reached only through the API (internal secret) and reads only reporting views as `orderflow_ro` |
| L-14 | Every checklist action carries `checklist_epoch`; a reset invalidates older actions, online and offline |

---

## 3. System context

```
 Customer (browser, signed in)                 Staff / Admin / Owner (browser, installable PWA)
        |  public browse + OIDC session                     |  OIDC session + CSRF
        v                                                   v
   +------------------------ apps/web (React + Vite) --------------------------+
   |  storefront + my-orders + help | staff workspace (4 nav) | offline cache/queue |
   +------------------------------------+---------------------------------------+
                                        | HTTPS JSON (multipart only on image upload)
                                        v
   +------------------------ apps/api (Express) --------------------------------+
   |  http -> services -> repositories (Prisma, raw SQL where needed)            |
   |  modules: auth, customers, catalog, products, orders, payments, lifecycle,  |
   |   checklist, dispatch, delivery, address-requests, refunds, settings,       |
   |   offline-sync, audit, health                                               |
   |  ports: PaymentAdapter (mock)   EmailAdapter (mock)                         |
   |  static: /uploads/products (read only)                                      |
   +-------+---------------------------+----------------------+-----------------+
           | orderflow_app             | volume `uploads`     | internal secret
           v                           v                      v
   +---------------+            /uploads (local disk)  +----------------------+
   | PostgreSQL 16 | <------ orderflow_ro ------------ | apps/analytics (R/O) |
   +---------------+                                   +----------------------+
   apps/mock-oidc (sign-in for demo customers and staff)   scripts: seed, reset, simulate payment
```
No `worker`. The only outbound action in Phase 1 is writing a mock email row.

---

## 4. Technology stack
TypeScript strict; Node 22; npm workspaces; Express; Zod; Prisma (custom SQL in migrations); PostgreSQL 16; `jose`; `pino`; `helmet`, `cors`, `express-rate-limit`, `cookie-parser`; `oidc-provider` (mock issuer only); React 18, Vite, React Router, TanStack Query; **plain CSS**; Vitest, Supertest, Playwright; Docker Compose; ESLint 9 flat config; Prettier.

**Approved 26 November 2026, installed when their slice starts:**
- Slice 1B, image upload: `multer` 2.x (1.x has known denial-of-service advisories; do not use it) and `sharp` (re-encode photos, dropping EXIF location data; works on the Debian-slim image, which keeps native binaries simple).
- Slice 2, offline: `vite-plugin-pwa` (app-shell service worker), `idb-keyval` (IndexedDB), `@tanstack/react-query-persist-client` with `@tanstack/query-async-storage-persister` (query cache). The offline **action queue** uses its own IndexedDB store through `idb-keyval`, never the query cache.

**Removed from the approved list:** `expo`, `react-native`, `expo-secure-store`, `jest-expo`, all Shopify tooling.

---

## 5. Repository layout

```
apps/
  api/            Express API (src/http, src/modules, src/db, src/integrations/{payment,email}, prisma/)
  analytics/      read-only reporting service
  web/            storefront, my-orders, staff workspace (src/model, src/controller, src/view, src/offline)
  mock-oidc/      local OIDC issuer (demo customers and staff)
packages/shared/  Zod schemas, permission map, step-permission rule, lifecycle graph, shared types
api-spec/openapi.yaml
docs/             architecture.md, adr/, evidence/, wireframes/, proposed-changes.md
docker/           Dockerfiles, postgres init.sql and grants.sql
fixtures/         payment event fixtures, seed data
scripts/          db-migrate.sh, seed.ts, reset-demo.ts, simulate-payment.ts, guard.ts
PRD.md  AGENTS.md  plan.md  README.md  docker-compose.yml  .env.example
volume `uploads` mounted at /uploads in the api container (not in git)
```
Delete, do not hide: `apps/native`, `apps/api/src/integrations/shopify`, `apps/api/src/modules/webhooks-inbox`, `apps/api/src/modules/sync`, `mock_shopify_*` code, and `docs/adr` entries that describe Shopify behaviour (mark them Superseded, section 17).

---

## 6. Backend structure

Layers: **http** (parse, validate with Zod, authenticate, authorize, call one service, format) then **service** (rules, one transaction per command) then **repository** (queries). Rules:
1. No business rules and no Prisma in `src/http`.
2. Cross-module calls go through the other module's `index.ts`.
3. **Only the `lifecycle` module writes** `lifecycle_status`, `order_version`, `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `cancelled_at`. `payments`, `checklist`, `dispatch`, `delivery`, `address-requests` (on apply) and cancel call it.
4. Only `audit` inserts `audit_events`, always inside the caller's transaction.
5. `PaymentAdapter` and `EmailAdapter` types and code stay inside `src/integrations/`. Domain code sees `ParsedPaymentEvent` and `OutgoingEmail`.
6. Every command goes through the idempotency helper (10.7).
7. Services take a transaction handle; they never open their own nested ones.
8. **Customer reads live only in the `customers` module** and always carry `customer_user_id = :actor` in the SQL (10.14). No staff query is reused for customers.
9. Uploaded-file handling lives only in the `products` module (10.12).
10. Stock holds live only in the `stock` module (10.15); order creation asks it whether a product is orderable.
11. The `reports` module in the API only checks `report.view` and forwards to analytics (10.9); it holds no report SQL.
12. The staff order query is the single function `staffOrderScope(actor)` (10.16); every staff list, search and detail read goes through it.

---

## 7. Client structure (apps/web, MVC)

- **model:** typed API shapes and view-state types from `packages/shared`.
- **controller:** TanStack Query hooks, the `ApiClient` (CSRF header and `request_id`), auth hook, offline hooks. No JSX.
- **view:** presentational React components. No `fetch`, no business rules.
- **offline/** (10.8): `connectivity`, `cache`, `queue`, `sync`. The only code that touches IndexedDB. Staff, Admin and Owner only.
- **Routes:** customer (`/shop`, `/sign-in`, `/cart`, `/checkout`, `/pay/:orderNumber`, `/my-orders`, `/my-orders/:orderNumber`, `/help/address-change`, `/track`) and staff (`/orders`, `/refunds`, `/reports`, `/admin`). After sign-in the app routes by role: customers to `/shop`, staff to `/orders`. A customer opening a staff route, or the reverse, gets a no-access page.
- **Staff navigation:** exactly four entries. Orders renders the split pane (queue left, detail right; stacked on narrow screens). The Checklist component renders five numbered, collapsible sub-sections driven by `packages/shared` (`canPerformStep`).
- **Image upload control:** two inputs side by side, camera (`accept="image/*" capture="environment"`) and gallery (`accept="image/*" multiple`), because `capture` usually hides the gallery on phones.
- Every server-dependent view handles loading, synchronized, queued-offline, failed and stale states, in text and colour.

---

## 8. Data architecture

### 8.1 Tables
As PRD section 7. Notes that matter to implementation:
- `orders.order_number`: `DEFAULT 'OF-' || lpad(nextval('order_number_seq')::text, 6, '0')`.
- `orders.public_token`: 32 hex characters from `crypto.randomBytes(16)`, generated by the API, unique, compared with `timingSafeEqual`. Status-only access, stored plainly.
- `orders.customer_user_id`: nullable foreign key to `users`, set once; null for manual orders. Index on it for `/my-orders`.
- `orders.has_pending_address_request`: derived from `address_change_requests` by a trigger (8.3); never written by application code.
- `order_items` rows are inserted at creation and never updated.
- `payment_events` keeps no raw body. `email_outbox` keeps the rendered text (no address, no phone).
- `idempotency_keys`: unique `(scope, endpoint, request_id)`; `scope` is the user id.
- `product_images.file_name`: server UUID plus the extension of the verified type.
- `orders.phone_normalized`: `GENERATED ALWAYS AS (regexp_replace(customer_phone, '[^0-9]', '', 'g')) STORED`, btree index. Search normalizes the input with the same rule.
- `orders.checklist_epoch`: integer, default 0.
- `products.availability`: replaces `is_available`.
- `product_stock_requests`, `payment_events.reviewed_*`, refund paid-outside columns, reporting views: see 8.3 and the migration plan in `plan.md`.

### 8.2 Money and time
`NUMERIC(12,2)`, `Prisma.Decimal` in code, decimal strings in JSON; no `number` arithmetic on money. UTC `TIMESTAMPTZ`; the server clock for every timestamp OrderFlow records. Reports convert with `AT TIME ZONE 'Asia/Karachi'` to build half-open local-day ranges.

### 8.3 Constraints and triggers
Created by migration `0003_standalone_pivot` (Slice 1A) unless marked `0004` (Slice 3) or `0005` (Slice 5).
- **Set once** (extends `orders_set_once_guard`): `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `order_number`, `public_token`, `customer_user_id`.
- **Lifecycle graph** (replaces `orders_lifecycle_guard`): allowed pairs are exactly `PENDING_PAYMENT→PAID`, `PENDING_PAYMENT→CANCELLED`, `PAID→PREPARING`, `PAID→CANCELLED`, `PREPARING→PAID`, `PREPARING→DISPATCHED`, `PREPARING→CANCELLED`, `DISPATCHED→DELIVERED`. Everything else raises.
- **Timestamp CHECKs:** `lifecycle_status IN ('PAID','PREPARING','DISPATCHED','DELIVERED') → payment_verified_at IS NOT NULL`; `IN ('DISPATCHED','DELIVERED') → dispatched_at IS NOT NULL`; `= 'DELIVERED' → delivered_at IS NOT NULL`.
- **Checklist epoch:** trigger refuses any decrease of `checklist_epoch`.
- **Dispatch precondition:** `dispatches` BEFORE INSERT: order `PREPARING`, five completed `checklist_steps`, no `OPEN` row in `address_change_requests`.
- **Address requests:** partial unique index `(order_id) WHERE status = 'OPEN'`; trigger blocks changing `proposed_address` and any status move other than `OPEN→APPLIED|DECLINED|VOID`; BEFORE INSERT trigger refuses the row when `now() >= orders.created_at + address_change_window_hours` or the order is not `PENDING_PAYMENT`, `PAID` or `PREPARING`; AFTER INSERT/UPDATE trigger sets `orders.has_pending_address_request = EXISTS(open request)` without touching `order_version`.
- **Stock requests (`0004`):** partial unique index `(product_id) WHERE status = 'PENDING'`; status moves only from `PENDING`; `expires_at = created_at + stock_hold_hours`, set once.
- **Refund paid-outside (`0005`):** fields set once, only while status is `APPROVED_MANUALLY`, amount `> 0` and `<=` the order total (trigger).
- **Unique indexes:** one succeeded dispatch per order; `payment_events (provider, provider_event_id)`; `products.sku`; `checklist_steps (order_id, step_number)`; `users.oidc_subject`.
- **CHECKs:** non-negative money; `quantity BETWEEN 1 AND 20`; tracking `^[A-Za-z0-9-]{6,30}$`; lifecycle in the six values; `payment_method` in its four values; `source` in (`STOREFRONT`,`MANUAL`); `availability` in its three values; `product_images.byte_size <= 5242880`; `product_images.content_type` in the three allowed types; a `STOREFRONT` order must have `customer_user_id`.
- **Append-only:** `audit_events`, `order_notes`, `order_address_revisions` via `reject_modification()` on UPDATE and DELETE (blocks even the owner role).
- **Existing 33 SQL checks** are adapted; new SQL checks cover every item above.

### 8.4 Versioning
`order_version` bumps in the `lifecycle` module on each transition and on applying an address request. `checklist_epoch` increases only when Apply resets the checklist; it is separate from `order_version` because checklist actions deliberately do not carry `expected_version`. Checklist actions and creating an address request do not bump it; checklist is protected by the row lock, step order and step permission.

### 8.5 Database roles and grants
`docker/postgres/init.sql` creates roles; `grants.sql` runs after migrations.
- `orderflow_owner`: owns objects, runs migrations and seed/reset (TRUNCATE).
- `orderflow_app`: SELECT, INSERT, UPDATE where needed; **no DELETE, no TRUNCATE**; no UPDATE on append-only tables; `order_items`, `product_images`: no UPDATE of immutable columns (only `sort_order` and `is_active` on images).
- `orderflow_ro`: SELECT on the reporting views only (`report_orders_v`, `report_order_items_v`, `report_dispatches_v`, `report_refunds_v`; created in `0005`, owned by `orderflow_owner`, `security_barrier`). No grant on any base table. The views contain no address, phone, email, notes, audit, users, address requests, email outbox, payment reference, settings or idempotency data.

### 8.6 Removed schema
Drop `webhook_inbox`, `integration_state`, `worker_heartbeats`, `mock_shopify_orders`, `mock_controls`, and the `shopify_*`, `eligibility_*` and conflict columns; retire roles `staff` and `cap_address_update` and permission `checklist.update` (re-seed). This alters existing demo data, so the migration needs a human approval before merge (AGENTS section 13).

---

## 9. Lifecycle
Graph and rules: PRD section 6, enforced twice: in `packages/shared` (`canTransition`) by the `lifecycle` module, and in the database trigger (8.3). A test asserts the two graphs are identical.

---

## 10. Data flows

### 10.1 Create order (FR-01)
1. Require a session. Customers need `customer.order.create`; staff need `orders.create`. Rate limit per user and size limit. Validate the body with Zod (phone regex, required email for customer orders, quantity bounds, line count, `expected_total` as a decimal string).
2. Idempotency check on `request_id`.
3. In one transaction:
   - `SELECT ... FROM products WHERE id = ANY($ids) FOR SHARE`; reject unknown products, `availability <> 'AVAILABLE'`, or an active stock hold (`stock.isHeld`) with `PRODUCT_UNAVAILABLE`.
   - Compute line totals and the total with `Prisma.Decimal`, reading `delivery_charge_pkr`. If the total differs from `expected_total`, roll back and return 409 `PRICE_CHANGED` with the current total.
   - Insert the order (`customer_user_id` = actor for customers), the lines and five checklist rows; audit `ORDER_CREATED`.
   - **Insert the single `email_outbox` row** with the rendered confirmation (10.13).
   - Store the idempotency response.
4. After commit, call `EmailAdapter.deliver(outboxId)` (10.13). A failure updates that row and is audited; it never fails the response.
5. Respond with `order_number` (the token goes by email).

### 10.2 Payment event (FR-02)
```
POST /webhooks/payments  (express.raw, mounted before express.json)
 -> adapter.verifyAndParse(rawBody, headers)      constant-time HMAC; throws InvalidSignature -> 401
 -> BEGIN
      INSERT payment_events ... ON CONFLICT (provider, provider_event_id) DO NOTHING
      if conflict -> return the stored result
      SELECT * FROM orders WHERE order_number = $1 FOR UPDATE
      checks: order exists, lifecycle = PENDING_PAYMENT, currency = PKR, amount = total (Decimal.equals)
      ok     -> lifecycle.transition(PAID, now) ; payment_events.status = APPLIED ; audit PAYMENT_VERIFIED
      not ok -> payment_events.status = REJECTED + reason ; audit PAYMENT_REJECTED
    COMMIT
```
Invalid signatures are counted per IP and throttled. The mock gateway route (`POST /mock-gateway/orders/:orderNumber/pay`) requires the signed-in **owner of the order**, builds a signed body with `PAYMENT_WEBHOOK_SECRET` and calls the same `handlePaymentWebhook` function (no HTTP loopback), so verification and application code are the real code. Mock routes are registered only when `PAYMENT_ADAPTER=mock`.

### 10.3 Manual confirmation (FR-02)
One transaction: lock order, check `expected_version` and `PENDING_PAYMENT`, store method, reference and confirming user, `lifecycle.transition(PAID)`, audit `PAYMENT_VERIFIED_MANUAL`.

### 10.4 Checklist (FR-05)
One transaction: lock the order `FOR UPDATE`, then:
1. Require `PAID` or `PREPARING`.
2. Require no `OPEN` address request (else `ADDRESS_REQUEST_PENDING`).
3. Require the request's `checklist_epoch` to equal the order's (else `CHECKLIST_RESET`).
4. **Permission:** `canPerformStep(actor, step, settings)` in `packages/shared`: Owner always; Admin only if the Owner has `admin_can_perform_staff_tasks` on; otherwise `checklist.steps_1_2` for steps 1 and 2, `checklist.steps_3_5` for steps 3 to 5. Refusal raises `STEP_NOT_PERMITTED`. The web app uses the same function to lock the UI, and `/me` returns the allowed steps.
5. **Complete:** step n requires n-1 done and n not done; if n is 1, transition to `PREPARING`. **Undo:** only the highest completed step, only if the actor may act on it; if it is step 1, transition to `PAID`.
6. Audit the action. The response includes progress (`completed_count` of 5) for the live progress display.

### 10.5 Dispatch (FR-06)
```
BEGIN
  idempotency check
  SELECT * FROM orders WHERE id = $1 FOR UPDATE
  version = expected_version ? else 409 VERSION_CONFLICT
  lifecycle = PREPARING ?      else INVALID_LIFECYCLE / ALREADY_DISPATCHED
  five steps complete ?        else CHECKLIST_INCOMPLETE
  no OPEN address_change_request ? else ADDRESS_REQUEST_PENDING
  tracking = trim(input) matches ^[A-Za-z0-9-]{6,30}$ ? else INVALID_TRACKING
  INSERT INTO dispatches (...)               -- DB trigger re-checks lifecycle, checklist, open request
  lifecycle.transition(DISPATCHED, dispatched_at = now())
  audit ORDER_DISPATCHED
COMMIT
```
No network call, so no lock is held across I/O. A unique index makes a second succeeded dispatch impossible even if two requests race.

### 10.6 Delivery and cancel (FR-08, FR-09)
Same pattern: lock, version check, lifecycle check, `lifecycle.transition`, audit. Delivery is idempotent on repeat. Cancel requires a reason and refuses `DISPATCHED` and later. In the same transaction it sets any `OPEN` address request to `VOID` (the trigger clears the flag) and audits `ADDRESS_CHANGE_VOIDED`.

### 10.7 Idempotency helper
`runIdempotent({scope, endpoint, requestId, payload}, fn)`: inside the command's transaction, `INSERT ... ON CONFLICT DO NOTHING` into `idempotency_keys`. If the row already exists: same `payload_hash` returns the stored response; a different hash raises `IDEMPOTENCY_CONFLICT` (409). On success the response is stored in the same transaction.

### 10.8 Offline (FR-07)
**Client** (staff, Admin, Owner only):
- `connectivity`: pings `GET /health` every 15 s with a 3 s timeout; offline after two consecutive failures or `navigator.onLine === false`.
- `cache`: IndexedDB, most recent 200 visible orders; no phone or email; address only when the user holds `order.address.read`; stamped with `synced_at`; cleared on sign-out and after 12 hours. The service worker caches only the static app shell, never API responses.
- `queue`: persistent FIFO of `{request_id, type, order_id, checklist_epoch, payload, client_occurred_at}` in its **own IndexedDB store** (`orderflow-offline-queue`, via `idb-keyval`), never in the persisted query cache; types `CHECKLIST_COMPLETE`, `CHECKLIST_UNDO`, `DISPATCH`. Cleared on sign-out after a final sync attempt; items that cannot be sent are reported to the user.
- **Proactive lock (UI):** while offline the Dispatch control is rendered disabled. When the 5th step is completed offline, or an order with five complete steps is open while offline, the view shows above the disabled button: "Offline — No dispatch available at the moment. Hold parcel until internet is restored." A `DISPATCH` item can be enqueued only when the user is Owner or Admin, the last known override is on, and the local checklist is complete. In that case the button is enabled and the banner "Offline dispatch override is ON…" is shown.
- `sync`: when online, sends the queue in order and removes items by result.

**Server `POST /offline-sync`:** for each item, in its own transaction, call the same service as the online endpoint with `fromOfflineQueue = true`:
- Skip the stale `expected_version`; validate by state, including step permission, the open-address-request rule and `checklist_epoch` equality (mismatch: `REJECTED: CHECKLIST_RESET`, and the client reloads that order and drops its cached copy).
- `DISPATCH` additionally requires that the actor **currently** holds the Owner or Admin role **and** `allow_offline_dispatch_override = true` now; otherwise `REJECTED: OFFLINE_DISPATCH_NOT_AUTHORIZED`. A staff user's queue item is rejected whatever the setting says. The dispatch row has `is_offline = true` and `client_occurred_at`; `dispatched_at` is server time.
- On any rejection write `OFFLINE_ACTION_REJECTED` (type, order, code, no PII) and return the item as `REJECTED`.
- Replays of an already applied `request_id` return `ALREADY_APPLIED`.

**Switches:** `PATCH /settings/offline-dispatch-override` and `PATCH /settings/admin-staff-mode` both require `settings.owner` (Owner only) and a reason. Both write `SETTING_CHANGED` with old value, new value and reason in the same transaction; both are online-only by nature.

### 10.9 Reports (FR-12)
**Path:** browser → `GET /api/v1/reports/...` on the API → `requirePermission('report.view')` → the API calls `ANALYTICS_URL` on the compose network with header `X-Internal-Secret: <INTERNAL_SERVICE_SECRET>` and a correlation id → analytics verifies the secret in constant time (else 401) → runs SQL as `orderflow_ro` against the reporting views → JSON back through the API. Analytics publishes no host port and has no CORS; the API never forwards the browser's cookies.

**Dispatch performance** (all bounds are Karachi local-day starts converted to UTC, half-open):
- `population` = `report_orders_v` rows not cancelled with `payment_verified_at` or `dispatched_at` in `[from, to)`.
- `dispatched_count` = rows with `dispatched_at` in range; `delivered_count` = rows with `delivered_at` in range.
- `included` = population rows with both timestamps and `dispatched_at >= payment_verified_at`; average, median (`percentile_cont(0.5)`), min and max over `included`.
- `excluded_missing_timestamps_count` = population − included, returned with `{ not_yet_dispatched, negative_duration }`.
- `offline_dispatch_count` from `report_dispatches_v.is_offline`.
- `verified_sales_pkr` = sum of totals, and `units_sold` = sum of quantities from `report_order_items_v`, for non-cancelled rows with `payment_verified_at` in range.
- Buckets use `date_trunc('day'|'week'|'month', ts AT TIME ZONE 'Asia/Karachi')`; Postgres weeks start Monday (D-31).
- Empty population: counts 0, averages `null`, rendered "N/A".

**Refund applicants** from `report_refunds_v`.

### 10.10 Health (FR-14)
`GET /health` runs `SELECT 1`. `GET /admin/health` returns database state, last payment event time, rejected events in 24 hours, unreviewed offline issues, open address requests, failed emails in 24 hours, override and staff-mode state, and adapter modes.

### 10.11 Address change request (FR-04)
- **Create** (`POST /my/address-change-requests`, customer): one transaction. `SELECT ... FROM orders WHERE order_number = $1 AND customer_user_id = $actor FOR UPDATE` (else 404); require lifecycle `PENDING_PAYMENT`, `PAID` or `PREPARING` and `now() < created_at + address_change_window_hours` (else `ADDRESS_REQUEST_WINDOW_CLOSED`; the BEFORE INSERT trigger repeats this check); insert the request (the partial unique index turns a second open request into `ADDRESS_REQUEST_EXISTS`); the trigger sets the flag; audit `ADDRESS_CHANGE_REQUESTED` (no address). Because the row lock is shared with checklist and dispatch, a concurrent checklist action either commits first or sees the open request and fails.
- **Apply** (staff, `order.address.update`): lock order, check `expected_version`, lifecycle before dispatch, an `OPEN` request with that id (else `NO_OPEN_ADDRESS_REQUEST`). Then: insert the current address into `order_address_revisions`; set the address to `proposed_address` unchanged; mark the request `APPLIED`; if any checklist step is completed, set all five to not completed, increase `checklist_epoch` by 1, audit `CHECKLIST_RESET` with the step numbers that were done, and if the order is `PREPARING` call `lifecycle.transition(PAID)`; `lifecycle` bumps the version; audit `ADDRESS_CHANGE_APPLIED` (fact only).
- **Decline:** lock, mark `DECLINED` with a reason; the trigger clears the flag; audit; checklist untouched.
- **Void:** done by cancel (10.6).
- The orders table has no other path that writes the address column besides order creation and apply. A grant test and a repository test assert this.

### 10.12 Product images (FR-01)
`POST /admin/products/:id/images` (`products.manage`), multipart, mounted **instead of** `express.json` on that route only.
1. Streaming parser with limits: 5 MB per file, 5 files per request, no other fields beyond the product id in the path.
2. Read the first bytes and accept only JPEG, PNG or WebP signatures; ignore the declared type and the file name.
3. Count the product's active images (max 10).
4. With `sharp` (once approved) decode and re-encode to strip metadata; otherwise store as uploaded.
5. Write to `UPLOAD_DIR/products/<uuid>.<ext>` (path built only from the generated UUID); insert `product_images`; audit `PRODUCT_IMAGE_ADDED` (ids and sizes only).
6. If the database insert fails, remove the file just written. Failures return `IMAGE_TOO_LARGE` (413) or `UNSUPPORTED_IMAGE_TYPE` (415).
Serving: static route `/uploads/products/*` read only, `X-Content-Type-Options: nosniff`, content type from the extension map, no directory listing, no execution. Deactivating an image sets `is_active = false`; files are never deleted by the app.

### 10.13 Email (FR-01)
**Single insert (fix):** the `email_outbox` row is inserted exactly once, inside the order transaction (10.1), with the rendered subject and text and `status = STORED`. `EmailAdapter.deliver(outboxId)` runs after commit and only **updates** that row: `MockEmailAdapter` does nothing further (the stored row is the inspectable email); a future `SmtpEmailAdapter` would send it and set `SENT`. On failure the row becomes `FAILED` with an error code and audit `ORDER_CONFIRMATION_EMAIL_FAILED` is written. No code path inserts a second row for the same order.

The body is built by a template function from the order number, the tracking link `PUBLIC_BASE_URL/track?order=<n>&token=<t>`, and the recipient name; it never includes address, phone or item prices. The `/track` page sets `Referrer-Policy: no-referrer`. Owner/Admin read the outbox at `GET /admin/email-outbox` and in Admin & Health. No retry in Phase 1; a real SMTP adapter in Phase 2 needs a retry mechanism.

### 10.14 Customer reads (FR-01)
`GET /my/orders` and `GET /my/orders/:orderNumber` use a dedicated repository method whose SQL always includes `WHERE customer_user_id = $actor`. The response type is a separate DTO: order number, items, totals, status, the five timestamps, tracking number if dispatched, own address, address request state. It has no fields for notes, checklist, audit, payment reference, staff identities or other customers. A foreign or unknown order number returns the same 404.

### 10.15 Stock holds (FR-15)
- `stock.isHeld(productId, now)`: a `PENDING` request with `expires_at > now`. No job ever updates rows on a timer.
- **Report:** lock the product `FOR UPDATE`; if a `PENDING` request exists and has lapsed, set it `EXPIRED` and audit; if one is still active, return `STOCK_REQUEST_EXISTS`; insert the new request with `expires_at = now + stock_hold_hours`; audit.
- **Approve:** lock product and request; set `availability = OUT_OF_STOCK`, request `APPROVED`; audit. **Decline:** request `DECLINED` with note; audit. Reviewing a lapsed request is allowed and records its real decision.
- Storefront and cart read `availability` plus `isHeld` to show "Out of stock" or "Checking availability, temporarily unavailable". The `FOR UPDATE` here and `FOR SHARE` in 10.1 serialize report and checkout.

### 10.16 Staff order scope and search (FR-03)
`staffOrderScope(actor)` returns the base SQL predicate for every staff read:
- Staff profiles: `lifecycle_status <> 'PENDING_PAYMENT' AND NOT has_pending_address_request` (and not `CANCELLED` unless they open a historic order they already worked).
- Owner/Admin: all orders.
Search adds one of: `order_number ILIKE $q || '%'`, `customer_name ILIKE '%' || $q || '%'`, `tracking_number = $q`, or `phone_normalized = normalize($q)` (only when the actor has `order.address.read`; separate rate limiter; the value is excluded from logs). `payment_status` is derived: `Awaiting payment` (`PENDING_PAYMENT`, no rejected event), `Payment issue` (in `PAYMENT_ISSUE`), else `Verified` with `payment_method` or "gateway". Progress is `count(completed)` from `checklist_steps`. A detail read with an id outside the scope returns 404.

### 10.17 Payment issues (FR-03)
`PAYMENT_ISSUE` = (a) `PENDING_PAYMENT` with latest event `REJECTED`, or (b) any `REJECTED` event with reason `ORDER_NOT_PAYABLE` and `reviewed_at IS NULL`. `POST /admin/payment-events/:id/review` sets `reviewed_by`/`reviewed_at` once and audits.

---

## 11. Ports

```ts
interface PaymentAdapter {
  readonly provider: string;                                   // 'mock'
  verifyAndParse(rawBody: Buffer, headers: Headers): ParsedPaymentEvent; // throws InvalidSignatureError
  checkoutRedirect(order: { orderNumber: string }): string;    // '/pay/<orderNumber>' for the mock
}
type ParsedPaymentEvent = { eventId: string; orderNumber: string; amount: string; currency: string; occurredAt: string };

interface EmailAdapter {
  readonly provider: string;                                   // 'mock'
  send(email: OutgoingEmail): Promise<{ status: 'STORED' | 'SENT' }>; // throws EmailSendError
}
type OutgoingEmail = { orderId: string; to: string; subject: string; text: string };
```
Neither interface has a refund, payout, transfer, bulk-send or attachment method; do not add one. A future `PayFastAdapter` and `SmtpEmailAdapter` implement the same interfaces; core code does not change.

---

## 12. Authentication and authorization
- OIDC authorization-code flow through an issuer adapter; `jose` verifies ID tokens; a secure HTTP-only cookie holds the session id; state-changing requests need the CSRF token header for every role.
- **Unauthenticated routes only:** `/health`, `GET /storefront/products`, `GET /uploads/products/*`, `GET /storefront/orders/:orderNumber?token=`, and the payment webhook. `POST /orders` and everything else need a session.
- **Provisioning:** an unknown subject signing in is created as a `customer` with name and email from the claims. Staff roles are never created by sign-in. `users.manage` refuses to put `customer` on a staff account or a staff role on a customer account (service rule plus a test).
- **Authorization** is by permission key per route through `requirePermission`; every route has a per-role test. Customer routes require a customer key and the query-level owner filter. A customer calling a staff route gets 403.
- Owner-only rules (Owner role grant, offline-dispatch override, Admin staff-mode) are enforced in the service, not just the route. The Admin staff-mode rule is enforced by `canPerformStep`.
- The seeded demo staff users move to `staff_full`.

---

## 13. API conventions
Base `/api/v1`. JSON. Money as decimal strings. Errors `{ error: { code, message, correlation_id } }`. Paged lists. `request_id` and, where PRD 8 says so, `expected_version` in the body. Status codes: 200, 201, 400, 401, 403, 404, 409, 413, 415, 429, 503. JSON body limit 100 KB, never raised; the single multipart route has its own limits. OpenAPI is updated before endpoint code; shared types are generated from it.

---

## 14. Security and privacy
HMAC over the raw body with constant-time compare; server-side pricing; unguessable public token; per-IP and per-user rate limits (order creation, tracking, bad signatures); `helmet`; CORS limited to `WEB_ORIGIN`; CSRF token on all writes; Zod on every input; customer isolation in the SQL; upload hardening (10.12); no PII, tokens or secrets in logs or audit (per-event allowlist, `pino` redaction); PII only in `orders`, `address_change_requests`, `order_address_revisions`, `email_outbox` (no address) and the opt-in offline address cache; the analytics role cannot read PII; no card data anywhere; secrets only in environment variables with a placeholder `.env.example`.

---

## 15. Non-functional targets and observability
Queue API p95 under 1 s and first render under 3 s with 100 seeded orders (measured and recorded). Structured logs with a correlation id per request. Health endpoints as 10.10. Tests run against real PostgreSQL in Docker.

---

## 16. Deployment

`docker compose up --build` starts `postgres`, `migrate`, `api`, `analytics`, `mock-oidc`, `web`, with volumes `pgdata` and `uploads` (mounted at `/uploads` in `api`). `migrate` runs `prisma migrate deploy` (never `db push`) then `grants.sql`. Services that connect as the app role must **not** inherit an owner URL from a shared `.env` (a previous bug: `DATABASE_URL_OWNER=localhost` overrode the container value and broke seeding). Compose sets `DATABASE_URL` and, for seed/reset, `DATABASE_URL_OWNER` per service; scripts read only `DATABASE_URL_OWNER`. The `analytics` service publishes **no host port**; only `api` reaches it on the compose network.

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_OWNER`, `DATABASE_URL_READONLY` | App, owner and read-only connections |
| `PAYMENT_ADAPTER` | `mock` (only value implemented) |
| `PAYMENT_WEBHOOK_SECRET` | HMAC secret for payment events |
| `EMAIL_ADAPTER` | `mock` (only value implemented) |
| `PUBLIC_BASE_URL` | Base of the tracking link in emails |
| `UPLOAD_DIR`, `UPLOAD_MAX_BYTES` | `/uploads`, `5242880` |
| `OIDC_*`, `SESSION_SECRET`, `WEB_ORIGIN`, `BOOTSTRAP_OWNER_SUBJECT` | Sign-in and CORS |
| `INTERNAL_SERVICE_SECRET`, `ANALYTICS_URL` | API to analytics |
| `REPORT_TZ` | `Asia/Karachi` |
| `ALLOW_DESTRUCTIVE_SEED` | Must be `true` to seed or reset |

Production limits are stated in the README: no HA, no backup certification, mock payment and mock email only, uploads on a single local volume.

---

## 17. Architecture Decision Records

Old ADR-001 to ADR-009 described Shopify behaviour. They are kept as history and marked **Superseded by architecture v4.3** except where stated.

| New ADR | Decision | Replaces |
|---|---|---|
| ADR-010 | Standalone store: OrderFlow owns orders and prices; the server computes totals | Shopify as source of truth |
| ADR-011 | `PaymentAdapter` port, mock now, HMAC-verified events, synchronous application, manual confirmation path | Shopify eligibility and webhook inbox |
| ADR-012 | Atomic internal dispatch; no pending state | Old dispatch attempt and reconcile design |
| ADR-013 | Offline queue with server-decided sync; offline dispatch only for Owner/Admin and only with the Owner override; proactive UI lock | "No offline" non-goal |
| ADR-014 | Database-enforced integrity: full lifecycle graph, set-once, append-only, dispatch precondition trigger, address-request triggers, role grants | Partial triggers in v2.1 |
| ADR-015 | Web-only client, plain CSS, MVC | Native app |
| ADR-016 | Idempotency table plus `expected_version` on lifecycle commands | Per-endpoint ad hoc handling |
| ADR-017 | Customer accounts through the same OIDC flow; `customer` role; query-level isolation; staff and customer roles cannot share an account | Anonymous customers |
| ADR-018 | Step-level checklist permissions (`staff_picker_packer`, `staff_inspector`, `staff_full`) and the Admin staff-mode setting, one shared `canPerformStep` rule | Single `checklist.update` key |
| ADR-019 | Local-volume product photos with content-signature checks and server-generated names | Cloud storage |
| ADR-020 | `EmailAdapter` with a mock outbox; best-effort send after commit | Direct SMTP |
| ADR-021 | Address changes only by applying a customer's open request; dispatch and checklist blocked while one is open; Apply resets the checklist | Free-form address override |
| ADR-022 | Staff stock holds with time-based expiry evaluated on read, no job | Stock counts or a scheduler |
| ADR-023 | `checklist_epoch` to invalidate checklist actions made before a reset | Comparing device timestamps |
| ADR-024 | Analytics behind the API with an internal secret, reading only `security_barrier` views as `orderflow_ro` | Browser-facing analytics service |
| Kept | OIDC with an issuer adapter and secure cookie session (old ADR-003); hexagonal ports; analytics isolation (old ADR-001) | |

Each new ADR gets a file in `docs/adr/` with context, decision, alternatives and consequences before its slice starts.

---

## 18. Traceability

| PRD | Architecture |
|---|---|
| FR-01 | 8.1, 10.1, 10.12, 10.13, 10.14, 11, 12 |
| FR-02 | 10.2, 10.3, 11 |
| FR-03, FR-04 | 6, 7, 8.3, 10.11 |
| FR-05 | 10.4, 12 |
| FR-06 | 8.3, 10.5 |
| FR-07 | 10.8 |
| FR-08, FR-09 | 10.6 |
| FR-10, FR-13 | 6 (audit), 8.3 (append-only) |
| FR-11 | 8.1 |
| FR-12 | 10.9 |
| FR-14 | 10.10 |
| FR-15 | 8.3, 10.15 |
| TA Req #1, #2, #3 | 10.16, 10.4, 10.9 |
| NFR-04 | 12, 14 |

---

## 19. Demo limitations and open items
- Payment and email are simulated; the demo says so on screen. PayFast and SMTP are Phase 2 (SMTP needs a retry mechanism).
- Offline and image packages were approved on 26 Nov 2026 (section 4).
- Decisions D-01 to D-38 are recorded in PRD section 16.
- Migration `0003` needs human approval before merge (8.6).

---

## 20. Consistency checks (performed on this version)
1. Every table, endpoint and permission named in the PRD appears here, and nothing here is absent from the PRD.
2. The lifecycle graph is identical in PRD 6, architecture 8.3 and the shared package.
3. No Shopify, native, worker, `DISPATCH_PENDING`, `webhook_inbox` or reconcile concept remains outside the history and "removed" lists.
4. Every command that mutates data uses the idempotency helper and a transaction.
5. No design relies on a package outside the approved list without the approval note.
6. No path other than checkout and apply-request writes the order address.
7. Customer-facing code cannot read a staff-only field: separate repository method and DTO.
8. Every staff read goes through `staffOrderScope`; no other query lists orders for staff.
9. `email_outbox` has exactly one insert site.
10. `orderflow_ro` has grants on views only.

---

## 21. Change control and history

| Version | Date | Change |
|---|---|---|
| 2.1 | 23 Nov 2026 | Shopify and native edition |
| 4.0 draft | 25 Nov 2026 | Unreviewed pivot draft (withdrawn) |
| 4.1 | 25 Nov 2026 | Standalone web edition aligned to PRD v4.1 |
| 4.2 | 26 Nov 2026 | Customer accounts, step-level staff profiles and Admin staff-mode, product photo upload, `EmailAdapter`, address request flow, offline proactive lock and Owner/Admin-only offline dispatch |
| 4.3 | 26 Nov 2026 | Gate 1 review: package approvals, timestamp CHECKs, checklist epoch, address window and reset, stock holds, staff scope and phone search, payment issues, report definition and analytics proxy with reporting views, single-insert email outbox, Owner-only staff-mode |
