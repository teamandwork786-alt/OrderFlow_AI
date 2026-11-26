# Slice 1 (1A to 1F): Loaded context and test cases

**Status:** DRAFT for human review (D4 Stage 4: Load context, Refine criteria and tests). No code written.
**Revision 2 (26 Nov 2026):** re-mapped to the vertical slice plan in `plan.md` v03 (PRD, architecture and `AGENTS.md` v4.4). Slice 1 is now six slices, 1A to 1F; the earlier three-part layout (1A, 1B, 1C) no longer exists.
**Sources read:** `PRD.md` v4.4, `docs/architecture.md` v4.4, `AGENTS.md` v4.4, `plan.md` v03 (Gate 1 pending), D4 Testing Instructions and Quality Gates.

---

## Part 1. Loaded context and mapped requirements

### 1.1 Slice 1 at a glance (from `plan.md`)

| Slice | Person and outcome | Mode | Depends on | Migration | Packages | Owned scenarios |
|---|---|---|---|---|---|---|
| 1A Sign in and land in the right place | Every demo role and a new customer sign in and see the correct landing | HITL | repo baseline | `0001_identity` | none | 28, 32, 66 |
| 1B Customer places an order | Customer browses seeded products, checks out (server-priced), sees the order in My orders | HITL | 1A | `0002_orders` | none | 1, 2, 17, 31, 37, 47, 65 |
| 1C Confirmation email and status link | Customer gets the confirmation in the mock outbox and opens `/track`; Admin/Owner read the outbox | HITL | 1B | `0003_email_outbox` | none | 29, 36 |
| 1D Admin manages the catalogue | Admin/Owner add a product with phone photos and set the delivery charge | HITL | 1C | `0004_product_images_settings` | `multer` 2.x, `sharp` | 35 |
| 1E Staff queue and manual orders | Admin/Owner/Intake create manual orders and find any order by number, name, tracking or exact phone | HITL | 1D | `0005_order_search` | none | 6, 45, 67 |
| 1F Payment verification | Customer pays through the mock gateway or Admin confirms; the order becomes `PAID` | HITL | 1E | `0006_payments` | none | 3, 4, 5, 30, 54 |

Gate 1 status: the sign-off table in `plan.md` section 9 is **blank**. Test approval here is the slice-level Gate 1 (D4: "Slice Readiness: clear scope, linked requirements, acceptance criteria"). No repo upload or destructive-migration approval is needed any more: the repo was reset, and each migration is additive.

### 1.2 Functional requirements that apply

| Requirement | Slice | What the slice must deliver |
|---|---|---|
| **PRD 2.1 to 2.4** Roles, permission keys, authentication | 1A | OIDC sign-in for everyone through the issuer adapter; session cookie plus CSRF on writes; first sign-in provisions `customer` only (`INSERT ... ON CONFLICT` on `oidc_subject`); roles seeded as PRD 2.2; `GET /me`; `requirePermission`; customer and staff roles never combined |
| **FR-13** Audit, **FR-14** Health (`/health`) | 1A | Per-event Zod allowlist; insert in the caller's transaction; append-only; app and database health |
| **FR-01** storefront and intake | 1B | `/shop` (seeded products, `availability`), `/cart`, `/checkout`, server-priced `POST /orders` with `request_id`, `expected_total` consent check, quantity 1 to 20, at most 30 lines, phone regex, rate limit 10 per hour per user, five checklist rows, query-isolated `/my/orders` with its own DTO, address editable only before submit |
| **FR-01** email and status link | 1C | Single `email_outbox` insert inside the order transaction, `EmailAdapter.deliver` after commit, failure audited and never failing the order, `GET /admin/email-outbox`, token-gated `/track` (status only, no PII, rate limited per IP) |
| **FR-01** products and photos | 1D | Admin product create and edit, photo upload (5 MB, 5 per request, 10 active, JPEG/PNG/WebP by magic bytes, server UUID names, `nosniff`, metadata stripped, deactivate not delete), delivery charge setting; the 100 KB limit stays on every JSON route |
| **FR-01** manual orders, **FR-03** queue and search | 1E | `staffOrderScope`; `GET /orders`, `GET /orders/:id`; search by number, name, tracking, exact phone (`order.address.read`, own rate limiter, never logged); Awaiting payment filter for Owner/Admin; rows with payment status, lifecycle status, "N of 5"; manual order (`orders.create`, `source = MANUAL`) |
| **FR-02** payment, **FR-03** `PAYMENT_ISSUE` | 1F | `POST /webhooks/payments` (raw-body HMAC, `timingSafeEqual`, dedupe, one-transaction application, reasons, bad-signature throttle); mock gateway and `/pay/:orderNumber` only when `PAYMENT_ADAPTER=mock`; `confirm-payment` (method, reference 1 to 100 chars); set-once `payment_verified_at`; payment issues and their review |
| **FR-10** Timeline | 1A to 1F (events only) | Audit events written from 1A onward; the timeline view is Slice 2A |

### 1.3 Non-functional requirements that apply

| NFR | Treatment in Slice 1 |
|---|---|
| NFR-03 Reliability | Tested: state change and audit event commit together; duplicate requests harmless |
| NFR-04 Security | Tested: HMAC raw body, constant-time compare, server-side pricing, token, rate limits, CSRF, helmet, CORS, no PII or secrets in logs or audit, customer isolation, upload hardening |
| NFR-05 Data integrity | Tested directly in SQL, in the slice that creates each object |
| NFR-06 Maintainability | Checked at Gate 3 (strict TypeScript, Zod, `PaymentAdapter` and `EmailAdapter` ports) |
| NFR-07 Accessibility | Light check on each new screen |
| NFR-08 Demo availability | Tested in 1A: one `docker compose up --build` reaches healthy with no external account |
| NFR-02 Performance | Scenario 67 is owned by **1E** (queue with 100 seeded orders); storefront timing recorded in 1B; both re-measured at Gate 5 |
| NFR-01 Usability | Not tested in Slice 1 (staff workspace arrives in 2A) |

### 1.4 Slice 1 exit criteria (from `plan.md`)

- **1A:** owned scenarios pass; audit and grants SQL checks pass; `docker compose up --build` healthy; a new customer and each demo role land correctly.
- **1B:** owned scenarios pass; customer A cannot read customer B (API and UI); stored total equals the server calculation.
- **1C:** owned scenarios pass; no address or phone in email bodies or logs; a wrong token and an unknown number give the same 404.
- **1D:** owned scenario and upload hardening tests pass; a new product with photos appears in `/shop`; a changed delivery charge shows in the next order total.
- **1E:** owned scenarios pass; with 100 seeded orders queue API p95 under 1 s and initial render under 3 s. Cases needing `PAID` orders use fixtures until 1F.
- **1F:** owned scenarios pass; mock routes absent with `PAYMENT_ADAPTER` unset; a customer can sign in, order, pay, and the order is `PAID`.

### 1.5 Constraints that shape testing

AGENTS 10: tests use real PostgreSQL in Docker; SQL constraint tests for every trigger, unique index, CHECK and grant, **written in the slice that creates the object** and re-run at every gate; boundary tests where meaningful; no fabricated results. Scenario 28 (role denial per endpoint, no PII in logs or audit) is re-run at every gate. D4 Gate 4 (regression) for each slice re-runs the earlier slices' cases.

---

## Part 2. Test cases

**How to read the tables.** `Actual Result` and `Pass / Fail` are `PENDING` until execution; do not fill them from memory. "Sc" is a PRD section 12 scenario number. Type codes: **F** functional, **N** negative, **EP** equivalence partitioning, **BVA** boundary value analysis, **SQL** database contract test. Roles used: Owner, Admin, Picker (`staff_picker_packer`), Inspector (`staff_inspector`), Full (`staff_full`), Intake (`cap_order_intake`), Customer A and B.

### Slice 1A: Sign in and land in the right place

| Test ID | Sub-Slice & Req ID | Test Type | Input / Condition | Expected Result | Actual Result | Pass / Fail |
|---|---|---|---|---|---|---|
| 1A-01 | 1A · §2.4, Sc32 | F | Sign in through mock-oidc as each seeded account (Owner, Admin, Picker, Inspector, Full, Customer A, Customer B); call `GET /me` | Roles equal the seed exactly; customers land on `/shop`, staff on `/orders` placeholder "Workspace arrives in Slice 2"; sign-out ends the session and `/me` then returns 401 | PENDING | PENDING |
| 1A-02 | 1A · §2.4, Sc32 | F | New subject uses the mock-mode create-account path, then signs in | One user with role `customer` only; `/me` shows only the three `customer.*` keys; name and email come from token claims | PENDING | PENDING |
| 1A-03 | 1A · §2.2, FR-05 | F | `GET /me` for Picker, Inspector, Full, Admin (staff-mode off), Owner | Allowed checklist steps: Picker 1-2, Inspector 3-5, Full 1-5, Admin none, Owner 1-5 | PENDING | PENDING |
| 1A-04 | 1A · §2.2 | F | Compare `packages/shared` permission map with `role_permissions` in the migrated database | Identical; roles `staff`, `cap_address_update` and key `checklist.update` do not exist | PENDING | PENDING |
| 1A-05 | 1A · FR-14 | F | `GET /health` with database up | 200, reports app and database healthy, no secrets or connection string in the body | PENDING | PENDING |
| 1A-06 | 1A · FR-13, NFR-03 | F | Audit module: insert an event with allowed keys inside a transaction, then roll the transaction back | Event stored on commit; no event remains after rollback (same transaction) | PENDING | PENDING |
| 1A-07 | 1A · NFR-08 | F | From a clean checkout: `cp .env.example .env`, `docker compose up --build`, run seed with `ALLOW_DESTRUCTIVE_SEED=true` | `postgres`, `migrate`, `api`, `mock-oidc`, `web` healthy; seed connects with per-service URLs (no `localhost` inside containers); demo accounts exist | PENDING | PENDING |
| 1A-08 | 1A · Sc28, FR-13 | N | Audit insert with an unknown key in `details` (for example `address`) | Rejected by the per-event Zod allowlist; nothing stored | PENDING | PENDING |
| 1A-09 | 1A · Sc28, §2.4 | N | Call a protected route with no cookie; then with an expired or tampered session cookie | 401 `UNAUTHENTICATED`; no data returned | PENDING | PENDING |
| 1A-10 | 1A · NFR-04, §2.4 | N | POST sign-out with valid cookie but missing, wrong, or another user's CSRF token | Rejected (403); session not ended; correct token succeeds. Payment webhook is exempt from CSRF (HMAC instead) | PENDING | PENDING |
| 1A-11 | 1A · §2.4, NFR-04 | N | Sign-in with an ID token that is expired, wrong audience, wrong issuer, or bad signature; and a callback with a wrong `state` | Rejected; no session and no user row created | PENDING | PENDING |
| 1A-12 | 1A · Sc28 | N | `requirePermission` test: every role against every permission key | Allowed exactly where PRD 2.2 says; Admin checklist keys not effective by default; denial is 403 `FORBIDDEN` | PENDING | PENDING |
| 1A-13 | 1A · Sc32 | N | Service rule: assign a staff role to a customer account; assign `customer` to a staff account | Both refused (no UI until Slice 5C, so tested at service level) | PENDING | PENDING |
| 1A-14 | 1A · Sc66 | N | Two simultaneous first sign-ins with the same new `oidc_subject` | Exactly one `users` row and one `customer` role row; both requests succeed | PENDING | PENDING |
| 1A-15 | 1A · NFR-04, §2.4 | N | Inspect sign-in response: cookie flags; browser storage after sign-in; log lines for the sign-in | HttpOnly and SameSite set, `Secure` configurable; no token in `localStorage` or `sessionStorage`; logs contain no email, name, token or secret | PENDING | PENDING |
| 1A-16 | 1A · §2.4 | N | Customer opens a staff route (`/orders`) and calls a staff endpoint | No-access page in the UI; 403 from the API | PENDING | PENDING |
| 1A-17 | 1A · Sc18 (audit half) | SQL | UPDATE and DELETE on `audit_events` as `orderflow_app` and as `orderflow_owner` | Both rejected by `reject_modification()`; INSERT works. (`order_notes` is tested in 2A, `order_address_revisions` in 4A) | PENDING | PENDING |
| 1A-18 | 1A · §8.5 | SQL | As `orderflow_app`: DELETE and TRUNCATE on any table. As `orderflow_ro`: SELECT on a base table | All denied | PENDING | PENDING |
| 1A-19 | 1A · §8.3 | SQL | Insert a second user with the same `oidc_subject` | Rejected by the unique index | PENDING | PENDING |
| 1A-20 | 1A · §8.3 | SQL | Apply `0001_identity` to an empty database; apply `prisma migrate deploy` a second time | Succeeds; second run is a no-op. The same check is repeated for each slice's migration at its gate (empty database and previous slice's database) | PENDING | PENDING |

### Slice 1B: Customer places an order

| Test ID | Sub-Slice & Req ID | Test Type | Input / Condition | Expected Result | Actual Result | Pass / Fail |
|---|---|---|---|---|---|---|
| 1B-01 | 1B · Sc1, FR-01 | F | Anonymous visitor adds 2 products, goes to checkout, is sent to sign-in, returns to the cart, submits valid details | 201; order `PENDING_PAYMENT`, `source = STOREFRONT`, `customer_user_id` set, five checklist rows, server-computed total = lines + `delivery_charge_pkr`, audit event written | PENDING | PENDING |
| 1B-02 | 1B · FR-01 | F | Anonymous `GET /storefront/products` with seeded products `AVAILABLE`, `OUT_OF_STOCK`, `HIDDEN` | `AVAILABLE` listed; `OUT_OF_STOCK` listed with badge and Add to cart disabled; `HIDDEN` absent; prices formatted in PKR. (Photos are checked in 1D) | PENDING | PENDING |
| 1B-03 | 1B · Sc31, FR-01 | F | Customer A lists and opens own order | Fields: number, items, totals, status, timestamps, tracking only once dispatched, own address, address-request state; no notes, checklist, audit, payment reference or staff names | PENDING | PENDING |
| 1B-04 | 1B · Sc2, FR-01 | F | Send the same `POST /orders` (same `request_id`, same payload) twice | Second call returns the original order; one order row and one outbox row | PENDING | PENDING |
| 1B-05 | 1B · Sc37, FR-01 | F | Edit the address on the checkout form before submit; after submit try any edit call on the order as the customer | Free editing before submit; afterwards no customer endpoint can change it (404 or 405) | PENDING | PENDING |
| 1B-06 | 1B · NFR-02 | F | `GET /storefront/products` 20 times against the seeded catalogue | Each answer under 1 second locally; timings and environment recorded as early NFR-02 evidence (scenario 67 itself is owned by 1E) | PENDING | PENDING |
| 1B-07 | 1B · Sc1, NFR-04 | N | Anonymous `POST /orders` | 401 `UNAUTHENTICATED`; no order row | PENDING | PENDING |
| 1B-08 | 1B · Sc1, NFR-04 | N | Body carries `unit_price` or `total` fields set to 1.00 | Rejected by validation or ignored; stored total always the server total | PENDING | PENDING |
| 1B-09 | 1B · Sc31 | N | Customer B requests `/my/orders/<A's number>`, and an unknown number | Both return the identical 404 body; B's list excludes A's orders | PENDING | PENDING |
| 1B-10 | 1B · Sc31, Sc28 | N | Customer calls a staff-permission route (a test route registered in the integration harness) | 403 `FORBIDDEN`. (Real staff routes are tested where they appear: outbox 1C, products 1D, orders 1E, confirm-payment 1F) | PENDING | PENDING |
| 1B-11 | 1B · NFR-04 | N | `POST /orders` with valid cookie but no CSRF token | Rejected; no order created | PENDING | PENDING |
| 1B-12 | 1B · Sc35 | N | `POST /orders` JSON body larger than 100 KB | Rejected (413); no order | PENDING | PENDING |
| 1B-13 | 1B · Sc47 | N | Edit the product price after the cart was built; submit with the old `expected_total` | 409 `PRICE_CHANGED` with the current total; no order, no outbox row | PENDING | PENDING |
| 1B-14 | 1B · FR-01 | N | Order lines containing: a `HIDDEN` product, an `OUT_OF_STOCK` product, an unknown product id | Whole order refused with `PRODUCT_UNAVAILABLE`; offending line identified; nothing created | PENDING | PENDING |
| 1B-15 | 1B · Sc2, FR-01 | N | Same `request_id` with a different payload | 409 `IDEMPOTENCY_CONFLICT`; original order unchanged | PENDING | PENDING |
| 1B-16 | 1B · Sc28, NFR-04 | N | Run the order flows (checkout, my-orders), then search the logs and `audit_events` for the test address, phone, email | None found | PENDING | PENDING |
| 1B-17 | 1B · Sc16 | SQL | After each of `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `order_number`, `public_token`, `customer_user_id` is set, try to change it, as `orderflow_app` and as `orderflow_owner` | Every change raises; setting NULL to a value the first time is allowed | PENDING | PENDING |
| 1B-18 | 1B · Sc17 | SQL | Attempt all 30 ordered pairs of distinct lifecycle states | Exactly the 8 graph edges succeed (including `PREPARING` to `PAID`); the other 22 raise | PENDING | PENDING |
| 1B-19 | 1B · Sc65 | SQL | Set `PAID`/`PREPARING` without `payment_verified_at`; `DISPATCHED` without `dispatched_at`; `DELIVERED` without `delivered_at`; then each with the timestamp present | Missing-timestamp cases rejected by CHECK; present cases accepted | PENDING | PENDING |
| 1B-20 | 1B · §8.3 | SQL | Insert a duplicate `products.sku`; a duplicate `(order_id, step_number)` in `checklist_steps` | Both rejected | PENDING | PENDING |
| 1B-21 | 1B · §8.3 | EP | CHECK classes: `source` STOREFRONT with and without `customer_user_id`, MANUAL; `availability` valid and invalid | Valid classes accepted; STOREFRONT without customer and a bad `availability` rejected | PENDING | PENDING |
| 1B-22 | 1B · FR-01 | EP | Phone classes: `+923001234567`, `03001234567`; invalid `0300-1234567`, `abc`, empty | Valid accepted; invalid `VALIDATION_FAILED` | PENDING | PENDING |
| 1B-23 | 1B · FR-01, Sc31 | EP | Order-read classes: own order, other customer's order, unknown number, manual order with no customer link | 200, 404, 404, 404 | PENDING | PENDING |
| 1B-24 | 1B · §8.3 | BVA | `quantity` 0, 1, 20, 21; money -0.01 and 0.00 | Accepted: 1, 20, 0.00. Rejected: 0, 21, -0.01. (Tracking-length boundaries are tested in 2B, image size in 1D) | PENDING | PENDING |
| 1B-25 | 1B · FR-01 | BVA | Line quantity 0, 1, 20, 21, 1.5, -1; lines 0, 1, 30, 31 | Accepted: quantity 1 and 20, lines 1 and 30. Rejected: all others | PENDING | PENDING |
| 1B-26 | 1B · Sc47 | BVA | `expected_total` equal to the server total written `1200`, `1200.0`, `1200.00`; then 1199.99 and 1200.01 | Equal decimals accepted (decimal compare, not string compare); 1199.99 and 1200.01 return `PRICE_CHANGED` | PENDING | PENDING |
| 1B-27 | 1B · Sc29 | BVA | 10th and 11th order in one hour by one user | 10th 201; 11th 429 | PENDING | PENDING |
| 1B-28 | 1B · FR-01 | BVA | Phone with 9, 10, 15, 16 digits (with and without leading `+`); JSON body of 102,400 and 102,401 bytes | 10 and 15 digits accepted; 9 and 16 rejected; 102,400 accepted, 102,401 rejected | PENDING | PENDING |
| 1B-29 | 1B · NFR-04 | BVA | Money arithmetic with seeded prices: 3 lines at 0.10; 3 x 33.33 | Totals 0.30 and 99.99 exact (no float drift) | PENDING | PENDING |

### Slice 1C: Confirmation email and status link

| Test ID | Sub-Slice & Req ID | Test Type | Input / Condition | Expected Result | Actual Result | Pass / Fail |
|---|---|---|---|---|---|---|
| 1C-01 | 1C · Sc36, FR-01 | F | Place an order; Admin opens `GET /admin/email-outbox` | Exactly one `email_outbox` row, status `STORED`, containing order number, tracking link with token and recipient name; no address, phone or item prices | PENDING | PENDING |
| 1C-02 | 1C · FR-01 | F | Open `/track?order=<n>&token=<t>` | Status, timestamps and tracking only; no address, phone or email; `Referrer-Policy: no-referrer` | PENDING | PENDING |
| 1C-03 | 1C · Sc28 | N | Picker, Inspector, Full, Intake and Customer call `GET /admin/email-outbox` | All 403; Admin and Owner succeed | PENDING | PENDING |
| 1C-04 | 1C · Sc36 | N | Force the email adapter to throw | Order still 201 and committed; outbox row `FAILED` with error code; audit `ORDER_CONFIRMATION_EMAIL_FAILED`; still exactly one outbox row | PENDING | PENDING |
| 1C-05 | 1C · Sc29 | N | 31 `/track` calls in a minute from one IP (order creation limit is tested in 1B-27) | 31st gets 429 | PENDING | PENDING |
| 1C-06 | 1C · Sc31, FR-01 | N | `/track` with a wrong token and with an unknown order number | Identical 404 for both | PENDING | PENDING |
| 1C-07 | 1C · Sc28, NFR-04 | N | Run the email flow (order confirmation, track), then search logs, `audit_events` and the email body for the test address, phone and token in logs | Address and phone absent from email, logs and audit; the token appears only in the email link | PENDING | PENDING |

### Slice 1D: Admin manages the catalogue

| Test ID | Sub-Slice & Req ID | Test Type | Input / Condition | Expected Result | Actual Result | Pass / Fail |
|---|---|---|---|---|---|---|
| 1D-01 | 1D · §7, FR-01 | F | After migration `0004`: read `system_settings` | Keys `delivery_charge_pkr` (0.00) and `sla_unstarted_hours` (24) seeded. The other four keys are seeded by their own slices (2A, 2C, 3, 4A), each checked at that slice's gate | PENDING | PENDING |
| 1D-02 | 1D · FR-01 | F | Admin creates a product, edits its price, deactivates one photo and reorders another | Existing orders keep their old price and total; new orders use the new price; deactivated photo disappears from the storefront but file and row remain | PENDING | PENDING |
| 1D-03 | 1D · Sc35, FR-01 | F | Admin uploads a JPEG with GPS metadata (camera control and gallery control on desktop) | 201; stored as `uploads/products/<uuid>.jpg` (server name); served with `X-Content-Type-Options: nosniff`; GPS metadata absent after re-encode | PENDING | PENDING |
| 1D-04 | 1D · FR-01 | F | Admin sets `delivery_charge_pkr` to 150.00 with a reason; place an order | Total includes 150.00; change audited; invalid value (negative, non-decimal) rejected | PENDING | PENDING |
| 1D-05 | 1D · Sc28 | N | Picker, Inspector, Full, Intake call create product, image upload, `PATCH /settings/operations` | All 403; Admin and Owner succeed | PENDING | PENDING |
| 1D-06 | 1D · NFR-04 | N | Image upload with valid cookie but no CSRF token | Rejected; no file stored | PENDING | PENDING |
| 1D-07 | 1D · Sc35 | N | Upload a text file renamed `photo.jpg` with declared type `image/jpeg` | 415 `UNSUPPORTED_IMAGE_TYPE`; nothing on disk, no row | PENDING | PENDING |
| 1D-08 | 1D · Sc35 | N | Image upload of 3 MB after the JSON limit case | Accepted; the 100 KB JSON limit does not apply to the image route | PENDING | PENDING |
| 1D-09 | 1D · NFR-04 | N | `GET /uploads/products/..%2f..%2f.env`, directory path, and a non-existent UUID | 404 each; no directory listing; no file outside the upload folder reachable | PENDING | PENDING |
| 1D-10 | 1D · FR-01 | N | Force the `product_images` insert to fail after the file is written | File removed from disk; error returned; no row | PENDING | PENDING |
| 1D-11 | 1D · Sc35 | EP | Upload valid classes JPEG, PNG, WebP; invalid classes GIF, SVG, PDF, 0-byte file, ZIP renamed `.png`; and PNG bytes named `x.txt` with type `text/plain` | Valid: 201. Invalid: 415 with stable code. PNG bytes named `.txt` accepted (checked by bytes only) and stored with `.png` extension | PENDING | PENDING |
| 1D-12 | 1D · Sc35 | BVA | Upload exactly 5,242,880 bytes and 5,242,881 bytes (fixtures padded to size) | First 201; second 413 `IMAGE_TOO_LARGE`, nothing stored | PENDING | PENDING |
| 1D-13 | 1D · Sc35 | BVA | Upload 5 files and 6 files in one request; product with 9, 10 active photos then upload one more; two simultaneous uploads when 9 are active | 5 stored; 6 refused as a whole; 10th accepted, 11th refused; concurrent case ends with at most 10 active | PENDING | PENDING |
| 1D-14 | 1D · NFR-04 | BVA | Create products with price 9999999999.99, one cent above, and -0.01 | Maximum accepted; overflow and negative rejected | PENDING | PENDING |

### Slice 1E: Staff queue and manual orders

| Test ID | Sub-Slice & Req ID | Test Type | Input / Condition | Expected Result | Actual Result | Pass / Fail |
|---|---|---|---|---|---|---|
| 1E-01 | 1E · FR-01 | F | Admin, Owner and Intake create a manual order with `external_reference` | `source = MANUAL`, no `customer_user_id`, `PENDING_PAYMENT`, reference stored | PENDING | PENDING |
| 1E-02 | 1E · FR-03, Sc46 | F | Admin lists default view and Awaiting payment filter | Default Pending shows `PAID`/`PREPARING`; Awaiting payment shows `PENDING_PAYMENT`; rows show payment status (Awaiting, Verified with method, Payment issue), lifecycle status and "N of 5" (Verified and Payment issue rows use fixtures until 1F) | PENDING | PENDING |
| 1E-03 | 1E · Sc6, Sc46 | F | Full lists orders; opens an unpaid order by id; searches an unpaid order's number | List excludes `PENDING_PAYMENT`; direct open returns 404; search returns nothing | PENDING | PENDING |
| 1E-04 | 1E · Sc45, FR-03 | F | Search as Admin: order number exact and prefix `OF-0001`; name `ali` against "Ali Khan"; tracking exact (fixture dispatched order); phone full normalized | Each returns only matching orders the user may open | PENDING | PENDING |
| 1E-05 | 1E · Sc67, NFR-02 | F | Seed 100 active orders; call `GET /orders` 50 times; load the queue in the browser | API p95 under 1 second and initial queue render under 3 seconds; environment details recorded | PENDING | PENDING |
| 1E-06 | 1E · Sc45, Sc28 | N | Phone search as Intake or any user lacking `order.address.read`; as Customer | Refused (403); with `order.address.read` allowed | PENDING | PENDING |
| 1E-07 | 1E · Sc45, FR-03 | N | Partial phone `0300123`; the phone of an unpaid order as Full; typed phone searched then logs inspected | Partial returns nothing; unpaid order never returned to staff; typed number absent from logs | PENDING | PENDING |
| 1E-08 | 1E · Sc6, NFR-04 | N | Search and filter inputs: `' OR 1=1 --`, `%`, `_`, 5,000 characters; Full forces `payment_status=awaiting` or a `PENDING_PAYMENT` filter | No error detail leaked; wildcards matched literally; no extra rows; filters cannot widen staff scope | PENDING | PENDING |
| 1E-09 | 1E · NFR-04 | N | Manual-order write without CSRF token | Rejected; no order created | PENDING | PENDING |
| 1E-10 | 1E · Sc28, FR-01 | N | Picker creates a manual order; a Customer sends `external_reference` in a storefront order | Picker 403; `external_reference` ignored or rejected and never stored for storefront orders | PENDING | PENDING |
| 1E-11 | 1E · §8.1 | SQL | Insert `customer_phone` values `+92 300-1234567` and `0300 1234567`; try to write `phone_normalized` directly | Generated values `923001234567` and `03001234567`; direct write refused | PENDING | PENDING |
| 1E-12 | 1E · Sc45, FR-03 | EP | Search classes: valid (number exact, number prefix, name contains in mixed case, tracking exact, full phone); non-searchable (address text, email, partial phone) ; empty query | Valid classes return matches; non-searchable return empty; empty query returns the default view | PENDING | PENDING |
| 1E-13 | 1E · Sc6, Sc46 | EP | Role classes on `GET /orders`: Customer; Intake alone; Picker, Inspector, Full; Admin; Owner | 403; 403; paid-and-later only; all orders; all orders | PENDING | PENDING |
| 1E-14 | 1E · Sc45 | EP | Phone formats: stored `+923001234567`; query `+92 300 1234567`, `923001234567`, `03001234567` | First two match (digits `923001234567`); `03001234567` does not match. Documents the exact-normalized rule (see open point 2) | PENDING | PENDING |
| 1E-15 | 1E · Sc45 | BVA | 30th and 31st phone search in one minute by one user; page size 25 default, 100, 101 | 30th ok, 31st 429; default 25; 100 allowed; 101 rejected or clamped to 100 (fix behaviour in the 1C plan) | PENDING | PENDING |

### Slice 1F: Payment verification

| Test ID | Sub-Slice & Req ID | Test Type | Input / Condition | Expected Result | Actual Result | Pass / Fail |
|---|---|---|---|---|---|---|
| 1F-01 | 1F · Sc3, FR-02 | F | Customer signs in, orders, opens `/pay/:orderNumber`, clicks Simulate successful payment | Server-signed event passes through `POST /webhooks/payments`; order `PAID` once; `payment_verified_at` set from the server clock; `payment_events` row `APPLIED`; audit event; version bumped | PENDING | PENDING |
| 1F-02 | 1F · Sc5, FR-02 | F | Admin confirms payment: method `RAAST`, reference `TXN-1`, current `expected_version` | Order `PAID`; confirming user and reference stored and audited; same set-once timestamp as the gateway path | PENDING | PENDING |
| 1F-03 | 1F · Sc4, FR-03 | F | Send a rejected event (amount mismatch) for a `PENDING_PAYMENT` order | Order appears in `PAYMENT_ISSUE` for Owner/Admin and not for staff | PENDING | PENDING |
| 1F-04 | 1F · Sc54 | F | Send a valid event for an already-`PAID` order (double payment); Admin calls `POST /admin/payment-events/:id/review` | Event stored `REJECTED` `ORDER_NOT_PAYABLE`; order unchanged; in `PAYMENT_ISSUE` until reviewed; review clears it and is audited. (Cancelled-order variant uses a DB fixture until Slice 4) | PENDING | PENDING |
| 1F-05 | 1F · FR-02 | F | Run `npm run payment:simulate` with `valid`, `tampered`, `mismatch`, `wrong-currency`, `duplicate` | Outputs match cases 1F-01, 1F-07, 1F-09, 1F-10, 1F-11 (human task, confirm by eye) | PENDING | PENDING |
| 1F-06 | 1F · Sc6, Sc45, Sc46 | F | Re-run 1E cases for staff scope and search on orders that became `PAID` through the 1F flows instead of fixtures | Same results as with fixtures | PENDING | PENDING |
| 1F-07 | 1F · Sc4, NFR-04 | N | Valid event body altered after signing; body signed with the wrong secret; missing signature header | 401; order unchanged; no effect on any order | PENDING | PENDING |
| 1F-08 | 1F · NFR-04 | N | Signature computed over re-serialized JSON (different whitespace) instead of the raw bytes | 401 (proves raw-body verification) | PENDING | PENDING |
| 1F-09 | 1F · Sc4, FR-02 | N | Event amount differs from the order total | Stored `REJECTED` `AMOUNT_MISMATCH`; order stays `PENDING_PAYMENT`; audited | PENDING | PENDING |
| 1F-10 | 1F · Sc4, FR-02 | N | Event with currency `USD`; event for an unknown order number | `REJECTED` `CURRENCY_MISMATCH`; `REJECTED` `UNKNOWN_ORDER`; no order changed | PENDING | PENDING |
| 1F-11 | 1F · Sc4, NFR-03 | N | Same `provider_event_id` sent twice in sequence, and twice concurrently | One effect; second returns the original result; one `payment_events` row; `payment_verified_at` unchanged | PENDING | PENDING |
| 1F-12 | 1F · Sc4, NFR-04 | N | Many invalid-signature requests from one IP | 429 after the configured limit; throttle is per IP | PENDING | PENDING |
| 1F-13 | 1F · Sc5, Sc28 | N | Picker, Inspector, Full, Intake, Customer call `confirm-payment`; Admin and Owner call it | All staff and customer attempts 403; Admin and Owner succeed | PENDING | PENDING |
| 1F-14 | 1F · Sc5, FR-02 | N | Confirm payment with missing reference, whitespace reference, method `CARD`, stale `expected_version` | 400 `VALIDATION_FAILED` for the first three; 409 `VERSION_CONFLICT` for the stale version; nothing written | PENDING | PENDING |
| 1F-15 | 1F · Sc5, NFR-03 | N | Confirm an already-`PAID` order; replay the same `request_id`; two Admins confirm at the same moment | Already paid: refused, timestamp unchanged; replay returns the original result; concurrent case: exactly one succeeds | PENDING | PENDING |
| 1F-16 | 1F · Sc30 | N | Start API with `PAYMENT_ADAPTER` unset; call `POST /mock-gateway/orders/:n/pay`; open `/pay/:n`; run `payment:simulate` | Route absent (404); demo page absent; simulator refuses | PENDING | PENDING |
| 1F-17 | 1F · Sc3, FR-02 | N | Mock-gateway pay for another customer's order; and anonymously | Another customer's order refused (404 or 403); anonymous 401 | PENDING | PENDING |
| 1F-18 | 1F · NFR-04 | N | `confirm-payment` without CSRF token; the payment webhook without CSRF token but with a valid signature | `confirm-payment` rejected; webhook accepted (HMAC is its protection) | PENDING | PENDING |
| 1F-19 | 1F · §8.3 | SQL | Insert a duplicate `(provider, provider_event_id)` into `payment_events` | Rejected by the unique index | PENDING | PENDING |
| 1F-20 | 1F · Sc4 | BVA | Order total 1200.00; event amounts `1200.00`, `1200`, `1199.99`, `1200.01` | Applied for `1200.00` and `1200` (decimal compare); `AMOUNT_MISMATCH` for 1199.99 and 1200.01 | PENDING | PENDING |
| 1F-21 | 1F · Sc5 | BVA | `payment_reference` of 0, 1, 100, 101 characters | 0 and 101 rejected; 1 and 100 accepted | PENDING | PENDING |
| 1F-22 | 1F · Sc5, NFR-03 | BVA | `expected_version` equal to current, and current minus 1 | Equal accepted; older gives 409 `VERSION_CONFLICT` | PENDING | PENDING |
| 1F-23 | 1F · Sc3, §8.2 | BVA | Event carries a `paid_at` one day in the past and one hour in the future | `payment_verified_at` is the server clock time in both cases | PENDING | PENDING |


### Cases carried to later slices (not part of Slice 1)

These SQL cases belonged to the earlier "1A" but test objects that now arrive later; they move with their migration.

| Earlier ID | Moves to | What it tests |
|---|---|---|
| 1A-21 (part) | 2A (`0007`) and 4A (`0011`) | `order_notes` and `order_address_revisions` are append-only, as app and owner role |
| 1A-23 | 2A (`0007`) | `checklist_epoch` can increase, never decrease |
| 1A-24 | 2B (`0008`) | Dispatch insert refused for a non-`PREPARING` order and for 4 of 5 steps; accepted when valid. The open-address-request clause is added and re-tested in 4A |
| 1A-25 | 4A (`0011`) | Address request triggers: one `OPEN` per order, window, immutable proposed address, status graph, flag sync |
| 1A-26 (part) | 2B (`0008`) | One succeeded dispatch per order |
| 1A-30 (part) | 2B (`0008`) | Tracking length 5, 6, 30, 31 and bad punctuation |

---

## Part 3. Totals and coverage

| Sub-slice | Cases | F | N | SQL | EP | BVA | Owned scenarios |
|---|---|---|---|---|---|---|---|
| 1A | 20 | 7 | 9 | 4 | 0 | 0 | 28, 32, 66 |
| 1B | 29 | 6 | 10 | 4 | 3 | 6 | 1, 2, 17, 31, 37, 47, 65 |
| 1C | 7 | 2 | 5 | 0 | 0 | 0 | 29, 36 |
| 1D | 14 | 4 | 6 | 0 | 1 | 3 | 35 |
| 1E | 15 | 5 | 5 | 1 | 3 | 1 | 6, 45, 67 |
| 1F | 23 | 6 | 12 | 1 | 0 | 4 | 3, 4, 5, 30, 54 |
| **Slice 1 (1A to 1F)** | **108** | | | | | | all 23 owned scenarios |

Every one of the 23 owned scenarios has at least one case; scenario 28 is also re-run at each later gate.

## Part 4. Open points for your decision (none blocks approving the cases)

1. **Phone search and country prefix.** The rule is exact match on digits only, so `03001234567` and `+923001234567` are different numbers (case 1E-14). That follows PRD FR-03 literally; if staff will type local-style numbers, say so now and I will propose a normalization rule for you to approve.
2. **Details the documents leave open** (the expected result says "rejected" where no code is fixed): CSRF failure code, HTTP status of `PRODUCT_UNAVAILABLE`, the bad-signature throttle limit, the 429 error code, behaviour for page size above 100. Each can be fixed in the HITL plan for its slice. I read "100 KB" as 102,400 bytes.
3. **Fixtures.** Until 1F the app cannot create `PAID` orders, and until Slices 2B and 4B it cannot create dispatched or cancelled ones; test setup inserts them through the owner role. Case 1E-02 and the staff-scope cases are re-run on real paid orders in 1F.
4. **Deferred parts.** Offline half of scenario 45 (2C); the Users UI for scenario 32 (tested at service level in case 1A-13, UI in 5C); final NFR-02 re-measurement (Gate 5).
5. **Size.** 108 cases is more than "lightweight". If you want fewer, drop the EP and BVA rows that repeat SQL or earlier checks first.
6. **Evidence file.** After approval these rows move to `docs/evidence/test-evidence.md` (AGENTS 10), which does not exist on `main` after the reset; Slice 1A creates it.
7. **Resolved by the new plan:** the lost-baseline question (migrations `0001` and `0002` and `constraints.sh`) no longer applies; the schema starts fresh and SQL checks are written per slice.