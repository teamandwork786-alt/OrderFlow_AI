# plan.md: OrderFlow AI master plan

**Plan version:** v02 | **Date:** 26 November 2026 | **Aligned to:** PRD v4.3, `docs/architecture.md` v4.3, `AGENTS.md` v4.3
**Status:** **Gate 1 pending.** No slice may start until the Gate 1 sign-off in section 9 is recorded by a human.
**History:** v01 (Shopify and native edition) is kept unchanged in `docs/plan-history/plan-v01.md`.

This is the single master plan. Agents may update only the parts a slice instructs; decisions (Accept, Revise, Reject) and sign-offs are human-only (AGENTS 5 and 11). The change log (section 11) is append-only.

---

## 1. Team and ownership

| Person | Owns |
|---|---|
| Ibrahim | Planning, process, `plan.md`, client UI, Gate 1 and acceptance decisions |
| Ihtesham | Architecture, ADRs, documentation, Docker, scaffold, mock payment and email adapters, simulator, mock-oidc, analytics |
| Taha | Backend (API, services, repositories, migrations) |
| Ahmed | QA: test cases and fixtures before code, quality gates, evidence |

Each deliverable has one accountable owner. The AI agent implements under the owner's direction and never records a decision.

---

## 2. Slice loop (every slice)

1. **Scope** (Ibrahim): confirm the slice section below, record mode and any change.
2. **Design check** (Ihtesham): architecture, data model, ADRs, OpenAPI changes written first.
3. **Tests first** (Ahmed): test cases and fixtures for every owned scenario, before implementation.
4. **HITL plan** (agent): goal, files, interfaces, tests, risks. **Wait for approval.** Wireframes for new screens wait for approval too.
5. **Implement** (Taha backend, Ibrahim UI, agent assisting) on branch `slice/<id>-<name>`.
6. **Conformance review** (Ihtesham): AGENTS.md rules, module boundaries, docs.
7. **Quality gates** (Ahmed): lint, typecheck, format, unit and integration tests, SQL tests, slice-specific checks; evidence appended to `docs/evidence/test-evidence.md`.
8. **Decision** (Ibrahim): Accept, Revise or Reject recorded in section 10 and `docs/evidence/workflow-log.md` (mode, AI session link, correction loops, reason).
9. **Merge** by a human after Accept. Human tasks for the next slice are listed before it starts.

**Quality gates:** 1 scope and plan; 2 design and tests; 3 works end to end in mock mode; 4 verification evidence recorded; 5 acceptance. A slice is complete only when its criteria and evidence are recorded.

---

## 3. Slice overview

| Slice | Name | Mode | Depends on | Migration |
|---|---|---|---|---|
| 1A | Foundation: schema pivot, sign-in, roles | HITL | Current repo | `0003_standalone_pivot` |
| 1B | Catalogue, photos, checkout, orders, email, my-orders | HITL | 1A | none |
| 1C | Payment verification, manual orders, staff queue foundation | HITL | 1B | none |
| 2 | Staff workspace, checklist, dispatch, delivery, offline | HITL | 1C | none |
| 3 | Stock availability requests | HITL | 2 | `0004_stock_requests` |
| 4 | Address change requests, staff hold, cancellation | HITL | 3 | none |
| 5 | Reports, refunds, Admin & Health, hardening, demo | HITL (report and analytics), AFK for UI | 4 | `0005_reporting` |

All slices are HITL because each touches at least one mandatory HITL area (AGENTS 11.3). UI-only tasks inside a slice may run AFK with review.

---

## 4. Slice details

### Slice 1A: Foundation (schema pivot, sign-in, roles)
**Goal:** a clean standalone codebase on the new schema where customers and staff can sign in and receive the right roles. Nothing customer-facing beyond sign-in.

**Repo cleanup (on the team's current repo, not `orderflow-s1.zip`):** delete `apps/native`, the Shopify adapters (mock and real), `/webhooks/shopify`, webhook inbox, sync, reconcile, conflict-flag code, the worker and its compose service, Shopify fixtures and scripts. Mark ADR-001 to ADR-009 Superseded. Write ADR-010 to ADR-024 files.

**Database (`0003_standalone_pivot`, needs explicit human approval before merge because it drops demo data):**
- Drop `webhook_inbox`, `integration_state`, `worker_heartbeats`, `mock_shopify_orders`, `mock_controls`, `shopify_*`, `eligibility_*` and conflict columns.
- Create `products` (with `availability`), `product_images`, `address_change_requests` (final shape: `OPEN|APPLIED|DECLINED|VOID`), `order_address_revisions`, `payment_events` (with `reviewed_*`), `email_outbox`, `idempotency_keys`, `system_settings` (all six keys seeded).
- Alter `orders` (all PRD 7 columns, including `checklist_epoch`, generated `phone_normalized`, `customer_user_id`, `has_pending_address_request`) and `dispatches` (`courier_name`, `is_offline`, `client_occurred_at`).
- All triggers and constraints in architecture 8.3 marked `0003`: set-once, full lifecycle graph, timestamp CHECKs, epoch monotonic, dispatch precondition, address-request triggers (window, status graph, flag sync), append-only, unique indexes, CHECKs.
- Re-seed roles and permissions: `owner`, `admin`, `staff_picker_packer`, `staff_inspector`, `staff_full`, `cap_dispatch`, `cap_delivery`, `cap_report`, `cap_order_intake`, `customer`; retire `staff`, `cap_address_update`, `checklist.update`. `packages/shared` permission map identical to the seed (test).
- `grants.sql`: app role SELECT/INSERT/UPDATE, no DELETE or TRUNCATE; read-only role has no base-table grants (views arrive in `0005`).

**Backend:** OIDC sign-in for everyone through the issuer adapter; session cookie and CSRF on all writes; first-sign-in provisioning as `customer` with `INSERT ... ON CONFLICT` on `oidc_subject`; `GET /me` (roles, permissions, allowed checklist steps, flags); `requirePermission`; idempotency helper; audit module with per-event allowlist; `/health`; typed config; error mapper.

**mock-oidc:** demo accounts (Owner, Admin, one per staff profile, two customers) and a mock-mode **create account** path so first-sign-in provisioning can be shown.

**Frontend:** `/sign-in`, role-based landing (customers to `/shop`, staff to `/orders` placeholder that states "Workspace arrives in Slice 2"), no-access page, sign-out.

**Docker:** compose services `postgres`, `migrate`, `api`, `mock-oidc`, `web` (analytics added in Slice 5); volumes `pgdata`, `uploads`; per-service database URLs (fixes the earlier seeding bug); seed and reset scripts guarded and using `DATABASE_URL_OWNER`.

**Scenarios owned:** 16, 17, 18, 28 (baseline; re-run at every later gate), 32, 65, 66.

**Exit criteria:** all owned scenarios pass; the adapted 33 SQL checks plus new 0003 checks pass; `docker compose up --build` reaches healthy; a new customer and each demo role sign in and see the correct landing.

**Human tasks before starting:** upload the current repo (without `node_modules`); approve migration `0003`; confirm OIDC demo passwords and that seed data may be wiped.

---

### Slice 1B: Catalogue, photos, checkout, orders, email, my-orders
**Goal:** a signed-in customer browses products with photos, places a server-priced order, receives a confirmation email in the mock outbox, and sees it in `/my-orders`. Admin/Owner manage products and upload photos from a phone.

**Packages installed in this slice:** `multer` 2.x, `sharp`.

**Backend:**
- `GET /storefront/products` (public; `availability`; held-product state stubbed as "not held" until Slice 3 adds the `stock` module).
- `GET`, `POST /admin/products`, `PATCH /admin/products/:id`; `POST /admin/products/:id/images` (multipart, 5 MB per image, 5 per request, 10 active per product with the product row locked, magic-byte check, `sharp` re-encode, UUID names, cleanup on failed insert); `PATCH /admin/products/:id/images/:imageId`; static `/uploads/products/*` with `nosniff`.
- `POST /orders` for customers: products read `FOR SHARE`, server pricing with `Prisma.Decimal`, `expected_total` check (`PRICE_CHANGED`), `PRODUCT_UNAVAILABLE`, `request_id`, five checklist rows, audit, **single `email_outbox` insert in the transaction**, then `EmailAdapter.deliver` after commit.
- `MockEmailAdapter`; `GET /admin/email-outbox`.
- `GET /my/orders`, `GET /my/orders/:orderNumber` (customers module, query-level isolation, own DTO).
- `GET /storefront/orders/:orderNumber?token=` (status only, rate limited, `Referrer-Policy: no-referrer` on `/track`).
- `GET /settings`, `PATCH /settings/operations` (keys `delivery_charge_pkr`, `sla_unstarted_hours` validated now; the other keys accepted from their slices).

**Frontend:** `/shop` and product pages (PKR formatting), `/cart` (client cart), `/checkout` (address editable until submit; shows `PRICE_CHANGED` and unavailable lines), `/my-orders`, `/my-orders/:orderNumber`, `/track`, Admin & Health stubs: **Products** (camera and gallery controls) and **Email outbox**.

**Scenarios owned:** 1, 2, 29, 31, 35, 36, 37, 47.

**Exit criteria:** owned scenarios pass; upload hardening tests pass; no address or phone in email bodies or logs; customer A cannot read customer B (API and UI).

**Human tasks:** manual phone test of camera and gallery upload on a real phone; check the outbox email content.

---

### Slice 1C: Payment verification, manual orders, staff queue foundation
**Goal:** an order becomes `PAID` through the mock gateway or Owner/Admin confirmation; Owner/Admin and order-intake staff can enter manual orders; the left-pane queue component exists with authorization and search.

**Backend:**
- `MockPaymentAdapter`; `POST /webhooks/payments` (raw body, constant-time HMAC, dedupe, synchronous application, reasons `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `ORDER_NOT_PAYABLE`, `UNKNOWN_ORDER`); invalid-signature throttle.
- `POST /mock-gateway/orders/:orderNumber/pay` (order owner only; mock mode only); `npm run payment:simulate`.
- `POST /orders/:id/confirm-payment` (`payment.confirm`, method and reference required).
- `POST /orders` staff branch (`orders.create`, `source = MANUAL`, `external_reference`).
- `GET /orders` with `staffOrderScope`, filters, search by order number, name, tracking and exact phone (`order.address.read`, own rate limiter, value never logged), `payment_status`; `GET /orders/:id` (scoped, 404 outside scope).
- `PAYMENT_ISSUE` computation (both kinds) and `POST /admin/payment-events/:id/review`.

**Frontend:** `/pay/:orderNumber` (labelled demo gateway); the **real left-pane queue component** with Awaiting payment filter, search box, payment and lifecycle status columns; a minimal detail panel with **Confirm payment**; **New manual order** form for `orders.create` holders. Slice 2 extends these components; nothing here is temporary.

**Scenarios owned:** 3, 4, 5, 6, 30, 45, 54.

**Exit criteria:** owned scenarios pass; mock routes absent with `PAYMENT_ADAPTER` unset; a full customer path runs: sign in, order, pay, order is `PAID`.

**Human tasks:** run the payment simulator fixtures (`valid`, `tampered`, `mismatch`, `wrong-currency`, `duplicate`) and confirm results by eye.

---

### Slice 2: Staff workspace, checklist, dispatch, delivery, offline
**Goal:** staff work paid orders in the split pane through the five-step checklist by profile, dispatch and deliver online, keep working the checklist offline with the proactive dispatch lock, and Owner/Admin dispatch offline only when the Owner allows it.

**Packages installed in this slice:** `vite-plugin-pwa`, `idb-keyval`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`.

**Backend:**
- Checklist `POST /orders/:id/checklist/:step/complete|undo`: row lock, order, `canPerformStep`, **`checklist_epoch` check**, **open-address-request block** (tested with fixture request rows; the customer flow arrives in Slice 4), progress in the response.
- `PATCH /settings/admin-staff-mode` (`settings.owner`, reason).
- `POST /orders/:id/dispatch` (all FR-06 checks, including the open-request rule) and `POST /orders/:id/deliver` (online).
- `GET /orders/:id/timeline`; `POST /orders/:id/notes` (all three staff profiles, Admin, Owner).
- `POST /offline-sync` (per-item transactions, state validation, epoch, Owner/Admin-only offline dispatch with override on at sync, `OFFLINE_ACTION_REJECTED`); `GET /admin/offline-conflicts`, `POST /admin/offline-conflicts/:id/review`; `PATCH /settings/offline-dispatch-override` (`settings.owner`, reason).
- Needs attention groups 1 to 3 (`PAYMENT_ISSUE`, `OFFLINE_CONFLICT`, `SLA_OVERDUE`), built so further groups add without change.

**Frontend:** four-item navigation; split pane (extends 1C queue and detail); Checklist section with five numbered collapsible steps, "N of 5" progress in header and row, locked and read-only states ("Needs inspector"); dispatch form and fixed confirmation dialog; delivery button; notes; timeline; connectivity monitor and banner; cache (200 orders, no phone or email, address only with permission, 12-hour and sign-out wipe); offline queue in its **own IndexedDB store**; proactive disabled Dispatch and the exact step-5 offline alert; Owner-only Settings controls (override, Admin staff-mode) and offline sync issues under Admin & Health.

**Scenarios owned:** 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 33, 34, 40, 42, 43, 44, 46, 49, 63, 64.

**Exit criteria:** owned scenarios pass; concurrency test for two simultaneous dispatches; offline tests in Playwright with the network cut; the TA Req #2 path demonstrated.

**Human tasks:** manual offline check on a phone or tablet (airplane mode); confirm alert text and banner wording.

---

### Slice 3: Stock availability requests
**Goal:** staff report a product out of stock; it is held from new orders for up to 4 hours without disappearing; Owner/Admin approve (out of stock, badged) or decline; affected paid orders show under `STOCK_ISSUE`.

**Database (`0004_stock_requests`):** `product_stock_requests` with the partial unique index and status trigger (architecture 8.3); permissions `product.stock.report` (three staff profiles, Admin, Owner) and `product.stock.review` (Admin, Owner); grants.

**Backend:** `stock` module (`isHeld` evaluated on read, no job); `POST /products/:id/out-of-stock-requests` (product locked `FOR UPDATE`, lapsed request closed as `EXPIRED`); `GET /admin/out-of-stock-requests`; approve and decline; storefront and `POST /orders` now call `stock.isHeld`; `STOCK_ISSUE` group; `stock_hold_hours` validated in `PATCH /settings/operations`.

**Frontend:** "Report out of stock" on order lines and in the product list; Admin & Health **Stock requests** queue; storefront and cart states "Checking availability, temporarily unavailable" and "Out of stock" with Add to cart disabled; `STOCK_ISSUE` group in Needs attention.

**Scenarios owned:** 55, 56, 57, 58, 59.

**Exit criteria:** owned scenarios pass, including the serialized checkout-versus-report test and expiry tested by moving the clock (no waiting four hours).

**Human tasks:** decide the wording of the storefront badges if different from the PRD.

---

### Slice 4: Address change requests, staff hold, cancellation
**Goal:** a customer reports a wrong address within 4 hours; the order disappears from staff work at once; Owner/Admin compare and apply (checklist reset to step 1, order back to `PAID`) or decline (progress kept); Owner/Admin cancel before dispatch.

**Backend:** `POST /my/address-change-requests` (own order, window, row lock); `staffOrderScope` already hides flagged orders (built in 1C), now exercised end to end; `GET /address-change-requests`, `GET /orders/:id/address-change-requests`; apply (revision, exact proposed address, checklist reset, epoch, `CHECKLIST_RESET` audit, lifecycle `PREPARING→PAID`, version) and decline; `POST /orders/:id/cancel` from `PENDING_PAYMENT`, `PAID` or `PREPARING`, voiding an open request; `address_change_window_hours` validated in `PATCH /settings/operations`; `ADDRESS_CHANGE_REQUEST` group (fifth group overall, fourth in PRD numbering).

**Frontend:** "Request address change" on `/my-orders/:orderNumber` (shown only while allowed) and `/help/address-change` with request status; staff hold banner "On hold: address under review"; Owner/Admin side-by-side review with the reset warning; Cancel modal with reason.

**Scenarios owned:** 15, 19, 38, 39, 41, 48, 50, 51, 52, 53.

**Exit criteria:** owned scenarios pass, including the offline replay after reset (scenario 51) and the concurrent request-versus-checklist test.

**Human tasks:** manual check of the side-by-side review screen with a real-looking Pakistani address.

---

### Slice 5: Reports, refunds, Admin & Health, hardening, demo
**Goal:** Owner/Admin see the dispatch performance and sales report (TA Req #3) and the refund applicants report from the isolated analytics service; staff record refund applications; Admin & Health is complete; the whole demo runs end to end.

**Database (`0005_reporting`):** reporting views (`report_orders_v`, `report_order_items_v`, `report_dispatches_v`, `report_refunds_v`, `security_barrier`); `orderflow_ro` granted the views only; refund paid-outside columns and trigger.

**Analytics (`apps/analytics`):** compose service with no host port; internal-secret check; dispatch performance per architecture 10.9 (Today or custom, buckets, population, included, excluded count with breakdown, offline count, sales, units, rows); refund applicants report.

**Backend (API):** `reports` module proxy with `report.view`; refunds `POST /orders/:id/refund-applications`, `GET /refund-applications`, `POST /refund-applications/:id/review`, `POST /refund-applications/:id/paid-outside`; user and role management (all ten roles, customer and staff roles never combined, Owner-role rule); `GET /admin/health` with every counter.

**Frontend:** `/reports` (Today button, From and To date pickers as plain inputs, bucket switch, KPI cards, the excluded-orders callout, order rows, refund applicants table); Refund Applications screen with the fixed label; Admin & Health completed: users and roles, settings page gathering every switch built earlier (no new switch logic), health counters.

**Hardening:** NFR-02 measurement on 100 seeded orders; Playwright smoke of the demo path; README with run steps and honest limits; demo script; final evidence.

**Scenarios owned:** 25, 26, 27, 60, 61, 62, 67, 68.

**Exit criteria:** owned scenarios pass; scenario 28 re-run across all endpoints; full regression green; demo rehearsed.

**Human tasks:** rehearse the demo; record final acceptance.

---

## 5. Traceability

### 5.1 TA core requirements

| TA requirement | Built in | Proven by scenarios |
|---|---|---|
| TA Req #1: authorized search, statuses, open details, exclusion | 1C (API, queue), 2 (full pane), 4 (address hold exclusion) | 6, 31, 45, 46, 53 |
| TA Req #2: sequential checklist, progress, dispatch blocked | 2 | 7, 9, 33, 44, 46 |
| TA Req #3: dispatch performance report with excluded count | 5 | 26, 60, 65 |

### 5.2 Functional requirements

| PRD | Slice |
|---|---|
| FR-01 accounts, storefront, intake, photos, email, my-orders | 1A (accounts), 1B, 1C (manual orders) |
| FR-02 payment | 1C |
| FR-03 queue, search, Needs attention | 1C, 2 (groups 1 to 3), 3 (`STOCK_ISSUE`), 4 (`ADDRESS_CHANGE_REQUEST`) |
| FR-04 detail, notes, address flow | 2 (detail, notes), 4 (address flow) |
| FR-05 checklist | 2 |
| FR-06 dispatch | 2 |
| FR-07 offline and override | 2 |
| FR-08 delivery | 2 |
| FR-09 cancellation | 4 |
| FR-10 timeline | 2 (events written from 1A onward) |
| FR-11 refunds | 5 |
| FR-12 report | 5 |
| FR-13 audit | every slice (module in 1A) |
| FR-14 health | 1A (`/health`), 5 (panel) |
| FR-15 stock | 3 |
| NFR-01 to NFR-08 | NFR-02 measured in 5; the others checked at every gate |

### 5.3 Scenario ownership (each scenario has exactly one owner)

| Slice | Scenarios |
|---|---|
| 1A | 16, 17, 18, 28, 32, 65, 66 |
| 1B | 1, 2, 29, 31, 35, 36, 37, 47 |
| 1C | 3, 4, 5, 6, 30, 45, 54 |
| 2 | 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 33, 34, 40, 42, 43, 44, 46, 49, 63, 64 |
| 3 | 55, 56, 57, 58, 59 |
| 4 | 15, 19, 38, 39, 41, 48, 50, 51, 52, 53 |
| 5 | 25, 26, 27, 60, 61, 62, 67, 68 |

Total 68, no duplicates, no gaps. Scenario 28 is owned by 1A and re-run at every gate.

### 5.4 Roles

| Role | First usable |
|---|---|
| `owner`, `admin`, `customer` | 1A |
| `cap_order_intake` | 1C |
| `staff_picker_packer`, `staff_inspector`, `staff_full`, `cap_dispatch`, `cap_delivery` | 2 |
| `cap_report` | 5 |

All roles are seeded in 1A; role management UI is in 5.

---

## 6. Migration plan

| Migration | Slice | Contents | Approval |
|---|---|---|---|
| `0003_standalone_pivot` | 1A | Full pivot; every table and trigger Slices 1A to 4 rely on, so no later slice reshapes them | Human, before merge (drops data) |
| `0004_stock_requests` | 3 | `product_stock_requests`, two permissions, grants | Normal review |
| `0005_reporting` | 5 | Reporting views, `orderflow_ro` view grants, refund paid-outside columns and trigger | Normal review |

Migrations are forward-only; a merged migration is never edited.

---

## 7. Rework check (why the order needs no throwaway work)

- Address request table, its triggers, the dispatch precondition, `checklist_epoch` and `phone_normalized` all exist from `0003`, so Slice 2's dispatch, checklist and offline queue are final when written.
- The queue and detail components built in 1C are the ones Slice 2 extends.
- Every settings key is seeded in `0003`; each slice only adds validation for its own key to the same endpoint.
- The Needs attention component takes groups as data; Slices 3 and 4 add rows, not code paths.
- Order creation calls `stock.isHeld` behind an interface from 1B; Slice 3 supplies the real implementation.
- Settings controls are built once in their slice; Slice 5 only places them on the Admin & Health page.

---

## 8. Package approvals (recorded 26 November 2026)

| Package | Slice | Note |
|---|---|---|
| `multer` 2.x | 1B | 1.x not allowed |
| `sharp` | 1B | Strips photo metadata |
| `vite-plugin-pwa` | 2 | App-shell service worker only |
| `idb-keyval` | 2 | Offline action queue in its own store |
| `@tanstack/react-query-persist-client` | 2 | Query cache persistence |
| `@tanstack/query-async-storage-persister` | 2 | IndexedDB persister for the query cache |

Install only when the slice starts; pin through the lockfile.

---

## 9. Gate 1 sign-off (human only)

**Gate 1 checks:**
- [ ] PRD v4.3, architecture v4.3 and AGENTS.md v4.3 read and accepted
- [ ] Slice scopes and order accepted
- [ ] Scenario ownership (5.3) accepted
- [ ] Migration plan accepted; `0003` approval to be given at the end of 1A
- [ ] Current repo uploaded for Slice 1A

| Role | Name | Decision (Accept, Revise, Reject) | Date | Notes |
|---|---|---|---|---|
| Planning lead | Ibrahim | | | |
| Architecture | Ihtesham | | | |
| Backend | Taha | | | |
| QA | Ahmed | | | |

---

## 10. Slice decisions (human only)

| Slice | Gate | Decision | Date | Reason | Evidence link |
|---|---|---|---|---|---|
| 1A | | | | | |
| 1B | | | | | |
| 1C | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

---

## 11. Change log (append-only)

| Date | Version | Change | By |
|---|---|---|---|
| 23 Nov 2026 | v01 | Shopify and native edition plan | Team with AI agent |
| 26 Nov 2026 | v02 | Standalone web edition: five slices with Slice 1 split into 1A, 1B, 1C; aligned to PRD v4.3 after the Gate 1 review; package approvals recorded | Team with AI agent |
