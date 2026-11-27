# plan.md: OrderFlow AI master plan

**Plan version:** v03.1 | **Date:** 26 November 2026 | **Aligned to:** PRD v4.4, `docs/architecture.md` v4.4, `AGENTS.md` v4.4
**Status:** **Gate 1 pending.** No slice may start until the Gate 1 sign-off in section 9 is recorded by a human.
**History:** v01 (Shopify and native edition) and v02 (seven slices, one up-front migration) are in the git history; the earlier prototype code is on branch `legacy/s1-prototype`.

This is the single master plan. Agents may update only the parts a slice instructs; decisions (Accept, Revise, Reject) and sign-offs are human-only (AGENTS 5 and 11). The change log (section 11) is append-only.

---

## 1. Team and ownership

Work is distributed by **end-to-end vertical slice** rather than horizontal technical layers, so every team member owns complete user-visible capabilities (UI, API, database, tests, quality gates and evidence) for their assigned slices.

| Member | Primary vertical slices | End-to-end scope and accountabilities |
| :--- | :--- | :--- |
| **Ibrahim** | **1A, 1B, 1C, 1E** (sign-in, auth and RBAC; storefront, checkout and My orders; confirmation email, outbox and status link; staff queue, manual orders and search) + **Overall Process Lead** | Owns Gate 1 sign-off, `plan.md` history, Workflow Evidence Log governance, and end-to-end delivery (UI, API, schema and triggers, test cases, Gate 2 to 4 checks) for these slices |
| **Ihtesham** | **1D, 1F, 5B, 5C** (catalogue and photo upload; payment verification, mock gateway and webhook, manual confirmation; analytics and reporting views; users, roles and Admin & Health) | Owns end-to-end delivery (UI, API, mock adapters, database constraints and views, test cases, Gate 2 to 4 checks) for these slices, plus Docker and scaffold maintenance and ADRs |
| **Taha** | **2A, 2C, 3** (five-step parcel preparation checklist, concurrent lock and epoch guard, Admin staff-mode switch; offline mode and Owner override; stock availability requests) | Owns end-to-end delivery (UI, API, migrations and triggers, test cases, Gate 2 to 4 checks) for these slices |
| **Ahmed** | **2B, 4A, 4B, 5A** (idempotent dispatch, courier tracking, delivery confirmation; customer address-change request flow; cancellation and Needs attention; refund applications) + **Gate 5 final check** | Owns end-to-end delivery (UI, API, migrations and triggers, test cases, Gate 2 to 4 checks) for these slices, plus the final Gate 5 end-to-end validation |

### Governance rules
- **Single accountable owner per slice:** each vertical slice has one accountable owner responsible for defining and approving its test cases before implementation, running the Gate 2 to 4 checks, recording the human Accept, Revise or Reject decision, and updating `plan.md` and the Workflow Evidence Log.
- **Cross-project knowledge:** every member reviews merged pull requests across slices and must be able to explain and defend the complete architecture, plan and key trade-offs during the final evaluation.
- **AI agent boundary:** the AI agent implements code, proposes test cases and runs checks under the slice owner's direction, but never records gate approvals or human Accept, Revise or Reject decisions.

---

## 2. Slice loop (every slice)

**Vertical rule.** Every slice touches UI, API, domain rules, database and tests, and ends in an outcome that a named person can perform and a reviewer can see without waiting for a later slice. A slice creates only the database objects it uses, in its own migration. Scaffolding is built inside the first slice that needs it. Hardening is part of each slice's exit criteria; the final product check is Gate 5, which is a gate and not a slice.

1. **Scope** (slice owner): confirm the slice section below, record mode and any change.
2. **Design check** (slice owner; new ADRs recorded by Ihtesham): architecture, data model, ADRs, OpenAPI changes written first.
3. **Tests first** (slice owner): test cases and fixtures for every owned scenario, approved before implementation.
4. **HITL plan** (agent): goal, files, interfaces, tests, risks. **Wait for approval.** Wireframes for new screens wait for approval too.
5. **Implement** (slice owner, end to end: UI, API, domain, database; agent assisting) on branch `slice/<id>-<name>`.
6. **Conformance review** (a team member other than the slice owner): AGENTS.md rules, module boundaries, docs.
7. **Quality gates** (slice owner): lint, typecheck, format, unit and integration tests, SQL tests, slice-specific checks; evidence appended to `docs/evidence/test-evidence.md`.
8. **Decision** (slice owner, confirmed by Ibrahim as Overall Process Lead): Accept, Revise or Reject recorded in section 10 and `docs/evidence/workflow-log.md` (mode, AI session link, correction loops, reason).
9. **Merge** by a human after Accept. Human tasks for the next slice are listed before it starts.

**Quality gates:** 1 scope and plan; 2 design and tests; 3 works end to end in mock mode; 4 verification evidence recorded; 5 acceptance. A slice is complete only when its criteria and evidence are recorded.

**Every slice also meets:** its endpoints have a permission key and a role-denial test; logs and audit for its flows contain no PII; its screens show status in text and colour and are keyboard-usable; OpenAPI and README sections for it are updated; its migration applies to an empty database and to the previous slice's database; earlier slices' cases are re-run (Gate 4).

---

## 3. Slice overview

| Slice | Name | Person and outcome | Mode | Depends on | Migration |
|---|---|---|---|---|---|
| 1A | Sign in and land in the right place | Every demo role and a new customer sign in and see the correct landing page | HITL (authentication) | repo baseline | `0001_identity` |
| 1B | Customer places an order | Signed-in customer browses seeded products, checks out (server-priced) and sees the order in My orders | HITL (customer isolation) | 1A | `0002_orders` |
| 1C | Confirmation email and status link | Customer gets the confirmation in the mock outbox and opens the tracking link; Admin/Owner read the outbox | HITL | 1B | `0003_email_outbox` |
| 1D | Admin manages the catalogue | Admin/Owner add a product with phone photos and set the delivery charge; the customer sees both | HITL (file upload) | 1C | `0004_product_images_settings` |
| 1E | Staff queue and manual orders | Admin/Owner/Intake create manual orders and find any order by number, name, tracking or exact phone | HITL (authorization) | 1D | `0005_order_search` |
| 1F | Payment verification | Customer pays through the mock gateway or Admin confirms; the order becomes `PAID` | HITL (payment) | 1E | `0006_payments` |
| 2A | Staff workspace and checklist | Staff complete the steps their profile allows on a paid order; Owner switches Admin staff-mode | HITL (permissions) | 1F | `0007_checklist_notes` |
| 2B | Dispatch and delivery | An authorized user dispatches once with a tracking number and marks delivery | HITL (dispatch) | 2A | `0008_dispatch` |
| 2C | Offline mode | Staff keep working without internet; Owner/Admin dispatch offline only under the Owner override | HITL (override) | 2B | `0009_offline` |
| 3 | Stock availability requests | Staff report out of stock; Owner/Admin decide; the storefront reflects it | HITL (stock holds) | 2C | `0010_stock_requests` |
| 4A | Address change requests | Customer reports a wrong address; Owner/Admin apply or decline | HITL (reset rules) | 3 | `0011_address_requests` |
| 4B | Cancellation and Needs attention | Owner/Admin cancel before dispatch; five Needs attention groups show the right orders | HITL | 4A | `0012_cancellation` |
| 5A | Refund applications | Staff submit, Owner/Admin review, optional paid-outside record | HITL | 4B | `0013_refunds` |
| 5B | Dispatch performance report and demo path | Owner/Admin read the report with the excluded count; the full demo path runs | HITL (reports) | 5A | `0014_reporting_views` |
| 5C | Users, roles and Admin & Health | Owner/Admin manage users and roles, read health, review offline conflicts | AFK for UI, HITL for role rules | 5B | none |

After 5C comes **Gate 5, the final product check** (re-run every slice's cases, re-measure NFR-02, rehearse the demo).

All slices except 5C are HITL because each touches a mandatory HITL area (AGENTS 11.3). UI-only tasks inside a HITL slice may run AFK with review.

---

## 4. Slice details

### Slice 1A: Sign in and land in the right place
**Goal:** the first running system: every demo role and a new customer sign in through mock OIDC and land on the right page.

**Scaffold (inside this slice, because the repo reset removed it):** npm workspaces, strict TypeScript, ESLint 9, Prettier, `.nvmrc`, `.env.example` with the v4.4 variables, Docker Compose services `postgres`, `migrate`, `api`, `mock-oidc`, `web` with per-service database URLs (a shared `.env` value must never override a container's database host), volumes `pgdata` and `uploads`, guarded seed and reset scripts using `DATABASE_URL_OWNER`. ADR-001 to ADR-009 marked Superseded; ADR-010 to ADR-025 written.

**Database (`0001_identity`):** `users` (unique `oidc_subject`), `roles`, `permissions`, `user_roles`, `role_permissions` with all ten roles and keys seeded as PRD 2.2 (`owner`, `admin`, `staff_picker_packer`, `staff_inspector`, `staff_full`, `cap_dispatch`, `cap_delivery`, `cap_report`, `cap_order_intake`, `customer`); `audit_events` with the append-only trigger; database roles and `grants.sql` (`orderflow_app` no DELETE or TRUNCATE; `orderflow_ro` no base-table access). `packages/shared` permission map identical to the seed (test).

**Backend:** OIDC authorization-code sign-in through the issuer adapter; session cookie and CSRF on all writes; first-sign-in provisioning as `customer` with `INSERT ... ON CONFLICT` on `oidc_subject`; `GET /me` (roles, permissions, allowed checklist steps, flags); `requirePermission`; audit module with the per-event allowlist; `/health`; typed config; error mapper.

**mock-oidc:** demo accounts (Owner, Admin, one per staff profile, two customers) and a mock-mode create-account path.

**Frontend:** `/sign-in`, role-based landing (customers to `/shop` placeholder, staff to `/orders` placeholder "Workspace arrives in a later slice"), no-access page, sign-out.

**Scenarios owned:** 28 (baseline, re-run at every gate), 32, 66.

**Exit criteria:** owned scenarios pass; audit and grants SQL checks pass; `docker compose up --build` reaches healthy; a new customer and each demo role sign in and see the correct landing.

**Human tasks:** confirm OIDC demo passwords; confirm seed data may be wiped on `docker compose down -v`.

**Approved scope addendum (27 Nov 2026):** The customer mock OIDC portal supports email/password sign-in with seeded accounts and customer-selected passwords for new accounts. Customer sign-in may also use the local Google/Apple demo shortcuts, which authenticate as fixed demo customer identities; these are mock-only and are not real external identity-provider integrations. Staff sign-in remains email/password only. Account credentials remain in the mock issuer's in-memory store and are not persisted by OrderFlow.

---

### Slice 1B: Customer places an order
**Goal:** a signed-in customer browses seeded products, fills a cart, checks out with a server-calculated total and sees the order in My orders as awaiting payment.

**Database (`0002_orders`):** `products` (seeded by the seed script; `availability`), `orders` with every lifecycle column (`order_number` from a sequence, `public_token`, `source`, `customer_user_id`, `lifecycle_status`, `order_version`, `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, totals, recipient fields, address), `order_items`, `checklist_steps` (five rows per order), `idempotency_keys`; set-once triggers (`payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `order_number`, `public_token`, `customer_user_id`), the full lifecycle-graph trigger, the timestamp CHECKs, money, quantity (1 to 20) and `source` CHECKs, unique `(order_id, step_number)`, unique `products.sku`.

**Backend:** `GET /storefront/products` (public; held state shown as "not held" until Slice 3); `POST /orders` for customers (products read `FOR SHARE`, server pricing with `Prisma.Decimal`, `expected_total` check returning `PRICE_CHANGED`, `PRODUCT_UNAVAILABLE`, `request_id` idempotency, rate limit per user, five checklist rows, audit event); `GET /my/orders` and `GET /my/orders/:orderNumber` (customers module, query-level isolation, own DTO).

**Frontend:** `/shop` and product pages (PKR formatting), `/cart` (client cart), `/checkout` (address editable until submit; shows `PRICE_CHANGED` and unavailable lines; unauthenticated visitor sent to sign-in and back), `/my-orders`, `/my-orders/:orderNumber`.

**Scenarios owned:** 1, 2, 17, 31, 37, 47, 65.

**Exit criteria:** owned scenarios pass; customer A cannot read customer B (API and UI); the stored total equals the server calculation; storefront list timing recorded as early NFR-02 evidence.

**Human tasks:** try the checkout by hand in a browser.

---

### Slice 1C: Confirmation email and status link
**Goal:** after ordering, the customer gets the confirmation in the mock outbox and can open the tracking link; Admin/Owner read the outbox.

**Database (`0003_email_outbox`):** `email_outbox`.

**Backend:** `EmailAdapter` port and `MockEmailAdapter`; **single `email_outbox` insert inside the order transaction**, `EmailAdapter.deliver` after commit (failure audited, never failing the order); `GET /admin/email-outbox` (`system.manage`); `GET /storefront/orders/:orderNumber?token=` (status only, rate limited per IP, `Referrer-Policy: no-referrer` on `/track`).

**Frontend:** `/track`; Admin & Health shell with a minimal **Email outbox** page.

**Scenarios owned:** 29, 36.

**Exit criteria:** owned scenarios pass; no address or phone in email bodies or logs; a wrong token and an unknown number give the same 404.

**Human tasks:** read the outbox email by eye.

---

### Slice 1D: Admin manages the catalogue
**Goal:** Admin/Owner add a product with photos taken on a phone and set the delivery charge; the customer sees the product in `/shop` and the charge in the next order total.

**Packages installed in this slice:** `multer` 2.x, `sharp`.

**Database (`0004_product_images_settings`):** `product_images` (`byte_size <= 5242880`, content-type CHECK), `system_settings` with `delivery_charge_pkr` (0.00) and `sla_unstarted_hours` (24).

**Backend:** `GET`, `POST /admin/products`, `PATCH /admin/products/:id`; `POST /admin/products/:id/images` (multipart, 5 MB per image, 5 per request, 10 active per product with the product row locked, magic-byte check, `sharp` re-encode, UUID names, cleanup on failed insert); `PATCH /admin/products/:id/images/:imageId`; static `/uploads/products/*` with `nosniff`; `GET /settings`, `PATCH /settings/operations` (validates its two keys now; other keys are added by their slices).

**Frontend:** Admin & Health **Products** (camera and gallery controls, availability, deactivate photo); storefront shows photos.

**Scenarios owned:** 35.

**Exit criteria:** owned scenarios and the upload hardening tests pass; a new product with photos appears in `/shop`; a changed delivery charge shows in the next order total.

**Human tasks:** manual camera and gallery upload on a real phone.

---

### Slice 1E: Staff queue and manual orders
**Goal:** Admin/Owner/Intake create a manual order and find any order they may open; staff never see unpaid orders.

**Database (`0005_order_search`):** `orders.phone_normalized` (generated, indexed), `orders.external_reference`.

**Backend:** `staffOrderScope(actor)`; `GET /orders` (filters, search by order number, name, tracking and exact phone with `order.address.read`, own rate limiter, value never logged, paging) and `GET /orders/:id` (scoped, 404 outside scope); `POST /orders` staff branch (`orders.create`, `source = MANUAL`).

**Frontend:** the left-pane queue component (Awaiting payment filter for Owner/Admin, search box, payment and lifecycle status columns, "N of 5"), minimal detail panel, **New manual order** form. Slice 2A extends these components; nothing here is temporary.

**Scenarios owned:** 6, 45, 67.

**Exit criteria:** owned scenarios pass; with 100 seeded active orders the queue API p95 is under 1 second and the initial queue render under 3 seconds (recorded with environment details). Cases that need `PAID` orders use database fixtures until 1F; the same cases are re-run in 1F.

**Human tasks:** none beyond review.

---

### Slice 1F: Payment verification
**Goal:** a customer pays through the mock gateway, or Owner/Admin confirms payment, and the order becomes `PAID`.

**Database (`0006_payments`):** `payment_events` (unique `(provider, provider_event_id)`, `reviewed_*`), payment columns on `orders` (`payment_method`, `payment_reference`, `payment_confirmed_by`), `payment_method` CHECK.

**Backend:** `PaymentAdapter` port and `MockPaymentAdapter`; `POST /webhooks/payments` (raw body, constant-time HMAC, dedupe, synchronous application, reasons `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `ORDER_NOT_PAYABLE`, `UNKNOWN_ORDER`; invalid-signature throttle); `POST /mock-gateway/orders/:orderNumber/pay` (order owner only, mock mode only); `npm run payment:simulate`; `POST /orders/:id/confirm-payment` (`payment.confirm`, method and reference required); `PAYMENT_ISSUE` (both kinds) and `POST /admin/payment-events/:id/review`.

**Frontend:** `/pay/:orderNumber` (labelled demo gateway); **Confirm payment** in the detail panel; payment status and `PAYMENT_ISSUE` in the queue; customer sees `PAID` in My orders.

**Scenarios owned:** 3, 4, 5, 30, 54.

**Exit criteria:** owned scenarios pass; mock routes absent with `PAYMENT_ADAPTER` unset; a full customer path runs: sign in, order, pay, order is `PAID`; the 1E cases that used fixtures are re-run on real paid orders.

**Human tasks:** run the simulator fixtures (`valid`, `tampered`, `mismatch`, `wrong-currency`, `duplicate`) and confirm results by eye.

---

### Slice 2A: Staff workspace and checklist
**Goal:** staff open a paid order in the split pane and complete the checklist steps their profile allows; the Owner switches Admin staff-mode.

**Database (`0007_checklist_notes`):** `order_notes` (append-only trigger), `orders.checklist_epoch` (default 0) with the monotonic trigger, setting `admin_can_perform_staff_tasks` (false).

**Backend:** `POST /orders/:id/checklist/:step/complete|undo` (row lock, order, `canPerformStep`, `checklist_epoch` check, progress in the response; open-address-request block arrives with 4A); undo of step 1 returns `PREPARING` to `PAID`; `PATCH /settings/admin-staff-mode` (`settings.owner`, reason); `GET /orders/:id/timeline`; `POST /orders/:id/notes` (all three staff profiles, Admin, Owner); Needs attention component taking groups as data, with `SLA_OVERDUE`.

**Frontend:** four-item staff navigation; full split pane; Checklist section with five numbered collapsible steps, "N of 5" in header and row, locked and read-only states ("Needs inspector"); notes; timeline; Owner-only Settings control for Admin staff-mode.

**Scenarios owned:** 7, 18, 33, 44, 46, 63, 64.

**Exit criteria:** owned scenarios pass; the TA Req #2 path (search, open, checklist, progress) is demonstrated; `order_notes` append-only tested as the owner role.

**Human tasks:** try each staff profile by hand.

---

### Slice 2B: Dispatch and delivery
**Goal:** an authorized user dispatches a fully checked order once with a tracking number and marks it delivered; the customer sees the tracking number.

**Database (`0008_dispatch`):** `dispatches` (tracking CHECK, one succeeded dispatch per order, `courier_name`, BEFORE INSERT precondition trigger: order `PREPARING`, five steps complete).

**Backend:** `POST /orders/:id/dispatch` (one transaction: row lock, `expected_version`, `request_id`, preconditions, insert, server `dispatched_at`, transition, audit); `POST /orders/:id/deliver` (permanent, idempotent); checklist locked after dispatch.

**Frontend:** dispatch form and fixed confirmation dialog; Delivery button; Dispatched and Completed filters; tracking number in `/my-orders` and `/track`.

**Scenarios owned:** 8, 9, 10, 11, 12, 13, 14, 16.

**Exit criteria:** owned scenarios pass, including two simultaneous dispatches and tracking boundaries 5, 6, 30, 31; set-once behaviour of all guarded columns is verified (scenario 16).

**Human tasks:** none beyond review.

---

### Slice 2C: Offline mode
**Goal:** staff keep working without internet; Owner/Admin dispatch offline only when the Owner allows it.

**Packages installed in this slice:** `vite-plugin-pwa`, `idb-keyval`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`.

**Database (`0009_offline`):** `dispatches.is_offline`, `dispatches.client_occurred_at`, offline-conflict review marker, setting `allow_offline_dispatch_override` (false).

**Backend:** `POST /offline-sync` (per-item transactions, state validation, epoch check, Owner/Admin-only offline dispatch with the override on at sync, `OFFLINE_ACTION_REJECTED`); `GET /admin/offline-conflicts`, `POST /admin/offline-conflicts/:id/review`; `PATCH /settings/offline-dispatch-override` (`settings.owner`, reason); `OFFLINE_CONFLICT` group.

**Frontend:** connectivity monitor and banner; cache (200 orders, no phone or email, address only with permission, 12-hour and sign-out wipe); offline queue in its **own IndexedDB store**; proactive disabled Dispatch and the exact step-5 alert; Owner-only override control; offline sync issues page.

**Scenarios owned:** 20, 21, 22, 23, 24, 34, 42, 43.

**Exit criteria:** owned scenarios pass; offline tests in Playwright with the network cut.

**Human tasks:** manual offline check on a phone or tablet (airplane mode); confirm alert and banner wording.

---

### Slice 3: Stock availability requests
**Goal:** staff report a product out of stock; it is held from new orders for up to 4 hours without disappearing; Owner/Admin approve (out of stock, badged) or decline; affected paid orders show under `STOCK_ISSUE`.

**Database (`0010_stock_requests`):** `product_stock_requests` with the partial unique index and status trigger (architecture 8.3), setting `stock_hold_hours` (4); permissions `product.stock.report` (three staff profiles, Admin, Owner) and `product.stock.review` (Admin, Owner) if not already seeded.

**Backend:** `stock` module (`isHeld` evaluated on read, no job); `POST /products/:id/out-of-stock-requests` (product locked `FOR UPDATE`, lapsed request closed as `EXPIRED`); `GET /admin/out-of-stock-requests`; approve and decline; storefront and `POST /orders` now call the real `stock.isHeld`; `STOCK_ISSUE` group; `stock_hold_hours` validated in `PATCH /settings/operations`.

**Frontend:** "Report out of stock" on order lines and in the product list; Admin & Health **Stock requests**; storefront and cart states "Checking availability, temporarily unavailable" and "Out of stock".

**Scenarios owned:** 55, 56, 57, 58, 59.

**Exit criteria:** owned scenarios pass, including the serialized checkout-versus-report test and expiry tested by moving the clock.

**Human tasks:** decide the badge wording if different from the PRD.

---

### Slice 4A: Address change requests
**Goal:** a customer reports a wrong address within 4 hours; the order disappears from staff work at once; Owner/Admin compare and apply (checklist reset, order back to `PAID`) or decline (progress kept).

**Database (`0011_address_requests`):** `address_change_requests` (partial unique index one `OPEN` per order, immutable proposed address, status graph, window trigger), `order_address_revisions` (append-only), `orders.has_pending_address_request` with its sync trigger, setting `address_change_window_hours` (4); **replaces the dispatch precondition trigger** to add "no `OPEN` address request".

**Backend:** `POST /my/address-change-requests` (own order, window, row lock); `staffOrderScope` extended with the open-request exclusion; `GET /address-change-requests`, `GET /orders/:id/address-change-requests`; apply (revision, exact proposed address, checklist reset, `checklist_epoch` increase, `CHECKLIST_RESET` audit, `PREPARING` to `PAID`, version) and decline; `ADDRESS_REQUEST_PENDING` refusals in checklist, dispatch and offline sync; `ADDRESS_CHANGE_REQUEST` group; `address_change_window_hours` validated in settings.

**Frontend:** "Request address change" on `/my-orders/:orderNumber` and `/help/address-change`; staff hold banner; Owner/Admin side-by-side review with the reset warning.

**Scenarios owned:** 19, 38, 39, 40, 48, 49, 50, 51, 53.

**Exit criteria:** owned scenarios pass, including the offline replay after reset (51) and the concurrent request-versus-checklist test.

**Human tasks:** manual check of the review screen with a real-looking Pakistani address.

---

### Slice 4B: Cancellation and Needs attention
**Goal:** Owner/Admin cancel an order before dispatch; the five Needs attention groups show the right orders to the right roles.

**Database (`0012_cancellation`):** `orders.cancellation_reason`, `orders.cancelled_at`.

**Backend:** `POST /orders/:id/cancel` (`order.cancel`, reason, `expected_version`; from `PENDING_PAYMENT`, `PAID` or `PREPARING`; voids an open address request and clears its flag; refused after dispatch).

**Frontend:** Cancel modal with reason; Cancelled filter; Needs attention shows all five groups with counts and per-role visibility.

**Scenarios owned:** 15, 41, 52.

**Exit criteria:** owned scenarios pass; each group's membership and visibility checked.

**Human tasks:** none beyond review.

---

### Slice 5A: Refund applications
**Goal:** staff submit refund applications, Owner/Admin review them, and may record that the refund was paid outside OrderFlow.

**Database (`0013_refunds`):** `refund_applications`, `refund_application_items`, paid-outside columns with the set-once, status and amount trigger.

**Backend:** `POST /orders/:id/refund-applications`, `GET /refund-applications`, `POST /refund-applications/:id/review`, `POST /refund-applications/:id/paid-outside`; no money-moving code path.

**Frontend:** Refund Applications screen with the fixed label "Manual refund application tracking. No payment is issued by OrderFlow."

**Scenarios owned:** 25, 61.

**Exit criteria:** owned scenarios pass.

**Human tasks:** none beyond review.

---

### Slice 5B: Dispatch performance report and demo path
**Goal:** Owner/Admin read the dispatch performance and sales report with the excluded-orders count from the isolated analytics service, and the whole demo path runs end to end.

**Database (`0014_reporting_views`):** `report_orders_v`, `report_order_items_v`, `report_dispatches_v`, `report_refunds_v` (`security_barrier`); `orderflow_ro` granted the views only.

**Analytics (`apps/analytics`):** compose service with no host port; internal-secret check; dispatch performance per architecture 10.9 (Today or custom, buckets, population, included, excluded count with breakdown, offline count, sales, units, rows); refund applicants report.

**Backend (API):** `reports` module proxy with `report.view`.

**Frontend:** `/reports` (Today button, From and To pickers, bucket switch, KPI cards, excluded-orders callout, rows, refund applicants table).

**Scenarios owned:** 26, 27, 60, 62, 68.

**Exit criteria:** owned scenarios pass, including the Playwright smoke of the demo path (customer signs in, orders, pays; staff complete the checklist; dispatch; delivery; the report shows the order).

**Human tasks:** rehearse the demo path once by hand.

---

### Slice 5C: Users, roles and Admin & Health
**Goal:** Owner/Admin manage users and roles, read system health and review offline conflicts.

**Backend:** user and role management (all ten roles, customer and staff roles never combined, Owner-role rule); `GET /admin/health` with every counter.

**Frontend:** Admin & Health completed: users and roles, settings page gathering every switch built earlier (no new switch logic), health counters, offline sync issues.

**Scenarios owned:** none (the PRD has no numbered scenario for these). **Acceptance criteria:** the Owner assigns and revokes roles; Admin cannot grant or revoke the Owner role; a customer and staff role combination is refused in UI and API; health shows database state, email failures and offline conflicts.

**Human tasks:** none beyond review.

---

## 5. Traceability

### 5.1 TA core requirements

| TA requirement | Built in | Proven by scenarios |
|---|---|---|
| TA Req #1: authorized search, statuses, open details, exclusion | 1E (API, queue), 2A (full pane), 4A (address hold exclusion) | 6, 31, 45, 46, 53 |
| TA Req #2: sequential checklist, progress, dispatch blocked | 2A (checklist, progress), 2B (dispatch) | 7, 9, 33, 44, 46 |
| TA Req #3: dispatch performance report with excluded count | 5B | 26, 60, 65 |

### 5.2 Functional requirements

| PRD | Slice |
|---|---|
| FR-01 accounts, storefront, intake, photos, email, my-orders | 1A (accounts), 1B (storefront, orders, my-orders), 1C (email, status link), 1D (products, photos), 1E (manual orders) |
| FR-02 payment | 1F |
| FR-03 queue, search, Needs attention | 1E (queue, search), 1F (`PAYMENT_ISSUE`), 2A (`SLA_OVERDUE`), 2C (`OFFLINE_CONFLICT`), 3 (`STOCK_ISSUE`), 4A (`ADDRESS_CHANGE_REQUEST`), 4B (all five checked) |
| FR-04 detail, notes, address flow | 2A (detail, notes), 4A (address flow) |
| FR-05 checklist | 2A |
| FR-06 dispatch | 2B |
| FR-07 offline and override | 2C |
| FR-08 delivery | 2B |
| FR-09 cancellation | 4B |
| FR-10 timeline | 2A (events written from 1A onward) |
| FR-11 refunds | 5A |
| FR-12 report | 5B |
| FR-13 audit | every slice (module in 1A) |
| FR-14 health | 1A (`/health`), 5C (panel) |
| FR-15 stock | 3 |
| NFR-01 to NFR-08 | NFR-02 measured in 1E and re-measured at Gate 5; the others checked at every gate |

### 5.3 Scenario ownership (each scenario has exactly one owner)

| Slice | Scenarios |
|---|---|
| 1A | 28, 32, 66 |
| 1B | 1, 2, 17, 31, 37, 47, 65 |
| 1C | 29, 36 |
| 1D | 35 |
| 1E | 6, 45, 67 |
| 1F | 3, 4, 5, 30, 54 |
| 2A | 7, 18, 33, 44, 46, 63, 64 |
| 2B | 8, 9, 10, 11, 12, 13, 14, 16 |
| 2C | 20, 21, 22, 23, 24, 34, 42, 43 |
| 3 | 55, 56, 57, 58, 59 |
| 4A | 19, 38, 39, 40, 48, 49, 50, 51, 53 |
| 4B | 15, 41, 52 |
| 5A | 25, 61 |
| 5B | 26, 27, 60, 62, 68 |
| 5C | none |

Total 68, no duplicates, no gaps (checked mechanically). Notes: scenario 16 is owned by 2B because the last guarded columns become usable there (1B and 1F test the columns they use as ordinary slice cases); 18 is owned by 2A, where `order_notes` exists (the `audit_events` half is tested in 1A and `order_address_revisions` in 4A); 29 is owned by 1C, where tracking exists (1B tests its own creation limit); 67 is owned by 1E, where the queue exists; 68 is owned by 5B because the demo path ends with the report. Scenario 28 is re-run at every gate.

### 5.4 Roles

| Role | First usable |
|---|---|
| `owner`, `admin`, `customer` | 1A |
| `cap_order_intake` | 1E |
| `staff_picker_packer`, `staff_inspector`, `staff_full` | 2A |
| `cap_dispatch`, `cap_delivery` | 2B |
| `cap_report` | 5B |

All roles are seeded in `0001_identity`; role management UI is in 5C.

---

## 6. Migration plan

Every migration is additive, forward-only and never edited after merge. Numbering restarts at `0001` because the repo reset removed the earlier schema; there is no existing data to drop, so no migration needs a destructive-change approval. Each migration is reviewed in its slice.

| Migration | Slice | Creates |
|---|---|---|
| `0001_identity` | 1A | `users`, `roles`, `permissions`, `user_roles`, `role_permissions` (ten roles seeded), `audit_events` (append-only), database roles and grants |
| `0002_orders` | 1B | `products`, `orders` (all lifecycle columns), `order_items`, `checklist_steps`, `idempotency_keys`; set-once, lifecycle-graph and timestamp triggers; CHECKs and unique indexes |
| `0003_email_outbox` | 1C | `email_outbox` |
| `0004_product_images_settings` | 1D | `product_images`, `system_settings` (`delivery_charge_pkr`, `sla_unstarted_hours`) |
| `0005_order_search` | 1E | `orders.phone_normalized` (generated, indexed), `orders.external_reference` |
| `0006_payments` | 1F | `payment_events`, payment columns on `orders` |
| `0007_checklist_notes` | 2A | `order_notes` (append-only), `orders.checklist_epoch` with trigger, setting `admin_can_perform_staff_tasks` |
| `0008_dispatch` | 2B | `dispatches` with CHECK, unique index and precondition trigger |
| `0009_offline` | 2C | `dispatches.is_offline`, `client_occurred_at`, conflict review marker, setting `allow_offline_dispatch_override` |
| `0010_stock_requests` | 3 | `product_stock_requests` and triggers, setting `stock_hold_hours` |
| `0011_address_requests` | 4A | `address_change_requests` and triggers, `order_address_revisions` (append-only), `orders.has_pending_address_request` and sync trigger, setting `address_change_window_hours`; replaces the dispatch precondition trigger |
| `0012_cancellation` | 4B | `orders.cancellation_reason`, `orders.cancelled_at` |
| `0013_refunds` | 5A | refund tables and the paid-outside trigger |
| `0014_reporting_views` | 5B | four reporting views and the `orderflow_ro` grants |

---

## 7. Rework check (what is deliberately changed later)

The vertical order accepts a small, listed amount of change to earlier work, each covered by a test:
- The dispatch precondition trigger (2B) is replaced in 4A to add the open-address-request check. Scenario 40 and the 2B cases are re-run.
- `staffOrderScope` (1E) gains the open-request exclusion in 4A. Scenario 53 covers it.
- The Needs attention component (2A) takes groups as data; slices 1F, 2C, 3 and 4A each add a group, and 4B checks all five.
- Order creation (1B) calls `stock.isHeld` behind an interface that returns "not held"; Slice 3 supplies the real implementation.
- Order creation gains the single `email_outbox` insert in 1C inside the same transaction.
- The delivery charge in 1B is the typed config value `DELIVERY_CHARGE_PKR` (default `0.00`); Slice 1D replaces it with the `system_settings` value and re-runs the 1B order total tests.
- `PATCH /settings/operations` (1D) accepts each new key when its slice seeds it.
- The queue and detail components built in 1E are the ones 2A extends; nothing is thrown away.
- SQL constraint tests are written in the slice that creates each object and re-run at every gate.

---

## 8. Package approvals (recorded 26 November 2026)

| Package | Slice | Note |
|---|---|---|
| `multer` 2.x | 1D | 1.x not allowed |
| `sharp` | 1D | Strips photo metadata |
| `vite-plugin-pwa` | 2C | App-shell service worker only |
| `idb-keyval` | 2C | Offline action queue in its own store |
| `@tanstack/react-query-persist-client` | 2C | Query cache persistence |
| `@tanstack/query-async-storage-persister` | 2C | IndexedDB persister for the query cache |

Install only when the slice starts; pin through the lockfile.

---

## 9. Gate 1 sign-off (human only)

**Gate 1 checks:**
- [x] PRD v4.4, architecture v4.4 and AGENTS.md v4.4 read and accepted
- [x] Slice scopes and order (15 slices) accepted
- [x] Scenario ownership (5.3) accepted
- [x] Migration plan (section 6) accepted
- [x] Slice 1 test cases (`docs/evidence`, once created in 1A) accepted

Each slice is signed off by the one person accountable for it (section 1). The first row is the sign-off of the plan as a whole.

| Slice | Accountable owner | Decision (Accept, Revise, Reject) | Date | Notes |
|---|---|---|---|---|
| Whole plan (Gate 1) | Ibrahim (Overall Process Lead) | Accept | 2026-11-27 | Gate 1 approved; Slice 1A addendum approved for clean email/password login, custom registration passwords, and simulated Google/Apple OIDC customer identities. |
| 1A | Ibrahim | Accept | 2026-11-27 | Slice 1A scope and email/password + simulated Google/Apple OIDC addendum approved to proceed. |
| 1B | Ibrahim | Accept | 2026-11-27 | Slice 1B scope approved to proceed with Formrest-inspired storefront UI aligned to PRD v4.4 and migration 0002_orders. |
| 1C | Ibrahim | | | |
| 1D | Ihtesham | | | |
| 1E | Ibrahim | | | |
| 1F | Ihtesham | | | |
| 2A | Taha | | | |
| 2B | Ahmed | | | |
| 2C | Taha | | | |
| 3 | Taha | | | |
| 4A | Ahmed | | | |
| 4B | Ahmed | | | |
| 5A | Ahmed | | | |
| 5B | Ihtesham | | | |
| 5C | Ihtesham | | | |

---

## 10. Slice decisions (human only)

## 10. Slice decisions (human only)

| Slice | Gate | Decision | Date | Reason | Evidence link |
|---|---|---|---|---|---|
| 1A | Gate 4 | Accept | 2026-11-27 | Slice 1A (`0001_identity`, mock OIDC with email/password + simulated Google/Apple customer sign-in, RBAC, append-only audit, and grants) verified and merged on `feat/customer-sign-in-modes` (`73be42d`). | `docs/evidence/test-evidence.md` |
| 1B | | | | | |
| 1C | | | | | |
| 1D | | | | | |
| 1E | | | | | |
| 1F | | | | | |
| 2A | | | | | |
| 2B | | | | | |
| 2C | | | | | |
| 3 | | | | | |
| 4A | | | | | |
| 4B | | | | | |
| 5A | | | | | |
| 5B | | | | | |
| 5C | | | | | |
| Gate 5 | | | | | |

---

## 11. Change log (append-only)

| Date | Version | Change | By |
|---|---|---|---|
| 23 Nov 2026 | v01 | Shopify and native edition plan | Team with AI agent |
| 26 Nov 2026 | v02 | Standalone web edition: five slices with Slice 1 split into 1A, 1B, 1C; aligned to PRD v4.3 after the Gate 1 review; package approvals recorded | Team with AI agent |
| 26 Nov 2026 | v03 | All slices made vertical at the planner's direction: 15 slices (1A to 1F, 2A to 2C, 3, 4A, 4B, 5A to 5C); no foundation or hardening slice (Gate 5 is a gate); migrations created per slice from `0001`; scenarios 16, 18, 29, 40, 49, 67, 68 re-owned; aligned to v4.4 documents | Team with AI agent |
| 26 Nov 2026 | v03.1 | Team and ownership rewritten as per-slice end-to-end ownership (planner's review comment), mapped onto the 15 slice IDs, with the six unassigned slices distributed between Ihtesham, Taha and Ahmed; Gate 1 sign-off table made slice by slice; slice loop steps now name the slice owner so they no longer conflict with section 1 | Team with AI agent |
| 27 Nov 2026 | v03.2 | Human-approved Slice 1A scope addendum: email/password mock sign-in, customer-selected account passwords, and fixed Google/Apple demo customer identities through OIDC | Ibrahim / AI agent |