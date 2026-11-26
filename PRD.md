# OrderFlow AI: Product Requirements Document

**Version:** 4.3 (Standalone Web Edition) | **Date:** 26 November 2026
**Supersedes:** PRD v4.2 and v4.1 (25 to 26 Nov 2026), v3.0 (Shopify and native-app edition) and the unreviewed "v4.0" draft
**Client:** Hannan's decoration-piece business, Pakistan | **Currency:** PKR only
**Source-of-truth order:** this PRD, then `docs/architecture.md`, then `api-spec/openapi.yaml`, then `AGENTS.md`

---

## 0. What changed (read first)

### From v3.0 to v4.1

| Removed | Replaced by |
|---|---|
| Shopify storefront, webhooks, GraphQL/REST, fulfilment calls, conflict flags, reconcile worker, `DISPATCH_PENDING` | OrderFlow's own storefront, own orders, one atomic internal dispatch |
| Payment eligibility from Shopify data | Payment verification: signed `PaymentAdapter` event (mock in the demo) or manual confirmation by Owner/Admin |
| Expo / React Native app (`apps/native`) | One responsive web app (`apps/web`) |
| "No offline mode" (old non-goal) | Offline viewing and checklist work; dispatch blocked offline unless the Owner switches on an override |

**Kept unchanged:** PostgreSQL roles `orderflow_owner`, `orderflow_app`, `orderflow_ro`; `NUMERIC(12,2)` PKR; UTC `TIMESTAMPTZ` with `Asia/Karachi` report days; set-once timestamps; append-only `audit_events` and `order_notes`; `order_version` locking; `request_id` idempotency; RBAC checked in the API; manual refund application tracking (no money moves); the read-only `apps/analytics` service; OIDC sign-in with a mock issuer.

### From v4.1 to v4.2

| Change | Detail |
|---|---|
| Customers sign in | OIDC with a `customer` role. No anonymous ordering. `/my-orders` shows only the customer's own orders (FR-01) |
| Three staff profiles | `staff_picker_packer` (steps 1 to 2), `staff_inspector` (steps 3 to 5), `staff_full` (all five). Admin performs checklist steps only when `admin_can_perform_staff_tasks` is switched on (FR-05) |
| Product management and photo upload | Admin/Owner create and edit products and upload photos from a phone; local `/uploads` volume (FR-01) |
| Order confirmation email | `EmailAdapter` with a mock outbox you can inspect (FR-01) |
| Wrong-address complaint flow | Customer request, Admin/Owner applies or declines, fourth "Needs attention" group (FR-01, FR-03, FR-04) |
| Checklist screen | Numbered collapsible steps 1 to 5 (FR-05) |
| Offline | Dispatch locked up front with a clear message; only Owner and Admin may queue an offline dispatch, and only when the Owner override is on (FR-07) |

### From v4.2 to v4.3 (Gate 1 review, 26 Nov 2026)

| Change | Detail |
|---|---|
| TA core requirements | TA Req #1 (search), #2 (checklist progress), #3 (dispatch performance report) written into FR-03, FR-05 and FR-12; mapping in 12.1 |
| Phone search | Exact match on normalized digits, staff with `order.address.read`, online only, rate limited (FR-03) |
| Queue rows | Show payment status, lifecycle status and checklist progress "N of 5" |
| Stock availability | New FR-15: staff report a product out of stock; a timed hold blocks new orders; Owner/Admin approve or decline; one `availability` value replaces `is_available`; fifth Needs attention group `STOCK_ISSUE` |
| Address requests | 4-hour submission window; order hidden from staff while a request is open; checklist blocked; Apply resets the checklist to step 1 and the order to `PAID`; cancel voids an open request (FR-04, FR-09) |
| Checklist epoch | `orders.checklist_epoch` makes offline actions recorded before a reset fail safely (FR-05, FR-07) |
| Price changes | Client sends `expected_total`; a mismatch returns `PRICE_CHANGED` (FR-01) |
| Payment issues | `PAYMENT_ISSUE` also covers payments that arrive for a cancelled or already-paid order (FR-03) |
| Report | Today or custom range, delivered count, defined population and explicit excluded count, daily, weekly and monthly views, sales and units (FR-12) |
| Refunds | PRD model kept; optional "recorded as paid outside OrderFlow" entry added (FR-11) |
| Permissions | Staff profiles may add exception notes and report stock; only the Owner switches Admin staff-mode |
| Database | Timestamp CHECKs, read-only reporting views, analytics reached only through the API |
| Packages | `multer` 2.x, `sharp`, `vite-plugin-pwa`, `idb-keyval`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister` approved |

---

## 1. Product overview

### 1.1 Purpose
Signed-in customers order from OrderFlow's own web store and can follow their orders. Payment is verified (by a signed payment event or by an Owner/Admin). Verified orders enter the staff queue, are packed through a five-step checklist by the right staff profile, dispatched exactly once with a tracking number, and marked delivered. A customer who gave a wrong address can report it, and an Owner/Admin applies the correction before dispatch. Refund applications are tracked by hand. Two reports measure speed and list refund applicants.

### 1.2 Goals
1. One trustworthy path from checkout to delivery with every step timestamped and audited.
2. A demo that never depends on an external account: mock payment adapter and mock OIDC issuer.
3. Minimal navigation: four primary items.
4. Safe by construction: the database refuses invalid states even if the application has a bug.

### 1.3 Non-goals (Phase 1)
Live payment gateway (PayFast is Phase 2 behind the same `PaymentAdapter`), card data of any kind, Cash on Delivery, partial or split payments, automated refunds or any money movement, courier integration, inventory counts and stock reservation, discount codes, password handling inside OrderFlow (the OIDC provider owns credentials), customer self-cancellation, customer-side refund submission, customer editing of an order after it is placed, real email delivery and automatic email retry (Phase 2), cloud object storage, native mobile app, multi-store, editing prices or quantities after an order exists, dispatch undo, delivery undo, a `REFUNDED` status, chatbots and generative-AI features.

---

## 2. Users, roles and permissions

### 2.1 User types
- **Customer:** signs in through OIDC and holds only the `customer` role. May browse the catalogue without signing in (D-14); **must sign in to place an order or to see order history.** Sees only their own orders (`orders.customer_user_id = current_user.id`) and never another customer's. Has no access to the staff workspace.
- **Staff** (three profiles, replacing the single generic `staff` role). All three can view paid orders, read the delivery address, search by phone (FR-03), add exception notes, report a product out of stock (FR-15), and submit and read refund applications. They differ in checklist steps:

| Profile | Role key | Checklist steps they may complete or undo |
|---|---|---|
| Picker and packer | `staff_picker_packer` | Steps 1 and 2 |
| Inspector | `staff_inspector` | Steps 3, 4 and 5 |
| Full staff | `staff_full` | Steps 1 to 5 |

  Step 4 (pack the products securely) belongs to the inspector and full staff, confirmed by the Owner (D-15).
- **Admin:** focuses on payment verification, customer complaints (address requests), cancellations, refund review, user management and oversight. Admin does **not** perform checklist steps unless the Owner switches on `admin_can_perform_staff_tasks` (FR-05). Admin can dispatch and confirm delivery. Admin cannot grant or revoke the Owner role and cannot switch the offline-dispatch override or Admin staff-mode.
- **Owner:** all permissions, including the offline-dispatch override, Admin staff-mode and the Owner role. The Owner can always perform checklist steps.
- **Capability roles** add single abilities to staff: `cap_dispatch`, `cap_delivery`, `cap_report`, `cap_order_intake`.
- **Seeded roles:** `owner`, `admin`, `staff_picker_packer`, `staff_inspector`, `staff_full`, `cap_dispatch`, `cap_delivery`, `cap_report`, `cap_order_intake`, `customer`. **Retired:** the generic `staff` role (demo users move to `staff_full`) and `cap_address_update` (address changes are now only applied from a customer request).
- Effective permissions are the union of a user's roles. A customer account never holds a staff or admin role, and a staff, admin or owner account never holds `customer` (D-21).

### 2.2 Permission keys
Kept: `orders.read`, `order.address.read`, `order.address.update` (now only to apply a customer address request), `dispatch.create`, `delivery.confirm`, `refund.apply`, `refund.read`, `refund.review`, `order.exception.record`, `report.view`, `audit.read`, `users.manage`, `system.manage`.
**Replaced:** `checklist.update` becomes `checklist.steps_1_2` and `checklist.steps_3_5`.
**New (staff side):** `orders.create`, `payment.confirm` (also grants viewing unpaid orders), `order.cancel`, `products.manage`, `product.stock.report`, `product.stock.review`, `settings.owner` (Owner only).
**New (customer side, held only by `customer`):** `customer.order.create`, `customer.order.read_own`, `customer.address_request.create`.

| Role | Permissions |
|---|---|
| `owner` | Every staff-side key, including `settings.owner` and both checklist keys |
| `admin` | Every staff-side key except `settings.owner`. The two checklist keys are effective only while the Owner has `admin_can_perform_staff_tasks` switched on (a service rule, not a role change) |
| `staff_picker_packer` | `orders.read`, `order.address.read`, `checklist.steps_1_2`, `refund.apply`, `refund.read`, `order.exception.record`, `product.stock.report` |
| `staff_inspector` | `orders.read`, `order.address.read`, `checklist.steps_3_5`, `refund.apply`, `refund.read`, `order.exception.record`, `product.stock.report` |
| `staff_full` | `orders.read`, `order.address.read`, `checklist.steps_1_2`, `checklist.steps_3_5`, `refund.apply`, `refund.read`, `order.exception.record`, `product.stock.report` |
| `cap_dispatch`, `cap_delivery`, `cap_report`, `cap_order_intake` | `dispatch.create`, `delivery.confirm`, `report.view`, `orders.create` |
| `customer` | `customer.order.create`, `customer.order.read_own`, `customer.address_request.create` |

### 2.3 Permission matrix

| Action | Customer | Picker/Packer | Inspector | Staff full | Admin | Owner |
|---|---|---|---|---|---|---|
| Browse the catalogue (public) | Yes | Yes | Yes | Yes | Yes | Yes |
| Place an order | Yes (signed in) | No | No | No | Manual order | Manual order |
| See own orders in `/my-orders` | Yes | n/a | n/a | n/a | n/a | n/a |
| Request an address change (own pre-dispatch order) | Yes | No | No | No | No | No |
| View paid orders (PAID and later) | No | Yes | Yes | Yes | Yes | Yes |
| View unpaid orders (`PENDING_PAYMENT`) | No | No | No | No | Yes | Yes |
| Confirm payment manually | No | No | No | No | Yes | Yes |
| Checklist steps 1 to 2 | No | Yes | No | Yes | Only if staff-mode on | Yes |
| Checklist steps 3 to 5 | No | No | Yes | Yes | Only if staff-mode on | Yes |
| View delivery address (staff side) | No | Yes | Yes | Yes | Yes | Yes |
| Search the queue by phone (online, exact match) | No | Yes | Yes | Yes | Yes | Yes |
| See orders that have an open address request | Own order only | No | No | No | Yes | Yes |
| Add exception notes | No | Yes | Yes | Yes | Yes | Yes |
| Report a product out of stock | No | Yes | Yes | Yes | Yes | Yes |
| Approve or decline a stock request; mark back in stock | No | No | No | No | Yes | Yes |
| Apply or decline an address request | No | No | No | No | Yes | Yes |
| Dispatch online | No | With `cap_dispatch` | With `cap_dispatch` | With `cap_dispatch` | Yes | Yes |
| Dispatch offline | No | **Never** | **Never** | **Never** | Only if override on | Only if override on |
| Mark delivered (online) | No | With `cap_delivery` | With `cap_delivery` | With `cap_delivery` | Yes | Yes |
| Cancel before dispatch | No | No | No | No | Yes | Yes |
| Submit a refund application | No | Yes | Yes | Yes | Yes | Yes |
| Review refund applications | No | No | No | No | Yes | Yes |
| View reports | No | With `cap_report` | With `cap_report` | With `cap_report` | Yes | Yes |
| View audit history | No | Order timeline only | Order timeline only | Order timeline only | Yes | Yes |
| Create or edit products, upload photos | No | No | No | No | Yes | Yes |
| View the email outbox | No | No | No | No | Yes | Yes |
| Manage users and roles | No | No | No | No | Yes (not Owner role) | Yes |
| Switch `admin_can_perform_staff_tasks` | No | No | No | No | **No** | **Yes (only)** |
| **Switch the offline-dispatch override** | No | No | No | No | **No** | **Yes (only)** |

Permissions are enforced by the API on every protected request. Hiding a button is not authorization.

### 2.4 Authentication
- **Everyone signs in through OIDC** (`apps/mock-oidc` locally; Auth0-compatible in production) behind an issuer adapter, so changing the issuer needs no business-logic change. Customers and staff use the same flow and the same issuer.
- **Provisioning:** the first sign-in of an unknown subject creates a user with the `customer` role only (name and email from the token claims). Staff, admin and owner roles are never auto-assigned: they are seeded or assigned by the Owner/Admin, and `users.manage` cannot assign `customer` to a staff account or a staff role to a customer account. A shopper who is also staff uses a separate account.
- Web sessions use a secure HTTP-only cookie plus a CSRF token on every state-changing request (customers included). No tokens in `localStorage`. In local development over plain HTTP the `Secure` flag is configurable; production requires it.
- Customer isolation is enforced in the query (`WHERE customer_user_id = :current_user`), not only in the route. Another customer's order returns 404, the same as an unknown order.
- Demo credentials are seeded and documented apart from production secrets: one account per staff profile, an Admin, an Owner and two customers (so isolation can be demonstrated). All secrets are environment variables.

---

## 3. Domain terms and source of truth

- **Order:** OrderFlow's own record; OrderFlow is the single source of truth for orders, prices, payment verification, checklist, lifecycle, audit and refund applications. There is no external system to sync.
- **Customer account:** a `users` row with the `customer` role. An order links to it through `customer_user_id`. A manual order (entered by staff) has none.
- **Order number:** unique, human readable, generated by the database (`OF-000001`). Set once.
- **Public token:** 128-bit random value, sent to the customer in the confirmation email as a tracking link. Set once. Never logged. It grants status-only access.
- **Payment verified:** the order total has been matched by one successful payment event or one manual confirmation. `payment_verified_at` is the server time of that moment and is set once.
- **Dispatch:** the one-time act of recording a parcel as handed to a courier, with a tracking number. Internal only.
- **Offline dispatch:** a dispatch queued by an Owner or Admin on a device without connection while the Owner override is on, applied to the server on reconnection.
- **Address change request:** a customer's proposed corrected delivery address for one of their own pre-dispatch orders, awaiting an Owner/Admin decision.
- **Checklist epoch:** a counter on each order that increases whenever the checklist is reset by an applied address change. Every checklist action states the epoch it was made under.
- **Stock hold:** a temporary block on ordering a product while a staff out-of-stock report awaits review. The product stays visible.
- **Product snapshot:** order lines copy product title, SKU and unit price at order time. Later catalogue changes never alter existing orders.

---

## 4. Platforms and navigation

One responsive web application (`apps/web`, React + Vite + TypeScript + TanStack Query). No native app.

**Customer routes:** `/shop` and product pages (public); `/sign-in`; `/cart`; `/checkout` (sign-in required); `/pay/:orderNumber` (the order's owner only); `/my-orders` and `/my-orders/:orderNumber`; `/help/address-change` (Help / FAQ / Report Wrong Address); `/track` (status-only link from the confirmation email). Customers never see the staff workspace.

**Staff workspace, four primary navigation items only:**

| Item | Contents |
|---|---|
| **Orders** | Two-column split pane. Left: searchable, filterable queue with the Needs attention groups. Right: order detail, the Checklist section (five numbered collapsible steps), dispatch and delivery actions, address request decision, cancel, notes, and the append-only timeline |
| **Refund Applications** | List, create from an order, review (Owner/Admin) |
| **Reports** | Dispatch performance and refund applicants (via `apps/analytics`) |
| **Admin & Health** | Users and roles; **Products** (create, edit, photo upload); **Stock requests** (review queue); **Settings** (Owner/Admin: `sla_unstarted_hours`, `delivery_charge_pkr`, `address_change_window_hours`, `stock_hold_hours`; Owner only: offline-dispatch override and `admin_can_perform_staff_tasks`); **Email outbox**; health status; offline sync issues; mock-mode demo tools |

Every server-dependent screen shows its state (loading, synchronized, queued offline, failed) in text as well as colour. Touch targets suit tablets and phones. Interface text is English.

---

## 5. Functional requirements

### FR-01 Customer accounts, storefront and order intake
- **Sign-in:** customers must sign in (OIDC, `customer` role) before placing an order or viewing order history. Browsing the catalogue stays public (D-14). Checkout sends an unauthenticated visitor to sign-in and then back to the cart.
- **Catalogue and products:** `GET /api/v1/storefront/products` lists available products with their photos. Admin/Owner (`products.manage`) create and edit products: `POST /api/v1/admin/products` and `PATCH /api/v1/admin/products/:id` (title, description, price, `availability`). `availability` is one of `AVAILABLE`, `HIDDEN` (not listed) or `OUT_OF_STOCK` (listed with an "Out of stock" badge, Add to cart disabled, cannot be ordered). A product under an active stock hold (FR-15) is listed with "Checking availability, temporarily unavailable" and cannot be ordered. A price edit never changes an existing order. There are no stock counts (D-34).
- **Product photos (mobile friendly):** Admin/Owner upload several photos per product from a phone camera or gallery. The screen offers two controls, because most phone browsers skip the gallery when `capture` is set: **Take photo** (`<input type="file" accept="image/*" capture="environment">`) and **Choose from gallery** (`<input type="file" accept="image/*" multiple>`).
  - Endpoint: `POST /api/v1/admin/products/:id/images`, `multipart/form-data`, up to 5 files per request, **at most 5 MB per image**.
  - Only JPEG, PNG and WebP, checked by the file's leading bytes, not by its extension or declared type. At most 10 active photos per product.
  - Stored on the local Docker volume mounted at `/uploads`; no cloud or S3 account. File names are generated by the server (UUID); the uploaded name is never used. Served read-only from `/uploads/products/<uuid>.<ext>` with `X-Content-Type-Options: nosniff`.
  - **The 100 KB limit applies strictly to JSON API bodies** and is never raised for a JSON route; the image route has its own streaming limit of 5 MB per file.
  - Removing a photo marks it inactive (`PATCH /api/v1/admin/products/:id/images/:imageId`, which also sets order). The app never deletes files or rows.
  - Phone photos carry location metadata. Re-encoding to strip it is required once the package for it is approved (D-20).
- **Creating an order:** `POST /api/v1/orders` needs a signed-in user: a customer (`customer.order.create`) or a staff user with `orders.create` (manual phone or WhatsApp order). Body: recipient name, phone, **email** (required for customer orders), delivery address, optional note, `request_id`, `expected_total` (the total the customer was shown), and lines of `{product_id, quantity}`.
  - **The client never sends prices or totals.** The server reads current prices, builds the snapshot lines, computes the subtotal, adds the fixed delivery charge (`system_settings.delivery_charge_pkr`, default `0.00`) and stores the total. Unknown products, products that are not `AVAILABLE`, and products under an active stock hold are rejected with `PRODUCT_UNAVAILABLE`; product rows are read `FOR SHARE` so a stock hold being created at the same moment and the order are serialized. If the server's total differs from `expected_total`, no order is created and the response is 409 `PRICE_CHANGED` with the current total, so the customer confirms the new price (D-35). `expected_total` is a consent check only; it is never used as a price.
  - Quantity 1 to 20 per line; at most 30 lines.
  - Customer orders get `source = STOREFRONT` and `customer_user_id` set to the signed-in customer. Manual orders get `source = MANUAL`, no customer link, and an optional `external_reference`.
  - New orders start `PENDING_PAYMENT`. The five checklist rows are created with the order but cannot be completed until it is `PAID`.
- **Address: free before submitting, fixed afterwards.** The customer types and edits the delivery address freely on the checkout form until they submit. After that the customer cannot edit it; a correction goes through the request flow in FR-04.
- **Confirmation email:** after the order commits, the server sends a confirmation containing the `order_number` and the `public_token` (as a tracking link) through the `EmailAdapter` port. In Phase 1 `EMAIL_ADAPTER=mock` renders the message into the `email_outbox` table, which Owner/Admin read under Admin & Health and at `GET /api/v1/admin/email-outbox` (`system.manage`). No SMTP account is needed for `docker compose up`. The email never contains an address or phone number. Sending is best effort: a failure never rolls back or blocks the order, is recorded in the audit log, and Phase 1 does not retry automatically (D-19).
- **My orders:** `GET /api/v1/my/orders` and `GET /api/v1/my/orders/:orderNumber` (`customer.order.read_own`) return only orders where `customer_user_id` equals the signed-in user. They show order number, items, totals, status, timestamps (placed, payment verified, dispatched, delivered, cancelled), the tracking number once dispatched, the order's own delivery address, and the state of any address request. They never show internal notes, checklist, audit events, the payment reference or staff names.
- **Immutability:** lines, prices and totals can never change after creation.
- **Abuse limits:** order creation is rate-limited per user (default 10 per hour); tracking per IP (default 30 per minute). Phone must match `^\+?[0-9]{10,15}$`; the database also keeps `phone_normalized` (digits only, generated) for exact-match search. JSON bodies over 100 KB are rejected.
- **Status link:** `GET /api/v1/storefront/orders/:orderNumber?token=<public_token>` returns status, timestamps and tracking number only. A wrong token returns the same 404 as an unknown number.

**Acceptance:** an anonymous `POST /orders` returns 401; tampering with a price has no effect; duplicate `request_id` returns the original order; customer A cannot read customer B's order (404); an order's address cannot be changed by the customer after submission; a 5 MB image is accepted and a larger one, a renamed text file or a fifth-plus-one file is refused with a stable code; the confirmation email appears in the outbox with the order number and token and without an address; an email failure does not stop the order.

### FR-02 Payment verification (`PENDING_PAYMENT` to `PAID`)
Two paths, both ending in the same server transaction, the same audit event and the same set-once `payment_verified_at`.

1. **Payment event (`PaymentAdapter`):** `POST /api/v1/webhooks/payments`.
   - Verified with HMAC-SHA256 over the **raw body** using the adapter secret and `crypto.timingSafeEqual`.
   - Stored in `payment_events` deduplicated on `(provider, provider_event_id)`. A repeated event returns the original result and has no second effect.
   - Applied **inside the request, in one transaction** (no background worker). The paid amount must equal the order total exactly (decimal compare) and the currency must be `PKR`. Otherwise the event is stored as `REJECTED` with a reason (`AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, `ORDER_NOT_PAYABLE`, `UNKNOWN_ORDER`), the order stays `PENDING_PAYMENT`, and an audit event is written.
   - An invalid signature returns 401, stores nothing about the order, and is rate-limited per IP.
   - `MockPaymentAdapter` produces correctly signed events. A mock checkout page at `/pay/:orderNumber` (signed-in owner of the order only) offers "Simulate successful payment"; the server-side mock gateway then signs and delivers an event through this same endpoint, so the real verification code runs. Mock endpoints and demo tools exist only when `PAYMENT_ADAPTER=mock` and are absent otherwise.
2. **Manual confirmation:** `POST /api/v1/orders/:id/confirm-payment` by a user with `payment.confirm`, with `request_id`, `expected_version`, `payment_method` (`BANK_TRANSFER`, `RAAST`, `MOBILE_WALLET`, `CASH`) and a required `payment_reference` (1 to 100 characters, no card numbers). The confirming user and reference are stored and audited. Staff without `payment.confirm` receive 403.

A partial payment or an overpayment is never accepted automatically: the event is rejected and an Owner/Admin decides manually. Staff never see `PENDING_PAYMENT` orders.

**Acceptance:** valid event moves the order to `PAID` once; tampered signature, amount mismatch, wrong currency and duplicate event all behave as above; manual confirmation by Staff is refused; `payment_verified_at` cannot change after being set.

### FR-03 Order queue and search (left pane of Orders) — TA Req #1
- Default view for everyone: **Pending** (`PAID` and `PREPARING`, the work to do). Other filters: Dispatched, Completed (`DELIVERED`), Needs attention. Owner/Admin also get **Awaiting payment** and **Cancelled**.
- **Authorization comes before search, in the query itself.** Staff profiles receive only orders in `PAID` or later and **never an order with an open address change request** (D-37). Owner/Admin receive every order. A search can never return an order the user could not open, and opening an unauthorized order returns 404.
- **Search fields:** order number (exact, or prefix such as `OF-0001`); customer name (case-insensitive, contains); tracking number (exact); **customer phone** (exact match on `phone_normalized`; the typed value is normalized the same way; partial numbers return nothing, so numbers cannot be guessed digit by digit; requires `order.address.read`; online only; rate limited to 30 per minute per user; the typed number is never logged) (D-25). Never by address or email.
- **Each row shows:** order number, customer name, **payment status** (`Awaiting payment`, `Verified` with method, `Payment issue`) and **lifecycle status** in text and colour, checklist progress "N of 5", tracking number once dispatched, and Needs attention badges. Selecting a row opens the order detail in the right pane.
- Page size 25 (max 100). Pending is sorted by payment verification time, oldest first.
- **Needs attention** has five groups. An order can be in more than one; each group shows its count and the queue returns `attention_reasons` per order (filter `reason=`):

| Group | `reason` code | An order is in it when | Visible to |
|---|---|---|---|
| 1 Payment issues | `PAYMENT_ISSUE` | It is `PENDING_PAYMENT` and its latest payment event was `REJECTED`; **or** a payment event arrived while the order was not payable (cancelled or already paid, a possible double payment) and has not been marked reviewed | Owner, Admin |
| 2 Offline sync conflicts | `OFFLINE_CONFLICT` | It has an unreviewed `OFFLINE_ACTION_REJECTED` | Owner, Admin |
| 3 Overdue or unstarted paid orders | `SLA_OVERDUE` | It is `PAID`, no checklist step is completed, and it has waited longer than `sla_unstarted_hours` (default 24) | All staff, Admin, Owner |
| 4 Customer wrong-address complaints | `ADDRESS_CHANGE_REQUEST` | `has_pending_address_request = true` | Owner, Admin (staff do not see the order at all) |
| 5 Stock issues | `STOCK_ISSUE` | It is `PAID` or `PREPARING` and contains a product that is `OUT_OF_STOCK` or under an active stock hold | Owner, Admin |

A payment issue of the second kind is cleared by `POST /api/v1/admin/payment-events/:id/review` (`system.manage`, audited). A stock issue clears itself when the product is `AVAILABLE` again and no hold is active; Owner/Admin otherwise cancel the order (FR-09) or let staff continue if stock was found.

**Acceptance:** staff search never returns an unpaid order or an order with an open address request; phone search matches only the full normalized number and is refused without `order.address.read`; each row shows payment status, lifecycle status and progress; each group has the right members for the right roles.

### FR-04 Order detail (right pane)
Shows number, payment status, lifecycle status, customer name, items with snapshot prices, totals in PKR, payment method and reference (Owner/Admin), delivery address (with `order.address.read`), the Checklist section, dispatch and delivery blocks, exception notes, any open address request, and the timeline. Exception notes (`order.exception.record`: all three staff profiles, Admin, Owner; max 500 characters) are append-only (D-32).

**Address changes happen only through a customer request.**
1. **Request (customer):** from the order in `/my-orders/:orderNumber` ("Request address change") or at `/help/address-change`, a signed-in customer picks one of their own orders and submits the proposed corrected address: `POST /api/v1/my/address-change-requests` with `order_number`, `proposed_address`, `request_id`.
   - Allowed only while the order is `PENDING_PAYMENT`, `PAID` or `PREPARING` **and** the server time is before `orders.created_at + address_change_window_hours` (default 4). Otherwise `ADDRESS_REQUEST_WINDOW_CLOSED` or `INVALID_LIFECYCLE`.
   - Only one open request per order (`ADDRESS_REQUEST_EXISTS`).
   - The order row is locked `FOR UPDATE`, the same lock checklist and dispatch use, so a request and a checklist action or dispatch can never interleave.
   - On commit: `has_pending_address_request` becomes true (database trigger); audit `ADDRESS_CHANGE_REQUESTED` (no address); the order leaves every staff queue and staff search; every checklist action and dispatch is refused with `ADDRESS_REQUEST_PENDING`; a staff user who still has the order open sees "On hold: address under review". The order version does not change.
   - The window governs submitting only. An open request stays open until decided (D-36).
2. **Decision (Owner/Admin, `order.address.update`):** a side-by-side view of current and proposed address, with a warning when checklist steps are done ("N steps done; Apply resets the checklist to step 1").
   - **Apply:** `POST /api/v1/orders/:id/address-change-requests/:requestId/apply` with `request_id` and `expected_version`, only before dispatch. In one transaction: the previous address goes to the append-only `order_address_revisions`; the order takes **exactly** the proposed address; the request becomes `APPLIED`; the flag clears; if any checklist step was completed, all five steps return to not completed, `PREPARING` returns to `PAID`, `checklist_epoch` increases by 1 and audit `CHECKLIST_RESET` records which steps were done; `order_version` increases; audit `ADDRESS_CHANGE_APPLIED` records the fact only. The `order_number` never changes. The order returns to the staff queue for fresh packing with the new label.
   - **Decline:** `.../decline` with a required reason (max 200). The request becomes `DECLINED`, the flag clears, the checklist is untouched and work resumes where it stopped. The customer can submit a new request while the window is open.
   - **Cancel** of the order closes an open request as `VOID` (FR-09).
3. **No open request, no change.** There is no free-form address edit for anyone.
4. The customer sees the request state (open, applied, declined with reason, void) on the order in `/my-orders`.

### FR-05 Five-step packing checklist
Steps, in order:
1. Confirm the order and customer details.
2. Verify every product and quantity.
3. Inspect product condition.
4. Pack the products securely.
5. Confirm the package is ready for dispatch.

**Who may act on a step (checked by the server for every request):**
- Steps 1 and 2 need `checklist.steps_1_2` (`staff_picker_packer`, `staff_full`, Owner). Steps 3, 4 and 5 need `checklist.steps_3_5` (`staff_inspector`, `staff_full`, Owner).
- **Admin** holds the keys only while `system_settings.admin_can_perform_staff_tasks` is on. The default is `false`: Admin focuses on payment verification, complaints and oversight. Only the Owner switches it, with `PATCH /api/v1/settings/admin-staff-mode`, online only, with a required reason, audited with old and new value (D-16).
- Different people may do different steps (for example a picker does 1 and 2, an inspector does 3 to 5). A refused step returns `STEP_NOT_PERMITTED`.
- **Undo** is allowed only for the most recently completed step and only to a user permitted to act on that step.

**Rules:** only when the order is `PAID` or `PREPARING`; strictly in order, a later step cannot be completed while an earlier one is open; completing step 1 moves `PAID` to `PREPARING`; undoing step 1 moves `PREPARING` back to `PAID`; each action records the user and server time; after dispatch the checklist is read-only; all five steps must be done before dispatch. Checklist actions carry a `request_id` and the `checklist_epoch` the user saw; a different epoch returns `CHECKLIST_RESET`. While an address change request is open every checklist action returns `ADDRESS_REQUEST_PENDING`. Step order, permission, epoch and the open-request rule are checked under the order's row lock.

**Screen (right pane):** one primary **Checklist** section containing five numbered, collapsible sub-sections, `1` to `5`.
- Each sub-section shows the step label, its state (open, done), and who completed it and when.
- Only the next open step can be expanded and acted on. Later steps are locked with the text "Complete step N first".
- Only the latest completed step shows **Undo**.
- A step the signed-in user may not act on is read-only and shows which profile can do it ("Needs inspector").
- When all five are done the section shows "Ready for dispatch".
- **Live progress (TA Req #2):** the section header and the queue row show "N of 5 complete" with a progress bar, updated after every action, and the Dispatch confirmation stays disabled until all five mandatory steps are complete.

### FR-06 Safe dispatch (internal, atomic)
`POST /api/v1/orders/:id/dispatch` with `request_id`, `expected_version`, `tracking_number`, optional `courier_name` (max 50). Requires `dispatch.create`. In **one transaction** the server locks the order row and verifies:
1. `order_version` equals `expected_version` (else 409 with current state).
2. Lifecycle is `PREPARING` (not cancelled, not already dispatched).
3. All five checklist steps are complete.
4. Tracking number, trimmed, matches `^[A-Za-z0-9-]{6,30}$`.
5. No dispatch has already succeeded for this order.
6. **No open address change request** exists for the order (else `ADDRESS_REQUEST_PENDING`; Owner/Admin must apply or decline it first, D-17).
Then it inserts the dispatch, sets `dispatched_at` from the server clock (set once), moves the order to `DISPATCHED`, increments `order_version` and writes the audit event. No external call is made. Confirmation dialog text: "Dispatch order #[order number]? This records the parcel as handed to the courier and cannot be undone in OrderFlow. Verify the parcel and tracking number before continuing."
- Same `request_id` with the same payload returns the stored result; with a different payload returns 409.
- The database also refuses a dispatch row unless the order is `PREPARING` with five completed steps, and refuses a second succeeded dispatch.
- An offline dispatch follows FR-07, and is limited to Owner and Admin.
- There is no dispatch undo.

### FR-07 Offline mode and the Owner dispatch override
**Connectivity:** the web app treats itself as offline when two consecutive `GET /health` pings (every 15 seconds, 3-second timeout) fail, or `navigator.onLine` is false. A visible banner states the mode in words. Offline mode is for staff, Admin and Owner; customers have no offline features.

**While offline, a signed-in staff user can:**
- **View** orders previously loaded on this device (the queue and details). The cache holds the most recent 200 orders the user could see. Customer phone and email are never cached; the address is cached only for users with `order.address.read`. The cache is wiped on sign-out and after 12 hours without sign-in. Entries show "last synchronized at". Phone search is not available offline.
- **Work the checklist** for the steps their profile allows (FR-05): complete and undo, stored in a local queue (first in, first out per order) with a client-generated `request_id`, user, the `checklist_epoch` it was made under, and `client_occurred_at` (informational only). The queue has its own IndexedDB store, separate from the cached orders.

**While offline, a user cannot:** create orders, confirm payment, cancel, decide address requests, mark delivery, submit or review refunds, change settings, edit products, or dispatch (except as the override below allows).

**Proactive dispatch lock (default):**
- While offline, the **Dispatch button is disabled before it can be clicked**, for everyone, unless the override rules below apply.
- As soon as the **5th checklist step is completed on an offline device**, an alert appears above the disabled Dispatch button: **"Offline — No dispatch available at the moment. Hold parcel until internet is restored."** The same alert shows if an order that already has five steps complete is opened, or the device goes offline while it is open.

**Owner override:** `system_settings.allow_offline_dispatch_override` (default `false`).
- Changed by `PATCH /api/v1/settings/offline-dispatch-override` with `request_id` and a required reason, **only by the Owner role, only while online**. Every change writes an audit event with actor, time, old value, new value and reason. Admin does not see the switch.
- **Even when it is on, only Owner and Admin may queue an offline dispatch** (`is_offline = true`). Regular staff, including staff with `cap_dispatch`, stay blocked from offline dispatch at all times and always see the alert above. Staff can still dispatch online.
- When the override is on and the signed-in user is Owner or Admin, the Dispatch button is enabled offline once the five steps show complete locally, and a persistent banner reads: "Offline dispatch override is ON. Queued dispatches are applied when the connection returns."
- The app learns the setting value whenever it is online and keeps the last known value. A stale cached `true` grants nothing by itself: the server decides at sync time.

**Synchronisation:** on reconnection the client sends the queue to `POST /api/v1/offline-sync`. The server processes items one by one, in order, each in its own transaction, by calling the same service functions as the online endpoints, so every normal rule applies, including step permissions (an Admin whose staff-mode was switched off meanwhile is refused). Per item the response is `APPLIED`, `ALREADY_APPLIED` (same `request_id`) or `REJECTED` with a code.
- Queued items ignore the stale `expected_version`; the server validates by state instead (lifecycle, checklist order, not already dispatched, no open address request) and requires the queued `checklist_epoch` to equal the order's current one, otherwise `REJECTED: CHECKLIST_RESET` and the device reloads that order.
- A queued **dispatch** is applied only if the actor is Owner or Admin **now** and the override is **on at the moment of sync**; otherwise `REJECTED: OFFLINE_DISPATCH_NOT_AUTHORIZED`. A forged queue item from a staff account is refused the same way.
- `dispatched_at` and every other server timestamp are the **sync time** from the server clock. The device time is stored only as `client_occurred_at`, and `dispatches.is_offline = true` marks the row. Reports state how many dispatches were applied offline.
- A rejected item (order cancelled, already dispatched elsewhere, steps out of order, open address request, override off, role not allowed) is removed from the queue, shown to the user, written to the audit log as `OFFLINE_ACTION_REJECTED`, and listed under Admin & Health, "Offline sync issues", where Owner/Admin mark it reviewed (an audit event).
- Warning shown beside the override switch: if two devices both dispatch the same order offline, the first to synchronise wins and the second is rejected, but a second physical parcel may already have left.

**Acceptance:** the Dispatch button is disabled offline before any click; the exact alert text appears when the 5th step is completed offline; staff can never dispatch offline, with or without the override; Owner/Admin can only when the override is on; the override can only be changed by the Owner, online, with a reason, audited; queued checklist actions replay in order and respect step permissions; a rejected action is reported and logged; no phone or email is stored on the device; the cache is cleared on sign-out.

### FR-08 Delivery confirmation
By `delivery.confirm` (Owner/Admin always), online only, for a `DISPATCHED` order, with `request_id` and `expected_version`. The server sets `delivered_at` and `delivered_by` once. Delivery is permanent; repeats return the existing result; the optional note is limited to 200 characters. Corrections are separate exception notes.

### FR-09 Cancellation (before dispatch only)
`POST /api/v1/orders/:id/cancel` by `order.cancel`, with `request_id`, `expected_version` and a required reason (max 200). Allowed from `PENDING_PAYMENT`, `PAID` or `PREPARING`; never after dispatch. `CANCELLED` is terminal. Cancelling also closes an open address change request as `VOID` and clears the flag, in the same transaction. Cancelling a paid order does not move money; the Owner/Admin handles any repayment outside OrderFlow and may record a refund application against the cancelled paid order (FR-11).

### FR-10 Order timeline
Chronological and append-only, built from `audit_events` for the order: order created, payment event received or rejected, payment verified (path, actor), each checklist action, address change requested, applied or declined (facts only, never the address), confirmation email stored or failed, dispatched (tracking, offline flag), delivered, cancelled, notes, refund application events, offline actions rejected. Each event has type, actor type and id, UTC time, safe structured details from a per-type allowlist, and the `request_id` where one exists. Corrections are new events.

### FR-11 Manual refund applications
Unchanged in meaning from v3.0 and always labelled "Manual refund application tracking. No payment is issued by OrderFlow." An application may be recorded for an order that is `DISPATCHED`, `DELIVERED`, or `CANCELLED` after payment was verified. It stores customer and order, reason, requested lines and quantities (snapshot), submitting user, optional note, and optional manually entered delivery-charge and approved amounts. Statuses: `SUBMITTED`, `UNDER_REVIEW`, `APPROVED_MANUALLY`, `DECLINED`, `CLOSED`. Only `refund.review` holders decide. OrderFlow never moves money, changes payment status or sets a `REFUNDED` status. Duplicate `request_id` creates no duplicate. Staff submit applications (`refund.apply`); customers do not.

**Paid outside OrderFlow (optional record, D-26):** after an application is `APPROVED_MANUALLY`, an Owner/Admin may record that the business repaid the customer outside OrderFlow: `POST /api/v1/refund-applications/:id/paid-outside` with amount (PKR, greater than 0 and at most the order total), reference (max 100, no card or account numbers) and `request_id`. It is recorded once, shown everywhere as "Recorded as paid outside OrderFlow", and changes no payment or lifecycle status. OrderFlow still moves no money.

### FR-12 Dispatch performance and sales report — TA Req #3
**Access:** `report.view` (Owner, Admin, and staff with `cap_report`) (D-30). Served by `apps/analytics` through the API.

**Range:** **Today** (the current `Asia/Karachi` day) or a custom **From to To** of Karachi dates; start inclusive, end through the start of the next local day. Views: one total for the range, or **Daily**, **Weekly** (weeks start Monday, D-31) or **Monthly** buckets in Karachi time.

**Authoritative timestamps:** only the server-recorded `payment_verified_at`, `dispatched_at` and `delivered_at`. Device times are never used.

**Figures:**
1. **Dispatched count:** orders whose `dispatched_at` is in range.
2. **Delivered count:** orders whose `delivered_at` is in range (counted on its own timestamp).
3. **Turnaround** = `dispatched_at − payment_verified_at`. The report population (D-24) is every non-cancelled order whose `payment_verified_at` **or** `dispatched_at` falls in range. **Average**, median, fastest and slowest are computed only over population orders that have both timestamps and a non-negative duration.
4. **Excluded count (`excluded_missing_timestamps_count`):** the exact number of population orders left out of the average, always shown, including 0, as "Excluded N orders without both timestamps", with the breakdown: not yet dispatched (no `dispatched_at`) and negative duration (data-integrity exception). With the timestamp CHECKs in section 7, a missing `payment_verified_at` cannot occur.
5. **Offline-applied dispatches:** count of `dispatches.is_offline` in range; their turnaround ends at sync time.
6. **Verified sales (PKR)** = sum of totals of non-cancelled orders whose `payment_verified_at` is in range; **units sold** = sum of their line quantities.
7. **Order rows:** order number, payment verified time, dispatched time, delivered time, turnaround.

An empty range shows counts of 0 and averages as "N/A". Read-only.

### FR-13 Audit
Every security-sensitive or business-critical action writes an append-only audit event in the same transaction as the change: sign-ins and permission denials, role changes, payment events and verification, address changes, checklist actions, dispatch, delivery, cancellation, refund events, settings changes, product and photo changes, stock requests and decisions, checklist resets, payment-event reviews, paid-outside refund records, first-sign-in provisioning of customers, email outcomes, offline rejections. Details use a per-event Zod allowlist; no tokens, secrets, card data or customer contact data.

### FR-14 Health and operational status
- `GET /health` (public): application and database state.
- Admin & Health shows: database state, last payment event received, rejected payment events in the last 24 hours, offline sync issues awaiting review, open address requests, active stock holds and pending stock requests, failed confirmation emails in the last 24 hours, current override and staff-mode state, and the `PAYMENT_ADAPTER` and `EMAIL_ADAPTER` modes. There is no worker in Phase 1.

### FR-15 Stock availability requests
- **Report (staff):** a user with `product.stock.report` (all three staff profiles, Admin, Owner) reports a product as out of stock from an order line in the order detail or from the product list: `POST /api/v1/products/:id/out-of-stock-requests` with optional `order_id`, optional reason (max 200) and `request_id`. Only one `PENDING` request per product (`STOCK_REQUEST_EXISTS`).
- **Hold:** while the request is `PENDING` and the server time is before `expires_at` (`created_at + stock_hold_hours`, default 4), the product is **held**: it stays listed on `/shop` and its page keeps working, it shows "Checking availability, temporarily unavailable", Add to cart is disabled, and `POST /orders` refuses it with `PRODUCT_UNAVAILABLE`. Paid orders containing it appear in `STOCK_ISSUE`.
- **Expiry without a background job:** a hold is active only if the request is `PENDING` and `expires_at` is in the future, evaluated when reading. When it lapses, ordering resumes automatically and the request shows as expired; the next write on it (a review or a new report) records the status `EXPIRED`. A new report on a product whose request has lapsed first closes the old one as `EXPIRED` in the same transaction (D-38).
- **Review (Owner/Admin, `product.stock.review`):** `POST /api/v1/admin/out-of-stock-requests/:id/approve` sets the product's `availability` to `OUT_OF_STOCK` (still listed with an "Out of stock" badge, not orderable). `.../decline` with a required note lifts the hold. A lapsed request can still be approved. Marking the product back in stock is `PATCH /api/v1/admin/products/:id` with `availability = AVAILABLE`.
- **Concurrency:** creating a request locks the product row `FOR UPDATE`; order creation reads product rows `FOR SHARE`. An order that commits first is kept; once the request commits no new order can include the product.
- Every report, approval, decline and expiry is audited. Customers never see who reported or why.

**Acceptance:** scenarios 55 to 59.

---

## 6. Lifecycle

`PENDING_PAYMENT → PAID → PREPARING → DISPATCHED → DELIVERED`, plus `CANCELLED` (terminal, before dispatch only).

| From | Event | To | Rule |
|---|---|---|---|
| (new) | Order created | `PENDING_PAYMENT` | Server-priced |
| `PENDING_PAYMENT` | Verified payment event or manual confirmation | `PAID` | Exact total, PKR; sets `payment_verified_at` once |
| `PAID` | Checklist step 1 completed | `PREPARING` | |
| `PREPARING` | Checklist step 1 undone | `PAID` | Only when step 1 is the only completed step |
| `PREPARING` | Address change request applied | `PAID` | All five steps reset; `checklist_epoch` + 1 (FR-04) |
| `PREPARING` | Dispatch recorded | `DISPATCHED` | Five steps done; valid tracking; sets `dispatched_at` once |
| `DISPATCHED` | Delivery confirmed | `DELIVERED` | Sets `delivered_at` once |
| `PENDING_PAYMENT`, `PAID`, `PREPARING` | Cancel | `CANCELLED` | Reason required |

No other transition exists. The database trigger enforces this exact graph, not only the terminal states.

**Versioning:** `order_version` starts at 1 and increments on every lifecycle transition and every applied address change request. Checklist actions that do not change the lifecycle do not increment it; they are protected by the row lock and step-order rule. A version mismatch on a request that requires `expected_version` returns 409 with the current state. `checklist_epoch` starts at 0, only increases, and changes only when an applied address request resets the checklist.

**Timestamp rules (database CHECKs):** `PAID`, `PREPARING`, `DISPATCHED` and `DELIVERED` require `payment_verified_at`; `DISPATCHED` and `DELIVERED` require `dispatched_at`; `DELIVERED` requires `delivered_at`.

---

## 7. Data requirements

Names follow the existing schema where the concept survives.

| Table | Purpose and key rules |
|---|---|
| `users`, `roles`, `permissions`, `user_roles`, `role_permissions` | Existing. New roles and keys seeded (section 2). Retired: `staff`, `cap_address_update`, `checklist.update`. Unique `oidc_subject`; first sign-in uses `INSERT ... ON CONFLICT` |
| `products` (new) | `id`, `sku` unique, `title`, `description`, `price NUMERIC(12,2) CHECK (>= 0)`, `availability` (`AVAILABLE`, `HIDDEN`, `OUT_OF_STOCK`) |
| `product_images` (new) | `id`, `product_id`, `file_name` (server UUID plus extension), `content_type` (`image/jpeg`, `image/png`, `image/webp`), `byte_size CHECK (<= 5242880)`, `sort_order`, `is_active`, `created_by`, `created_at`. Never deleted by the app |
| `product_stock_requests` (new) | `product_id`, `order_id` (nullable), `requested_by`, `reason`, `status` (`PENDING`, `APPROVED`, `DECLINED`, `EXPIRED`), `expires_at`, `reviewed_by`, `reviewed_at`, `decision_note`, `created_at`. Partial unique index: one `PENDING` per product. Status moves only from `PENDING` |
| `orders` | `order_number` (set once), `public_token` (set once), `source`, `customer_user_id` (nullable FK, set once; null for manual orders), `external_reference`, `has_pending_address_request`, `checklist_epoch` (integer, starts 0, only increases), `phone_normalized` (generated, digits only, indexed), `payment_method`, `payment_reference`, `payment_confirmed_by`, `cancellation_reason`, `cancelled_at`; plus totals, recipient fields, address, `lifecycle_status`, `order_version`, `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by` |
| `order_items` | Snapshot lines: `product_id`, title, SKU, `quantity`, `unit_price`, `line_total`. Never updated or deleted by the app role |
| `address_change_requests` (new) | `order_id`, `requested_by`, `proposed_address`, `status` (`OPEN`, `APPLIED`, `DECLINED`, `VOID`), `decision_reason`, `decided_by`, `created_at`, `decided_at`. Partial unique index: one `OPEN` per order. `proposed_address` cannot change; status moves only from `OPEN`. A trigger refuses an insert after the submission window or after dispatch (D-27) |
| `order_address_revisions` (new) | Append-only previous addresses with who and when |
| `checklist_steps` | Five rows per order; completed flag, who, when. Reset by an applied address request |
| `dispatches` | Only succeeded dispatches exist. `courier_name`, `is_offline`, `client_occurred_at`. Tracking CHECK `^[A-Za-z0-9-]{6,30}$` (trimmed). One succeeded dispatch per order. Insert trigger: order `PREPARING`, five steps complete, no open address request |
| `payment_events` (new, replaces `webhook_inbox`) | `provider`, `provider_event_id`, `order_id`, `amount`, `currency`, `signature_valid`, `status` (`APPLIED`, `REJECTED`), `reason`, `received_at`, `reviewed_by`, `reviewed_at`. Unique `(provider, provider_event_id)`. Raw body not stored |
| `email_outbox` (new) | `order_id`, `to_address`, `subject`, `body_text`, `status` (`STORED`, `FAILED`), `error_code`, `created_at`. **Inserted once, inside the order transaction**; the adapter only updates its status. Readable only with `system.manage` |
| `idempotency_keys` (new) | `request_id` (unique with actor scope), `endpoint`, `payload_hash`, `response_status`, `response_body`, `created_at` |
| `system_settings` (new) | `key` primary key, `value` jsonb, `updated_by`, `updated_at`. Keys, all seeded by migration `0003`: `allow_offline_dispatch_override` (false), `admin_can_perform_staff_tasks` (false), `sla_unstarted_hours` (24), `delivery_charge_pkr` (0.00), `address_change_window_hours` (4), `stock_hold_hours` (4) |
| `refund_applications`, `refund_application_items` | Existing, order link now local. Add `paid_outside_amount`, `paid_outside_reference`, `paid_outside_recorded_by`, `paid_outside_recorded_at`, set once, only when `APPROVED_MANUALLY`, amount at most the order total (trigger) |
| `order_notes`, `audit_events` | Existing, append-only by trigger |
| Reporting views (new) | `report_orders_v` (order id, number, lifecycle, totals, the three timestamps, cancelled flag), `report_order_items_v` (order id, product title, SKU, quantity), `report_dispatches_v` (order id, `dispatched_at`, `is_offline`), `report_refunds_v` (application fields, order number, customer name, paid-outside fields). No address, phone, email, notes, audit or payment reference |

**Removed tables:** `webhook_inbox`, `integration_state`, `worker_heartbeats`, `mock_shopify_orders`, `mock_controls`.

**Integrity rules:** money is `NUMERIC(12,2)` with non-negative CHECKs, decimal strings in JSON; all timestamps `TIMESTAMPTZ` UTC, server clock only for anything OrderFlow records; set-once triggers on `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `order_number`, `public_token`, `customer_user_id` and the paid-outside fields; the lifecycle trigger enforces the graph in section 6; the timestamp CHECKs in section 6; `checklist_epoch` only increases; foreign keys everywhere; `orderflow_app` has no DELETE or TRUNCATE; **`orderflow_ro` can read only the reporting views** and nothing else.

---

## 8. API (all under `/api/v1`, JSON, decimal strings for money)

| Method and path | Who | Notes |
|---|---|---|
| `GET /health` (at root) | public | App and database |
| `GET /storefront/products` | public | Available products with photos |
| `GET /uploads/products/:file` (at root) | public, read only | Product photos |
| `GET /storefront/orders/:orderNumber?token=` | token holder | Status only, no PII |
| `POST /webhooks/payments` | signed event | Raw-body HMAC |
| `GET /me` | signed in | Roles, permissions, checklist steps allowed, flags |
| `POST /orders` | `customer.order.create` or `orders.create` | `request_id`; server-priced; sends confirmation email |
| `GET /my/orders`, `GET /my/orders/:orderNumber` | `customer.order.read_own` | Own orders only |
| `POST /my/address-change-requests` | `customer.address_request.create` | Own pre-dispatch order |
| `POST /mock-gateway/orders/:orderNumber/pay` | order's owner, **mock mode only** | Server signs and delivers a payment event |
| `GET /orders`, `GET /orders/:id`, `GET /orders/:id/timeline` | `orders.read` (unpaid needs `payment.confirm`) | Filters, search (`phone` needs `order.address.read`), `reason=`, paging; staff never receive orders with an open address request |
| `POST /admin/payment-events/:id/review` | `system.manage` | Clears a payment issue of the second kind |
| `POST /orders/:id/confirm-payment` | `payment.confirm` | `request_id`, `expected_version` |
| `POST /orders/:id/cancel` | `order.cancel` | `request_id`, `expected_version`, reason |
| `GET /address-change-requests`, `GET /orders/:id/address-change-requests` | `order.address.update` | Open requests; one order's history |
| `POST /orders/:id/address-change-requests/:requestId/apply` and `/decline` | `order.address.update` | `request_id`; apply needs `expected_version`; decline needs reason |
| `POST /orders/:id/checklist/:step/complete` and `/undo` | `checklist.steps_1_2` or `checklist.steps_3_5`, by step | `request_id` |
| `POST /orders/:id/dispatch` | `dispatch.create` | `request_id`, `expected_version`, tracking |
| `POST /orders/:id/deliver` | `delivery.confirm` | `request_id`, `expected_version` |
| `POST /orders/:id/notes` | `order.exception.record` | Append-only |
| `POST /orders/:id/refund-applications`, `GET /refund-applications`, `POST /refund-applications/:id/review` | `refund.apply` / `refund.read` / `refund.review` | |
| `POST /refund-applications/:id/paid-outside` | `refund.review` | Once, after `APPROVED_MANUALLY` |
| `POST /offline-sync` | signed-in staff | Batch; per-item result |
| `GET /settings`, `PATCH /settings/operations` (`sla_unstarted_hours`, `delivery_charge_pkr`, `address_change_window_hours`, `stock_hold_hours`) | `system.manage` | Reason required, audited |
| `PATCH /settings/admin-staff-mode` | `settings.owner` | Reason required |
| `PATCH /settings/offline-dispatch-override` | `settings.owner` | Reason required |
| `GET`, `POST /admin/products`, `PATCH /admin/products/:id` | `products.manage` | |
| `POST /admin/products/:id/images`, `PATCH /admin/products/:id/images/:imageId` | `products.manage` | Multipart, 5 MB per image |
| `POST /products/:id/out-of-stock-requests` | `product.stock.report` | `request_id`; optional order and reason |
| `GET /admin/out-of-stock-requests`, `POST /admin/out-of-stock-requests/:id/approve` and `/decline` | `product.stock.review` | Decline needs a note |
| `GET /admin/email-outbox` | `system.manage` | Mock mode |
| `GET /admin/offline-conflicts`, `POST /admin/offline-conflicts/:id/review` | `system.manage` | |
| `GET /admin/health` | `system.manage` | Status panel data |
| `GET /reports/dispatch-performance?preset=today\|custom&from=&to=&bucket=none\|day\|week\|month`, `GET /reports/refund-applicants?from=&to=` | `report.view` | The API checks the permission and forwards to `apps/analytics` with the internal secret; analytics is never reachable from the browser |

**Common rules:** errors are `{ error: { code, message, correlation_id } }`; codes include `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INVALID_LIFECYCLE`, `CHECKLIST_INCOMPLETE`, `CHECKLIST_OUT_OF_ORDER`, `STEP_NOT_PERMITTED`, `INVALID_TRACKING`, `ALREADY_DISPATCHED`, `ADDRESS_REQUEST_PENDING`, `ADDRESS_REQUEST_EXISTS`, `NO_OPEN_ADDRESS_REQUEST`, `PAYMENT_AMOUNT_MISMATCH`, `OFFLINE_DISPATCH_NOT_AUTHORIZED`, `IMAGE_TOO_LARGE`, `UNSUPPORTED_IMAGE_TYPE`, `PRICE_CHANGED`, `PRODUCT_UNAVAILABLE`, `STOCK_REQUEST_EXISTS`, `ADDRESS_REQUEST_WINDOW_CLOSED`, `CHECKLIST_RESET`, `RATE_LIMITED`. List endpoints are paged. Every state-changing endpoint requires a `request_id`, including order creation. The one exception is the signed payment event, which is deduplicated by its provider event id. JSON bodies are limited to 100 KB; only the image route accepts multipart.

---

## 9. Non-functional requirements

- **NFR-01 Usability:** four primary navigation items; split-pane Orders; a first-time staff member can complete an order without help.
- **NFR-02 Performance (measured and recorded, not assumed):** with 100 seeded active orders, queue API p95 under 1 second locally and initial queue render under 3 seconds; storefront product list under 1 second locally.
- **NFR-03 Reliability:** every state change and its audit event commit together or not at all; no lock held across a network call (there are none); duplicate requests are harmless.
- **NFR-04 Security:** HMAC on raw body; constant-time compare; server-side pricing; unguessable public token; rate limits; CSRF protection; helmet; strict CORS to the configured web origin; no PII or secrets in logs or audit; PII only in the order record, the address request and revision tables, and the opt-in offline address cache; customers can read only their own orders; uploaded files are type-checked by content, size-limited and named by the server; no card data ever.
- **NFR-05 Data integrity:** sections 6 and 7, enforced in the database and tested directly in SQL.
- **NFR-06 Maintainability:** TypeScript strict, Zod at every boundary, MVC on the client, hexagonal ports for `PaymentAdapter`.
- **NFR-07 Accessibility:** status shown by text and colour; keyboard-usable; labelled form fields.
- **NFR-08 Demo availability:** one `docker compose up --build` runs everything with no external account; mock payment and mock OIDC are the guaranteed path. No feature is shown in the demo that is not working.

---

## 10. Reports and analytics isolation

`apps/analytics` is a separate process using only `orderflow_ro`, callable only with the internal service secret, unable to write anything. It reads only the reporting views (section 7), publishes no host port, and is reached only through the API, which checks `report.view` first. Reports are FR-12 and the refund applicants report (application number and date, order number, customer name and a safe reference, product, variant, SKU, quantity, reason, status, reviewer, review date, manually entered amounts, and any paid-outside record labelled "Recorded as paid outside OrderFlow"). A submitted application is never labelled a completed refund.

---

## 11. Error handling and recovery

| Situation | Behaviour |
|---|---|
| Invalid payment signature | 401, nothing applied, rate limited |
| Amount or currency mismatch | Event stored `REJECTED`; order stays `PENDING_PAYMENT`; audited; Owner/Admin may confirm manually |
| Duplicate payment event or `request_id` | Original result returned; no second effect |
| Version conflict | 409 with the current state and a refresh message |
| Dispatch precondition fails | 4xx with a stable code; nothing written |
| Database unavailable | `/health` reports it; staff screens show a failed state; dispatch is not possible |
| Offline | FR-07 |
| Rejected offline action | Reported to the user, logged, listed for review |
| Confirmation email fails | Order unaffected; audited; visible in the outbox; no automatic retry |
| Image too large or wrong type | 413 or 415 with a stable code; nothing stored |
| Dispatch while an address request is open | Refused with `ADDRESS_REQUEST_PENDING` |
| Price changed between cart and order | 409 `PRICE_CHANGED` with the new total; no order created |
| Product held or out of stock at checkout | `PRODUCT_UNAVAILABLE`; the cart marks the line |
| Address request after the window | `ADDRESS_REQUEST_WINDOW_CLOSED` |
| Offline action made before a checklist reset | `REJECTED: CHECKLIST_RESET`; the device reloads the order |

---

## 12. Testing and acceptance

**Levels:** unit (domain rules, money, HMAC), integration (repositories, endpoints, real PostgreSQL in Docker), SQL constraint tests as the DB contract, E2E smoke in Playwright, boundary and equivalence tests for tracking length (5, 6, 30, 31, punctuation), amounts, report date ranges and `order_version`.

**Mandatory scenarios (each slice owns those in its scope):**
1. Signed-in customer order priced by the server; client price tampering ignored; anonymous `POST /orders` returns 401.
2. Duplicate order `request_id` creates one order.
3. Valid signed payment event marks `PAID` once.
4. Invalid signature, amount mismatch, wrong currency, duplicate event handled as FR-02.
5. Manual payment confirmation by Owner/Admin works; by Staff is 403.
6. Staff never see `PENDING_PAYMENT` orders.
7. Checklist order enforced; only the latest step undone; undo of step 1 returns to `PAID`.
8. Checklist locked after dispatch.
9. Dispatch with five steps and a valid tracking number succeeds once; every precondition failure writes nothing.
10. Stale `expected_version` returns 409.
11. Same `request_id` same payload replays; different payload 409.
12. Two simultaneous dispatches: exactly one succeeds.
13. Tracking boundaries 5, 6, 30, 31 and bad punctuation.
14. Delivery once, permanent, repeat harmless.
15. Cancel before dispatch works; after dispatch refused; `CANCELLED` terminal.
16. Set-once timestamps, `order_number` and `public_token` cannot change (SQL).
17. Lifecycle graph enforced by the database (SQL).
18. `audit_events` and `order_notes` cannot be updated or deleted even by the owner role (SQL).
19. Address correction keeps history and writes no address in audit.
20. Offline: cached orders readable; checklist actions queue and replay in order.
21. Offline dispatch blocked with override off (UI and sync); the Dispatch button is disabled before any click.
22. Only the Owner can change the override, online, with reason, audited.
23. Offline dispatch applied only when the actor is Owner or Admin and the override is on at sync; flagged `is_offline`; `dispatched_at` is server sync time.
24. Rejected offline item reported, logged and listed.
25. Refund application recorded without changing lifecycle; only Owner/Admin review; no money-moving code path exists.
26. Dispatch report: empty range shows N/A; negative duration excluded and counted; Karachi day boundaries.
27. Analytics role cannot write; `orderflow_ro` cannot read PII columns (SQL).
28. Role denial per endpoint; no PII or secrets in logs or audit.
29. Rate limit on order creation (per user) and tracking (per IP).
30. Mock endpoints do not exist when `PAYMENT_ADAPTER` is not `mock`.
31. Customer A cannot read customer B's order, list, or address (404); a customer calling any staff endpoint gets 403.
32. First sign-in provisions a `customer` only; staff roles are never auto-assigned; customer and staff roles cannot be combined on one account.
33. Picker/packer can do steps 1 and 2 only; inspector 3 to 5 only; full staff all five; each other attempt returns `STEP_NOT_PERMITTED`; undo needs permission for that step.
34. Admin cannot perform checklist steps by default; can after the Owner switches `admin_can_perform_staff_tasks` on (reason required, audited); is refused again after it is switched off, including queued offline items.
35. Product photo upload: 5 MB accepted, larger refused; wrong content refused even with an image extension; file stored under a server-generated name; JSON routes still reject bodies over 100 KB.
36. Order creation stores a mock email in `email_outbox` with order number and token and no address; an email failure does not fail the order.
37. A customer cannot edit the address after submission; an address request on another customer's order is refused.
38. Address request flow: submit sets the flag and the `ADDRESS_CHANGE_REQUEST` group; a second open request is refused; apply stores the old address in `order_address_revisions`, uses exactly the proposed address, clears the flag, bumps the version and audits without the address; decline clears the flag with a reason.
39. Admin cannot change an address when no open request exists.
40. Dispatch is refused while an address request is open (online and at offline sync).
41. Needs attention shows the five groups with correct membership and per-role visibility.
42. Offline: completing the 5th step shows the exact alert text above the disabled Dispatch button.
43. Staff (including `cap_dispatch`) cannot dispatch offline even with the override on, and a forged queue item is rejected at sync.
44. Checklist screen: five numbered collapsible steps, locked until the previous is done, Undo only on the latest step.
45. Phone search matches only the full normalized number, returns only orders the user may open, is refused without `order.address.read`, is rate limited, and is unavailable offline.
46. Queue rows show payment status, lifecycle status and "N of 5" progress; selecting a row opens the detail; staff results never include unpaid orders or orders with an open address request.
47. A price change between cart and order returns `PRICE_CHANGED` with the new total and creates no order.
48. An address request after the window returns `ADDRESS_REQUEST_WINDOW_CLOSED`; after dispatch it is refused; an open request stays open after the window passes.
49. Every checklist action is refused with `ADDRESS_REQUEST_PENDING` while a request is open, online and at offline sync.
50. Apply with steps done resets all five steps, moves `PREPARING` to `PAID`, increases `checklist_epoch`, audits `CHECKLIST_RESET`, keeps the `order_number`, and returns the order to the staff queue; Decline leaves progress unchanged.
51. A queued offline checklist action made before a reset is rejected with `CHECKLIST_RESET` and the device reloads the order.
52. Cancel works from `PENDING_PAYMENT`, `PAID` and `PREPARING`, and voids an open address request and clears its flag.
53. Staff queue and staff search exclude orders with an open address request; Owner/Admin see them in `ADDRESS_CHANGE_REQUEST`.
54. A payment event for a cancelled or already-paid order appears under `PAYMENT_ISSUE` until reviewed; reviewing is audited.
55. A stock report creates a hold: the product stays listed with "Checking availability", Add to cart is disabled, `POST /orders` returns `PRODUCT_UNAVAILABLE`; a second report on the same product is refused.
56. A hold ends after `stock_hold_hours` with no background job; a new report on a lapsed request closes it as `EXPIRED` and starts a new hold.
57. Approve sets `OUT_OF_STOCK` (listed, badged, not orderable); Decline lifts the hold; setting `AVAILABLE` restores ordering; only Owner/Admin review; all three staff profiles can report; customers cannot.
58. `STOCK_ISSUE` contains exactly the paid or preparing orders with a held or out-of-stock product.
59. A checkout and a stock report on the same product at the same moment are serialized: no order containing the product is created after the hold commits.
60. Dispatch report: Today and custom ranges in Karachi time; dispatched and delivered counts; average excludes population orders missing a timestamp or with a negative duration; the excluded count and its breakdown are exact and always shown; Daily, Weekly (Monday) and Monthly buckets; sales and units exclude cancelled orders; an empty range shows N/A.
61. A paid-outside record is accepted only after `APPROVED_MANUALLY`, only once, only up to the order total, is labelled "Recorded as paid outside OrderFlow", and changes no status.
62. `apps/analytics` publishes no host port; the API forwards only after `report.view`; a missing or wrong internal secret is refused; `orderflow_ro` can read only the reporting views (SQL).
63. All three staff profiles can add exception notes; notes are append-only.
64. Only the Owner can switch Admin staff-mode; Admin receives 403; a reason is required and audited.
65. The database refuses `PAID` or later without `payment_verified_at`, `DISPATCHED` or later without `dispatched_at`, and `DELIVERED` without `delivered_at` (SQL).
66. Two simultaneous first sign-ins of the same subject create one user.
67. NFR-02 targets are measured on 100 seeded active orders and recorded.
68. A Playwright smoke run of the demo path passes in mock mode: customer signs in, orders, pays; staff complete the checklist; dispatch; delivery; the report shows the order.

### 12.1 TA core requirements

| TA requirement | PRD | Scenarios |
|---|---|---|
| TA Req #1: authorized search by order number, customer name or phone; payment and lifecycle status; open details; unauthorized orders excluded | FR-03, FR-04 | 6, 31, 45, 46, 53 |
| TA Req #2: sequential checklist with completion status, live progress, dispatch blocked until complete | FR-05, FR-06 | 7, 9, 33, 44, 46 |
| TA Req #3: dispatch performance report for Today or a custom range: dispatched and delivered counts, average payment-to-dispatch time from authoritative timestamps, exact excluded count | FR-12 | 26, 60, 65 |

**Quality gates:** 1 scope and plan; 2 design and tests; 3 implementation works end to end in mock mode; 4 verification evidence recorded; 5 acceptance by the human reviewer. A slice is complete only when criteria and evidence are recorded.

---

## 13. Technical baseline

TypeScript strict; Node 22; Express; Zod; PostgreSQL 16; Prisma with custom SQL for triggers, partial indexes and grants; `jose`; `pino`; `helmet`, `cors`, `express-rate-limit`, `cookie-parser`; `oidc-provider` (mock issuer); React 18, Vite, React Router, TanStack Query; plain CSS (no CSS framework); Vitest, Supertest, Playwright; Docker Compose; npm workspaces.

**Ports (hexagonal):** `PaymentAdapter` (mock now) and `EmailAdapter` (mock now, stores to `email_outbox`). Real implementations (PayFast, SMTP) are Phase 2 and the SMTP one will need a retry mechanism.

**Packages approved on 26 November 2026, installed when their slice starts:**
- Image upload (Slice 1B): `multer` 2.x (multipart parsing) and `sharp` (re-encoding to strip location metadata). `busboy` is not used directly.
- Offline mode (Slice 2): `vite-plugin-pwa`, `idb-keyval`, `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`. The offline action queue lives in its own IndexedDB store, separate from the query cache.

Docker Compose services: `postgres`, `migrate`, `api`, `analytics`, `mock-oidc`, `web`; volumes `pgdata` and `uploads` (mounted at `/uploads` in `api`). No `worker`, no `native`. New variables: `EMAIL_ADAPTER=mock`, `UPLOAD_DIR=/uploads`, `UPLOAD_MAX_BYTES=5242880`, `PUBLIC_BASE_URL`.

---

## 14. Security, privacy, retention
No card data is stored, processed or transmitted. Customer accounts hold name and email; orders hold recipient name, phone, email and address. Addresses and contacts never appear in reports, search, logs or audit. Customers see only their own data. The mock email outbox holds email addresses and tracking links and is readable only by Owner/Admin. Uploaded photos are public product images stored on a local volume; backup of that volume is out of scope. The offline cache follows FR-07. Demo data is synthetic. Seed and reset scripts are destructive, guarded by `ALLOW_DESTRUCTIVE_SEED=true`, and use the owner database role. Backup, retention schedules and production hosting are out of scope; this is stated honestly in the README.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Offline mode is the largest and riskiest scope | Isolated in its own slice; first candidate to descope; the other rules stay valid if it is cut |
| Two devices dispatch the same order offline | First sync wins; second rejected and logged; warning text; only Owner/Admin may do it |
| PII cached on a device | No phone or email; address only for permitted users; wiped on sign-out and after 12 hours; accepted by the Owner (D-01) |
| One customer reads another's order | Isolation in the query itself, 404 for foreign orders, dedicated tests (scenario 31) |
| Admin switches staff-mode on for themselves | Not possible: only the Owner switches it (D-16) |
| Image upload attack surface | Content-signature check, 5 MB limit, server-generated names, `nosniff`, no execution from `/uploads` |
| Phone photos leak location | Re-encoded with `sharp` (approved, D-20) |
| Public tracking link in an email reaches a mail provider and browser history | Status-only token, `Referrer-Policy: no-referrer`, no address or phone in the email |
| Mock payment or mock email mistaken for real | Mock routes exist only in mock mode; screens say "demo"; PayFast and SMTP are Phase 2 |
| Address request left open blocks dispatch | Shown in Needs attention for Owner/Admin; decline or apply clears it |
| A late address change wastes packing work | 4-hour window; Owner/Admin see how many steps will reset before applying |
| Offline work recorded against an old address | `checklist_epoch` rejects it at sync |
| Phone search used to look people up | Exact match only, permission required, rate limited, value never logged |
| Staff misuse stock reports to block sales | Hold lasts 4 hours at most unless approved; every report is audited with the reporter |
| Existing code written for Shopify | Migration `0003` pivots the schema; removed modules are deleted, not hidden |

---

## 16. Decisions and assumptions (approved at the Gate 1 review on 26 Nov 2026 unless marked otherwise)

| ID | Decision (default) |
|---|---|
| D-01 | Offline cache may hold addresses for users with `order.address.read`; no phone or email; cleared on sign-out and after 12 hours |
| D-02 | Delivery confirmation is online only |
| D-03 | Only the Owner may switch the offline-dispatch override; Admin cannot |
| D-04 | **Updated.** With the override on, only Owner and Admin may queue an offline dispatch; regular staff never can |
| D-05 | Undoing step 1 returns the order from `PREPARING` to `PAID` |
| D-06 | Refund applications are allowed on `DISPATCHED`, `DELIVERED` and paid-then-`CANCELLED` orders |
| D-07 | Payment must equal the total exactly; partial or over-payment is rejected for manual handling |
| D-08 | No stock counts; availability is one value (D-34) plus staff stock holds (FR-15) |
| D-09 | Payment events are applied synchronously; no background worker or retry queue |
| D-10 | `courier_name` is an optional free-text field |
| D-11 | A fixed delivery charge from `system_settings`, default `0.00` |
| D-12 | Offline-applied dispatches are timed to server sync time and counted separately in the report |
| D-13 | **Updated.** Product management and photo upload are required (FR-01), not optional |
| D-14 | Browsing the catalogue is public; sign-in is required to order and to see history |
| D-15 | **Confirmed by the Owner.** Picker/packer does steps 1 to 2; inspector does steps 3 to 5, including step 4 (pack); full staff do all five |
| D-16 | **Confirmed.** Only the Owner switches `admin_can_perform_staff_tasks`, online, with a required reason, audited. Owner is never restricted by the switch |
| D-17 | Dispatch is refused while an address change request is open |
| D-18 | Admin applies exactly the customer's proposed address or declines with a reason; no free-form edit |
| D-19 | Confirmation email is best effort, mock outbox only, no automatic retry in Phase 1 |
| D-20 | **Approved.** `multer` 2.x and `sharp`; photos are re-encoded to strip metadata; two controls (camera and gallery) replace a single `capture` input |
| D-21 | Customer and staff roles cannot share an account |
| D-22 | `sla_unstarted_hours` defaults to 24 |
| D-23 | The generic `staff` role and `cap_address_update` are retired; demo staff users become `staff_full` |
| D-24 | Report population: non-cancelled orders whose `payment_verified_at` or `dispatched_at` is in range; excluded = missing a timestamp or negative duration |
| D-25 | Phone search: exact match on normalized digits, `order.address.read` required, online only, rate limited |
| D-26 | Refunds keep the PRD statuses; an optional "paid outside OrderFlow" record is added; no customer submission |
| D-27 | Address request names stay `OPEN`, `proposed_address`, `decision_reason`, `decided_by`, `decided_at`; `VOID` added. The time window is enforced from `orders.created_at`, so the request has no `expires_at` of its own (requests do not expire, D-36) |
| D-28 | Fifth Needs attention group `STOCK_ISSUE` |
| D-29 | All three staff profiles, Admin and Owner may report a product out of stock (`product.stock.report`) |
| D-30 | Reports visible to Owner, Admin, and staff with `cap_report` |
| D-31 | Weekly report buckets start on Monday, Karachi time |
| D-32 | **Confirmed.** All three staff profiles hold `order.exception.record` |
| D-33 | Slice 1 runs as three gated parts, 1A, 1B and 1C (`plan.md`) |
| D-34 | `availability` (`AVAILABLE`, `HIDDEN`, `OUT_OF_STOCK`) replaces `is_available` |
| D-35 | Orders carry `expected_total`; a mismatch returns `PRICE_CHANGED` |
| D-36 | The address window limits submitting only; an open request stays open until decided |
| D-37 | Orders with an open address request are hidden from staff queues and search, not only flagged |
| D-38 | Stock holds expire by time, checked on read; no background job |

---

## 17. Document history

| Version | Date | Change |
|---|---|---|
| 3.0 | Nov 2026 | Shopify and native edition |
| 4.0 draft | 25 Nov 2026 | Unreviewed first pivot draft (withdrawn: see the audit report) |
| 4.1 | 25 Nov 2026 | Standalone web edition, errors in the 4.0 draft corrected, all retained engineering guarantees restored |
| 4.2 | 26 Nov 2026 | Customer sign-in and `/my-orders`; three staff profiles and Admin staff-mode toggle; product management and photo upload; `EmailAdapter` with mock outbox; wrong-address request flow and fourth Needs attention group; collapsible checklist; offline proactive lock and Owner/Admin-only offline dispatch |
| 4.3 | 26 Nov 2026 | Gate 1 review: TA requirements, phone search, stock availability (FR-15), address window and checklist reset, checklist epoch, price-change check, wider payment issues, full report definition, paid-outside refund record, staff notes, Owner-only staff-mode, timestamp CHECKs, reporting views, package approvals, scenarios 45 to 68 |
