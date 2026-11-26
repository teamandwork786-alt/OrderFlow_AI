# OrderFlow AI

A standalone web order-management and dispatch system for a small decoration-piece business in Pakistan (prices in PKR). Signed-in customers order from the store and follow their orders. Payment is verified, staff pack each order through a five-step checklist, dispatch it exactly once with a tracking number, and mark it delivered. Refund applications are tracked by hand; OrderFlow never moves money.

**Status (26 Nov 2026):** specification v4.4 is written and awaiting Gate 1 sign-off (`plan.md` section 9). This branch holds documentation only: no application code exists yet. The application is built in 15 vertical slices (1A to 5C), each ending in something a person can use. The earlier prototype is kept on branch `legacy/s1-prototype` for reference. Nothing below should be read as "already working" unless `plan.md` records the slice as accepted.

## Documents

| Document | Purpose |
|---|---|
| [`PRD.md`](PRD.md) | Requirements v4.4: roles, lifecycle, functional requirements, scenarios, decisions. Highest authority. |
| [`docs/architecture.md`](docs/architecture.md) | Architecture v4.4: modules, database constraints, flows, ADR-010 to ADR-025. |
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents and the slice workflow. |
| [`plan.md`](plan.md) | Master plan: 15 vertical slices (1A to 5C), per-slice migrations, scenario ownership, Gate 1 sign-off. |

If documents disagree, the order is PRD, architecture, `AGENTS.md`, `plan.md`.

## Architecture overview

Browser (React) calls one Express API. The API owns all business rules and writes to PostgreSQL. Two ports keep external services replaceable: `PaymentAdapter` (mock in the demo) and `EmailAdapter` (mock, writes to the `email_outbox` table). Reports are served by a separate read-only service, reached only through the API.

- **Order lifecycle:** `PENDING_PAYMENT` to `PAID` to `PREPARING` to `DISPATCHED` to `DELIVERED`, plus `CANCELLED` before dispatch.
- **Integrity in the database:** set-once timestamps, a lifecycle-graph trigger, a dispatch precondition trigger, append-only audit log and notes, and three roles: `orderflow_owner` (migrations), `orderflow_app` (no DELETE or TRUNCATE), `orderflow_ro` (reporting views only).
- **Safety rules:** server-side pricing with a price-consent check, `request_id` idempotency, `expected_version` locking, and offline checklist support with dispatch blocked offline unless the Owner enables an override.
- **Analytics:** browser to API (`report.view`) to `apps/analytics` with an internal secret, reading `security_barrier` views as `orderflow_ro`. It publishes no host port.

## Tech stack

TypeScript (strict), npm workspaces, Node 22, Express, Zod, PostgreSQL 16 with Prisma and custom SQL migrations, `jose`, `pino`, `oidc-provider` (mock issuer), React 18, Vite, React Router, TanStack Query, plain CSS, Vitest, Supertest, Playwright, Docker Compose. Extra packages are installed only when their slice starts (see `plan.md`).

## Repository structure

Target layout (architecture section 5):

```
apps/api/         Express API (src/http, src/modules, src/db, src/integrations/{payment,email}, prisma/)
apps/analytics/   read-only reporting service
apps/web/         storefront, my-orders, staff workspace
apps/mock-oidc/   local OIDC issuer for demo customers and staff
packages/shared/  Zod schemas, permission map, lifecycle graph, shared types
api-spec/         openapi.yaml
docs/             architecture.md, adr/, evidence/, wireframes/, proposed-changes.md
docker/           Dockerfiles, postgres init.sql and grants.sql
scripts/          db-migrate.sh, seed and reset scripts (1A), payment simulator (1F)
uploads volume    product photos at /uploads (never committed)
```

Today only the documents exist (`README.md`, `PRD.md`, `AGENTS.md`, `plan.md`, `docs/architecture.md`). Each directory above is created by the first slice that needs it (`plan.md` section 4); Slice 1A creates the scaffold.

## Local setup (Docker and PostgreSQL)

Requirements: Docker with Compose, Node 22 (`.nvmrc`).

```bash
cp .env.example .env        # demo values only; never commit .env
npm install
docker compose up --build   # PostgreSQL 16, migrations, API, mock sign-in, web
docker compose down         # stop
```

- PostgreSQL is not published to the host. To inspect it locally, add `ports: ["127.0.0.1:5432:5432"]` to the `postgres` service.
- The init script creates the three roles with demo passwords; `npm run db:migrate` applies migrations and then `docker/postgres/grants.sql`.
- Seed and reset scripts are destructive and run only with `ALLOW_DESTRUCTIVE_SEED=true`.
- `.env.example`, Docker Compose and the scripts below are created by Slice 1A; until then these steps do not work.

Commands (`AGENTS.md` section 12): `npm run db:migrate`, `db:seed`, `db:reset`, `npm test`, `npm run test:sql`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, `npm run format:check`. Some of these are added by the slices that need them.

## Roles and access control (RBAC)

Effective permissions are the union of a user's roles and are always enforced in the API, never only in the UI.

| Role | Purpose |
|---|---|
| `customer` | Orders, pays, tracks own orders, requests an address correction. Never holds a staff role. |
| `staff_picker_packer` | Checklist steps 1 and 2 |
| `staff_inspector` | Checklist steps 3 to 5 (includes packing, step 4) |
| `staff_full` | All five steps |
| `admin` | Payment confirmation, address requests, cancellations, refund review, users, products. Performs checklist steps only if the Owner enables `admin_can_perform_staff_tasks`. |
| `owner` | Everything, including the offline-dispatch override, Admin staff-mode and the Owner role |
| `cap_dispatch`, `cap_delivery`, `cap_report`, `cap_order_intake` | Single added abilities for staff: dispatch, mark delivered, view reports, create manual orders |

Full permission keys and the action matrix are in PRD section 2.

## Working agreement

Work is delivered in slices with human approval gates (Gate 1 first, then a plan and acceptance per slice). AI agents follow `AGENTS.md`: documents are read-only to them, plan decisions and sign-offs are human-only, and no slice starts before Gate 1 is signed.