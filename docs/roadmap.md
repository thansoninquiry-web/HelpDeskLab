# HelpDeskLab — Roadmap

**Status:** M0–M4, M6, and the M7 job-targets surface built · M5 and R1 sign-off still open
**Last updated:** 2026-10-17
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

### Current status (2026-10-17)

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
- **M6 — scenario depth, handoff notes, weak topics: done.** Three more families
  (DHCP-01, M365-01, FS-01) with the tools they need, a scored escalation handoff
  note, and weak-topic recommendations on Progress. This pulls forward M365 and
  DHCP depth from Release 2 and moves R1 sign-off to M7.
- **M7 — job targets and skills coverage: done (2026-10-17).** A learner-requested
  surface delivered ahead of sign-off: local job listings, deterministic keyword
  extraction into skills and families, coverage across all listings, demand-and-
  weakness-weighted practice recommendations, and per-listing interview prompts.
  §11 records the scope and evidence. This does not replace the R1 sign-off slot
  below; the same M7 label covers both, and sign-off is still open.
- **Next — M5:** close Release 1 — fairness lint, three fixtures per variant,
  keyboard/resume audit, and streak plus Leitner surfacing. R1 sign-off then
  closes the release; M8–M11 evaluate the reference product's lesson,
  progression, call, and interview ideas in that order (see §9).

The Release 1 checklist and acceptance criteria below are still outstanding; the
items above cover the build milestones but not yet the fairness-lint acceptance
tests (500 tickets per variant, unsafe/lucky fixtures per scenario).

A family is "done" only when it has a reference script, fairness lint coverage,
three scoring fixtures, and a debrief that explains every deduction. M6 added
the reference scripts and rubric coverage for three new families; their fairness
lint and fixtures land with M5.

## 2. Release 1 — "First Shift"

**Theme:** a learner can practise the most common Tier 1 tickets indefinitely,
and their history survives restarts.

### In scope

| Family | Variants | What the learner practises |
|--------|----------|----------------------------|
| **PWD-01** Password reset | account lockout · expired password | Verify the caller, distinguish lockout from expiry, reset safely, set expectations for next sign-in |
| **NET-01** No internet | bad static DNS · stale DHCP lease | Read `ipconfig /all`, separate link/DNS/DHCP faults, apply the correct fix, avoid shotgun changes |
| **PRN-01** Printer problems | spooler stopped · job stuck offline | Check printer vs queue vs default device, restart/clear in the correct order |
| **DHCP-01** DHCP scopes and addresses | scope hands out a dead DNS server · scope exhausted | Read scope options and leases, tell a scope-wide fault from a device fault, clear only stale leases, know when the network team owns the fix |
| **M365-01** Microsoft 365 sign-in | MFA method lost · smart lockout | Read a sign-in log and its AADSTS code, separate an MFA problem from a block, verify the caller before an MFA reset |
| **FS-01** Shared drives and permissions | missing group membership · explicit deny | Distinguish denied from read-only, read effective access and its entries, restore a group membership, recognise a data-owner hold |

Variation comes from **context** (fictional site, requester, hostname, OS build,
subnet, printer model, share, tenant state), **phrasing**, and **distractors**,
not just the two variants. Two variants across six families with context
permutation yields hundreds of distinct, non-repeating tickets.

M365 sign-in and DHCP operations were planned for Release 2; M6 pulled one
variant of each forward because the identity and network faults were already
visible in the world model. They are part of R1 now, which is why the release
has six families and twelve variants. [architecture.md §11](architecture.md#11-forward-design-not-release-1)
tracks what is still deferred (tenant administration, DHCP server changes,
conditional access).

**Fictional org:** Larkspur Logistics — three sites, ~40 employees, two DNS
servers, one M365 tenant, and three department file shares.

### Feature checklist

- [ ] Seeded procedural generator with duplicate avoidance and replay by seed
- [ ] Simulated environment: directory, devices, network, printers, caller
      dialogue, simulated clock
- [ ] Terminal with the network, identity, M365, share, and printer tools plus
      history and quick actions
- [ ] Caller chat with quick-reply intents and `verify-caller`
- [ ] Debrief: per-item feedback including the escalation handoff note, action
      timeline, expert path, closure message
- [ ] Scoring: resolution, diagnosis, safety gate (password reset), professionalism
- [ ] SQLite persistence: tickets, sessions, actions, scores, stats, settings
- [ ] Minimal service worker precaching the app shell and SQLite WASM, so the
      app opens offline after the first visit
- [ ] Resume after reload; abandoned sessions handled cleanly
- [ ] Progress: attempts/passes/best per family, XP, streak, Leitner due list,
      and weak-topic recommendations with a filtered practice link
- [ ] Export/import `.sqlite`, pre-migration backup, manual reset
- [ ] First-run notice, settings, keyboard-only path, reduced motion
- [ ] Domain/repository/UI tests, content fairness lint, build and typecheck

### Explicitly out of scope for R1

M365 tenant administration, DHCP server changes (scope options, relay, server
console), multi-fault tickets, SLA countdowns, hints, adaptive difficulty, custom
content packs, mobile layout, accounts/cloud sync, native installer, telemetry,
any runtime network call.

### Acceptance criteria

R1 is shippable when all of these are demonstrated, not merely built:

1. `npm install && npm run dev` starts the app; a production build (`vite
   preview`) works with the network disabled after one load, and data survives a
   full browser restart.
2. The fairness lint generates 500 tickets per variant (6,000 total) with zero
   schema failures, zero unsolvable tickets, and no duplicate signatures inside
   the recent window.
3. For each of the twelve variants: reference script scores 100 and passes; an
   unsafe or unverified script fails the safety gate; a "lucky end state, no
   evidence" script scores below 75. All three fixtures live in the repo.
   Escalation variants must also fail the handoff item when the note omits the
   report, the evidence, or the next action.
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
| M3 | Generator and workspace across PWD-01, NET-01, and PRN-01: seeded tickets, queue, terminal, caller questions, verification, notes, resolve/escalate | L | Any generated ticket playable from queue to debrief · **done** |
| M4 | Scoring and debrief: declarative specs over the action log and end state, safety gates, SQLite persistence, explained debrief | M | Reference/unsafe/lucky fixtures behave as specified · **done** |
| M5 | Close Release 1: fairness lint over twelve variants, three fixtures per variant, keyboard/resume audit, streak and Leitner surfacing | M | R1 criteria 2–6 and 11 demonstrated |
| M6 | Scenario depth, handoff notes, weak topics: DHCP-01, M365-01, FS-01 with their tools; a scored escalation handoff; weak-topic recommendations on Progress | L | Twelve variants score 100 on the reference path; escalation notes are scored by content; Progress names the weakest family |
| M7 | R1 sign-off: recovery UI polish, a11y and performance pass, docs, manual E2E script | S | All acceptance criteria recorded |

The plan is a vertical slice, not waterfall: M2–M4 were developed against NET-01
so the loop was playable early; M6 then widened the catalog once the mechanics
were proven, and M5/M7 close the release around it.

### R1 risks

| Risk | Mitigation |
|------|-----------|
| Six families balloon into a large command surface | Group tools by family in `help`; add a probe only when a rubric item needs it |
| Wording variety makes tickets feel generic or ambiguous | Fairness lint + 10-seed manual read-through before sign-off |
| Scoring teaches the rubric, not the job | Expert path written by scenario intent; diagnosis checks require evidence, not magic actions |
| Browser storage eviction loses practice history | Persistent-storage request, visible status, export reminder, backup slot |

## 3. Release 2 — "The Identity Shift"

**Theme:** sign-in and Microsoft 365 troubleshooting, plus the first smart layer.

- **M365 depth beyond M6:** disabled account, password expiry, conditional-access
  block, cached credential mismatch, plus a tenant view with licenses and device
  compliance. M6 already ships the sign-in log, MFA reset, and smart-lockout unblock.
- **DHCP depth beyond M6:** relay misconfiguration, reservations, and lease
  duration faults. M6 already ships scope inspection, stale-lease cleanup, and
  the scope-wide DNS fault.
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

## 9. Proposed M5+ plan — from the reference feature inventory

**Proposed 2026-10-17 · M6 delivered, the rest awaiting approval.**

M6 replaced the old "R1 sign-off" slot with scenario depth: DHCP-01, M365-01,
FS-01, a scored escalation handoff note, and weak-topic recommendations on
Progress. That work was pulled forward from §3, so R1 sign-off moved from M6 to
M7 and every later milestone shifted by one. The planning tables below use the
current numbering.

[docs/research/feature-inventory.md](research/feature-inventory.md) records what a
single screen recording of a commercial service-desk simulator exposed. It is
inspiration only. This plan reuses none of that product's text, branding, lesson
content, images, or layout, and it does not treat anything the inventory marks
**Unknown** as known: ticket detail fields, scoring format, points thresholds,
call and voicemail mechanics, and interview format are all unknown here, so the
versions below are independent designs rather than reconstructions.

### 9.1 Evaluation, ordered by value versus effort

| Inventory idea | Value | Effort | Smallest useful version | Placement |
|----------------|-------|--------|------------------------|-----------|
| 1. Lessons tied to ticket families | High — the tickets assume vocabulary (spooler, lease, lockout) that a career changer may not have yet | S–M, mostly writing | One original single-screen field note per family (about 250 words): what the user experiences, the three tools worth reaching for first, the fix-versus-escalate rule, and two traps. Linked from the queue and the debrief. No paging, screenshots, video, or unlocking. | M8 |
| 2. Points and rank progression | Medium — motivating, but XP already exists and is not yet surfaced | S, no schema change | A rank title derived from total stored XP, shown in the header with a small progress bar, plus a weekly practice streak computed from session timestamps on the dashboard. No achievements, badges, leaderboards, or currency. | M9 |
| 4. Phone-call practice | Medium–high — call handling is the part of the job the terminal cannot teach, and the caller scripts already exist | M — a new interaction mode, no audio | A text call mode on one family: caller turns arrive in sequence with two decision points (verify identity, read back the fix), recorded in the action log and scored as one communication rubric item. No audio, transcription, voicemail box, or script authoring. | M10 |
| 3. Mock interview mode | Medium overall, high for job seekers; weakest link to the simulated machine | M–L — content plus a new surface | Three original interviewer personas × five questions; each question is answered by picking the strongest of three original responses, followed by an explanation of why the others are weaker and a short summary. No free-text grading, no AI, no voice. | M11 |
| 5. Open-ticket count and severity colour-coding | Already delivered in M3 | None | The queue already shows open/closed counts and colour-coded severity | Done — verify in the M5 checklist |

Deliberately not carried over from the reference product: paid gating, a points
economy, achievements, video or screenshot-based lessons, voice calls, and
voicemail. Nothing in this plan copies its wording or visual design.

### 9.2 Reuse of what already exists

Every idea below is an overlay on the M2–M6 engine, not a second engine. This
table is the constraint the estimates above assume; if a milestone cannot be
built this way, its size goes up and it should be re-scoped before starting.

M6 already demonstrated the pattern: three new families reused the generator
contract, the command registry, the world JSON, and the rubric evaluator, and the
handoff note reused the existing note actions rather than adding a schema field.

| Milestone | Reuses | Genuinely new |
|-----------|--------|---------------|
| M8 Field notes | Scenario family and variant metadata, so a note can only name tools the simulator actually exposes; the existing command registry is the source for "tools worth reaching for first" | One static content module, a route, and two links — no schema change, no rule changes |
| M9 Rank and streak | The evaluator's existing XP formula and per-session score rows (`scores` joined to `tickets.difficulty` reproduces each session's XP, because XP is a pure function of total, band, and difficulty); session `started_at` timestamps; `scenario_stats.leitner_box` and `due_at` for the due list | A derived selector (XP aggregate → rank title, distinct practice days → weekly streak) and a header chip; no table, column, or migration |
| M10 Text call mode | Existing caller prompts and the `verify-caller` intent; the environment reducer for the state the caller reacts to; the session action log; the declarative rubric evaluator | Call turns recorded under the existing `ask-user` action kind (the `actions.kind` CHECK constraint would otherwise force a migration), so the log, debrief, and scoring loader stay as they are; plus a call-turn content file per variant and one communication rubric item |
| M11 Interview drill | The page shell, the debrief-style summary layout, and the rubric evaluator's deterministic item model | Persona and question content plus an answer key; no AI, no free text, no persistence in v1 — the summary is shown once and not stored |

Two consequences worth stating: none of M8–M11 needs a schema version, and M8 and
M10 are content-heavy rather than rule-heavy. M10 is still the only item that
adds an interaction mode and writes to an existing path, which is why it needs
its fixture set before it ships rather than after.

### 9.3 Milestones after M4

| # | Milestone | Size | Exit check |
|---|-----------|------|------------|
| M5 | Close Release 1: fairness lint (500 tickets per variant, 6,000 total), three scoring fixtures per variant, keyboard and resume audit, streak and Leitner surfacing | M | R1 criteria 2–6 and 11 demonstrated with no new feature surface |
| M6 | Scenario depth, handoff notes, weak topics — **done** | L | Twelve variants score 100 on the reference path; handoff notes scored by content; Progress names the weakest family |
| M7 | R1 sign-off: recovery-flow polish, accessibility and performance pass, docs refresh, recorded manual E2E script — **still open**; the job-targets surface that shipped under the same label is recorded in §11 | S | All R1 acceptance criteria recorded with evidence |
| M8 | Family field notes: one original primer per family, linked from queue and debrief | S–M | Every family has a primer; copy independently written; no schema change |
| M9 | Rank and streak: derived rank from XP, weekly streak on the dashboard | S | Rank and streak survive reload; thresholds documented; no new tables |
| M10 | Text call mode: one family end-to-end | M | Call variant playable from greeting to resolution; transcript stored as actions; communication rubric item with fixtures |
| M11 | Interview drill: personas, questions, deterministic scoring, summary | M–L | Three personas playable; scoring is deterministic and explained; no AI or free text required |

**Why this order.** Release 1's acceptance criteria are still unmet, so closing
them outranks any new surface. Field notes come first among the new features
because they are the cheapest high-value addition and need no engine change. Rank
and streak are the next cheapest and reuse XP we already compute. Call mode couples
tightly to the existing caller prompts and action log but introduces a new UI mode,
so it follows. The interview drill carries the largest content burden and the
weakest dependency on the simulated machine, which is the product's differentiator,
so it goes last. If learner feedback says interview prep matters more than call
handling, M11 can move ahead of M10 without touching the engine.

### 9.4 Guardrails for M8–M11

- Original copy only, written for HelpDeskLab; no text, layout, lesson content, or
  visual asset from the reference product.
- No paid tier or artificial gating: every feature stays available offline.
- The simulated machine keeps priority. Call mode and the interview drill are
  optional surfaces over the core loop, never replacements for it, and neither may
  soften evidence-based scoring.
- Rank, streak, and any progress indicator are computed from the local database
  only; no telemetry, accounts, or leaderboards.
- Unknown reference behaviour stays unknown. We claim no parity with features that
  were not observed.
- The remaining Release 2 domain work (tenant administration, DHCP server
  changes, hints, adaptive selection) still outranks mock interviews for real
  Tier 1 readiness; revisit its order after M11.

### 9.5 Open questions for approval

1. Does closing Release 1 (M5 and M7) stay ahead of all new surfaces?
2. Are single-screen field notes enough, or should each family get a three-page
   primer with paging?
3. Are original rank names acceptable (for example a Tier 1 progression ladder),
   or should progression stay a numeric XP total with no titles?
4. Is a text-only call mode an acceptable first version, and is deterministic
   multiple-choice interview scoring acceptable before any local-model work?

## 10. Approval requested

Confirm the four choices listed in
[architecture.md §13](architecture.md#13-decisions-requested-at-approval):

1. Browser-first PWA with WASM SQLite for R1 (recommended).
2. Hybrid terminal + quick actions + caller chat interaction model (recommended).
3. Six families × two variants in R1 after M6, with tenant administration and
   DHCP server changes still in R2 (recommended).
4. Keep all local attempt history, with export/import and manual reset
   (recommended).

For the work ahead, also confirm the §9 sequencing: finish Release 1 (M5 and
M7) before M8 field notes, M9 rank and streak, M10 text call mode, and M11
interview drill — or say what to reorder. Nothing after M6 is implemented until
that approval arrives.

## 11. M7 delivered — job targets and skills coverage

**Built 2026-10-17.** Local-first, deterministic, and offline: no model call, no
network request, and no listing text in anything meant for sharing. The M7 label
here names the surface the learner asked for; the R1 sign-off slot in §9.3 keeps
the same number and remains open.

### What shipped

| Piece | Behaviour |
|-------|-----------|
| Job listings | Paste company, title, URL, date applied, status, and the listing text. Stored in a new `job_targets` table (schema v2) and therefore included in the local `.sqlite` backup, export, and import. Edit status in place; delete with confirmation. |
| Skill extraction | A fixed table of twelve A+-style skill areas maps lowercase keyword phrases to the six scenario families and their simulated tools. Matching is case-insensitive phrase matching with word boundaries; each phrase counts at most once per listing, so repetition in an advert cannot inflate coverage. |
| Coverage view | Every known skill appears, requested or not, with the number of listings that asked for it and the families that practise it. Skills whose family list is empty — VPN and hardware today — read "Not covered yet". |
| Weighted practice | Family demand (phrase mentions across listings) multiplied by room to improve (`100 − average score`, or 50 for a family never played). Surfaced on Job targets, on Progress ("From your job targets"), and as a strip on the practice queue, each linking to `/practice?family=…`. |
| Interview prep | Per-listing disclosure with two original questions per matched skill (top three skills, six prompts) and a short "what this tests" note. Templates are static content; nothing is generated at runtime. |
| Share-safe export | A JSON download containing company, title, URL, date, status, derived skills, and families — with `rawDescription` deliberately absent. The full database backup still contains the text because it is a local backup. |

### Privacy and repository rules

- Listing text lives only in the local SQLite database (IndexedDB snapshot). It
  is excluded from the sharing export by construction, not by a UI toggle.
- `.gitignore` now ignores `data/job-listings/` in case listings are ever dumped
  to files, and the README says plainly not to commit or paste raw listings.
- Extraction reads the text; it never writes it to logs, the action log, or any
  analytics path.

### Evidence

- `npm run check` passes: typecheck, ESLint (including the UI-must-use-services
  boundary), 152 tests, and the production build. A migration test seeds a v1
  database, runs the v2 upgrade, and asserts the old row survives.
- Domain tests cover extraction counts and false positives, coverage ordering and
  uncovered skills, recommendation weighting and limits, template determinism,
  and an export test that asserts a marker sentence from the listing is absent
  from the JSON.
- Persistence tests cover round-trip, ordering, duplicate ids, status updates,
  deletion, and survival through export/import.
- Service tests cover validation, trimming, the empty-database path, and the
  share-safe payload. UI tests cover the saved listing, coverage table, practice
  links, interview panel, save flow, export note, empty state, and save errors.
- Verified manually in the browser: pasted a listing, saw ten requested skills
  with VPN correctly marked "Not covered yet", expanded the six interview
  questions, downloaded the share-safe file, and confirmed the Progress page and
  queue chips link to the weighted families. No console errors; the only network
  request is the local `sql-wasm.wasm` asset.

### Known limits

- Keyword extraction is literal. A listing that says "service desk" is matched,
  but paraphrases such as "front-line support engineer" are not; the UI says so
  when nothing matches.
- Coverage counts listings, not emphasis: a skill mentioned once and a skill
  mentioned ten times in one advert both add one listing.
- No editing of saved listings beyond status; correcting a typo means deleting
  and re-pasting.
- No interview-answer grading, and the question bank is deliberately small.
