# plan.md: OrderFlow AI master plan

**Current version:** v01 | **Date:** 23 Nov 2026 | **Status:** Stage 2 complete, ready to begin Stage 4 at S0
**Single master plan.** Do not keep competing plans. Every meaningful change is appended to section 17 and a numbered copy is saved (`docs/plan-history/plan-vNN.md`). Git history is an additional, not a replacement, record.

**Authority order:** PRD v3.0 > `docs/architecture.md` v2.1 > `api-spec/openapi.yaml` > `AGENTS.md` v2.1 > this file.

---

## 1. Product objective

OrderFlow AI is an internal order-operations system for Hannan's decoration-piece business. Authorized staff see Shopify orders that are genuinely paid and eligible, prepare each parcel through a five-step checklist, dispatch it safely (no duplicate fulfillment even under timeout), record delivery once and permanently, track manual refund applications, and read an order timeline and two reports. A responsive web app and an Expo native app share one backend. A deterministic mock Shopify adapter is the guaranteed demo path; a real adapter sits behind the same interface.

**Client problem addressed** (PRD 1.2): confusion between payment, preparation, dispatch and delivery status; unsafe or duplicate dispatch; no traceable record of staff actions and refund requests.

**Non-goals** (PRD 1.5): storefront, payment collection, automated refunds, courier integration or driver app, chatbot, offline mode, inventory, multi-tenancy, production hosting.

## 2. D4 assessment requirements and where they are met

The course assesses product quality and process quality equally. If an activity cannot be shown with evidence at the demo, it may get no credit.

| D4 requirement | How this project meets it | Where |
|---|---|---|
| Stage 2: review context for gaps, plan, README | Gap review done (section 4); this file and README exist | sections 4, 17 |
| plan.md contents: objective, assumptions and open issues, slices, priorities and order, dependencies, acceptance criteria, status | Sections 1, 4, 5, 6, 8, 16 | this file |
| Plan history preserved | Numbered copies `docs/plan-history/plan-vNN.md` plus Git history, plus section 17 log | section 17 |
| Stage 3: AI-generated supporting artefacts, kept if used | Listed in section 9 | section 9 |
| Stage 4: loop of 9 steps per slice with minimum evidence | Section 10 and the Workflow Evidence Log | section 10 |
| Workflow Evidence Log (11 fields per slice) | `docs/evidence/workflow-log.md` | section 10 |
| Testing: functional, negative, EP, BVA, used where meaningful; 5 quality gates; test evidence table | Section 11 | section 11 |
| Stage 5: end-to-end checks, edge cases, selected NFRs | S6 and Gate 5 | sections 5, 11 |
| CCP analysis in final report (8 elements) | Section 13 plans it; report in `docs/final-report.md` | section 13 |
| Group Contribution Log | `docs/evidence/contribution-log.md` | section 10 |
| Final submissions list and final demo list | Sections 14 and 15 | sections 14, 15 |
| Improve product before demo; new features recorded in artefacts first | Section 6 (enhancement rule and candidates) | section 6 |
| Commit only to what works at demo | Section 7 (descope order) | section 7 |

**Late-submission risk:** the penalty is 20% to 70% of marks, and zero after two days. The official deadline is **27 November 2026**. The team target in PRD 21 is **26 November**, with feature freeze on the evening of the 26th. The teacher's deadline governs; the exact submission time is **an open item to confirm** (section 4, O-01).

## 3. Roles

| Member | Primary ownership | Slice duties |
|---|---|---|
| Ibrahim | Planner and process lead; client UI (web and native); wireframes; this plan and its history; workflow evidence log; contribution log; final report | Records scope and acceptance criteria; records Accept, Revise or Reject |
| Ihtesham | Architect and documentation lead; Docker and scaffold; mock adapter and webhook simulator; analytics and reports; PRD, ADR, architecture and AGENTS alignment; OpenAPI review | Checks architecture, data model and ADR alignment; conformance review |
| Taha | Backend builder: webhook pipeline, eligibility, order mirror, checklist API, dispatch, delivery, real adapter | Implements backend per slice |
| Ahmed | QA lead: test design, fixtures, quality gates, security and performance checks, defect reports, regression, demo script | Prepares tests and fixtures before implementation; runs gates and logs evidence |

Each deliverable has one accountable owner. Everyone must be able to explain the whole product, architecture, plan and major decisions at the demo (D4 group-work rule).

## 4. Stage 2 review: assumptions, gaps and open issues

### 4.1 Review result

PRD v3.0, `architecture.md` v2.1 and `AGENTS.md` v2.1 were reconciled in an AI-assisted audit on 23 Nov 2026 (Workflow Evidence Log entry W-00). About 30 contradictions and implementation traps were found and fixed, among them: post-dispatch refunds wrongly flagged as conflicts, mock Shopify state held in memory across two processes, config validation that crashes in mock mode, OIDC issuer versus JWKS URL mismatch in Docker, a `SameSite=Strict` login cookie that breaks the OIDC redirect, a reset script blocked by its own audit triggers, and unclear dispatch replay and reconciliation locking. The full list is in the audit summary kept at `docs/evidence/ai-sessions/W-00-audit.md`.

### 4.2 Open decisions (need a team answer; defaults apply until then)

| ID | Question | Default in use | Decide before |
|---|---|---|---|
| E1 | Can a refunded, voided or partially refunded order ever return to the queue? | No in-app override; stays blocked until Shopify state re-evaluates as eligible; Owner/Admin may add a note | S1 |
| E2 | Real Shopify mode cannot take test transactions (they are ineligible). Is real mode only a configuration demo? | Yes. Mock mode is the acceptance path | S1 |
| E3 | Staff "assigned order access": per-order assignment or permissions? | Permissions through `cap_*` roles; no per-order assignment | S2 |
| E4 | Partial fulfilment (some line items only)? | Not supported; dispatch fulfils all line items | S3 |
| O-01 | Exact submission time on 27 Nov (to avoid late penalty) | Assume morning of 27 Nov; target finish 26 Nov evening | now |
| O-02 | Git hosting: GitHub optional (D4) but PRD 19.2 names a Git repository | Local Git repository, one branch per slice; GitHub only if the team chooses | S0 |
| O-03 | CI provider (PRD requires "CI/test setup") | Local scripts that run lint, typecheck, format check and tests; hosted CI optional | S0 |
| O-04 | Is the Expo native app demonstrated on a physical phone, an emulator, or Expo Go? | Emulator or Expo Go; record which in the README | S0 |

### 4.3 Items to verify against the pinned Shopify API version (real adapter only)

Webhook topic names; `processedAt` field for payment time; whether `fulfillmentCreate` accepts an idempotency key; fulfillment-order edge cases (on hold, nothing shippable). None blocks mock mode.

### 4.4 Assumptions (all from PRD 22 and architecture section 19)

PKR only; cash-on-delivery excluded; Shopify is the source of truth for commerce, payment and fulfillment facts; address override only before dispatch; shipping notifications off in mock mode; delivery is manual and permanent; refunds are tracked manually and never calculated or issued; mock OIDC for the demo; web carries administration and reports, native carries the core staff workflow; demo data is synthetic.

## 5. Vertical slices

Each slice is user-visible and cuts through UI, API, domain, data and tests. No slice is "frontend only" or "database only". Acceptance criteria are by reference to the PRD functional requirement (FR) acceptance criteria and to the PRD 15.2 mandatory scenarios (**M#**).

| Slice | Capability delivered | PRD requirements | Mandatory scenarios (PRD 15.2) | Mode and reason | Lead |
|---|---|---|---|---|---|
| **S0 Foundation** | Stack starts; demo user signs in on web and native; `/health` works; migrations and seed run; RBAC map in place | FR-13 (audit base), FR-14 (health), NFR-04, NFR-06, NFR-08, PRD 2.3 | none beyond sign-in and RBAC smoke | **HITL** for sign-in and RBAC (authentication is mandatory HITL); **AFK** for scaffold, Docker and shells | Ihtesham (scaffold), Taha (auth), Ibrahim (shells) |
| **S1 Ingestion and eligible list** | Signed webhook creates or updates one order once; eligible paid PKR orders appear in a searchable list; blocked orders do not | FR-01, FR-02, FR-03, PRD 8.1, 8.3 | M1 to M6 | **HITL** (payment eligibility is mandatory HITL) | Taha; Ihtesham (mock adapter, simulator); Ibrahim (list UI) |
| **S2 Details and checklist** | Open an order, see items, customer and address; complete and undo the five steps in order; timeline shows events | FR-04, FR-05, FR-10 (foundation) | M7, M8, part of M25 | **AFK** for UI and tests, **HITL** review of step rules | Taha; Ibrahim (UI) |
| **S3 Safe dispatch** | Dispatch once with confirmation; timeout becomes pending then reconciles; stale, unauthorized and ineligible requests fail safely | FR-06, FR-07, NFR-03, ADR-005 | M9 to M17 | **HITL** (dispatch is mandatory HITL; highest risk) | Taha; Ahmed (fixtures); Ibrahim (UI) |
| **S4 Delivery and conflicts** | Record delivery once, permanent; Shopify cancellation after dispatch raises a conflict flag; review note | FR-08, FR-09 | M18 to M20 | **HITL** for delivery rules; **AFK** for UI | Taha; Ibrahim (UI) |
| **S5 Reports and refunds** | Manual refund application and review; refund-applicants report; dispatch performance report; analytics cannot write | FR-11, FR-12, PRD 11 | M21 to M24 | **AFK** with review (reports, UI); **HITL** for the analytics boundary | Ihtesham (analytics), Taha (refunds), Ibrahim (UI) |
| **S6 Hardening and demo** | Security and performance evidence; E2E smoke; failure fixtures; accessibility pass; OpenAPI final; README final; demo script; evidence complete | NFR-01, NFR-02, NFR-04, NFR-07, NFR-08, PRD 24 | M25; all M1 to M25 re-run as regression | **AFK** for tests and docs, **HITL** for the final acceptance | Ahmed; Ibrahim; Ihtesham |

### 5.1 The slices in simple words

A **vertical slice** is one small piece of the finished product that works from the screen all the way down to the database. We never build "all screens first, then all servers, then the database". Instead, each slice gives staff one thing they can really do, and we test it before moving on.

**S0, Foundation: "the empty house with working doors"**
- What it is: the base everything else stands on. No business features yet.
- What works at the end: the whole system starts with one command; a demo user can sign in on web and on the phone app; a health page says the system is alive; the database is created and filled with demo data; the system already knows who is allowed to do what.
- Why first: every other slice needs sign-in, permissions and a database.
- Done when: both apps open, sign-in works, `/health` answers, migrations and seed run.

**S1, Ingestion and eligible list: "orders arrive and only the right ones show"**
- What it is: Shopify tells us about orders (a webhook). We check the message is genuine, save it safely, and a background worker reads it later.
- What works at the end: a paid order sent from the mock Shopify appears in the order list. Orders that are unpaid, cancelled, test, refunded, in the wrong currency, or with the wrong amount do not enter the working queue. Sending the same message twice changes nothing. A fake or tampered message is rejected. Old information can never overwrite newer information. Staff can search the list.
- Why second: nothing else can be shown or packed until orders exist.
- Done when: scenarios 1 to 6 in the PRD pass.

**S2, Details and checklist: "open an order and pack it"**
- What it is: the order page and the five packing steps.
- What works at the end: staff open an order and see products, quantities, customer and address. They tick the five steps in order (no skipping). Only the last ticked step can be undone. Every action shows in a timeline.
- Why third: dispatch is only allowed after all five steps are done.
- Done when: scenarios 7 and 8 pass and the web and phone show the same state.

**S3, Safe dispatch: "send the parcel once, never twice"**
- What it is: the riskiest slice. Staff enter a tracking number and confirm; the system tells Shopify the parcel is shipped.
- What works at the end: dispatch succeeds once. If Shopify does not answer in time, the order shows "pending confirmation" and the system checks Shopify later instead of sending again, so a customer never gets two shipments. Sending the same request twice returns the same answer. Out-of-date, unauthorized, incomplete, or Shopify-down requests are refused safely. Tracking numbers are checked at lengths 5, 6, 30 and 31.
- Why fourth: it needs the checklist and the mock Shopify built before.
- Done when: scenarios 9 to 17 pass. This slice gets the most careful human review.

**S4, Delivery and conflicts: "delivered means delivered"**
- What it is: staff record that the parcel arrived, and the system watches for Shopify changes after dispatch.
- What works at the end: an authorized person records delivery once, with their name and time. It can never be undone; a mistake is fixed by adding a note, not by changing the status. If Shopify cancels or changes an order after dispatch, the order gets a "conflict" flag for an admin to review, but its history is not rewritten.
- Why fifth: it needs dispatched orders.
- Done when: scenarios 18 to 20 pass.

**S5, Reports and refunds: "track refund requests and measure speed"**
- What it is: a manual refund register and two reports.
- What works at the end: staff record a refund application with the product details; only the Owner or Admin can approve or decline. The system never calculates or pays any refund. One report lists refund applicants; the other shows how long orders take from verified payment to dispatch, handling missing data and empty ranges. The reports run in a separate process that can only read the database.
- Why sixth: the dispatch report needs dispatch times from S3.
- Done when: scenarios 21 to 24 pass.

**S6, Hardening and demo: "prove it works and get ready to show it"**
- What it is: no new features; checking, polishing and packaging.
- What works at the end: security tests, a 100-order speed test, an end-to-end test of the main flow, failure demos, an accessibility pass, the final API description, finished README, evidence files and the demo script.
- Why last: it tests the whole product together.
- Done when: all 25 scenarios and the final acceptance checklist pass.

**How the slices connect:** S0 gives the base. S1 puts orders in. S2 lets staff prepare them. S3 ships them. S4 closes them out. S5 reports on them. S6 proves it all. Each slice is only accepted after its checks are run and a person decides Accept, Revise or Reject.

If a cohesive requirement cannot fit a slice, the human planner may add one (for example `S4b`), recorded in section 17. Adding a slice is a plan change and creates a new plan version.

## 6. Priorities, order and enhancement rule

**Order:** S0 → S1 → S2 → S3 → S4 → S5 → S6. This is also the dependency order.

**Priority tiers (used for descoping):**
1. **Must work at demo:** S0, S1, S2, S3, S4 on web plus native core flow; mock mode; timeline.
2. **Should work:** S5 (both reports and refund applications), web admin screens, dead-letter view.
3. **Could be reduced:** native refund-status screen, compact native report summary (optional in PRD), real-adapter live testing, accessibility depth beyond a documented pass.

**Enhancement rule (D4 section 2):** once the minimum is working, improve the product only with meaningful, reasonable additions. A new feature must first appear in the relevant artefact (PRD, architecture, AGENTS, this plan) and get its own slice or an addition to a slice, with criteria. Candidate improvements, to be considered only after S4 passes Gate 5 for its slice:

| ID | Candidate | Value | Cost |
|---|---|---|---|
| X1 | Needs-attention filter on the order list with reasons shown | Directly serves the client's confusion problem | Low (the data already exists) |
| X2 | CSV export of the refund-applicants report | Client can use it outside the system | Low |
| X3 | Order timeline filter by event type | Easier audit review | Low |

None of these is committed. The team commits only to what it can finish reliably.

## 7. Descope order (if time runs short)

Drop in this order, recording each drop in section 17 and in the README known limitations: (1) candidates X1 to X3; (2) native refund-status screen; (3) accessibility checks beyond a documented manual pass; (4) real-adapter live test (the adapter code stays); (5) native admin features (never in scope). Never drop: dispatch safety, delivery permanence, RBAC, webhook HMAC, the audit trail, the workflow evidence, plan history.

## 8. Dependencies

```
S0 ──► S1 ──► S2 ──► S3 ──► S4 ──► S5 ──► S6
         │                    ▲
         └─ mock adapter ─────┘ (S3 and S4 use the mock adapter's timeout and cancellation scenarios)
```

| Slice | Needs from earlier work |
|---|---|
| S1 | S0 database, auth, RBAC, Docker, shells |
| S2 | S1 orders and eligibility; wireframes approved |
| S3 | S2 checklist completion; S1 mock adapter and snapshot; `dispatches` table; scenario switches |
| S4 | S3 `DISPATCHED` orders; S1 sync for conflict detection |
| S5 | S3 dispatch timestamps for the dispatch report; S4 delivery; read-only DB role from S0 |
| S6 | everything |

External dependencies: none are required for the guaranteed path. Real Shopify credentials and Auth0 are optional.

## 9. AI-generated supporting artefacts (Stage 3)

Generated by the agent only as needed. Human review is not required, except UI wireframes, which the team may review and correct. Everything that becomes implementation context is kept in the repository.

| Artefact | Generated when | Location |
|---|---|---|
| OpenAPI contract | start of S0, extended per slice | `api-spec/openapi.yaml` |
| Prisma schema and custom SQL migration (indexes, triggers, grants) | S0, extended per slice | `apps/api/prisma/` |
| Database role script | S0 | `docker/postgres/init.sql` |
| Webhook fixtures (signed payloads) and GraphQL fixtures | S1, per scenario | `fixtures/shopify/` |
| UI wireframes (order list, detail and checklist, dispatch dialog, delivery, refund, reports, admin) | before each slice's UI | `docs/wireframes/` |
| Test cases and fixtures per slice | before implementation (Ahmed) | `docs/evidence/test-evidence.md` |
| Standalone ADR files from architecture section 17 | S0 | `docs/adr/` |
| Diagrams | when useful | inside `docs/architecture.md` (Mermaid) |

## 10. Stage 4 loop and evidence

### 10.1 The loop, per slice

| Step | Activity | Minimum evidence (recorded in the Workflow Evidence Log) |
|---|---|---|
| 1 Select | Take the next slice in order; link requirements and criteria | Slice ID, requirement reference |
| 2 Load context | Give the agent only the relevant PRD sections, architecture sections, ADRs, AGENTS.md, prior code, artefacts | Context and task reference |
| 3 Refine criteria and tests | Fix the criteria; the AI proposes tests; Ahmed prepares fixtures first | Criteria and test list (**Gate 1**) |
| 4 Choose mode | HITL or AFK, with the reason | Mode and reason |
| 5 Implement | The agent implements and iterates | AI chat or task reference, iterations |
| 6 Run checks | Slice tests plus regression of earlier slices | Test results (**Gates 2 and 4**) |
| 7 Human review | Accept, Revise or Reject; check behaviour, architecture, constraints, unnecessary functionality | Decision and reason (**Gate 3**) |
| 8 Integrate | Merge the slice branch; re-run regression | Integration evidence |
| 9 Update context | Update this plan (new version), and ADRs, architecture, AGENTS or OpenAPI if affected | New plan version |

A slice is not complete because the agent says it works. It is complete when the checks were run and compared with the acceptance criteria and the decision is recorded.

### 10.1a The loop in simple words: who does what in each step

The same loop runs once for every slice. The agent writes code, but the people decide. Nothing is "done" because the agent says so.

| Step | What happens in plain words | Who leads | What the others do | What is written down |
|---|---|---|---|---|
| 1 Select the slice | Pick the next slice in order (S0, S1, ...). Say which PRD requirements and acceptance criteria it covers | Ibrahim | Ihtesham confirms the slice fits the architecture | Slice ID, requirement references |
| 2 Load context | Give the AI agent only what this slice needs: the relevant PRD sections, architecture sections, ADRs, AGENTS.md, earlier code, and artefacts. Not the whole project | Ibrahim writes the task; Ihtesham checks the context is right | Taha and Ahmed read the same context so everyone shares one understanding | Task and context reference |
| 3 Refine criteria and tests | Turn the requirements into clear yes/no checks. The AI proposes tests; the team decides which matter, including invalid inputs and boundaries | Ahmed | Ibrahim confirms criteria; Taha says what is technically testable; the agent drafts cases | Criteria and test list. **Gate 1: is this slice ready to start?** |
| 4 Choose HITL or AFK | HITL means a human approves the agent's plan before it codes and reviews before merge. AFK means the agent works alone from the recorded scope, then a human reviews. Choose by risk: sign-in, payment eligibility and dispatch are always HITL | Ibrahim decides, Ihtesham advises on risk | Everyone knows the mode | Mode and one-line reason |
| 5 AI implements | The agent builds the slice and iterates. Taha supervises backend work; Ibrahim supervises client UI in parallel against the agreed API contract. Wireframes for the screens are proposed and approved first | Taha (backend), Ibrahim (UI) | Ihtesham answers architecture questions; Ahmed's fixtures are ready | AI chat or task reference; important correction loops and failed attempts |
| 6 Run checks | Run the slice's tests, the negative cases, and the earlier slices' tests again. Compare the actual result with the criteria, not with what the agent claims | Ahmed | Taha fixes defects; Ibrahim checks the UI manually on web and native | Test results. **Gate 2: does it work and handle bad input?** **Gate 4: did it break anything earlier?** |
| 7 Human review | Decide Accept, Revise or Reject. Check behaviour, architecture and constraints, and look for unnecessary extra functionality | Ihtesham reviews conformance; Ibrahim decides | Ahmed presents the evidence; Taha explains the code | Decision and reason. **Gate 3: does it respect architecture, ADRs and AGENTS.md?** |
| 8 Integrate | Merge the approved slice branch into the main code; re-run the regression checks | Taha (merge), Ahmed (re-run) | Ibrahim confirms the demo path still works | Integration evidence |
| 9 Update context | Save a new plan version and update the slice status. If the work changed a decision, update the ADR, architecture, AGENTS.md, OpenAPI or PRD | Ibrahim (plan), Ihtesham (the other documents) | Everyone reads the change | New plan version; workflow log entry |

**If the decision is Revise:** go back to step 5 (or step 3 if the criteria were wrong), keep the failed attempt as evidence, and repeat steps 6 and 7. **If Reject:** record why, discard the branch work, and restart from step 2 with better context or a smaller slice.

### 10.1b How each member analyses and does their work

**Ibrahim, planner and client UI**
- Analyses: reads the slice's PRD requirements and turns each into a plain acceptance criterion; asks "what can a staff member now do that they could not before?"
- Does: writes the slice scope and criteria; chooses HITL or AFK; proposes wireframes and gets them approved; builds the web and native screens against the OpenAPI contract; decides Accept, Revise or Reject; saves the new plan version; keeps the workflow log, contribution log and final report.
- Checks his own work by: using the screens in the browser and on the phone, and comparing them with the wireframe and the criteria.

**Ihtesham, architect and documentation lead**
- Analyses: asks "does this slice fit the architecture, the data model and the ADRs, and does it touch a locked decision?"
- Does: checks the schema and API contract before coding; builds the Docker setup, the mock Shopify adapter, the webhook simulator and the analytics process; reviews each slice for conformance; updates architecture, ADRs, AGENTS.md and OpenAPI when a decision changes; does the final documentation review.
- Checks his work by: comparing the code with the architecture document and recording any mismatch in `docs/proposed-changes.md`.

**Taha, backend builder**
- Analyses: reads the slice's rules and failure cases (duplicates, timeouts, stale data) and decides the order of backend work; questions anything ambiguous before the agent codes.
- Does: directs the AI agent to build the webhook pipeline, eligibility, order mirror, checklist API, dispatch and delivery, and the real Shopify adapter; reviews the generated code line by line for the risky parts; fixes defects found in testing; merges approved work.
- Checks his work by: running the unit and integration tests locally and reading the agent's code, not only its summary.

**Ahmed, QA and testing lead**
- Analyses: for each criterion asks "how could this fail?"; picks negative cases; uses equivalence partitioning where inputs fall into classes and boundary value analysis where limits exist (for example tracking number lengths 5, 6, 30, 31); does not test mechanically.
- Does: prepares test cases and fixtures **before** coding; runs the gates after coding; records every result in the test evidence table; files defect reports; reruns earlier tests for regression; checks security and the 100-order speed target; writes the demo script and verifies a clean run.
- Checks the AI's tests by: confirming they are relevant, that important cases are not missed, and that reported results are real (he runs them himself).

**Everyone:** any member can be asked about any part of the product at the demo, so each reads the plan, the slice context and the test results, not only their own part. Each deliverable still has one accountable owner.

### 10.1c Worked example: slice S1 (ingestion and eligible list)

1. **Select:** Ibrahim picks S1, linking FR-01, FR-02, FR-03 and scenarios 1 to 6.
2. **Load context:** the task includes PRD FR-01 to FR-03, architecture sections 10.1 and 10.2, ADR-006 and ADR-009, AGENTS.md, and the S0 code.
3. **Refine:** Ahmed lists checks, for example a valid paid order appears; unpaid, refunded and wrong-currency orders are blocked; a bad signature is rejected with 401; the same webhook twice creates one order; an older update does not overwrite a newer one; an amount one paisa off is blocked. Ihtesham prepares the mock adapter and signed fixtures.
4. **Mode:** HITL, because payment eligibility is a mandatory HITL area.
5. **Implement:** Taha has the agent present a short plan first, approves it, then lets it build; Ibrahim builds the list screen in parallel. Suppose the first attempt treats a transient Shopify error as "amount mismatch": Taha catches it, the agent corrects it, and the loop is logged.
6. **Run checks:** Ahmed runs the tests and the regression of S0; one fails, so it goes back to step 5.
7. **Review:** Ihtesham finds the eligibility code is correct and within the architecture; Ibrahim chooses Accept.
8. **Integrate:** Taha merges `slice/s1-ingestion`; Ahmed reruns the S0 and S1 tests on the merged code.
9. **Update:** Ibrahim saves plan-v02 with S1 marked Accepted, adds the workflow log entry, and Ihtesham updates OpenAPI if the contract changed.

This example is illustrative; the real entries are written in `docs/evidence/workflow-log.md` as work happens.

### 10.2 Evidence files (kept continuously, not rebuilt at the end)

| File | Content |
|---|---|
| `docs/evidence/workflow-log.md` | One entry per slice iteration: slice ID and name, requirements, lead, criteria, mode, AI chat or task reference, important iterations and correction loops, test result, decision, major issue or change, plan version, integration status |
| `docs/evidence/test-evidence.md` | Table: slice or requirement, test type, input or condition, expected, actual, pass or fail |
| `docs/evidence/contribution-log.md` | Per member: slices led, AI interactions, decisions, fixes, integration work |
| `docs/evidence/ai-sessions/` | Saved meaningful AI conversations, including rejected or revised outputs and self-corrections |
| `docs/plan-history/` | `plan-v01.md`, `plan-v02.md`, and so on |
| `docs/adr/` | Accepted ADRs; superseded ones in `docs/adr/superseded/` |

The demo must be able to show: at least one complete loop; one AI output that was revised or rejected; integration of several slices; the plan's evolution.

## 11. Testing and quality gates

Testing is lightweight and supports development; it does not dominate it.

**Required kinds of testing** (D4 testing instructions): basic functional testing against the criteria; negative testing of invalid, missing or unexpected input and actions; equivalence partitioning where an input domain has meaningful classes; boundary value analysis where limits exist. Do not apply EP or BVA mechanically, and do not build large suites for their own sake.

**Where EP and BVA are meaningful in this product:**

| Input | EP classes | BVA values |
|---|---|---|
| Tracking number (`^[A-Za-z0-9-]{6,30}$`) | valid; too short; too long; invalid characters; blank or whitespace | lengths 5, 6, 30, 31; leading and trailing spaces |
| Refund item quantity | valid; zero; negative; above line quantity; wrong order's item | 0, 1, line quantity, line quantity + 1 |
| Report date range | valid; start after end; span over limit; empty range | span 365, 366, 367 days; start equals end |
| Notes (delivery 200, exception 500, address reason 200 characters) | valid; empty; over limit | 0, 1, max, max + 1 |
| `order_version` | current; stale; missing; non-integer | current, current - 1 |
| Checklist step | step N with N-1 done; skipped step; undo of non-latest step | step 1, step 5 |
| Payment amount versus order total | equal; under; over; split payments summing to total | total - 0.01, total, total + 0.01 |

**Quality gates.** The D4 gates and the PRD 15.3 gates are the same checkpoints; both names are shown so either can be cited.

| Gate | D4 name | PRD 15.3 name | When | Pass condition | If it fails |
|---|---|---|---|---|---|
| 1 | Slice readiness | Scope and plan; Design and tests | Before implementation | Clear scope, linked requirements, acceptance criteria, mode recorded, tests and fixtures prepared | Update plan, PRD or context before coding |
| 2 | Functional verification | Implementation; Verification | After implementation | Expected behaviour works; important negative cases handled; relevant EP and BVA pass | Revise the slice and retest |
| 3 | Architecture and constraint check | (part of Acceptance) | Before integration | No violation of architecture, ADRs, AGENTS.md or agreed constraints | Revise code, or update approved artefacts if the design legitimately changed |
| 4 | Regression and integration check | Verification | Before accepting | Earlier accepted functionality still passes; slice integrates | Fix before acceptance |
| 5 | Final product check | Acceptance | After all slices | Main end-to-end flows work; promised scope demonstrable; edge cases and selected NFRs verified | Resolve critical failures before the demo |

Commands before every pull request: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`.

**Final product check (Gate 5) covers:** all 25 PRD scenarios, the PRD 24 final acceptance checklist, the 100-order list performance measurement (p95 under 1 second locally, UI under 3 seconds), the security tests (unauthenticated access, role escalation, invalid HMAC, duplicate delivery, no PII in logs or audit), and web and native consistency of lifecycle and checklist state.

## 12. Schedule (team target and deadline)

Today is Monday 23 November. The official deadline is Friday 27 November; the team freeze is Thursday evening, 26 November. Times are targets, not promises; the plan is updated as reality changes.

| Day | Plan | Gate target |
|---|---|---|
| Mon 23 Nov (evening) | Stage 2 done: documents reconciled; this plan and README; plan-v01 saved | Gate 1 for S0 |
| Tue 24 Nov | S0 complete. S1 started and, if possible, complete (adapter, inbox, HMAC, worker, eligibility, list) | S0 accepted; S1 Gates 1 to 2 |
| Wed 25 Nov | S1 accepted. S2 and S3 (details, checklist, dispatch with timeout reconciliation) | S2 accepted; S3 Gates 1 to 3 |
| Thu 26 Nov | S3 accepted. S4. S5. Freeze on the evening: no new features | S4, S5 accepted by the evening |
| Fri 27 Nov | S6 verification, evidence completion, final report, demo rehearsal, packaging, submission well before the cut-off | Gate 5 |

This is aggressive for four people. The descope order in section 7 is the safety valve. **S3 is the slice that must not be rushed.**

## 13. Final report plan (CCP analysis)

The final report (`docs/final-report.md`) contains: implemented scope; architecture and implementation summary; key challenges; CCP analysis; limitations and known issues; group contribution summary. Planned CCP content, drawn from existing ADRs:

| CCP element | Planned content |
|---|---|
| Problem statement | Staff must distinguish paid, prepared, dispatched and delivered orders, and avoid duplicate fulfillment. A simple CRUD order tool fails because Shopify is the authority, webhooks arrive duplicated and out of order, and a timed-out fulfillment call has an unknown outcome |
| Complexity drivers | Duplicate and out-of-order webhooks; uncertain dispatch outcome; two clients; separate processes (API, worker, analytics) sharing state; set-once audit records; role-based access to personal data |
| Trade-offs | Lock-free attempt-based dispatch (safe under timeout, more states to test) versus a database lock across the Shopify call (simpler, but blocks and cannot recover an unknown outcome); online-only clients (no sync conflicts) versus offline convenience |
| Alternatives (at least two) | Dispatch: pessimistic lock; fire-and-forget retry; attempt plus reconciliation (chosen, ADR-005). Background work: message queue; in-process timers; database inbox (chosen, ADR-009). Authentication: own passwords; Firebase; OIDC with mock issuer (chosen, ADR-003) |
| System integration | Shopify adapter, webhook inbox and worker, API, PostgreSQL, analytics read-only role, web and native clients, OIDC issuer |
| Solution evaluation | Dispatch correctness (no duplicate fulfillment across timeout scenarios, with test evidence); list response time at 100 orders; scenarios passed out of 25 |
| Scalability and feasibility | Single store, 100 active orders measured; polling reconciliation and one worker; what would change at scale: queue infrastructure, read replicas, per-order assignment, real Shopify scopes |
| Ethical and societal | Customer address and contact privacy (role checks, no PII in logs or audit, synthetic data); no automated financial action; accessibility basics; retention policy needed before production |

## 14. Final submission checklist (D4)

- [ ] Working product and all source files needed to run it
- [ ] Latest context: `PRD.md`, `docs/architecture.md`, `AGENTS.md`, ADRs, `README.md`, final `plan.md`, AI-generated artefacts
- [ ] Complete plan history (numbered copies and Git history)
- [ ] Workflow Evidence Log
- [ ] Test evidence table
- [ ] Final Project Report with CCP analysis
- [ ] Group Contribution Log
- [ ] Clear execution instructions and any access information (demo accounts)
- [ ] OpenAPI specification, database schema and migrations
- [ ] Demo script and known-limitations section

## 15. Final demo checklist (D4)

- [ ] Working product and main user flows (sign in, list, detail, checklist, dispatch, timeout recovery, delivery, refund application, reports)
- [ ] Fulfilment of the promised core requirements
- [ ] Evolution of plan.md (versions shown)
- [ ] Vertical-slice decomposition
- [ ] At least one complete implementation loop, shown from evidence
- [ ] One AI output that was revised or rejected
- [ ] Integration of several slices
- [ ] Basic testing and validation evidence, including a slice's gate history
- [ ] One CCP trade-off and its alternatives
- [ ] Every member's contribution and ability to explain the whole project

## 16. Current slice status

| Slice | Status | Plan version | Gate reached | Decision | Notes |
|---|---|---|---|---|---|
| S0 Foundation | Not started | v01 | Gate 1 pending | n/a | Next |
| S1 Ingestion and eligible list | Not started | v01 | n/a | n/a | |
| S2 Details and checklist | Not started | v01 | n/a | n/a | |
| S3 Safe dispatch | Not started | v01 | n/a | n/a | |
| S4 Delivery and conflicts | Not started | v01 | n/a | n/a | |
| S5 Reports and refunds | Not started | v01 | n/a | n/a | |
| S6 Hardening and demo | Not started | v01 | n/a | n/a | |

Status values: Not started, Gate 1 ready, In progress, In review, Accepted, Revise, Rejected, Integrated.

## 17. Plan change log (append only, newest last)

| Version | Date | Change | Reason | Affected | Approver |
|---|---|---|---|---|---|
| v01 | 23 Nov 2026 | First master plan after the Stage 2 review of PRD v3.0, architecture v2.1 and AGENTS v2.1 | Start of implementation | all | Ibrahim (to confirm) |

When you update this file: copy the previous version to `docs/plan-history/plan-vNN.md`, bump the version at the top, add a row above, and mention the new version in the Workflow Evidence Log entry for that slice.
