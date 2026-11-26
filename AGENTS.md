# AGENTS.md: OrderFlow AI

**Version:** 4.4 | **Date:** 26 November 2026 | **Aligned to:** PRD v4.4 and `docs/architecture.md` v4.4 | **Supersedes:** AGENTS.md v4.3, v4.2, v4.1, v2.1 and the unreviewed "v4.0" draft

Instructions for any AI coding agent (Claude Code, Cursor, Codex, Antigravity or similar) working in this repository. Read this file fully, then the parts of the PRD and `docs/architecture.md` your task touches, before every task. Human developers treat it as the team's working agreement with the agent.

---

## 1. Project in one paragraph

OrderFlow AI is a standalone web system for Hannan's decoration-piece business in Pakistan. Customers sign in, order from OrderFlow's own storefront, and follow their own orders; payment is verified by a signed payment event (a mock adapter in the demo) or manually by an Owner/Admin; verified orders enter the staff queue, go through a five-step packing checklist worked by three staff profiles (steps 1 to 2, steps 3 to 5, or all five), are dispatched exactly once with a tracking number, and are marked delivered. A customer who gave a wrong address files a request within 4 hours that an Owner/Admin applies (resetting the checklist) or declines before dispatch. Staff can report a product out of stock, which holds it from new orders until an Owner/Admin decides. Admin/Owner manage products and upload photos. Refund applications are tracked by hand and no money moves. Two reports run in a separate read-only analytics service. Staff can view orders and work the checklist offline; dispatch offline is possible only for Owner/Admin and only when the Owner switches on an override. **OrderFlow is the source of truth for everything it stores.** There is no Shopify, no native app and no background worker.

---

## 2. Document precedence

1. `PRD.md` v4.4
2. `docs/architecture.md` (ADR-010 to ADR-016 and the kept decisions)
3. `api-spec/openapi.yaml`
4. This file
5. Everything else

If two documents disagree, follow the higher one, **stop**, and write the conflict to `docs/proposed-changes.md` (reason, affected sections, options). Do not pick a side silently. Any text about Shopify, native apps, `DISPATCH_PENDING`, `webhook_inbox`, reconcile or the "no offline" rule is superseded; never implement it.

---

## 3. Scope

### 3.1 In scope
Everything in PRD sections 4, 5 and 10. The **vertical slices are defined by the human planner in `plan.md`**. Agents never invent, merge, split or reorder slices.

### 3.2 Out of scope: refuse and ask
Do not start any of these without an explicit human instruction recorded in `plan.md`:
- Shopify code, columns, routes, fixtures or wording; a native or Expo app
- A live payment gateway (PayFast is Phase 2), card data of any kind, Cash on Delivery, partial or split payments
- Automated refunds, refund calculations, payouts, transfers, any money movement, a `REFUNDED` status
- Courier integration, courier accounts or webhooks
- Inventory counts, stock reservation, discount codes, password handling inside OrderFlow, customer self-cancellation, customer-side refund submission, customer editing of an order after it is placed
- Editing prices, totals, line items or quantities after an order exists
- Dispatch undo, delivery undo, partial dispatch
- Background workers, queues or retry daemons (including automatic email retry)
- Free-form address editing by anyone; cloud object storage; a real SMTP adapter
- Chatbots, support queues, generative-AI features
- Multi-store or multi-tenant support; production hosting, HA, backup certification

If a request touches this list, reply with what is out of scope and ask for explicit confirmation.

---

## 4. Technology and dependencies

Fixed stack (architecture section 4): TypeScript strict; Node 22; Express; Zod; PostgreSQL 16; Prisma; `jose`; `pino`; `oidc-provider` (mock issuer); React 18 + Vite + React Router + TanStack Query; plain CSS; Vitest; Supertest; Playwright; Docker Compose; npm workspaces; ESLint 9; Prettier. Also approved: `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `pg` (analytics), `openapi-typescript`, `express-openapi-validator` (tests only), `tsx` (scripts and dev).

**Not approved, do not use:** Tailwind or any CSS framework, React 19, any Expo or React Native package, any Shopify package, any queue or worker library.

**Approved on 26 November 2026, to be installed only when their slice starts:**
- Slice 1D: `multer` **2.x only** (never 1.x) and `sharp`. `busboy` is not approved as a direct dependency.
- Slice 2C: `vite-plugin-pwa`, `idb-keyval`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`. The offline action queue uses its own IndexedDB store, never the persisted query cache.

**Dependency rule:** any package not listed needs human approval first. Your request states purpose, alternatives considered, size and maintenance status. Pin versions through the lockfile.

---

## 5. Repository layout and file boundaries

Layout is architecture section 5. Do not invent top-level directories.

| Area | You may edit | You must NOT edit |
|---|---|---|
| `apps/api/src/**`, `apps/analytics/**`, `apps/web/**`, `apps/mock-oidc/**`, `packages/shared/**` | Yes, within your slice | Code outside your slice's scope |
| `apps/api/prisma/**` | Schema and new migrations (section 8) | Any already-merged migration file |
| `api-spec/openapi.yaml` | Yes, before the endpoint code | n/a |
| `fixtures/**`, `scripts/**` | Yes | n/a |
| `docs/proposed-changes.md`, `docs/evidence/**` | Append only | Rewriting or deleting past entries |
| `README.md`, `plan.md` | Only the parts your slice instructs | Plan decisions (Accept, Revise, Reject) are human-only |
| `PRD.md`, `docs/architecture.md`, `docs/adr/**`, `AGENTS.md` | **Never** | Read-only for agents |
| `.env`, any real secret | **Never** read, write or print | All |

Module and layer rules (architecture section 6):
1. Routes in `src/http/**` parse, validate, authenticate, authorize, call one service and format the response. No business rules, no Prisma.
2. Cross-module access goes through the other module's `index.ts` only.
3. **Only the `lifecycle` module writes** `lifecycle_status`, `order_version`, `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `cancelled_at`.
4. Only `audit` inserts into `audit_events`, inside the caller's transaction. No UPDATE or DELETE on `audit_events`, `order_notes` or `order_address_revisions`, ever.
5. Payment adapter code stays inside `apps/api/src/integrations/payment/` and email adapter code inside `apps/api/src/integrations/email/`. Domain code uses `ParsedPaymentEvent` and `OutgoingEmail`.
6. Clients only call the API. They never touch the database. Only `apps/web/src/offline/**` may use IndexedDB.
7. Mock payment routes exist only when `PAYMENT_ADAPTER=mock`.
8. Services receive a transaction handle and never open nested transactions.
9. **Customer reads live only in the `customers` module**, always filter `customer_user_id = actor` in the SQL, and return a dedicated DTO. Never reuse a staff query or staff DTO for a customer route.
10. The order address column is written only by order creation and by applying an address change request. Nothing else may write it.
11. File upload code lives only in the `products` module.
12. Checklist step permission is decided only by `canPerformStep` in `packages/shared`; the API and the UI both call it.
13. Every staff read of orders (list, search, detail) goes through `staffOrderScope(actor)`. Never write a second staff order query.
14. Stock-hold logic lives only in the `stock` module; order creation asks it.
15. The API `reports` module only checks `report.view` and forwards to analytics with the internal secret. Report SQL lives only in `apps/analytics`.
16. `email_outbox` is inserted in exactly one place, inside the order transaction.

---

## 6. Non-negotiable behaviours

Details live in the PRD and `docs/architecture.md`. These are the rules agents break most often.

**Order creation and customers (PRD FR-01)**
- A session is required to create an order. Anonymous `POST /orders` returns 401. Customers need `customer.order.create`; manual orders need `orders.create`.
- The client never supplies a price or total. The server reads product prices, builds the snapshot lines and computes the total with `Prisma.Decimal`.
- Creation is rate limited per user. The public token is generated server-side, never logged, and goes to the customer only in the confirmation email; the status link shows no address or phone.
- `/my/orders` returns only orders with `customer_user_id` equal to the signed-in user; a foreign or unknown order is 404. A customer account never holds a staff role and a staff account never holds `customer`.
- First sign-in creates a `customer` only. Never auto-assign a staff role.
- A customer edits the address only on the checkout form before submitting. After that there is no customer edit endpoint.

**Payment (FR-02, architecture 10.2 and 10.3)**
- Verify the HMAC on the **raw body** with `crypto.timingSafeEqual`. The webhook route uses `express.raw`, mounted before the global JSON parser.
- Deduplicate with `INSERT ... ON CONFLICT DO NOTHING` on `(provider, provider_event_id)`. A repeated event has no second effect.
- Apply the event inside the request in one transaction. Amount must equal the total exactly (decimal compare) and currency must be `PKR`; otherwise store `REJECTED` with a reason and leave the order `PENDING_PAYMENT`.
- Only a verified event or a user with `payment.confirm` can make an order `PAID`. Staff cannot. Staff never see `PENDING_PAYMENT` orders.
- The payment adapter interface has no refund, payout or transfer method. Do not add one.

**Dispatch (FR-06, architecture 10.5)**
- One transaction: lock the order row `FOR UPDATE`, check `expected_version`, lifecycle `PREPARING`, five steps complete, no open address change request, tracking matches `^[A-Za-z0-9-]{6,30}$` after trimming, no succeeded dispatch yet; then insert the dispatch, set `dispatched_at` from the server clock, transition to `DISPATCHED`, bump the version, write the audit event.
- Same `request_id` and payload returns the stored result; same `request_id` with a different payload returns 409.
- There is no dispatch undo.

**Lifecycle**
- Only the transitions in PRD section 6 exist. Every transition and its audit event commit in one transaction. The database trigger enforces the same graph; a test asserts the shared package graph and the trigger graph match.
- `order_version` increments only on lifecycle transitions and address corrections.
- `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `order_number`, `public_token` are set once. Triggers enforce it; your code must too.

**Checklist (FR-05):** strictly in order, undo only the latest step, undo of step 1 returns the order to `PAID`, read-only after dispatch. Order and permission are enforced under the row lock.
- Steps 1 to 2 need `checklist.steps_1_2` (`staff_picker_packer`, `staff_full`, Owner). Steps 3 to 5 need `checklist.steps_3_5` (`staff_inspector`, `staff_full`, Owner). Undo needs permission for the step being undone. A refusal is `STEP_NOT_PERMITTED`.
- Admin holds those keys only while `system_settings.admin_can_perform_staff_tasks` is true (default false). **Only the Owner** changes it, online, with a reason, audited. Do not create an Admin role variant to bypass this.
- Every checklist action carries `checklist_epoch`; a mismatch is `CHECKLIST_RESET`. While an address request is open, every checklist action is `ADDRESS_REQUEST_PENDING`.
- Show live progress "N of 5 complete" in the checklist header and the queue row.
- The checklist screen is one Checklist section with five numbered collapsible steps; only the next open step is actionable; only the latest completed step shows Undo.

**Address change requests (FR-04)**
- A customer submits a proposed address for an own pre-dispatch order; one open request per order. Submitting sets `has_pending_address_request` through the database trigger, never in application code, and audits without the address.
- Requests are accepted only within `address_change_window_hours` (default 4) of order creation and before dispatch; the database trigger checks it too. The window limits submitting only.
- While a request is open the order is hidden from staff queues and search (through `staffOrderScope`), not only flagged.
- Owner/Admin (`order.address.update`) may only apply the request exactly as proposed, or decline it with a reason. The previous address goes to `order_address_revisions`. Applying bumps `order_version`; if any step was done it also resets all five steps, moves `PREPARING` to `PAID`, increases `checklist_epoch` and audits `CHECKLIST_RESET`. The `order_number` never changes. Declining leaves the checklist untouched.
- Cancelling an order sets its open request to `VOID`.
- Dispatch is refused with `ADDRESS_REQUEST_PENDING` while a request is open, online and at offline sync.
- The Needs attention groups are exactly `PAYMENT_ISSUE`, `OFFLINE_CONFLICT`, `SLA_OVERDUE`, `ADDRESS_CHANGE_REQUEST`, `STOCK_ISSUE`. `PAYMENT_ISSUE` includes unreviewed payments for orders that were not payable.

**Product photos (FR-01)**
- Only `products.manage` may upload. Multipart only on `POST /admin/products/:id/images`; every JSON route keeps the 100 KB limit and it is never raised.
- Max 5 MB per image, 5 files per request, 10 active images per product. Accept JPEG, PNG and WebP by leading bytes only; ignore the declared type and the uploaded name. File names are server UUIDs; build paths only from them.
- Serve read only with `X-Content-Type-Options: nosniff`. Never delete files or rows; deactivate instead. Remove a file written if the database insert fails.
- The upload screen has two controls (camera with `capture`, gallery with `multiple`).

**Email (FR-01)**
- Send the confirmation after the order commits, through `EmailAdapter`. The body holds the order number, the tracking link and the recipient name only: never an address, phone or price. A failure never fails the order and is audited. No automatic retry. Mock mode stores to `email_outbox`, readable only with `system.manage`.



**Delivery and cancel (FR-08, FR-09):** delivery is permanent and idempotent; cancel needs a reason and is refused after dispatch.

**Offline (FR-07, architecture 10.8)**
- Offline is for staff, Admin and Owner. It allows viewing cached orders and queuing checklist actions the user's profile permits. Nothing else, except dispatch under the override rule below.
- **Proactive lock:** while offline the Dispatch button is disabled before any click. When the 5th checklist step is completed on an offline device (or an order with five complete steps is open while offline) show above the disabled button exactly: "Offline — No dispatch available at the moment. Hold parcel until internet is restored."
- **Offline dispatch is allowed only for Owner and Admin, and only while `allow_offline_dispatch_override` is true.** Regular staff, including staff with `cap_dispatch`, never dispatch offline; they can dispatch online. The server enforces this at sync time: the actor must currently be Owner or Admin and the override must be on at that moment, and the server ignores any client claim or queue content.
- Only `settings.owner` (the Owner role) changes the override and `admin_can_perform_staff_tasks`, only online, with a reason, with an audit event. Admin cannot change either.
- Queue items carry the `checklist_epoch` they were made under and live in their own IndexedDB store.
- Server timestamps for offline work are the sync time. `client_occurred_at` is informational only and never used for set-once columns.
- The device cache never holds phone or email; address only for users with `order.address.read`; it is cleared on sign-out and after 12 hours; the service worker caches the app shell only, never API responses.
- A rejected offline item is returned to the user, written as `OFFLINE_ACTION_REJECTED` and listed under Admin & Health.

**Search (FR-03, TA Req #1)**
- Search fields: order number, customer name, tracking number, and phone as an **exact** match on `phone_normalized` only for users with `order.address.read`, online, rate limited. Never log the typed phone. Never search by address or email. Authorization is applied in the query before search.

**Stock holds (FR-15)**
- A hold is active only if the request is `PENDING` and `expires_at > now()`, evaluated when reading. Never add a timer, cron or worker to expire holds. A held or `OUT_OF_STOCK` product stays listed and is refused by `POST /orders` with `PRODUCT_UNAVAILABLE`. Report locks the product `FOR UPDATE`; order creation reads products `FOR SHARE`.

**Order price consent (FR-01)**
- `expected_total` is compared with the server total; a mismatch is 409 `PRICE_CHANGED`. It is never used as a price.

**Reports (FR-12, TA Req #3)**
- Use only server timestamps. Population, included and excluded sets exactly as architecture 10.9; always return `excluded_missing_timestamps_count` with its breakdown, even when 0. Karachi day boundaries, half-open ranges, Monday weeks.
- `apps/analytics` publishes no host port, checks the internal secret in constant time, connects as `orderflow_ro`, and reads only the reporting views.

**Refunds (FR-11)** are manual records only. The optional paid-outside record is set once, only after `APPROVED_MANUALLY`, at most the order total, and is always labelled "Recorded as paid outside OrderFlow". The mandatory label on every refund screen is "Manual refund application tracking. No payment is issued by OrderFlow."

**Money and time**
- Money is `NUMERIC(12,2)` and `Prisma.Decimal`; JSON amounts are decimal strings. Never `number`, `parseFloat` or float arithmetic for money.
- Store UTC `TIMESTAMPTZ`. Timestamps OrderFlow creates come from the server clock, never the client. Report days are `Asia/Karachi`.

**Audit and PII:** audit `details` use a per-event-type Zod allowlist; unknown keys are rejected. An address change audit records only the fact of the change. Previous addresses go in `order_address_revisions`.

---

## 7. Coding conventions

- TypeScript `strict: true`. No `any`, no `@ts-ignore`, no non-null `!` without a comment explaining why it is safe.
- Validate every external input with Zod at the boundary (HTTP bodies and queries, payment headers, environment variables, adapter output). Shared schemas live in `packages/shared`.
- Errors: typed `DomainError` with a stable `code`; one error mapper in `src/http/` produces the JSON error body. Never leak stack traces or SQL. Never swallow an error silently.
- Naming: files `kebab-case.ts`; types `PascalCase`; functions and variables `camelCase`; constants and enum values `UPPER_SNAKE_CASE`; DB columns `snake_case`; permission keys and API paths exactly as in the PRD and OpenAPI.
- Functions do one thing; keep files under about 300 lines; no circular imports.
- No `console.log` in application code. Use `pino` with correlation ids. Never log request bodies, payment events, addresses, names, emails, phone numbers, tokens or secrets. Scripts may print status lines.
- No placeholders: no `TODO`, `FIXME`, stub functions, fake data in production code or `throw new Error("not implemented")`. If something cannot be finished, say so in your report.
- Configuration comes from the typed config module. No hard-coded URLs, secrets or thresholds.
- Clients follow MVC (architecture 7): views contain no fetch calls and no business rules. Every server-dependent screen handles loading, synchronized, queued-offline, failed and stale states, shows status with text as well as colour, and works on a tablet or phone.
- Tests live beside the code (`*.test.ts`) or in `tests/`; fixtures in `fixtures/`.

---

## 8. API and database change protocol

1. **API first:** change `api-spec/openapi.yaml`, get it approved, then write the endpoint. Regenerate shared types. Contract tests must pass.
2. Errors carry a machine-readable `code`, a human message and a `correlation_id` (architecture 13).
3. **Database:** change `prisma/schema.prisma`, then create a migration. Constraints Prisma cannot express (triggers, partial unique indexes, grants) go in custom SQL in the same migration. Migrations are committed and reproducible. Never edit a merged migration; never run `prisma db push`.
4. Never weaken a constraint, trigger or grant listed in architecture 8.3 and 8.5.
5. Each migration is additive and created in the slice that first uses its tables (`plan.md` section 6). Never create tables or columns for a later slice. A migration that alters or drops existing data needs explicit human approval before merge.
6. Seed and reset scripts are destructive. They run only with `ALLOW_DESTRUCTIVE_SEED=true`, print their effect first, and connect with `DATABASE_URL_OWNER`. Never run them automatically. Never grant the app role DELETE or TRUNCATE.
7. Compose must set database URLs per service; a shared `.env` value must never override a container's database host.

---

## 9. Security rules

- Secrets only in environment variables; `.env.example` has placeholders only. Never commit a secret.
- Authorization is enforced in the API for every protected route. Every new endpoint needs a permission key and a test per role.
- Only the Owner role may grant or revoke the Owner role, and only the Owner role may change the offline-dispatch override. Both are enforced in the service. Customer isolation is enforced in the SQL, not only in the route.
- Sessions (all roles, customers included): secure HTTP-only cookie plus CSRF token on writes. Never `localStorage` for tokens.
- Unauthenticated routes are only `/health`, the product list, product photos, the token status link and the payment webhook. They are rate limited and size limited, and fail closed. Order creation is authenticated and rate limited per user.
- Zero PII or secrets in logs and audit. Customer contact data appears only in the order record, address request and revision tables, the confirmation email's recipient field, and (address only) the permitted offline cache; never in reports, search or logs.
- Uploaded files are untrusted: check content by leading bytes, limit size, name them yourself, serve with `nosniff`, never execute or list them.
- The analytics process connects as `orderflow_ro` only, reads only reporting views, accepts calls only with the internal service secret, and publishes no host port. Only the API calls it, after checking `report.view`.
- OrderFlow never stores, processes or transmits card data. Never invent credentials. Tests never call a real payment provider or identity provider.

---

## 10. Testing and quality gates

**Per slice:** unit tests for domain rules; integration tests for repositories and endpoints (Vitest, Supertest, real PostgreSQL in Docker); **SQL constraint tests** for every trigger, unique index, CHECK and grant (written in the slice that creates the object, then re-run at every gate); E2E smoke where the slice adds a principal workflow (Playwright). Use boundary tests: tracking length 5, 6, 30, 31 and bad punctuation; amounts; report date ranges; `order_version`.

**Mandatory scenarios** are PRD section 12 items 1 to 68. Each scenario has exactly one owning slice in `plan.md`. Each slice owns those in its scope and must have them passing before Accept.

**Quality gates:** 1 scope and plan; 2 design and tests; 3 implementation works end to end in mock mode; 4 verification (tests and slice-appropriate security and performance checks pass, evidence recorded); 5 acceptance (reviewer confirms requirements, docs, demo path, known limitations). A slice is complete only when criteria and evidence are recorded.

**Evidence:** append real results to `docs/evidence/test-evidence.md` (command, date, result) and the session summary to `docs/evidence/workflow-log.md`. Never fabricate a test result, a gate result or an acceptance decision. State plainly what was and was not verified.

**Performance:** with 100 seeded active orders, queue API p95 under 1 second locally and initial queue render under 3 seconds. Record environment details.

---

## 11. Workflow

### 11.1 Slices
Defined by the human planner in `plan.md`. Every slice is vertical: it cuts through UI, API, domain logic, persistence and tests, and ends in an outcome a named person can perform. There is no foundation slice and no hardening slice; the final check is Gate 5. A new slice may be added only by the human planner.

### 11.2 Slice loop
1. Ibrahim records scope and acceptance criteria.
2. Ihtesham checks architecture, data model and ADR alignment.
3. Ahmed prepares test cases and fixtures **before** implementation.
4. Taha implements backend; Ibrahim implements client UI in parallel against the agreed OpenAPI contract.
5. Ihtesham reviews conformance and documentation.
6. Ahmed runs the quality gates and logs evidence.
7. Ibrahim records Accept, Revise or Reject and updates `plan.md`.

Ownership: Ibrahim, planning, process and client UI; Ihtesham, architecture, documentation, Docker, scaffold, mock payment adapter, simulator and analytics; Taha, backend; Ahmed, QA. Each deliverable has one accountable owner. Do not touch another person's work outside the approved slice plan.

### 11.3 HITL and AFK
Each slice records its mode and reason in `plan.md`. If none is recorded, use **HITL**.
- **HITL (mandatory for authentication and customer data isolation, payment verification, dispatch behaviour, the offline override, file upload, address-change reset, stock holds, reports):** present a short plan (goal, files, interfaces, tests, risks), **wait for approval**, implement, then present a summary and test results and **wait for review before merge**.
- **AFK (allowed for scaffolding, UI screens, fixtures, tests, report UI):** implement from the recorded scope, then present for review. No merge without review.

Human tasks (installing tools, approving packages, running Docker, manual UI checks, accounts, secrets, recording decisions) belong to the human. List them at the end of each slice; do not do them for the human and do not mark them done.

### 11.4 Git
One branch per slice (`slice/<id>-<name>`); small focused commits; no direct commits to `main`; pull request reviewed and merged by a human; no force pushes or history rewriting; `plan.md` is the single master plan with an append-only change log.

### 11.5 UI
Propose wireframes first for each slice's screens and wait for approval recorded in `plan.md`. Screens: storefront (shop, sign-in, cart, checkout, pay, my orders, Help / Report Wrong Address, track); staff Orders split pane with the Needs attention groups and the numbered Checklist; Refund Applications; Reports; Admin & Health (users, products and photo upload, settings, email outbox, status, offline sync issues, demo tools in mock mode). Staff navigation has exactly four items.

Dispatch confirmation text (fixed): "Dispatch order #[order number]? This records the parcel as handed to the courier and cannot be undone in OrderFlow. Verify the parcel and tracking number before continuing."

---

## 12. Commands

These scripts must exist. Use exactly these names.

| Task | Command |
|---|---|
| Install | `npm install` |
| Start full stack | `docker compose up --build` |
| Stop | `docker compose down` |
| Migrate | `npm run db:migrate` |
| Seed demo data (destructive, guarded) | `npm run db:seed` |
| Reset demo data (destructive, guarded) | `npm run db:reset` |
| Simulate a payment event | `npm run payment:simulate -- --fixture <valid\|tampered\|mismatch\|wrong-currency\|duplicate> --order <OF-000001>` |
| Unit and integration tests | `npm test` |
| SQL constraint tests | `npm run test:sql` |
| Web E2E | `npm run test:e2e` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Format check | `npm run format:check` |

Before opening a pull request, `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm test` must pass.

---

## 13. When to stop and ask

Stop, state what you know, what you assume and the options (two or three, with a recommendation), and wait, when:
- A task would change a locked decision (L-01 to L-14), an ADR, the PRD or this file
- Two documents conflict, or a requirement is ambiguous in a way that changes behaviour
- You need a dependency outside section 4
- You need to touch code outside your slice
- The work would hit the out-of-scope list (section 3.2)
- A migration would alter existing data or weaken a constraint
- You are about to take any destructive or irreversible action

Do not stop for minor details that are cheap to change: take the safer option, say which one, and continue. Write documentation concerns to `docs/proposed-changes.md`.

---

## 14. Definition of done

- [ ] Plan or scope recorded; mode (HITL or AFK) recorded
- [ ] OpenAPI updated first if any endpoint changed
- [ ] Code stays within module and file boundaries (sections 5 and 7)
- [ ] Tests for the slice's mandatory scenarios written and passing, including SQL tests for any new constraint
- [ ] Lint, type check and format check clean
- [ ] No secrets, no PII in logs or audit, no out-of-scope features, no placeholders
- [ ] Migrations committed and reproducible
- [ ] Evidence appended; documentation concerns recorded
- [ ] Human tasks listed for the human
- [ ] Pull request opened from the slice branch
- [ ] Human has recorded Accept, Revise or Reject

---

## 15. Document history

| Version | Date | Change |
|---|---|---|
| 1.0 | Nov 2026 | Module-based rules (superseded) |
| 2.1 | 23 Nov 2026 | Shopify and native edition, self-audit fixes |
| 4.0 draft | 25 Nov 2026 | Unreviewed pivot draft (withdrawn: lost most rules) |
| 4.1 | 25 Nov 2026 | Standalone web edition: all v2.1 rules kept where they still apply, Shopify and native removed, payment, offline and override rules added |
| 4.2 | 26 Nov 2026 | Customer accounts and isolation rules; step-level staff profiles and Admin staff-mode; address request rules; product photo and email rules; offline proactive lock and Owner/Admin-only offline dispatch; new pending packages |
| 4.3 | 26 Nov 2026 | Gate 1 review: package approvals recorded, search and staff scope rules, checklist epoch and address reset, stock-hold rules without jobs, price consent, report and analytics rules, single-insert email outbox, Owner-only staff-mode, five Needs attention groups, scenarios 1 to 68 |
| 4.4 | 26 Nov 2026 | Vertical slices: per-slice additive migrations, package slices renamed (1D, 2C), slice rule restated, no foundation or hardening slice |