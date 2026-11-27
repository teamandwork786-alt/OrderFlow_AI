# Proposed changes

Append-only. Agents record conflicts here; humans decide. Nothing in this file has been applied to `PRD.md`, `docs/architecture.md` or `AGENTS.md`.

## 2026-11-27: Slice 1B `0002_orders` columns (conflict between context note and plan)

Found while preparing Slice 1B. Decision recorded: human approved decision D1 of the Slice 1B plan on 2026-11-27.

| Item | Detail |
|---|---|
| Documents | `docs/SLICE_1B_CONTEXT_AND_UI.md` (section A, `orders`, `idempotency_keys`) against `plan.md` section 6 and AGENTS 8.5 (additive, created by the slice that first uses the table or column). |
| Conflict | The context note lists `external_reference`, `has_pending_address_request`, `checklist_epoch`, `phone_normalized`, an `endpoint` column on `idempotency_keys`, and payment and cancellation columns in `0002_orders`. Their first use is a later slice (4A address requests and epoch, 1F payment and cancellation, 1E phone search). |
| Option A (taken) | Follow `plan.md` and AGENTS 8.5: create only what Slice 1B uses; each later slice adds its columns in its own migration. |
| Option B | Create all listed columns now. Rejected: breaks the per-slice additive rule and ships unused schema. |
| Effect | `0002_orders` has no `has_pending_address_request`, `checklist_epoch`, `phone_normalized`, `external_reference`, payment or cancellation columns, and `idempotency_keys` has no `endpoint` column (the key is the actor and the request id, and the route has a single owner in 1B). Slice 1B tests do not need them. |
| Follow-up for the human | If the context note is kept as a reference, mark section A as "indicative; `plan.md` section 6 governs". |
