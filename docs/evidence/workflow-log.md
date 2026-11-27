# Slice 1A workflow log

Date: 2026-11-27
Branch: `slice/1A-sign-in`
Mode: HITL. The user approved the Slice 1A plan before implementation.
AI session link: No shareable session URL is available in this environment.

Implemented the identity-only workspace scaffold, migration and least-privilege grants, API authentication/RBAC/audit modules, mock OIDC account flows, sign-in and role-based landing pages, guarded demo seeding, and Slice 1A tests.

The test-first baseline was recorded before implementation. During implementation, runtime checks found and corrected the Prisma workspace schema path, app-role upsert permissions, mock OIDC interaction/consent handling, and post-sign-out navigation. Final test evidence is recorded in `test-evidence.md`.

Decision: awaiting the human's Accept, Revise, or Reject review. No acceptance or merge decision has been recorded.

Human follow-up:
- Confirm the demo password before using the demo issuer.
- Confirm awareness that `docker compose down -v` removes the PostgreSQL data volume.

---

# Slice 1B workflow log

Date: 2026-11-27
Branch: `slice/1B-customer-order`
Mode: HITL. The user approved the Slice 1B plan (decisions D1 to D16) before implementation.
AI session link: https://claude.ai/code/session_01X9BVubpxetrrYRMaGN8MYU

Implemented, tests first: OpenAPI and shared schemas, `0002_orders` (products, orders, order lines, checklist rows, idempotency keys, set-once and lifecycle triggers, CHECKs) with the app-role grants in `docker/postgres/grants.sql`, the eight-product seed, the storefront, create-order, and own-orders endpoints, and the plain-CSS storefront (shop, quick view, bag drawer and page, checkout, my orders, order page).

Notable points:
- Concurrent duplicate requests are serialised with a transaction-scoped advisory lock on `(actor, request_id)` and then replay the stored result. This replaces the `INSERT ... ON CONFLICT DO NOTHING` wording in the plan; the behaviour (one order, same response) is the same and is tested (1B-A13).
- `UPDATE (updated_at)` on `products` is granted because PostgreSQL requires it for `SELECT ... FOR SHARE`.
- The client total is computed in BigInt minor units from live product prices; the delivery charge is not exposed by the API in 1B (it is `0.00`), so any difference would surface as `PRICE_CHANGED`.
- Failed attempts also count toward the per-user rate limit.
- The D1 column conflict is recorded in `docs/proposed-changes.md`; a rework item for the delivery charge is added to `plan.md` section 7.

Decision: awaiting the human's Accept, Revise, or Reject review. No acceptance or merge decision has been recorded.

Human follow-up:
- Rebuild with `docker compose --env-file .env.example up --build` and walk through checkout once in a browser.
- Review the drafted product descriptions in `apps/api/scripts/seed.ts`.
- Record Gate 2 to 4 and the Accept decision in `plan.md` sections 9 and 10; merge.

## Slice 1B local run follow-up (2026-11-27)

Rebuilt the Slice 1B API, web, and mock OIDC containers after discovering the running stack still served the Slice 1A API (the storefront route returned 404). The current API then returned an empty product list. With the user's approval, ran the guarded seed against the configured Compose database; it completed and the storefront returned all eight products.

Verification after rebuild and seed: lint, typecheck, format check, 74 unit/integration tests, 17 SQL tests, and all 17 Playwright tests passed. API, mock OIDC, web, and PostgreSQL were healthy. The checkout walkthrough by a human and review of product descriptions are still pending. No slice acceptance or merge decision was made.
