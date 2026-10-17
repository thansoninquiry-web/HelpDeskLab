# HelpDeskLab — Roadmap

**Status:** Proposed · awaiting approval · no code written yet
**Last updated:** 2026-10-16
**Companion:** [architecture.md](architecture.md)

## 1. Goal and audience

HelpDeskLab exists so someone preparing for a Tier 1 service desk role can sit
down, take a realistic ticket, investigate it with realistic tools, fix it, and
get honest feedback — as many times as they want, offline, on their own machine.

Primary audience: career changers and new help desk hires practising between
shifts. Secondary audience: instructors who want a repeatable lab without
standing up real infrastructure.

### Release strategy

Ship a **small vertical slice** first: three ticket families, one fault per
ticket, real SQLite persistence, real scoring, real debrief. Each later release
adds either breadth (more families, more variants) or depth (composite faults,
timers, authoring) — never both at once.

### Current status (2026-10-16)

- **M0 — scaffold: done.** Strict Vite/React/TypeScript shell, routing, CSS
  tokens, Vitest + Testing Library, layered ESLint import rules, offline
  Workbox precache.
- **M1 — persistence: done.** sql.js driver, versioned schema with rollback,
  IndexedDB snapshots with a pre-migration backup, repositories for all six
  tables, export/import/reset, and a live database panel in Settings.
- **M2 — environment core: done.** Larkspur Logistics world, simulated DNS,
  DHCP, link/WAN state and TCP ports, simulated clock, and network plus identity
  tools (`ipconfig`, `ping`, `nslookup`, `Test-NetConnection`, `set-dns`,
  `whoami`, `hostname`, `unlock-account`, `reset-password`, `help`).
- **M3 — generator and workspace: done.** Seeded ticket generation over the
  PWD-01, NET-01, and PRN-01 families, one variant per real injected fault; a
  ticket queue with severity and status; and a workspace with the ticket, the
  simulated terminal, caller questions, caller verification, troubleshooting and
  customer notes, and a resolve-or-escalate flow.
- **M4 — scoring and debrief: done.** Declarative rubric items over commands,
  effects, ordering, notes, and the closure decision, with critical safety gates;
  attempts, action logs, scores, and per-scenario progress persisted in SQLite;
  and a debrief that explains every item plus a clean reference path.
- **Next — M5:** more variants and distractors, fairness lint coverage,
  streaks, and dashboard surfacing.

The Release 1 checklist and acceptance criteria below are still outstanding; the
items above cover the build milestones but not yet the fairness-lint acceptance
tests (500 tickets per variant, unsafe/lucky fixtures per scenario).

A family is "done" only when it has a reference script, fairness lint coverage,
three scoring fixtures, and a debrief that explains every deduction.

## 2. Release 1 — "First Shift"

**Theme:** a learner can practise the three most common Tier 1 tickets
indefinitely, and their history survives restarts.

### In scope

| Family | Variants | What the learner practises |
|--------|----------|----------------------------|
| **PWD-01** Password reset | account lockout · expired password | Verify the caller, distinguish lockout from expiry, reset safely, set expectations for next sign-in |
| **NET-01** No internet | bad static DNS · stale DHCP lease | Read `ipconfig /all`, separate link/DNS/DHCP faults, apply the correct fix, avoid shotgun changes |
| **PRN-01** Printer problems | spooler stopped · job stuck offline | Check printer vs queue vs default device, restart/clear in the correct order |

Variation comes from **context** (fictional site, requester, hostname, OS build,
subnet, printer model), **phrasing**, and **distractors**, not just the two
variants. Two variants across three families with context permutation yields
hundreds of distinct, non-repeating tickets.

M365 sign-in is deliberately deferred to Release 2 instead of being squeezed
into R1. The tenant model, sign-in error codes, and credential actions are
already sketched in [architecture.md §11](architecture.md#11-forward-design-not-release-1),
so deferral does not create rework; it keeps the first release to one weeknight's
worth of content and a playable loop.

**Fictional org:** Larkspur Logistics — three sites, ~40 employees, two DNS
servers, one M365 tenant placeholder (not used until R2).

### Feature checklist

- [ ] Seeded procedural generator with duplicate avoidance and replay by seed
- [ ] Simulated environment: directory, devices, network, printers, caller
      dialogue, simulated clock
- [ ] Terminal with ~15 commands plus quick actions, history, tab completion
- [ ] Caller chat with quick-reply intents and `verify-caller`
- [ ] Debrief: per-item feedback, action timeline, expert path, closure message
- [ ] Scoring: resolution, diagnosis, safety gate (password reset), professionalism
- [ ] SQLite persistence: tickets, sessions, actions, scores, stats, settings
- [ ] Minimal service worker precaching the app shell and SQLite WASM, so the
      app opens offline after the first visit
- [ ] Resume after reload; abandoned sessions handled cleanly
- [ ] Progress: attempts/passes/best per family, XP, streak, Leitner due list
- [ ] Export/import `.sqlite`, pre-migration backup, manual reset
- [ ] First-run notice, settings, keyboard-only path, reduced motion
- [ ] Domain/repository/UI tests, content fairness lint, build and typecheck

### Explicitly out of scope for R1

M365 sign-in, DHCP server administration, multi-fault tickets, SLA countdowns,
hints, adaptive difficulty, custom content packs, mobile layout, accounts/cloud
sync, native installer, telemetry, any runtime network call.

### Acceptance criteria

R1 is shippable when all of these are demonstrated, not merely built:

1. `npm install && npm run dev` starts the app; a production build (`vite
   preview`) works with the network disabled after one load, and data survives a
   full browser restart.
2. The fairness lint generates 500 tickets per variant (3,000 total) with zero
   schema failures, zero unsolvable tickets, and no duplicate signatures inside
   the recent window.
3. For each of the six variants: reference script scores 100 and passes; an
   unsafe or unverified script fails the safety gate; a "lucky end state, no
   evidence" script scores below 75. All three fixtures live in the repo.
4. The password flow demonstrably blocks a pass when identity verification is
   skipped, and the debrief explains what could have happened.
5. A learner can start, diagnose, fix, resolve, and debrief a ticket using only
   the keyboard.
6. Reloading mid-ticket resumes the same world, action log, and clock; the next
   action continues at the correct sequence number.
7. Export → reset → import restores attempts, scores, and stats exactly. An
   incompatible import is rejected with a readable error and leaves data intact.
8. A deliberately corrupted snapshot offers backup/export/fresh-start recovery
   without silently deleting history.
9. `tsc --noEmit`, ESLint (including import boundaries), Vitest, and
   `vite build` all pass with no suppressions.
10. A 1,000-action database boots in under 1 second on a modest laptop, and the
    debrief renders the full timeline without jank.
11. Every rubric deduction in the debrief has a "why this matters" explanation.

### Milestones

Sizes are relative (S/M/L); the whole release is on the order of **2–3 weeks of
focused solo work**. No dates are committed.

| # | Milestone | Size | Exit check |
|---|-----------|------|------------|
| M0 | Scaffold: Vite + React + TS strict, Router, Vitest, ESLint boundaries, CSS tokens, CI script, offline app-shell precache | S | App shell renders offline, typecheck/tests/lint green |
| M1 | Persistence: schema, migrations, sql.js driver, IndexedDB snapshots, repositories, backup service | M | Repository tests round-trip every table; migration + corruption tests pass |
| M2 | Environment core: world model, command parser/registry, network + identity probes/actions, simulated clock | L | Reducer unit tests; wrong-tool outputs are realistic |
| M3 | First family end-to-end (NET-01): generator, catalog, ticket workspace, caller chat, fairness lint seed | L | One variant playable from generated ticket to debrief |
| M4 | Scoring + debrief: declarative specs, evaluator, safety gate, fixtures, debrief UI | M | Reference/unsafe/lucky fixtures behave as specified on NET-01 |
| M5 | Remaining R1 families + progress: PWD-01, PRN-01, `verify-caller`, XP/streak/Leitner, dashboard | M | Six variants pass scoring fixtures; stats update correctly |
| M6 | Hardening: import/export UI, recovery flow, keyboard/a11y pass, performance check, docs, manual E2E script | S | All acceptance criteria checked and recorded |

The plan is a vertical slice, not waterfall: M2–M4 are developed against NET-01
so the loop is playable early; content for PWD/PRN follows once the mechanics are
proven.

### R1 risks

| Risk | Mitigation |
|------|-----------|
| Three families still balloon into a large command surface | Cap tools per family; add a probe only when a rubric item needs it |
| Wording variety makes tickets feel generic or ambiguous | Fairness lint + 10-seed manual read-through before sign-off |
| Scoring teaches the rubric, not the job | Expert path written by scenario intent; diagnosis checks require evidence, not magic actions |
| Browser storage eviction loses practice history | Persistent-storage request, visible status, export reminder, backup slot |

## 3. Release 2 — "The Identity Shift"

**Theme:** sign-in and Microsoft 365 troubleshooting, plus the first smart layer.

- **M365 sign-in family (M365-01):** disabled account, password expiry, MFA not
  registered, conditional-access block, cached credential mismatch. Realistic
  sign-in error codes and a tenant view: account status, licenses, MFA methods,
  device compliance.
- **DHCP depth:** APIPA, wrong DNS handed out by scope, lease not renewing;
  read-only scope inspection, no server console.
- **Hints that teach:** one nudge per rubric item, costs professionalism, logged
  for progress; never reveals hidden state directly.
- **Adaptive selection:** Leitner plus per-skill mastery; difficulty rises only
  after two passes at the current level, and learners can pin a family or level.
- **Installable polish:** install prompt, service-worker update flow, storage
  status, and an optional File System Access auto-backup folder (basic offline
  precaching already ships in R1).
- **Test depth:** Playwright golden-path E2E, including reload/resume and import.
- **Deeper caller dialogue:** error-code requests, "is anyone else affected?",
  satisfaction follow-ups at resolution.

**Exit criteria:** a new learner can install the app offline, complete an M365
sign-in ticket scored by fixtures, and resume after restart; all R1 acceptance
criteria still pass. Indicative effort: **2–3 weeks**.

## 4. Release 3 — "Live Floor"

**Theme:** the pressure and mess of a real queue, without losing fairness.

- **Queue mode:** 3–5 concurrent tickets, shared terminal, switch between
  sessions; each keeps its own world and clock.
- **Optional SLA clock:** learner-toggleable, pause when the tab is hidden;
  scoring uses command count, the clock is pressure only.
- **Composite faults:** two causally independent faults behind one symptom, with
  ordered rubrics; a fairness lint that proves each fault is separately
  observable.
- **Content packs:** validated JSON packs (`.hdpack`) with schema, version, and
  a CLI validator; import/export so instructors can author original tickets.
- **Exam mode:** fixed seed set, no hints, fixed attempt count, printable summary.
- **More families:** VPN disconnects, shared mailbox permissions, disk full
  triage, onboarding/offboarding checklists, malware suspicion escalation
  (teaching "do not fix it yourself" as the correct answer).

**Exit criteria:** an exam seed set is reproducible across machines, a composite
ticket is solvable via two independent evidence paths, and a custom pack authored
outside the repo passes the validator and scores correctly. Indicative effort:
**3–5 weeks**.

## 5. Release 4 — "Classroom & Native" (exploratory)

Directions, not commitments:

- **Instructor mode:** assign seed sets, collect exported results, cohort view
  built from imported files — no hosted service required.
- **Native desktop build:** Tauri + `rusqlite` behind the existing driver port,
  for labs that need a file-backed installer and kiosk mode.
- **Accessibility and localization:** screen-reader pass on terminal output,
  high-contrast theme, Spanish and French content packs.
- **Optional AI feedback:** strictly opt-in, local-model, for free-text
  resolution notes; never required, never used for pass/fail. Grading stays
  deterministic.

## 6. Backlog / parking lot

Kept deliberately unscheduled:

- Cloud sync or accounts (conflicts with local-first; export is the sharing model)
- Real PowerShell/CMD/Active Directory connections (safety and scope)
- Voice caller simulation
- Mobile-first layout
- Leaderboards or social features
- Certificates and printable completion records
- More tenants/orgs per install
- Localization beyond R4 candidates

## 7. Success metrics

Measured locally (and only locally — there is no telemetry):

- Time from launch to first ticket started: under 60 seconds.
- A first-time learner completes a PWD ticket without reading external docs.
- Across attempts on unfamiliar seeds, pass rate per family rises from below 50%
  to above 80% within three attempts.
- Unsafe password resets decline across a learner's first five PWD attempts.
- Median practice frequency of five or more sessions per week among testers.
- Instructor can distribute 20 distinct seeds and collect results entirely
  offline.

## 8. Release gates

No release ships unless:

1. Every scenario variant has a reference script, three scoring fixtures, and
   fairness lint coverage over a sampled seed set.
2. Schema changes include a migration, a backup-before-migrate test, and an
   import compatibility check.
3. The debrief explains every deduction and every critical failure.
4. The previous release's acceptance criteria still pass.
5. No runtime network requests, no real credentials, no fictional-PII leakage.

## 9. Approval requested

Confirm the four choices listed in
[architecture.md §13](architecture.md#13-decisions-requested-at-approval):

1. Browser-first PWA with WASM SQLite for R1 (recommended).
2. Hybrid terminal + quick actions + caller chat interaction model (recommended).
3. Three families × two variants in R1, M365 and DHCP depth in R2 (recommended).
4. Keep all local attempt history, with export/import and manual reset
   (recommended).

Approval unlocks M0 only — scaffold and guardrails — with a checkpoint after M3
when the first ticket is playable end-to-end.
