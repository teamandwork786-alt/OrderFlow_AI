# AGENTS.md: OrderFlow AI

**Version:** 2.1 | **Date:** 23 November 2026 | **Aligned to:** PRD v3.0 and `docs/architecture.md` v2.1 | **Supersedes:** AGENTS.md v1.0

Instructions for any AI coding agent (Claude Code, Cursor, Codex, Antigravity or similar) working in this repository. Read this file fully, then the sections of `docs/architecture.md` that your task touches, before every task. Human developers treat it as the team's working agreement with the agent.

---

## 1. Project in one paragraph

OrderFlow AI is an internal order-operations system for Hannan's decoration-piece business. Staff see Shopify orders that are eligible (genuinely paid), prepare them through a five-step packing checklist, dispatch them once and safely, record delivery, track manual refund applications, and read an order timeline and two reports. It has a responsive web app, a native Expo app, one backend (API plus worker), a read-only analytics process and PostgreSQL. **Shopify is the source of truth for commerce, payment and fulfillment facts. OrderFlow is the source of truth for its own checklist, lifecycle, audit and refund-application data.** The guaranteed demo path uses a mock Shopify adapter and a mock OIDC issuer.

---

## 2. Document precedence

1. `PRD.md` v3.0
2. `docs/architecture.md` (includes ADR-001 to ADR-009)
3. `api-spec/openapi.yaml`
4. This file
5. Everything else

If two documents disagree, follow the higher one, **stop**, and write the conflict to `docs/proposed-changes.md` (reason, affected sections, options). Do not pick a side silently. Old ADR text about a standalone storefront, PayFast IPN/ITN checks or `payment_events` is superseded; never implement it.

---

## 3. Scope

### 3.1 In scope
Everything in PRD sections 4, 5 and 11, built in slices S0 to S6 (section 11 of this file).

### 3.2 Out of scope: refuse and ask
Do not start any of these without an explicit human instruction recorded in `plan.md`:
- Customer-facing checkout, storefront work, social-media order import
- Payment collection, bank-token verification, reconciliation, gateway refunds
- Automated refunds, refund calculations, payment transfers, any Shopify refund or return mutation
- Courier integration, courier accounts or apps, courier webhooks (there is no `courier/` directory)
- Chatbots, customer-support queues or triage, generative-AI features
- Editing prices, totals, line items or quantities
- Offline mode, queued dispatch, local databases on any client
- Multi-store or multi-tenant support, inventory, purchase orders
- Production hosting, HA, backup certification
- Partial dispatch, dispatch undo, delivery undo, any `REFUNDED` status

If a request touches this list, reply with what is out of scope and ask for explicit confirmation.

---

## 4. Technology and dependencies

Fixed stack (architecture section 4): TypeScript strict; Node.js LTS; Express; Zod; PostgreSQL; Prisma; `jose`; `pino`; `oidc-provider` (mock issuer); React + Vite + React Router + TanStack Query; React Native + Expo + `expo-secure-store`; Vitest; Supertest; `jest-expo`; Playwright; Docker Compose; npm workspaces. Also approved: `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `pg` (analytics), `openapi-typescript`, `express-openapi-validator` (tests only).

**Dependency rule:** any package not listed above requires human approval before you add it. Your request must state purpose, alternatives considered, size and maintenance status. Never add a local-storage or database package to a client. Pin versions through the lockfile; no floating versions.

---

## 5. Repository layout and file boundaries

Layout is defined in architecture section 5. Do not invent top-level directories.

| Area | You may edit | You must NOT edit |
|---|---|---|
| `apps/api/src/**`, `apps/analytics/**`, `apps/web/**`, `apps/native/**`, `apps/mock-oidc/**`, `packages/shared/**` | Yes, within your slice | Code outside your slice's scope (cross-slice changes need an approved plan) |
| `apps/api/prisma/**` | Schema and migrations, per section 8 | Any already-merged migration file (add a new one instead) |
| `api-spec/openapi.yaml` | Yes, before the endpoint code | n/a |
| `fixtures/**`, `scripts/**` | Yes | n/a |
| `docs/proposed-changes.md`, `docs/evidence/**` | Append only | Rewriting or deleting past entries |
| `README.md`, `plan.md` | Only the parts your slice instructs | Plan decisions (Accept, Revise, Reject) are human-only |
| `PRD.md`, `docs/architecture.md`, `docs/adr/**`, `AGENTS.md` | **Never** | All of them: read-only for agents |
| `.env`, any real secret | **Never** read, write or print | All |

Module and layer boundaries are in architecture section 6. Hard rules:

1. Routes in `src/http/**` parse, validate, authenticate, authorize, call one service and format the response. No business rules, no Prisma.
2. Cross-module access goes through the other module's `index.ts` only.
3. **Only the `lifecycle` module writes** `orders.lifecycle_status`, `order_version`, `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`.
4. **Only the `sync` module writes** Shopify snapshot columns, `order_items`, `eligibility_*` and `shopify_conflict_*`. It never writes lifecycle columns; it asks `lifecycle` to transition.
5. Only `audit` inserts into `audit_events`. No UPDATE or DELETE on `audit_events` or `order_notes`, ever.
6. Shopify types, payloads and GraphQL strings stay inside `apps/api/src/integrations/shopify/`. Domain code uses domain types.
7. Clients never call Shopify and never touch the database. They only call the API.
8. Mock Shopify state lives in the database tables `mock_shopify_orders` and `mock_controls`, never in process memory, because the API and worker are separate processes.

---

## 6. Non-negotiable behaviours

Details live in `docs/architecture.md`; the section number is given. These are the rules agents break most often.

**Webhooks (10.1)**
- HMAC is verified on the **raw body** with `crypto.timingSafeEqual`. The webhook route uses `express.raw`, never the JSON parser, and is mounted before the global JSON parser.
- Deduplicate on `X-Shopify-Webhook-Id` through `INSERT ... ON CONFLICT DO NOTHING`. A delivery counts as done only when `status = PROCESSED`.
- The receiver stores and acknowledges. All Shopify API calls happen in the worker.
- The webhook body is never trusted alone: fetch current state from Shopify, and ignore data older than the stored `shopify_updated_at`.
- Max 8 processing attempts, then `DEAD_LETTER`.

**Eligibility (10.2)**
- Eligibility is evaluated only on freshly fetched Shopify data, with exact decimal comparison. Transient errors never produce a permanent failure state such as `AMOUNT_MISMATCH`.
- Fail closed: if unsure, the order stays out of the eligible queue.

**Dispatch (10.4, 10.5)**
- Follow the ordered steps exactly: replay lookup, version check, local preconditions, live Shopify fetch, short transaction creating one `PENDING` attempt, adapter call **outside any transaction or lock**, outcome classification.
- Only GraphQL `userErrors` or a 4xx validation answer counts as a definitive rejection. Anything else is unknown, so `PENDING_CONFIRMATION`.
- Reconciliation never calls `createFulfillment`. Never retry creation blindly.
- Same `request_id` and payload returns the attempt's current state. Same `request_id` with a different payload returns 409. Clients reuse the same `request_id` after a timeout.
- Success is shown only after the API returns 200 or `dispatch-status` reports `SUCCEEDED`.

**Lifecycle (9)**
- Only transitions in the table in architecture 9.2 exist. Every transition and its audit event commit in one transaction.
- `order_version` increments only where architecture 8.4 says so. Shopify snapshot refreshes never increment it.
- `payment_verified_at`, `dispatched_at`, `delivered_at` are set once. Database triggers enforce this; your code must too.

**Delivery (10.6)** is permanent and idempotent. There is no reverse. Corrections are `order_notes`.

**Refunds (10.8)** are manual records only. The Shopify adapter interface has no refund, return, order-edit or payment method; do not add one. The UI label "Manual refund application tracking. No payment is issued by OrderFlow." is mandatory on every refund screen. A refund seen in Shopify after dispatch updates the snapshot only; it is not a post-dispatch conflict.

**Money and time**
- Money is `NUMERIC(12,2)` and `Prisma.Decimal`; amounts in JSON are decimal strings. Never use `number`, `parseFloat` or float arithmetic for money.
- Store UTC `TIMESTAMPTZ`. Timestamps OrderFlow creates come from the server clock, never the client. Report dates are interpreted in `Asia/Karachi`.

**Outage (10.10)** blocks dispatch only. Checklist, address override, delivery, notes and refund applications continue on the stored snapshot, visibly labelled stale after 15 minutes.

---

## 7. Coding conventions

- TypeScript `strict: true`. No `any`, no `@ts-ignore`, no non-null `!` without a comment explaining why it is safe.
- Validate every external input with Zod at the boundary (HTTP bodies and queries, webhook headers, environment variables, adapter responses). Schemas shared with clients live in `packages/shared`.
- Errors: throw typed domain errors (`DomainError` with a stable `code`). One error mapper in `src/http/` converts them to the JSON error body. Never leak stack traces, SQL or Shopify details to clients. Never swallow an error silently.
- Naming: files `kebab-case.ts`; types `PascalCase`; functions and variables `camelCase`; constants and enum values `UPPER_SNAKE_CASE`; DB columns `snake_case`; permission keys exactly as in architecture section 12; API paths exactly as in the PRD and OpenAPI.
- Functions do one thing; keep files under about 300 lines; no circular imports between modules.
- No `console.log`. Use the `pino` logger with correlation IDs. Never log request bodies, webhook payloads, addresses, names, emails, phone numbers, tokens or secrets.
- No placeholders: no `TODO`, `FIXME`, stub functions, fake data in production code or `throw new Error("not implemented")`. If something cannot be finished, say so in your report instead of leaving a stub.
- Configuration comes from the typed config module reading environment variables. No hard-coded URLs, shop domains, secrets or thresholds.
- Clients follow MVC (architecture 7): views contain no fetch calls and no business rules. Every server-dependent screen handles `synchronized`, `pending-confirmation`, `failed` and stale or unavailable states, shows status with text as well as colour, and uses touch targets suitable for mobile.
- Tests live beside the code (`*.test.ts`) or in `tests/`; fixtures live in `fixtures/`.

---

## 8. API and database change protocol

1. **API first:** change `api-spec/openapi.yaml`, get it approved, then write the endpoint. Regenerate shared types. Contract tests must pass.
2. Endpoints, status codes and error body follow architecture section 13. Errors carry a machine-readable `code`, a human message and a `correlation_id`.
3. **Database:** change `prisma/schema.prisma`, then create a migration. Constraints Prisma cannot express (partial unique indexes, triggers, grants, column-level privileges) go in custom SQL inside the same migration. Migrations are committed and reproducible. Never edit a merged migration.
4. Never weaken a constraint listed in architecture 8.3 or a grant in 8.5.
5. Seed and reset scripts are destructive. They run only with `ALLOW_DESTRUCTIVE_SEED=true`, print their effect first, and refuse when `SHOPIFY_ADAPTER=real`. Never run them automatically. They connect as `orderflow_owner`; never grant the app role DELETE or TRUNCATE.

---

## 9. Security rules

- Secrets only in environment variables. Provide `.env.example` with placeholders. Never commit a secret or bundle one into a client.
- Webhooks: HTTPS in real deployments, HMAC on raw body, shop-domain allowlist, deduplication, rate limiting, fail closed.
- Authorization is enforced in the API layer for every protected route. Hiding a button is not authorization. Every new endpoint needs a permission key and a test per role.
- Only `owner` may grant or revoke the `owner` role, enforced in the service.
- Tokens: `expo-secure-store` on native, secure HTTP-only cookie on web. Never `localStorage` for tokens.
- Zero PII or secrets in application logs and `audit_events`. Audit `details` use the per-event-type Zod allowlist; unknown keys are rejected.
- Customer addresses and contact data appear only in the protected order record, returned only to users with `order.address.read`, and never in broad reports or search matching.
- The analytics process connects with `orderflow_ro` only and accepts calls only with the internal service secret.
- OrderFlow never stores, processes or transmits card data. Never invent credentials, shop domains or tokens. Tests never call a real Shopify store or identity provider.

---

## 10. Testing and quality gates

**Per slice:** unit tests for domain rules and validators; integration tests for repositories, endpoints and adapter behaviour (Vitest, Supertest, real PostgreSQL in Docker); E2E smoke where the slice adds a principal workflow (Playwright for web; Expo critical-path tests for native). Use equivalence and boundary tests where meaningful, in particular tracking number lengths 5, 6, 30, 31 and invalid punctuation, report date ranges, amounts, and `order_version`.

**Mandatory scenarios** are PRD section 15.2, items 1 to 25. Each slice owns the ones in its scope and must have them passing before Accept. In addition, always include: duplicate webhook produces no second effect; invalid HMAC rejected; failed processing retries and reaches dead letter; older Shopify data cannot overwrite newer; transient Shopify error never produces a permanent failure; duplicate and conflicting `request_id`; stale version; timeout then reconciliation with no duplicate fulfillment; delivery twice; role denial per endpoint; analytics role cannot write; no PII in logs or audit.

**Quality gates** (PRD 15.3): 1 scope and plan; 2 design and tests; 3 implementation works end to end in mock mode; 4 verification (tests and slice-appropriate security and performance checks pass, evidence recorded); 5 acceptance (reviewer confirms requirements, docs, demo path, known limitations). A slice is not complete because code exists; it is complete when criteria and evidence are recorded.

**Evidence:** append real results to `docs/evidence/test-evidence.md` (command, date, result) and the session summary to `docs/evidence/workflow-log.md`. Never fabricate a test result, a gate result or an acceptance decision.

**Performance:** with 100 seeded active orders, list API p95 under 1 second locally and initial list UI under 3 seconds. Record environment details with the measurement.

---

## 11. Workflow

### 11.1 Slices
The unit of work is one vertical slice, not one module. A slice cuts through UI, API, domain logic, persistence and tests.

| Slice | Scope |
|---|---|
| S0 Foundation | Monorepo, Docker Compose, PostgreSQL, Prisma migrations and seed, API shell and `/health`, web and native shells, mock OIDC, RBAC foundation, CI and test setup |
| S1 Ingestion and eligible list | Adapter interface, mock adapter, real adapter foundation, webhook inbox, HMAC, worker, reconciliation, eligibility, order list and search |
| S2 Details and checklist | Order detail, address, items, five-step checklist, sequential complete and undo, timeline foundation |
| S3 Safe dispatch | Tracking validation, confirmation, idempotent request, attempt guard, fulfillment call, timeout reconciliation, notification config |
| S4 Delivery and conflicts | Permanent delivery, note, set-once timestamps, post-dispatch conflict flag and review |
| S5 Reports and refunds | Refund applications, review, applicant report, dispatch report, analytics boundary |
| S6 Hardening and demo | Security and performance tests, E2E smoke, failure fixtures, accessibility pass, README, OpenAPI, evidence, demo script |

A new slice may be added only by the human planner when a cohesive requirement cannot fit an existing one.

### 11.2 Slice loop
1. Ibrahim records scope and acceptance criteria.
2. Ihtesham checks architecture, data model and ADR alignment.
3. Ahmed prepares test cases and fixtures **before** implementation.
4. Taha implements backend; Ibrahim implements client UI in parallel against the agreed OpenAPI contract.
5. Ihtesham reviews conformance and documentation.
6. Ahmed runs the quality gates and logs evidence.
7. Ibrahim records Accept, Revise or Reject and updates `plan.md`.

Ownership: Ibrahim, planning, process and client UI; Ihtesham, architecture, documentation, Docker and scaffold, mock adapter, webhook simulator, analytics; Taha, backend; Ahmed, QA. Each deliverable has one accountable owner. Do not touch work owned by another person without it being part of the approved slice plan.

### 11.3 HITL and AFK
Each slice records its mode and the reason in `plan.md`. If no mode is recorded, use **HITL**.

- **HITL (mandatory for authentication, payment eligibility, dispatch behaviour):** present a short plan (goal, files, interfaces, tests, risks), **wait for approval**, implement, then present a summary and test results and **wait for review before merge**.
- **AFK (allowed for scaffolding, UI screens, fixtures, tests, report UI):** implement from the recorded scope without waiting, then present the result for review. No merge without review.

### 11.4 Git
- One branch per slice (`slice/s1-ingestion`); small, focused commits with clear messages.
- No direct commits to `main`. Open a pull request; a human reviews and merges.
- No force pushes, no history rewriting, no deleting branches you did not create.
- `plan.md` is the single master plan; changes are appended to its dated change log. Do not create competing plans.

### 11.5 UI
For each slice's screens, propose wireframes first and wait for approval recorded in `plan.md`, then code the UI. Screens: order list, order detail with checklist, dispatch confirmation, delivery, refund application and review, reports, admin (users, integration health).

The dispatch confirmation text is fixed: "Dispatch order #[order number]? This will create/confirm the Shopify fulfillment and cannot be undone in OrderFlow. Verify the parcel and tracking number before continuing."

---

## 12. Commands

These scripts must exist from S0. Use exactly these names; do not invent alternatives.

| Task | Command |
|---|---|
| Install | `npm install` |
| Start full stack | `docker compose up --build` |
| Stop | `docker compose down` |
| Migrate | `npm run db:migrate` |
| Seed demo data (destructive, guarded) | `npm run db:seed` |
| Reset demo data (destructive, guarded) | `npm run db:reset` |
| Simulate signed webhook | `npm run webhook:simulate -- --topic orders/paid --fixture <name>` |
| Flip a mock scenario (outage, timeout) | `npm run mock:scenario -- --set <scenario>=<on\|off>` |
| Unit and integration tests | `npm test` |
| Web E2E | `npm run test:e2e` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Format check | `npm run format:check` |
| Start native app | `npm run native:start` |
| Switch adapter | set `SHOPIFY_ADAPTER=mock` or `real` in `.env`, restart `api` and `worker` |

Before opening a pull request, `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm test` must pass.

---

## 13. When to stop and ask

Stop, state what you know, what you assume and the options (two or three, with a recommendation), and wait, when:

- A task would change a locked decision (D-01 to D-05), an ADR, the PRD or this file
- Two documents conflict, or a requirement is ambiguous in a way that changes behaviour
- You need a dependency outside section 4
- You need to touch code outside your slice
- The work would hit the out-of-scope list in section 3.2
- A migration would alter existing data or weaken a constraint
- You are about to take any destructive or irreversible action

Do not stop for minor details that are cheap to change: take the safer option, say which one, and continue. Write any documentation concern to `docs/proposed-changes.md`.

---

## 14. Definition of done

- [ ] Plan or scope recorded; mode (HITL or AFK) recorded
- [ ] OpenAPI updated first if any endpoint changed
- [ ] Code stays within module and file boundaries (sections 5 and 7)
- [ ] Tests for the slice's mandatory scenarios written and passing
- [ ] Lint, type check and format check clean
- [ ] No secrets, no PII in logs or audit, no out-of-scope features, no placeholders
- [ ] Migrations committed and reproducible
- [ ] Evidence appended; documentation concerns recorded in `docs/proposed-changes.md`
- [ ] Pull request opened from the slice branch
- [ ] Human has recorded Accept, Revise or Reject

---

## 15. Document history

| Version | Date | Change |
|---|---|---|
| 1.0 | Nov 2026 | Module-based rules, four-step checklist, Phase 1 and Phase 2 split (superseded) |
| 2.1 | 23 Nov 2026 | Self-audit fixes: approved dependency additions, route order, replay rule, mock state in database, owner role for reset, mock scenario command |
| 2.0 | 23 Nov 2026 | Aligned to PRD v3.0: vertical slices, five-step checklist, fixed stack and dependency list, file boundaries, coding conventions, commands, HITL and AFK rules, refund and dispatch rules, courier and support removed |
