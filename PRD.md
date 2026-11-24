# OrderFlow AI --- Product Requirements Document

**Version:** 3.0 --- Consolidated Final Project Baseline\
**Date:** 23 November 2026\
**Status:** Approved working baseline for the student-project demo\
**Supersedes:** `AI&HUMAN_VERIFIED_PRD.md` Version 2.0\
**Product:** OrderFlow AI for Hannan's decoration-piece business\
**Primary integration:** Shopify\
**Target milestone:** Thursday, 26 November 2026 (team target;
instructor deadline takes precedence)

------------------------------------------------------------------------

## Document control

### Purpose of this revision

This PRD consolidates the human-validated Version 2.0 with the decisions
made in the project discussion through 23 November 2026. It resolves the
implementation ambiguities that can reasonably be decided from the
agreed scope and records explicit limits where the demo must not pretend
to provide production functionality.

This document is the product requirements source of truth for the
project. Architecture, ADRs, API contracts, database design,
implementation plans, tests and the README must agree with it. If a
later document conflicts with this PRD, the PRD wins until the team
approves and records a change.

### Decision labels

-   **Confirmed:** Explicitly selected or approved by the team.
-   **Resolved default:** A concrete decision selected to remove an
    implementation blocker. It is part of this PRD baseline unless the
    team later changes it through a recorded change.
-   **Demo limitation:** Deliberately not production-complete; it must
    be clearly disclosed in the demo and README.
-   **Out of scope:** Must not be implemented in this project version.

------------------------------------------------------------------------

# 1. Product overview

## 1.1 Purpose

OrderFlow AI is an internal order-operations system for Hannan's
decoration-piece business. It gives authorized staff a clear view of
Shopify orders that are eligible for handling, guides them through
parcel preparation, records dispatch and delivery progress, and provides
an order timeline and operational reports.

The product consists of:

1.  A responsive web application for desktop and mobile browsers.
2.  A native mobile application for staff, built with React Native and
    Expo.
3.  A shared backend API and PostgreSQL database.
4.  A Shopify integration layer that supports both a deterministic mock
    adapter for the demo and a real Shopify adapter for a development
    store.

Both applications use the same backend and business rules. Neither app
connects directly to Shopify or directly edits the database.

## 1.2 Problem statement

Staff need to identify orders that have genuinely been paid, prepare the
correct products and quantities, avoid duplicate or unsafe dispatch
actions, and know which orders have been delivered. These activities
should be visible in one operational system without confusing payment
status, preparation status, dispatch status and delivery status.

The system must also retain a traceable record of staff actions and
refund requests, while avoiding automated financial actions that the
team has not approved.

## 1.3 Product goals

-   Import and synchronize eligible Shopify orders.
-   Treat Shopify as the source of truth for commerce and payment facts.
-   Show order number, payment state, lifecycle state, customer details,
    product details and quantities.
-   Store the customer delivery address in OrderFlow's database for
    operational use.
-   Guide staff through the approved five-step packing checklist.
-   Require an explicit confirmation and server-side checks before
    dispatch.
-   Safely recover from an uncertain Shopify dispatch response without
    creating a duplicate fulfillment.
-   Record delivery once and preserve it as an irreversible lifecycle
    milestone.
-   Provide an order timeline showing important system and staff events.
-   Provide a dispatch-performance report.
-   Record refund applications manually and generate a list of
    applicants with the relevant product details.
-   Support role-based access for the Owner/Admin and specifically
    authorized staff.
-   Work in a Shopify mock mode for a reliable demonstration and provide
    a real Shopify adapter behind the same interface.
-   Run locally using Docker Compose.

## 1.4 Success criteria

The demo is successful when the team can:

1.  Start the complete system using the documented local Docker
    workflow.
2.  Sign in using the local demo OIDC identity provider.
3.  create or replay sample Shopify webhook deliveries and see eligible
    paid orders appear.
4.  Open an order and see its products, quantities, customer and
    delivery information.
5.  Complete the five packing steps in order.
6.  Dispatch an eligible order once, with a confirmation and safe
    timeout reconciliation.
7.  Record delivery once, with actor and timestamp.
8.  View the order timeline.
9.  Submit and manually review a refund application without issuing an
    automated refund.
10. View the dispatch report and refund-applicant list.
11. Demonstrate role restrictions, webhook signature validation,
    duplicate handling and failure recovery.
12. Run the automated tests and show the evidence log.

## 1.5 Non-goals

The following are not part of this project version:

-   Customer-facing checkout or order creation.
-   Importing orders from social-media messages.
-   Payment collection, bank-token verification or bank reconciliation.
-   Automated refunds, automatic refund calculations or automatic
    payment transfers.
-   Courier-driver accounts or a courier mobile application.
-   A live courier-provider integration.
-   AI customer-service chatbots.
-   Replacing Shopify's storefront or Shopify Admin.
-   Editing product prices, order totals, line items or quantities in
    OrderFlow.
-   Offline dispatch or queued dispatch while disconnected.
-   Multi-store or multi-tenant SaaS support.
-   Production hosting, high availability, disaster recovery
    certification or a production security audit.
-   Inventory management, warehouse stock control or purchase-order
    management.

------------------------------------------------------------------------

# 2. Users, roles and permissions

## 2.1 User types

### Owner

The business owner. The Owner has all OrderFlow permissions, including
user/role administration, order operations, reports, refund-application
review and audit access.

### Admin

A trusted administrator. The Admin has the same operational permissions
as the Owner for the demo, except that the Owner account remains the
highest-level account and is the only account allowed to grant or revoke
the Owner role.

### Authorized Staff

A staff account explicitly granted the relevant permissions by the Owner
or Admin. Staff can perform assigned order-handling actions but cannot
manage users, change permissions, access restricted audit administration
or change system configuration.

### Customer

A customer places an order through the Shopify storefront. Customers do
not sign in to OrderFlow.

### Shopify

The external commerce platform. Shopify owns the commerce record,
payment/financial state, original order items and Shopify fulfillment
record.

## 2.2 Permission matrix

  --------------------------------------------------------------------------------
  Action                            Owner               Admin     Authorized Staff
  -------------------- ------------------ ------------------- --------------------
  View eligible orders                Yes                 Yes                  Yes
  and order details                                           

  View customer                       Yes                 Yes     Yes, if assigned
  delivery address                                                    order access

  View order timeline                 Yes                 Yes                  Yes

  Update packing                      Yes                 Yes                  Yes
  checklist                                                   

  Start preparation                   Yes                 Yes                  Yes

  Dispatch an order                   Yes                 Yes            Only with
                                                                 `dispatch.create`

  Mark an order                       Yes                 Yes            Only with
  delivered                                                     `delivery.confirm`

  Submit a refund                     Yes                 Yes     Yes, if assigned
  application on                                                      order access
  behalf of a customer                                        

  Review/decide refund                Yes                 Yes                   No
  applications                                                

  View dispatch and                   Yes                 Yes           No, unless
  refund reports                                                  `report.view` is
                                                                explicitly granted

  View audit history                  Yes                 Yes  Limited to relevant
                                                                    order timeline

  Manage staff and                    Yes         Yes, except                   No
  permissions                               granting/revoking 
                                                        Owner 

  Change                              Yes                 Yes                   No
  integration/system                                          
  settings                                                    
  --------------------------------------------------------------------------------

Permissions are checked by the backend on every protected request.
Hiding a button in the UI is not authorization.

## 2.3 Authentication

-   Use OpenID Connect (OIDC) as the authentication protocol.
-   The local demo uses a mock OIDC issuer so the project can run
    without a paid or externally configured identity service.
-   Auth0 is the documented production-compatible identity provider
    option.
-   The application must use an OIDC provider adapter so changing the
    issuer does not require rewriting business logic.
-   Access tokens are short-lived; refresh/session handling is delegated
    to the identity provider.
-   Tokens must be stored using platform-secure storage on native
    devices and secure, HTTP-only cookies or an equivalent secure web
    session on the web client. Do not put long-lived tokens in local
    storage.
-   Passwords are never stored by OrderFlow when the OIDC provider
    manages credentials.
-   Demo credentials must be seeded and documented separately from
    production secrets.
-   All secrets are environment variables and must never be committed to
    Git.

**Demo limitation:** The local mock issuer demonstrates the OIDC
boundary and role enforcement; it is not a production identity service.
A real Auth0 tenant and credentials are not required for the local demo.

------------------------------------------------------------------------

# 3. Domain terminology and source-of-truth rules

## 3.1 Terms

  -----------------------------------------------------------------------
  Term                                Meaning
  ----------------------------------- -----------------------------------
  Shopify order                       The commerce order created in
                                      Shopify.

  Eligible order                      An order that meets the payment,
                                      cancellation, currency, integrity
                                      and fulfillment checks required for
                                      OrderFlow handling.

  Payment verified                    Shopify reports a qualifying
                                      successful payment and the order
                                      passes OrderFlow's eligibility
                                      checks.

  Preparing                           Staff have started picking,
                                      checking and packing the order.

  Checklist                           The five ordered packing checks
                                      required before dispatch.

  Dispatch                            The action that creates or confirms
                                      the Shopify fulfillment and records
                                      the OrderFlow dispatch milestone.

  Pending confirmation                The dispatch request may have
                                      reached Shopify, but OrderFlow has
                                      not yet established the final
                                      result.

  Delivered                           An authorized user has recorded
                                      that the parcel was delivered.

  Refund application                  A manual record that a customer
                                      asked for a refund. It is not a
                                      refund transaction.

  Order timeline                      A chronological, human-readable
                                      history of significant order
                                      events.

  Webhook inbox                       A durable queue/table that stores
                                      incoming Shopify webhook deliveries
                                      and their processing state.

  Dead-letter item                    A webhook or background task that
                                      exhausted automatic retries and
                                      needs review.
  -----------------------------------------------------------------------

## 3.2 Source-of-truth boundaries

There is no single database that is authoritative for every kind of
data. Authority is divided deliberately:

  -----------------------------------------------------------------------
  Data                                Authoritative system
  ----------------------------------- -----------------------------------
  Shopify order ID, original order    Shopify
  number, line items, quantities,     
  product titles, original prices,    
  currency and Shopify customer/order 
  data                                

  Payment/financial status and        Shopify
  Shopify transactions/refunds        

  Shopify fulfillment ID and          Shopify
  fulfillment state                   

  OrderFlow checklist progress        OrderFlow PostgreSQL database

  OrderFlow preparation and           OrderFlow PostgreSQL database,
  operational lifecycle               reconciled against Shopify
                                      constraints

  Staff actions, permissions and      OrderFlow PostgreSQL database
  audit history                       

  Refund applications and manual      OrderFlow PostgreSQL database
  review notes                        

  Derived operational reports         Read-only queries over OrderFlow
                                      data and synchronized Shopify facts
  -----------------------------------------------------------------------

Shopify is authoritative for commerce and payment facts. OrderFlow is
authoritative for its own checklist, user actions, refund-application
records and operational audit trail. OrderFlow must never silently
overwrite Shopify financial facts.

## 3.3 Synchronization rules

-   Shopify webhook deliveries are notifications that data may have
    changed; the backend must fetch the current order from Shopify
    before applying a critical update.
-   Webhook events can arrive more than once or out of order. Processing
    must be idempotent and use Shopify timestamps/version information to
    avoid replacing newer data with older data.
-   Shopify-derived fields and OrderFlow-owned lifecycle fields must be
    stored separately.
-   A Shopify synchronization must not increment `order_version` used
    for checklist/lifecycle optimistic concurrency.
-   The application must display the last successful Shopify
    synchronization time.
-   Shopify data is considered stale after 15 minutes without a
    successful synchronization.
-   If Shopify is unavailable, the app may display cached order details
    and continue permitted local checklist and delivery-recording work.
    Dispatch is blocked until Shopify is reachable and the order is
    revalidated.
-   A stale or unavailable Shopify state must be visibly labelled; the
    UI must not imply that it is current.

------------------------------------------------------------------------

# 4. Product scope and platforms

## 4.1 Web application

The responsive web app is the full administrative interface. It
includes:

-   Sign-in and current-user profile.
-   Order list, filters and search.
-   Order detail and product lines.
-   Packing checklist.
-   Dispatch confirmation and pending-confirmation handling.
-   Delivery confirmation.
-   Order timeline.
-   Refund-application list and manual review.
-   Dispatch-performance report.
-   User/role administration for Owner/Admin.
-   Integration and system health indicators for authorized
    administrators.

## 4.2 Native mobile application

The React Native/Expo app uses the same backend and permissions. It
supports the core staff workflow:

-   Sign-in.
-   Eligible order list and search.
-   Order detail and customer delivery address.
-   Packing checklist.
-   Dispatch confirmation and result reconciliation.
-   Delivery confirmation.
-   Order timeline.
-   Basic order/refund-application status visibility.

The detailed report builder, role administration and integration
settings are web-first. The mobile app may show a compact report summary
but is not required to reproduce every web reporting control in the
first demo.

## 4.3 Shared behavior

The web and native applications must use the same API contracts, status
labels, permission checks, validation rules and lifecycle transitions.
No business rule may exist only in one client.

------------------------------------------------------------------------

# 5. Functional requirements

## FR-01 --- Shopify order ingestion

The backend shall receive configured Shopify order/payment/fulfillment
webhook topics, validate the delivery, persist it in the webhook inbox
and process it asynchronously.

**Acceptance criteria**

-   HTTPS webhook signatures are verified against the raw request body
    before trusting the payload.
-   A missing or invalid signature is rejected and not processed.
-   Each delivery is deduplicated using `X-Shopify-Webhook-Id`.
-   The event ID may be stored for correlation but is not substituted
    for the delivery ID.
-   The endpoint acknowledges a valid, durably recorded delivery
    quickly; long-running Shopify API calls occur in a worker.
-   A duplicate delivery does not create duplicate orders, checklist
    records, timeline events or dispatch actions.
-   A failed processing attempt remains retryable and is not marked
    processed.
-   A periodic reconciliation job checks for missed or stale Shopify
    updates.

Shopify's current webhook documentation specifies HMAC verification,
delivery IDs, fast acknowledgement, duplicate-safe processing and retry
behavior. The implementation must follow the documentation for the
pinned Shopify API version. See the official references in Section 17.

## FR-02 --- Payment eligibility

An order may enter the active OrderFlow preparation queue only when
Shopify's current data confirms that it is paid and the order passes all
integrity checks.

Eligibility rules:

1.  Shopify financial status must be `PAID`.
2.  The order must not be cancelled.
3.  The order must not already be fulfilled in a way that makes a new
    fulfillment inappropriate.
4.  The order currency must be PKR for this project baseline.
5.  The successful payment/transaction amount must match the payable
    order amount using exact decimal arithmetic.
6.  A test transaction must not qualify as a real paid order.
7.  A voided, fully refunded or partially refunded order is not eligible
    for new dispatch until an authorized administrator has reviewed and
    resolved the discrepancy.
8.  Cash-on-delivery orders are out of scope.
9.  Customer screenshots or manually supplied claims are not payment
    evidence.
10. Transient Shopify/API failures do not mark an order permanently
    failed; they remain pending synchronization/retry.

**Acceptance criteria**

-   Only eligible paid orders appear in the default active queue.
-   Ineligible orders display a clear reason to authorized users where
    practical.
-   A payment or amount mismatch blocks preparation/dispatch.
-   The backend rechecks Shopify financial and fulfillment state
    immediately before dispatch.
-   A transient network/API error does not become a permanent
    `amount_mismatch` or failed-payment state.

## FR-03 --- Order list

The order list shall show eligible orders by default.

Each row/card displays:

-   Shopify order number.
-   Customer name.
-   Payment status.
-   OrderFlow lifecycle status.
-   Product count or concise item summary.
-   Last synchronization time or stale indicator.
-   Dispatch/delivery timestamp when applicable.

Filters:

-   **Pending:** Paid and eligible orders not yet dispatched, including
    preparing orders.
-   **Dispatched:** Orders whose dispatch has been confirmed in Shopify
    and OrderFlow.
-   **Completed:** Delivered orders and pre-dispatch cancelled orders.
    Refund applications are shown as a separate flag/filter and do not
    change the completed lifecycle status.
-   **Needs attention:** Orders with a payment mismatch, stale
    synchronization, pending dispatch confirmation, Shopify conflict or
    dead-letter issue.

Search is limited to order number, customer name and tracking number.
Search must be permission-filtered and paginated.

## FR-04 --- Order details

The order detail screen shall show:

-   Shopify order number and internal OrderFlow ID.
-   Customer name and available contact details required for order
    handling.
-   Stored delivery address.
-   Product title, variant/SKU when available, quantity and
    Shopify-sourced item details.
-   Currency and order totals as read-only Shopify data.
-   Shopify payment/financial status.
-   Shopify fulfillment status and tracking details when available.
-   OrderFlow lifecycle status.
-   Checklist progress.
-   Refund-application indicator.
-   Last successful Shopify sync time and stale warning.
-   Timeline.

OrderFlow may update the stored address from Shopify synchronization.
Staff may correct the delivery address only before dispatch, if
authorized. Such a correction must be stored as an operational override
with actor, timestamp and reason; it must not change Shopify's original
financial or product data. The app must clearly distinguish the
operational delivery address from the original Shopify address.

## FR-05 --- Five-step packing checklist

The checklist is approved as follows:

1.  Confirm the order and customer details.
2.  Verify every product and quantity.
3.  Inspect product condition.
4.  Pack the products securely.
5.  Confirm the package is ready for dispatch.

Rules:

-   Checklist steps are completed in order.
-   A later step cannot be completed while an earlier step remains
    incomplete.
-   A user may undo only the most recently completed step, and only
    before dispatch.
-   Every completion and undo is recorded in the timeline/audit history
    with user and timestamp.
-   The order enters `PREPARING` when the first checklist step is
    completed.
-   All five steps must be complete before dispatch can be requested.
-   Once dispatch is confirmed, checklist changes are locked.
-   Checklist progress is stored in the backend and is shared by web and
    native clients.

**Acceptance criteria**

-   Steps appear in the approved order and have clear labels.
-   Completing step 2 while step 1 is incomplete is rejected by the
    backend.
-   Only the latest completed step can be undone before dispatch.
-   A dispatched order's checklist is read-only.

## FR-06 --- Safe dispatch

Dispatch is a high-risk action. It must require explicit confirmation
and server-side validation.

Before dispatch, the backend must recheck:

-   The user has `dispatch.create`.
-   The order is paid and eligible.
-   The order is not cancelled.
-   No successful Shopify fulfillment already exists for the relevant
    items.
-   All checklist steps are complete.
-   The tracking number is valid.
-   The order currency and payment amount remain acceptable.
-   The Shopify synchronization is current enough for a live check.

Tracking number validation:

-   Trim leading/trailing whitespace.
-   Required.
-   6--30 characters.
-   Only letters, digits and hyphens.
-   Reject spaces and other punctuation.

Dispatch workflow:

1.  Client sends a unique `request_id` and the current `order_version`.
2.  Backend validates the request and, in a short database transaction,
    creates a unique active dispatch attempt in `PENDING`.
3.  The transaction ends before the network request to Shopify. No
    database lock is held while waiting for Shopify.
4.  Backend calls the Shopify adapter with a 10-second request timeout.
5.  If Shopify confirms fulfillment creation, backend stores the Shopify
    fulfillment ID, tracking information, dispatch timestamp and
    `SUCCEEDED` outcome, then changes OrderFlow lifecycle to
    `DISPATCHED`.
6.  If Shopify definitively rejects the request, the attempt becomes
    `FAILED` with a safe, user-readable reason.
7.  If the response times out or the outcome is unknown, the attempt
    becomes `PENDING_CONFIRMATION`. The system queries Shopify to
    determine whether fulfillment was created before considering another
    create request.
8.  The system never blindly repeats a fulfillment-creation request
    after an uncertain response.
9.  Only one active dispatch attempt may exist for an order at a time.
10. The UI shows a pending state until the backend establishes the
    outcome. It must not show success merely because the user tapped
    Confirm.

Confirmation dialog:

> Dispatch order #\[order number\]? This will create/confirm the Shopify
> fulfillment and cannot be undone in OrderFlow. Verify the parcel and
> tracking number before continuing.

**Acceptance criteria**

-   Dispatch cannot occur offline or while Shopify is unavailable.
-   The backend rejects stale `order_version` values with HTTP 409 and
    returns the current state.
-   Reusing a `request_id` with the same payload returns the original
    stored result.
-   Reusing the same `request_id` with a different payload returns HTTP
    409.
-   Duplicate taps do not create duplicate fulfillment.
-   An uncertain outcome triggers reconciliation, not blind retry.
-   Only confirmed Shopify fulfillment changes the lifecycle to
    `DISPATCHED`.
-   No dispatch undo or reverse-dispatch control is provided.

## FR-07 --- Shopify integration outage

When OrderFlow's backend/database is running but Shopify is unavailable:

-   The app may show cached Shopify-derived order information.
-   The UI must show the last successful sync time and mark data stale
    after 15 minutes.
-   Staff may continue checklist work against already synchronized
    orders.
-   Authorized users may record a manual delivery confirmation for an
    already dispatched order.
-   Staff may view timelines and submit refund applications.
-   Dispatch and any operation that requires a fresh Shopify
    financial/fulfillment check are blocked.
-   When Shopify returns, the reconciliation worker refreshes the order
    and identifies conflicts.
-   A conflict must not silently regress OrderFlow lifecycle.

If the OrderFlow backend or database itself is unavailable,
state-changing operations are unavailable. The app must not claim that
unsaved local changes have been committed.

## FR-08 --- Delivery confirmation

Delivery is recorded manually by an Owner, Admin or user with
`delivery.confirm`.

-   Delivery can only be recorded for an order already in `DISPATCHED`.
-   The user must explicitly confirm the action.
-   The server sets `delivered_at` and `delivered_by`.
-   The timestamp is set once and cannot be overwritten.
-   Delivery confirmation is permanent in the normal product workflow.
    No user, including an Owner, can reverse or edit the delivered
    lifecycle status.
-   If an error is later reported, an authorized user may add a separate
    correction/exception note. The original delivery status and
    timestamp remain unchanged.
-   Repeated delivery requests return the existing delivery result and
    do not create a second transition.
-   Delivery notes are optional and limited to 200 characters. They must
    not contain payment credentials or unnecessary sensitive personal
    information.

**Acceptance criteria**

-   A non-dispatched order cannot be marked delivered.
-   A delivered order cannot be moved back to dispatched.
-   Duplicate requests do not change `delivered_at`.
-   The timeline records actor, timestamp and source.

## FR-09 --- Shopify cancellation or fulfillment conflict after dispatch

OrderFlow does not provide a cancellation action after dispatch. The
system cannot prevent a Shopify administrator or an external Shopify
process from making a change directly in Shopify.

If Shopify reports an unexpected cancellation or fulfillment change
after OrderFlow has recorded dispatch:

-   OrderFlow retains its recorded dispatch/delivery history; it does
    not silently regress the lifecycle to `CANCELLED`.
-   The order receives a `SHOPIFY_POST_DISPATCH_CONFLICT` flag.
-   The order appears in **Needs attention**.
-   Owner/Admin receives a visible warning and can record an
    investigation outcome.
-   The original Shopify event, OrderFlow state and resolution note
    remain in the timeline/audit trail.
-   No automatic refund or financial reversal is performed.
-   The team must not describe this as technically preventing Shopify
    cancellation; it is an OrderFlow safety and conflict-handling rule.

Pre-dispatch Shopify cancellation is different: it blocks
preparation/dispatch, moves the OrderFlow order to `CANCELLED`, and
removes it from the active queue while preserving history.

## FR-10 --- Order timeline

The system shall provide a chronological timeline for each order.

Events include, where applicable:

-   Order first synchronized.
-   Payment eligibility established or rejected.
-   Shopify order updates that materially affect eligibility.
-   Preparation started.
-   Each checklist step completed or undone.
-   Dispatch requested.
-   Dispatch confirmed, failed or awaiting confirmation.
-   Tracking number added/updated.
-   Delivery recorded.
-   Refund application submitted, reviewed, approved or declined.
-   Address override recorded.
-   Shopify conflict detected and reviewed.
-   Administrative exception note added.

Each event stores:

-   Event type.
-   Order ID.
-   Actor type and actor ID, or system/integration source.
-   UTC timestamp.
-   Safe, structured details that do not include secrets or unnecessary
    customer PII.
-   Correlation/request ID where available.

Timeline events are append-only. Corrections are new events, not edits
to historical events.

## FR-11 --- Manual refund applications

Refund handling in this version is deliberately manual. OrderFlow
records customer requests and helps staff review them; it does not issue
money or execute Shopify refunds.

### Refund application behavior

-   A refund application can be recorded for an order after the order
    has been dispatched or delivered. The system may also record an
    earlier inquiry, but it must be labelled `INQUIRY`, not an eligible
    refund application.
-   A refund application records the customer/order, reason, requested
    product line items and quantities, application date, submitting user
    and optional supporting note.
-   Product details are copied into a request snapshot so the report
    remains understandable if the Shopify product title later changes.
-   The application can be `SUBMITTED`, `UNDER_REVIEW`,
    `APPROVED_MANUALLY`, `DECLINED` or `CLOSED`.
-   Only Owner/Admin can record the review decision.
-   The system generates a list of customers who applied for a refund,
    with order number, product titles/variants, quantities, reason,
    request date and review status.
-   A request is not proof that a refund has been granted.
-   The system must never automatically create a Shopify refund, send
    money, change payment status or mark an order as `REFUNDED`.

### Delivery-charge handling

The business intends to account for delivery charges when reviewing a
refund. For this project, any delivery-charge deduction or amount is
entered and decided manually by an Owner/Admin. OrderFlow does not
calculate the deduction, decide refund eligibility, or execute a
payment. The record may store the manually entered delivery-charge
amount and manually approved amount for reference, with currency and
reviewer. These values are administrative records, not financial
transactions.

### Refund application acceptance criteria

-   A customer application can be recorded without changing the order
    lifecycle.
-   Duplicate submission with the same request ID does not create
    duplicate applications.
-   The applicant report lists each application and its requested
    product details.
-   Only Owner/Admin can approve or decline.
-   Approval does not trigger a Shopify refund or payment.
-   The UI clearly labels the feature "Manual refund application
    tracking --- no payment is issued by OrderFlow."

## FR-12 --- Dispatch performance report

The report measures the elapsed time from payment verification to
confirmed dispatch.

**Primary metric:**
`dispatch_duration = dispatched_at - payment_verified_at`.

Definitions:

-   `payment_verified_at` is the first qualifying successful Shopify
    payment timestamp used by OrderFlow for eligibility.
-   `dispatched_at` is the timestamp at which Shopify fulfillment is
    confirmed and OrderFlow records successful dispatch.
-   All stored timestamps are UTC.
-   User-selected report dates are interpreted in Pakistan Standard Time
    (Asia/Karachi).
-   The start date is inclusive; the end date is inclusive by selecting
    the half-open interval from local start-of-day through the start of
    the following local day.
-   The report includes only orders with a confirmed dispatch and a
    valid non-negative duration in the selected dispatch-date range.
-   Orders not dispatched in the selected range are not included in
    average duration.
-   The report separately counts excluded/undispatched eligible orders
    and lists exclusion reasons.
-   An empty result produces a count of zero and an average of "N/A",
    not zero.
-   A negative duration is treated as a data-integrity exception and
    excluded from the average.
-   Multiple Shopify payment transactions must not create duplicate
    order rows; the qualifying payment timestamp is selected once
    according to the eligibility rule.

Report outputs:

-   Number of orders dispatched in range.
-   Average payment-verification-to-dispatch duration.
-   Median duration.
-   Fastest and slowest duration.
-   Counts by lifecycle/status where useful.
-   Excluded/undispatched count and reasons.
-   Order-level detail with order number, payment verification time,
    dispatch time and duration.

The report is read-only. It cannot update orders.

## FR-13 --- Audit and history

The backend shall record security-sensitive and business-critical
actions, including:

-   Sign-in events and permission denials where appropriate.
-   Role/permission changes.
-   Webhook verification failures and processing failures.
-   Payment eligibility changes and mismatch reasons.
-   Checklist completion and undo.
-   Dispatch attempts and outcomes.
-   Delivery confirmation.
-   Refund application submission and manual review.
-   Address override.
-   Shopify conflict detection and resolution.
-   Administrative exception notes.

Audit records are append-only. Application users cannot update or delete
audit records through normal APIs. Audit details must use an allowlist
and must not store access tokens, payment credentials, full webhook
secrets or unnecessary customer personal data. Customer addresses belong
in the protected order record, not the audit log.

## FR-14 --- Health and operational status

The system shall expose:

-   `GET /health` for application and database health.
-   A protected integration status view showing Shopify connection
    state, last successful sync and pending/failed webhook counts.
-   A worker status indicator for webhook and reconciliation processing.
-   Clear UI warnings when data is stale, a dispatch is pending
    confirmation, or a webhook is in the dead-letter queue.

------------------------------------------------------------------------

# 6. Lifecycle and state-transition rules

## 6.1 OrderFlow lifecycle

The primary lifecycle is:

`PENDING_PAYMENT → PAID → PREPARING → DISPATCH_PENDING → DISPATCHED → DELIVERED`

`CANCELLED` is terminal and is permitted only before dispatch.

The `DISPATCH_PENDING` state is an operational safety state, not a
Shopify financial or fulfillment status. It indicates that a dispatch
attempt is in progress or its result is not yet known.

## 6.2 Transition table

  -----------------------------------------------------------------------------
  Current state      Event                 Next state         Rule
  ------------------ --------------------- ------------------ -----------------
  PENDING_PAYMENT    Shopify confirms      PAID               All payment and
                     eligible payment                         order checks pass

  PENDING_PAYMENT    Shopify cancellation  CANCELLED          Preserve history

  PAID               First checklist step  PREPARING          Backend validates
                     completed                                eligibility

  PREPARING          Valid dispatch        DISPATCH_PENDING   Checklist
                     request accepted for                     complete; attempt
                     processing                               created

  DISPATCH_PENDING   Shopify fulfillment   DISPATCHED         Store fulfillment
                     confirmed                                ID and timestamp

  DISPATCH_PENDING   Definitive Shopify    PREPARING          Preserve failed
                     rejection                                attempt; user may
                                                              correct issue and
                                                              retry

  DISPATCH_PENDING   Unknown               DISPATCH_PENDING   Reconcile
                     timeout/result                           Shopify; do not
                                                              blindly retry

  DISPATCHED         Authorized delivery   DELIVERED          Set once;
                     confirmation                             permanent

  PAID or PREPARING  Shopify cancellation  CANCELLED          Dispatch is
                     confirmed before                         blocked
                     dispatch                                 

  DISPATCHED or      Shopify               Same lifecycle     Do not silently
  DELIVERED          cancellation/update   state + conflict   regress
                     conflict              flag               

  DELIVERED          Refund application    DELIVERED + refund Refund request is
                     submitted             application state  separate from
                                                              lifecycle
  -----------------------------------------------------------------------------

No transition from `DISPATCHED` or `DELIVERED` to `CANCELLED` is allowed
in OrderFlow. No transition from `DELIVERED` back to `DISPATCHED` is
allowed.

## 6.3 Versioning and concurrency

-   `order_version` starts at 1.
-   It increments whenever OrderFlow-owned lifecycle or checklist state
    changes.
-   Shopify-only mirror refreshes do not increment it.
-   State-changing API requests include the version the client last
    read.
-   A mismatch returns HTTP 409 with the current version and a safe
    refresh message.
-   A request ID is unique per action. Same ID and same payload returns
    the stored result; same ID and different payload returns HTTP 409.

------------------------------------------------------------------------

# 7. Data requirements

The following is the logical data model. Exact physical column names may
be refined in the schema, but the relationships and constraints are
mandatory.

## 7.1 Core entities

### users

-   `id`
-   `oidc_subject` (unique)
-   `email`
-   `display_name`
-   `is_active`
-   `created_at`
-   `updated_at`

### roles and permissions

-   `roles`
-   `permissions`
-   `user_roles`
-   `role_permissions`

A user may have multiple roles, but effective permissions must be
deterministic and evaluated server-side.

### orders

Contains OrderFlow identity, Shopify identity and operational lifecycle.

Important fields:

-   `id`
-   `shopify_order_id` (unique)
-   `shopify_order_number`
-   `customer_name`
-   `customer_email` where needed
-   `shipping_address` (protected operational data)
-   `currency`
-   `subtotal_amount`, `shipping_amount`, `total_amount` as exact
    decimal values
-   `shopify_financial_status`
-   `shopify_fulfillment_status`
-   `shopify_updated_at`
-   `last_synced_at`
-   `lifecycle_status`
-   `order_version`
-   `payment_verified_at`
-   `dispatched_at`
-   `delivered_at`
-   `delivered_by`
-   `shopify_conflict_flag`
-   `created_at`, `updated_at`

Shopify-derived fields must be clearly separated from OrderFlow-owned
fields in code and schema documentation.

### order_items

-   `id`
-   `order_id`
-   `shopify_line_item_id`
-   `product_id` or Shopify product reference when available
-   `variant_id` or Shopify variant reference when available
-   `product_title`
-   `variant_title`
-   `sku`
-   `quantity`
-   `unit_price`
-   `line_total`

Product titles and item details are Shopify-sourced snapshots. Prices
use exact decimal arithmetic.

### checklist_steps

-   `id`
-   `order_id`
-   `step_number` (1--5)
-   `step_key`
-   `label`
-   `is_completed`
-   `completed_at`
-   `completed_by`
-   `updated_at`

Unique constraint: `(order_id, step_number)`.

### dispatches

-   `id`
-   `order_id`
-   `request_id` (unique for the action)
-   `status` (`PENDING`, `PENDING_CONFIRMATION`, `SUCCEEDED`, `FAILED`)
-   `tracking_number`
-   `shopify_fulfillment_id` (unique when present)
-   `attempt_count`
-   `last_error_code`
-   `last_error_message` (sanitized)
-   `requested_by`
-   `requested_at`
-   `confirmed_at`
-   `delivery_note` (optional, max 200 characters)

Enforce one active dispatch attempt per order.

### webhook_inbox

-   `id`
-   `shopify_webhook_id` (unique)
-   `shopify_event_id` (nullable correlation value)
-   `topic`
-   `shop_domain`
-   `api_version`
-   `payload` (protected, access restricted)
-   `status` (`RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`,
    `DEAD_LETTER`)
-   `attempt_count`
-   `received_at`
-   `processed_at`
-   `next_retry_at`
-   `last_error_code`
-   `last_error_message`

Only successfully processed deliveries are treated as completed. A
failed or transiently interrupted delivery remains eligible for retry.

### refund_applications

-   `id`
-   `order_id`
-   `application_number`
-   `status`
-   `reason_code`
-   `customer_reason`
-   `requested_at`
-   `submitted_by`
-   `reviewed_by`
-   `reviewed_at`
-   `review_note`
-   `manual_delivery_charge_amount` (nullable)
-   `manual_approved_amount` (nullable)
-   `currency`
-   `created_at`, `updated_at`

### refund_application_items

-   `id`
-   `refund_application_id`
-   `order_item_id` (nullable reference)
-   `product_title_snapshot`
-   `variant_title_snapshot`
-   `sku_snapshot`
-   `requested_quantity`
-   `reason_note`

### audit_events

-   `id`
-   `order_id` (nullable)
-   `actor_type`
-   `actor_id` (nullable for system events)
-   `event_type`
-   `details` (allowlisted structured JSON; no secrets or unnecessary
    PII)
-   `request_id` (nullable)
-   `created_at`

Audit events are insert-only.

## 7.2 Data types and integrity

-   Use PostgreSQL.
-   Use Prisma for schema management and typed data access.
-   Money uses `NUMERIC(12,2)` (or a precision explicitly justified by
    Shopify currency requirements), never floating-point arithmetic.
-   Store currency with every amount.
-   Store timestamps in UTC (`TIMESTAMPTZ`).
-   Use database constraints for unique Shopify IDs, webhook delivery
    IDs, request IDs and checklist step numbers.
-   Use transactions for local state changes that must succeed together.
-   Do not hold a database transaction open while calling Shopify over
    the network.
-   Foreign keys must protect order, user, checklist, dispatch, refund
    and audit relationships.
-   Customer addresses and webhook payloads are protected operational
    data and must not be written to general logs.

------------------------------------------------------------------------

# 8. Integration requirements

## 8.1 Shopify adapter

All Shopify interactions must go through a single adapter interface.
Business logic must not depend directly on Shopify SDK response objects.

Two implementations are required:

1.  **MockShopifyAdapter:** deterministic fixture-based implementation
    for local development, tests and demo. It simulates order retrieval,
    payment state, fulfillment creation, timeouts, duplicate webhook
    deliveries and Shopify outages.
2.  **RealShopifyAdapter:** communicates with a configured Shopify
    development store through the Shopify Admin GraphQL API.

The same application services and API endpoints must work with either
adapter. Select the adapter using configuration; do not fork business
logic.

## 8.2 Real Shopify integration

-   Use the Shopify Admin GraphQL API, not a newly written legacy REST
    integration.
-   Pin a supported stable API version in configuration and update it
    deliberately.
-   Use least-privilege access scopes.
-   Store the Shopify access token and app secret only in server-side
    environment secrets.
-   Verify webhook HMAC from the raw request body using constant-time
    comparison.
-   Use `X-Shopify-Webhook-Id` for delivery deduplication.
-   Acknowledge valid deliveries quickly after durable inbox insertion;
    process asynchronously.
-   Use `X-Shopify-Triggered-At` and Shopify resource
    `updatedAt`/`updated_at` to protect against out-of-order events.
-   Fetch the current order/fulfillment state from Shopify before
    critical dispatch decisions.
-   Use the appropriate Shopify fulfillment-order and fulfillment
    GraphQL operations. The real adapter must handle GraphQL
    `userErrors` as failures even when the HTTP request itself succeeds.
-   Customer notification on fulfillment is controlled by configuration.
    It is disabled in mock mode and must be explicitly enabled for a
    real store.
-   The integration must respect Shopify scopes, store permissions, rate
    limits and API-version behavior.

## 8.3 Webhook processing and retries

-   Verify authenticity before persisting an event as trusted.
-   Persist the delivery and its processing state before acknowledging
    success.
-   Use a worker to process events asynchronously.
-   Retry transient failures with bounded exponential backoff and
    jitter.
-   Permanent validation failures are not retried indefinitely.
-   After the configured maximum of 8 application processing attempts,
    move the event to `DEAD_LETTER` and expose it to Owner/Admin review.
-   The initial retry schedule is approximately 1 minute, 5 minutes, 15
    minutes, 1 hour, then bounded retries up to the attempt limit. Exact
    delay may be configured.
-   A dead-letter event can be manually requeued by Owner/Admin after
    inspection.
-   A periodic reconciliation task runs every 5 minutes for recently
    active orders and checks a rolling 48-hour window. It refreshes the
    current Shopify order state rather than replaying stale payloads.
-   Shopify itself also retries failed webhook deliveries; OrderFlow
    must remain idempotent even when both Shopify and its own worker
    retry.

## 8.4 Shopify outage behavior

-   Mock mode can simulate outage scenarios.
-   Real mode records integration errors and preserves webhook inbox
    items for retry.
-   The order detail/list can use the last synchronized snapshot,
    visibly marked stale after 15 minutes.
-   Checklist and manual delivery recording can continue locally while
    OrderFlow itself is online.
-   Dispatch is blocked until Shopify can be queried and the fulfillment
    outcome safely established.

## 8.5 Authentication provider adapter

-   OIDC issuer metadata, client ID, redirect URIs and audience are
    environment-configured.
-   Local demo uses a mock issuer.
-   Auth0 is the documented real-provider configuration.
-   Role mapping is based on stable OIDC subject and local role
    assignments, not email-domain assumptions.

------------------------------------------------------------------------

# 9. API requirements

The API is versioned under `/api/v1`. Exact OpenAPI schemas are
maintained separately, but the following operations are required.

  -----------------------------------------------------------------------------------------------------
  Method and path                                      Purpose                 Permission
  ---------------------------------------------------- ----------------------- ------------------------
  `GET /api/v1/me`                                     Current user and        Authenticated
                                                       effective permissions   

  `GET /api/v1/orders`                                 Paginated order list,   `orders.read`
                                                       filters and search      

  `GET /api/v1/orders/:id`                             Order detail and sync   `orders.read`
                                                       state                   

  `GET /api/v1/orders/:id/timeline`                    Order timeline          `orders.read`

  `PATCH /api/v1/orders/:id/address`                   Record permitted        `order.address.update`
                                                       delivery-address        
                                                       override before         
                                                       dispatch                

  `POST /api/v1/orders/:id/checklist/:step/complete`   Complete next checklist `checklist.update`
                                                       step                    

  `POST /api/v1/orders/:id/checklist/:step/undo`       Undo latest completed   `checklist.update`
                                                       step before dispatch    

  `POST /api/v1/orders/:id/dispatch`                   Start safe dispatch     `dispatch.create`
                                                       attempt                 

  `GET /api/v1/orders/:id/dispatch-status`             Reconcile pending       `orders.read`
                                                       dispatch result         

  `POST /api/v1/orders/:id/delivery`                   Record permanent        `delivery.confirm`
                                                       delivery confirmation   

  `POST /api/v1/orders/:id/refund-applications`        Submit manual refund    `refund.apply`
                                                       application             

  `GET /api/v1/refund-applications`                    List applications and   `refund.read`
                                                       filters                 

  `POST /api/v1/refund-applications/:id/review`        Approve/decline and     `refund.review`
                                                       record manual           
                                                       amounts/notes           

  `GET /api/v1/reports/dispatch-performance`           Read dispatch           `report.view`
                                                       performance metrics     

  `GET /api/v1/reports/refund-applicants`              Applicants and          `report.view`
                                                       requested product       
                                                       details                 

  `POST /api/v1/webhooks/shopify`                      Receive Shopify webhook HMAC authenticated

  `GET /health`                                        Health check            Public, minimal output

  `GET /api/v1/admin/integrations/shopify`             Shopify connection and  `system.manage`
                                                       queue health            
  -----------------------------------------------------------------------------------------------------

## 9.1 Common API rules

-   Validate all inputs at the API boundary.
-   Use consistent JSON error responses with a machine-readable code,
    human-readable message and correlation ID.
-   Never expose stack traces, secrets, SQL errors or raw Shopify
    credentials to clients.
-   Use pagination for order, timeline and report lists.
-   State-changing requests require authentication, permission checks,
    validation and idempotency where applicable.
-   Use `order_version` for checklist, address and lifecycle
    concurrency.
-   Return HTTP 401 for unauthenticated requests, 403 for insufficient
    permission, 404 for inaccessible/nonexistent resources, 409 for
    stale versions or conflicting idempotency keys, 422 for
    validation/business-rule failures, 429 for rate limits and 5xx for
    unexpected service failures.
-   A Shopify timeout must return a pending/unknown outcome, not a false
    success or false failure.

------------------------------------------------------------------------

# 10. Non-functional requirements

## NFR-01 --- Usability

-   Core order actions must be usable on common mobile screen sizes.
-   Order number, payment status and lifecycle status must be visible
    without opening the detail page.
-   The order detail view must be reachable in one interaction from the
    list.
-   Destructive/irreversible actions require explicit confirmation.
-   Stale data, pending dispatch and integration outages must be
    visually distinct.

## NFR-02 --- Performance

With 100 seeded active orders:

-   Order list API p95 response time target: under 1 second in the local
    Docker environment.
-   Initial order list UI target: under 3 seconds on a representative
    mobile device/network.
-   Record test hardware, browser/device, data volume, network
    conditions and measured results.
-   Pagination must prevent loading an unbounded order list.
-   These are demo acceptance targets, not a production SLA.

## NFR-03 --- Reliability

-   Webhook processing is durable and idempotent.
-   A worker restart must not lose an acknowledged webhook.
-   Failed work is retried within bounded limits and then surfaced for
    review.
-   Uncertain dispatch results are reconciled against Shopify.
-   The system never claims a state change succeeded before the backend
    confirms it.

## NFR-04 --- Security

-   HTTPS is required for real Shopify webhook delivery and real
    deployment.
-   Verify Shopify webhook HMAC signatures using raw request bytes and
    constant-time comparison.
-   Enforce RBAC in backend services.
-   Use secure OIDC flows and secure token/session storage.
-   Keep secrets out of source control, client bundles, audit logs and
    error messages.
-   Validate and normalize user inputs.
-   Apply request size limits, rate limits and safe CORS configuration.
-   Protect customer address and contact data; do not expose it in broad
    reports.
-   Use least-privilege Shopify scopes and database credentials.
-   Audit privileged operations and permission denials.
-   Security tests must include unauthenticated access, role escalation
    attempts, invalid webhook signatures, replay/duplicate delivery and
    sensitive-data leakage checks.

## NFR-05 --- Data integrity

-   Use exact decimal types for money.
-   Use UTC timestamps.
-   Use database uniqueness and foreign-key constraints.
-   Use optimistic concurrency for order lifecycle/checklist updates.
-   Preserve append-only audit history.
-   Shopify synchronization cannot overwrite OrderFlow-owned lifecycle
    state.
-   A delivered timestamp is set once.

## NFR-06 --- Maintainability

-   TypeScript strict mode.
-   Clear separation of UI, API, domain services, persistence and
    integration adapters.
-   Shared API schemas/types where practical between web and native
    apps.
-   Prisma migrations are committed and reproducible.
-   OpenAPI documentation is maintained with the API.
-   Business logic is testable without a live Shopify store.

## NFR-07 --- Accessibility

-   Controls have readable labels and keyboard focus states.
-   Status must not be conveyed by color alone.
-   Confirmation dialogs and error messages must be understandable.
-   Touch targets must be suitable for mobile use.

## NFR-08 --- Demo availability

-   The complete demo must run locally through Docker Compose.
-   The mock Shopify adapter and mock OIDC issuer must work without
    external credentials.
-   A real Shopify dev-store mode is optional for the live demo and
    requires credentials and scopes.
-   No production uptime or high-availability guarantee is made.

------------------------------------------------------------------------

# 11. Reports and dashboard definitions

## 11.1 Dispatch performance

The principal performance metric is payment verification to confirmed
dispatch.

For each included order:

`duration_seconds = dispatched_at - payment_verified_at`

Summary metrics:

-   Total successfully dispatched orders.
-   Average duration.
-   Median duration.
-   Minimum and maximum duration.
-   Number of eligible orders not dispatched in the selected period.
-   Number excluded for missing or invalid timestamps.
-   Order-level detail.

The query must begin from the orders dataset and use LEFT JOINs or
equivalent so orders without a dispatch row are not silently lost from
exclusion counts. Only confirmed successful dispatch attempts contribute
to the duration average.

## 11.2 Refund applicants report

The report lists people/orders that submitted refund applications. It
includes:

-   Application number and date.
-   Order number.
-   Customer name and safe contact reference.
-   Product title, variant, SKU and requested quantity.
-   Customer-stated reason.
-   Application status.
-   Reviewer and review date.
-   Manually entered delivery-charge amount and approved amount, if
    recorded.

It must not label a submitted application as a completed refund. No
money is moved by this report.

## 11.3 Analytics isolation

Reporting runs through a separate analytics process/service boundary. It
uses a read-only database role and an internal service secret. It cannot
update order, dispatch, refund or audit records.

------------------------------------------------------------------------

# 12. Error handling and recovery rules

  -----------------------------------------------------------------------
  Scenario                            Required behavior
  ----------------------------------- -----------------------------------
  Invalid Shopify HMAC                Reject; do not process; record a
                                      sanitized security event

  Duplicate webhook delivery          Return success after confirming the
                                      existing durable inbox record; do
                                      not repeat business effects

  Webhook worker transient failure    Retry with bounded exponential
                                      backoff

  Webhook worker reaches retry limit  Move to dead-letter queue; alert
                                      Owner/Admin

  Out-of-order Shopify update         Compare Shopify update/trigger
                                      timestamps; do not overwrite newer
                                      mirrored data

  Shopify unavailable                 Show cached data with stale label;
                                      allow checklist and delivery
                                      recording; block dispatch

  Dispatch request timeout            Set pending confirmation; query
                                      Shopify fulfillment state before
                                      retry

  Shopify says fulfillment already    Reconcile and attach the existing
  exists                              fulfillment if it matches the
                                      order; do not create another

  Dispatch definitively rejected      Keep order in preparing; show
                                      actionable safe error

  Duplicate dispatch request ID, same Return stored result
  payload                             

  Duplicate dispatch request ID,      HTTP 409
  different payload                   

  Stale `order_version`               HTTP 409 and return current
                                      version/state

  Invalid tracking number             HTTP 422 with validation message

  Unauthorized action                 HTTP 403 and audit the denied
                                      privileged attempt where
                                      appropriate

  Delivery submitted twice            Return existing delivery result; do
                                      not change timestamp

  Delivery correction requested       Preserve delivered state; add
                                      separate exception note

  Shopify cancellation after dispatch Preserve OrderFlow lifecycle; set
                                      conflict flag and require review

  Refund application submitted twice  Deduplicate by request ID; return
                                      existing application

  Refund decision entered             Record manual decision only; do not
                                      call Shopify refund mutation

  Database unavailable                Fail state-changing requests; do
                                      not claim changes were saved
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 13. Project implementation slices

The project uses vertical slices: each slice delivers a working
end-to-end capability across UI, API/domain logic, persistence and
tests. S0--S6 are the initial plan; the team may add a slice if a
cohesive requirement cannot be safely included in an existing slice.

  --------------------------------------------------------------------------------
  Slice                   Scope                   Deliverable and exit criteria
  ----------------------- ----------------------- --------------------------------
  **S0 --- Foundation**   Monorepo, Docker        Both clients start, API health
                          Compose, PostgreSQL,    works, demo user signs in,
                          Prisma migrations,      database migrations and seed run
                          Express API, React web  
                          shell, Expo native      
                          shell, OIDC mock        
                          issuer, RBAC            
                          foundation, CI/test     
                          setup                   

  **S1 --- Shopify        Shopify adapter         Signed fixture webhook
  ingestion and eligible  interface, mock         creates/updates one eligible
  order list**            adapter, real adapter   order once;
                          foundation, webhook     invalid/duplicate/out-of-order
                          inbox, HMAC             events are handled; list
                          verification, async     displays eligible orders
                          worker, reconciliation, 
                          payment eligibility,    
                          order mirror, order     
                          list                    

  **S2 --- Order details  Order detail,           Staff can open an order,
  and packing checklist** customer/address and    complete/undo permitted
                          product data, five      checklist steps and see history
                          checklist steps,        
                          sequential              
                          completion/undo, order  
                          timeline foundation     

  **S3 --- Safe           Tracking validation,    Dispatch succeeds once in mock
  dispatch**              confirmation dialog,    mode; timeout does not duplicate
                          idempotent dispatch     fulfillment;
                          request, active attempt unauthorized/stale/ineligible
                          lock, Shopify           requests fail safely
                          fulfillment call,       
                          timeout reconciliation, 
                          notification            
                          configuration           

  **S4 --- Delivery and   Permanent manual        Authorized user records delivery
  Shopify conflict        delivery confirmation,  once; delivered status cannot be
  handling**              delivery note, set-once reversed; Shopify conflict is
                          timestamp,              visible and auditable
                          post-dispatch Shopify   
                          conflict flag and       
                          review note             

  **S5 --- Reports and    Manual refund           Applicants list includes product
  refund applications**   application, product    details; no refund is
                          snapshots, manual       automatically issued; report
                          review, refund          metrics match seeded fixtures
                          applicants report,      
                          dispatch performance    
                          report, read-only       
                          analytics boundary      

  **S6 --- Hardening and  Security tests,         Quality gates pass; 100-order
  demo readiness**        performance tests,      performance evidence recorded;
                          end-to-end smoke test,  Docker setup is reproducible;
                          failure fixtures,       known limitations documented
                          accessibility pass,     
                          README, OpenAPI,        
                          evidence logs, demo     
                          script                  
  --------------------------------------------------------------------------------

### Slice workflow

For every slice:

1.  Ibrahim records scope and acceptance criteria.
2.  Ihtesham checks architecture, data model and ADR alignment.
3.  Ahmed prepares test cases and fixtures before implementation.
4.  Taha implements backend functionality; Ibrahim implements client UI
    in parallel against the agreed API contract.
5.  Ihtesham reviews conformance and documentation.
6.  Ahmed runs the quality gates and logs evidence.
7.  Ibrahim records Accept, Revise or Reject and updates the master
    plan.

HITL (human review before proceeding) is mandatory for authentication,
payment eligibility and dispatch behavior. Other low-risk work may use
AFK implementation followed by review.

------------------------------------------------------------------------

# 14. Team ownership

The existing four-person role map is retained.

  ------------------------------------------------------------------------------
  Team member             Primary ownership       Supporting responsibilities
  ----------------------- ----------------------- ------------------------------
  Ibrahim                 Planner/process lead    Master plan, plan history,
                          and client UI           Git/branch rules, web/native
                                                  screens, wireframes, workflow
                                                  evidence log, contribution log
                                                  and final report

  Ihtesham                Architect and           PRD/ADRs/architecture/AGENTS
                          documentation lead      alignment, schema and OpenAPI
                                                  review, Docker/scaffold, mock
                                                  adapter and webhook simulator
                                                  foundation, analytics/report
                                                  slice, final documentation
                                                  review

  Taha                    Backend builder         Webhook pipeline, payment
                                                  eligibility, order mirror,
                                                  checklist API, dispatch,
                                                  delivery backend, Shopify
                                                  adapter implementation and
                                                  backend fixes

  Ahmed                   QA and testing lead     Test design, fixtures, quality
                                                  gates, security/performance
                                                  checks, defect reports,
                                                  regression tests, demo script
                                                  and run verification
  ------------------------------------------------------------------------------

The role map describes ownership, not exclusive access. Team members may
help across slices, but each deliverable must have one accountable
owner.

------------------------------------------------------------------------

# 15. Testing and acceptance strategy

## 15.1 Required test levels

-   Unit tests for domain rules, validators, eligibility and report
    calculations.
-   Integration tests for PostgreSQL repositories, API endpoints,
    webhook inbox and Shopify adapter behavior.
-   End-to-end smoke tests for the principal demo workflows.
-   Security tests for authentication, authorization, webhook
    authenticity and sensitive-data handling.
-   Performance tests using 100 seeded active orders.
-   Manual acceptance checks for both web and native core workflows.

## 15.2 Mandatory scenarios

1.  Eligible paid Shopify order appears in the list.
2.  Unpaid, cancelled, test, refunded, partially refunded,
    wrong-currency or amount-mismatch order is blocked.
3.  Invalid webhook signature is rejected.
4.  Duplicate webhook delivery produces no duplicate business effect.
5.  Failed webhook processing is retried and can reach dead-letter
    review.
6.  Older Shopify update cannot overwrite newer synchronized data.
7.  Checklist cannot skip a step.
8.  Only the latest checklist step can be undone before dispatch.
9.  Dispatch is blocked when checklist is incomplete.
10. Dispatch is blocked when Shopify is unavailable or order data is
    stale.
11. Duplicate dispatch request returns stored outcome.
12. Same request ID with different payload returns 409.
13. Stale order version returns 409.
14. Shopify timeout enters pending confirmation and reconciles before
    retry.
15. Existing Shopify fulfillment prevents duplicate fulfillment
    creation.
16. Tracking number boundary tests cover 5, 6, 30 and 31 characters,
    plus invalid punctuation.
17. Staff without `dispatch.create` cannot dispatch.
18. Delivery can be recorded only after dispatch.
19. Delivery is set once and cannot be reversed.
20. Post-dispatch Shopify cancellation creates a conflict flag without
    lifecycle regression.
21. Refund application records requested product details and does not
    issue a refund.
22. Only Owner/Admin can approve or decline a refund application.
23. Dispatch report handles missing dispatch, missing timestamps, empty
    ranges and negative durations.
24. Analytics database role cannot write.
25. Web and native apps display consistent lifecycle and checklist
    state.

## 15.3 Quality gates

-   **Gate 1 --- Scope and plan:** Slice scope, dependencies, acceptance
    criteria and HITL/AFK choice recorded.
-   **Gate 2 --- Design and tests:** API/schema/ADR impact reviewed;
    tests and fixtures prepared.
-   **Gate 3 --- Implementation:** Slice works end to end in mock mode;
    validation and error handling are present.
-   **Gate 4 --- Verification:** Unit/integration/E2E tests pass;
    security/performance checks appropriate to the slice pass; evidence
    recorded.
-   **Gate 5 --- Acceptance:** Reviewer confirms requirements,
    documentation, demo path and known limitations; slice marked Accept,
    Revise or Reject.

A slice is not complete merely because code exists. It is complete when
the acceptance criteria and evidence are recorded.

------------------------------------------------------------------------

# 16. Technical baseline

The following stack is the resolved project default:

  -----------------------------------------------------------------------
  Area                                Decision
  ----------------------------------- -----------------------------------
  Backend                             Node.js + TypeScript + Express

  Web frontend                        React + TypeScript

  Native frontend                     React Native + Expo + TypeScript

  Database                            PostgreSQL

  Data access/migrations              Prisma

  API contract                        REST + OpenAPI

  Authentication                      OIDC adapter; local mock issuer for
                                      demo; Auth0 as documented real
                                      provider

  Shopify integration                 Shopify Admin GraphQL API behind
                                      mock and real adapters

  Background work                     Database-backed worker using
                                      durable inbox/job state

  Analytics                           Separate read-only service/process

  Local environment                   Docker Compose

  Testing                             Vitest/Jest-compatible TypeScript
                                      test stack, Supertest/API
                                      integration tests and Playwright
                                      for web smoke tests; Expo tests for
                                      native critical paths

  Source control                      Git, one branch per vertical slice,
                                      reviewed merge and plan history

  Documentation                       English Markdown, OpenAPI and
                                      Mermaid diagrams where useful
  -----------------------------------------------------------------------

The exact library versions are pinned in package manifests and lockfiles
at implementation time. The team must not use unpinned floating
dependencies in the final submission.

------------------------------------------------------------------------

# 17. External integration references

The real Shopify adapter must be checked against the official Shopify
documentation and the API version selected during implementation:

1.  [Verify webhook
    deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
    --- HMAC validation, delivery IDs, fast acknowledgement,
    asynchronous processing and retries.
2.  [Shopify webhooks](https://shopify.dev/docs/api/webhooks/latest) ---
    webhook headers, topics and API-version metadata.
3.  [About webhooks](https://shopify.dev/docs/apps/build/webhooks) ---
    event ordering limitations and reconciliation guidance.
4.  [Fulfillment create --- GraphQL Admin
    API](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreate)
    --- creating a fulfillment, tracking information, customer
    notification and required scopes.
5.  [Order object --- GraphQL Admin
    API](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)
    --- order data, financial details, fulfillment and refund
    relationships.

Important integration implications:

-   Shopify webhook delivery order is not guaranteed; use timestamps and
    current-state fetches.
-   Shopify recommends acknowledging quickly and doing long work
    asynchronously.
-   Shopify can retry failed webhook deliveries; OrderFlow must remain
    idempotent.
-   Shopify fulfillment creation requires the relevant access scope and
    a user/store permission. The real adapter must handle GraphQL
    `userErrors`, not just HTTP status.
-   The Shopify API version must be pinned and verified when
    implementation begins; the `latest` documentation URL is a
    reference, not a permanent version pin.

------------------------------------------------------------------------

# 18. Security, privacy and data retention

-   Store only customer information needed to prepare and deliver
    orders.
-   Delivery addresses are stored because the team explicitly selected
    database storage. Protect them through database access controls and
    encrypted storage/backup infrastructure where available.
-   Do not include full addresses, phone numbers, email addresses,
    tokens or webhook secrets in audit details or application logs.
-   Restrict order details and refund applicant lists to authorized
    roles.
-   Retain order, dispatch, refund-application and audit history for the
    duration of the project demo and its evaluation. A production
    retention period must be set by the business before real deployment.
-   Provide a seed/reset command for demo data. It must be clearly
    marked as destructive and must never run automatically against a
    real Shopify-connected environment.
-   Do not use real customer data in the demo. Use synthetic fixtures
    unless the business explicitly authorizes otherwise.
-   Backups and production restoration are not certified by this
    student-project baseline.

------------------------------------------------------------------------

# 19. Deployment and delivery

## 19.1 Local run

The project must provide Docker Compose services for:

-   PostgreSQL.
-   Backend API.
-   Background worker.
-   Web frontend.
-   Analytics/report process.
-   Local mock OIDC issuer where required.

The native Expo app runs through the documented local development
workflow and connects to the same API.

Required developer commands must be documented in README, including:

-   Install dependencies.
-   Start the local stack.
-   Run database migrations.
-   Seed demo data.
-   Run tests.
-   Run lint/type checks.
-   Start the native app.
-   Switch between mock and real Shopify adapter modes.
-   Reset demo data safely.

## 19.2 Delivery format

The deliverable is a Git repository with:

-   Source code.
-   `README.md`.
-   `PRD.md`.
-   `plan.md` and a dated plan change log.
-   `AGENTS.md`.
-   `docs/architecture.md`.
-   Accepted ADRs using consistent names such as `ADR-001-*.md`.
-   OpenAPI specification.
-   Database schema and migrations.
-   Workflow evidence log.
-   Test evidence table.
-   Contribution log.
-   Demo script and known-limitations section.

A ZIP may be created as an additional convenience, but the Git
repository and setup instructions are the requested primary delivery.

## 19.3 Production limitations

This is a demo-ready student project, not a production-certified
order-management platform. Before production use, the business would
need to complete at least:

-   Real identity-provider tenant and account provisioning.
-   Shopify app review, scopes and live store configuration.
-   Production hosting, secrets management, monitoring and alerting.
-   Backup and restore testing.
-   Privacy/retention policy and access review.
-   Security assessment and load testing at real expected scale.
-   Operational procedures for dead-letter review, manual refund
    decisions and Shopify conflicts.
-   Verification of customer notification and fulfillment behavior in
    the actual store.

------------------------------------------------------------------------

# 20. Risks and mitigations

  -----------------------------------------------------------------------
  Risk                    Impact                  Mitigation
  ----------------------- ----------------------- -----------------------
  Shopify webhook         Incorrect or repeated   Durable inbox, unique
  duplicates or           order changes           delivery ID,
  out-of-order delivery                           timestamps,
                                                  current-state fetch and
                                                  reconciliation

  Shopify unavailable     Unknown fulfillment     Block new dispatch;
  during dispatch         outcome                 pending-confirmation
                                                  reconciliation; never
                                                  blindly retry

  Real Shopify            Real adapter cannot be  Mock adapter is the
  credentials/scopes      exercised               reliable acceptance
  unavailable                                     path; real adapter
                                                  remains configurable

  Web and native scope is Incomplete demo         Shared API/types;
  too large for the                               web-first
  schedule                                        admin/reporting; native
                                                  core workflow; vertical
                                                  slices

  Refund expectations     Accidental financial    Manual application
  misunderstood           promise                 tracking only; no
                                                  refund mutation or
                                                  automatic calculation

  Customer address        Privacy risk            Role checks, protected
  exposure                                        storage, no PII in
                                                  audit/logs, synthetic
                                                  demo data

  Delivered status        Irreversible            Explicit confirmation;
  entered incorrectly     operational record      permanent event;
                                                  separate exception note
                                                  instead of reversal

  Team bottleneck in      Slice delays            Parallel
  backend implementation                          UI/test/documentation
                                                  work; stable OpenAPI
                                                  contract; slice
                                                  ownership

  Teacher deadline        Submission risk         Target Thursday 26
  differs from team                               November; teacher's
  target                                          confirmed deadline
                                                  governs submission
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 21. Schedule and project governance

-   **Team target:** Complete implementation, integration, tests and
    documentation by Thursday, 26 November 2026.
-   **Instructor deadline:** Not independently confirmed in this PRD;
    the teacher's official deadline takes precedence.
-   **Freeze:** Aim to stop feature work by Thursday evening and reserve
    remaining time for verification, evidence, demo rehearsal and
    submission packaging.
-   **Plan authority:** `plan.md` is the single master plan. Changes are
    appended to a dated change log; do not maintain competing active
    plans.
-   **Change control:** A change to an approved requirement must include
    the reason, affected requirements/slices, impact, approver and date.
-   **Evidence:** Save meaningful AI prompts/outputs, test results,
    acceptance decisions and individual contributions in the project
    evidence folder.

------------------------------------------------------------------------

# 22. Assumptions and resolved defaults

These defaults are deliberately selected so implementation can proceed
without waiting for more clarification:

1.  Shopify is the source of truth for commerce, payment and Shopify
    fulfillment facts; OrderFlow is the source of truth for its own
    operational workflow and audit data.
2.  PKR is the supported project currency.
3.  Cash-on-delivery orders are excluded.
4.  A paid order with any partial/full refund or void is blocked from
    new dispatch until reviewed.
5.  Delivery-address corrections are permitted only before dispatch and
    are stored as an OrderFlow override with audit history.
6.  Customer shipping notifications are off in mock mode and require
    explicit configuration in real mode.
7.  A post-dispatch Shopify cancellation/update is a conflict to review,
    not a reason to erase or regress OrderFlow dispatch history.
8.  Delivery is manually confirmed by authorized staff; no courier API
    integration is included.
9.  Delivered is permanent. A correction is represented by an exception
    note, not by changing the lifecycle status.
10. Refund applications are manually recorded and reviewed. No refund is
    calculated or paid by OrderFlow.
11. Any delivery-charge deduction and any approved refund amount are
    manually entered by Owner/Admin and are not calculated or executed
    by the system.
12. The five-step checklist in FR-05 is the approved packing checklist.
13. The local mock OIDC issuer is sufficient for the demo; Auth0 is the
    documented production option.
14. Mock Shopify mode is the guaranteed demo path; the real Shopify
    adapter is included behind the same interface but requires external
    credentials and permissions.
15. The web application carries full administration/reporting; the
    native app covers the core staff order workflow.
16. The initial S0--S6 slice plan may be extended if testing or
    integration reveals a necessary cohesive slice.
17. `plan.md` is the one master plan with a dated change log.
18. The Thursday target is a team planning target, not a claim about the
    instructor's official deadline.

------------------------------------------------------------------------

# 23. Traceability from Version 2.0 to Version 3.0

  -----------------------------------------------------------------------
  Version 2.0 requirement             Version 3.0 treatment
  ----------------------------------- -----------------------------------
  Mobile-first order handling         Retained and expanded to responsive
                                      web plus native mobile

  Central website database            Replaced with explicit Shopify
  authoritative                       commerce authority and OrderFlow
                                      operational authority

  Trusted payment verification        Updated to Shopify
                                      financial/transaction eligibility
                                      checks; no bank-token or screenshot
                                      verification

  Payment mismatch guard              Retained and made explicit

  Irreversible dispatch               Retained with durable attempt,
                                      idempotency and Shopify
                                      reconciliation

  Delivery confirmation               Retained as manual, permanent and
                                      set-once

  Owner/Admin RBAC                    Expanded to Owner, Admin and
                                      specifically authorized staff

  Customer address/details            Stored in OrderFlow as requested,
                                      protected and synchronized from
                                      Shopify

  Return/refund physical courier      Replaced by manual
  workflow                            refund-application tracking; no
                                      automated return/refund or courier
                                      integration

  Pending/Dispatched/Completed        Retained with explicit OrderFlow
  filters                             lifecycle mapping and a separate
                                      Needs attention view

  Courier status webhook              Removed from demo scope; delivery
                                      is manually confirmed

  Manual payment verification         Removed; Shopify payment facts
  fallback                            determine eligibility

  No AI conversation bots             Retained as a non-goal

  Performance target under 3 seconds  Retained as a UI target; API p95
  for 100 orders                      target added

  Cancellation/audit archival         Retained for pre-dispatch
                                      cancellation; post-dispatch Shopify
                                      changes become conflict flags

  Admin override for Delivered        Replaced by authorized manual
                                      delivery confirmation that is
                                      permanent and cannot be reversed

  Return/refund tracking              Replaced with a manual applicant
                                      register and product-detail report
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 24. Final acceptance checklist

The PRD baseline is considered implemented for the demo when all
applicable items below are evidenced:

-   [ ] Web and native apps connect to the same backend.
-   [ ] Docker Compose starts the backend, database, worker, web app and
    analytics process.
-   [ ] Local OIDC demo sign-in works and backend RBAC is enforced.
-   [ ] Mock Shopify adapter works without external credentials.
-   [ ] Real Shopify adapter is present behind the same interface and
    configuration is documented.
-   [ ] Webhook HMAC verification and duplicate handling work.
-   [ ] Webhook retries, dead-letter review and reconciliation work.
-   [ ] Only eligible paid PKR orders enter the active queue.
-   [ ] Order details show stored customer/address and Shopify product
    details.
-   [ ] The five-step checklist is sequential and auditable.
-   [ ] Dispatch is confirmed, idempotent and safe under timeout.
-   [ ] Dispatch is blocked while Shopify is unavailable.
-   [ ] Delivery is manual, permanent and auditable.
-   [ ] Post-dispatch Shopify conflicts are flagged without lifecycle
    regression.
-   [ ] Order timeline shows the required business events.
-   [ ] Refund applications and product-detail applicant report work
    manually.
-   [ ] No automated refund or payment transfer can be triggered.
-   [ ] Dispatch performance report uses payment verification to
    confirmed dispatch.
-   [ ] Analytics access is read-only.
-   [ ] Unit, integration, E2E smoke, security and performance evidence
    is recorded.
-   [ ] README, architecture, ADRs, OpenAPI, plan and evidence documents
    agree with this PRD.
-   [ ] Known demo/production limitations are disclosed.

------------------------------------------------------------------------

**End of PRD --- Version 3.0**
