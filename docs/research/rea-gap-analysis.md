# REA gap analysis — reference surface vs. HelpDeskLab

**Date:** 2026-10-17
**Source:** REA 6.5.0 passive inspection of a signed-in v2.7 session at
`https://servicedesk-simulator.com/` (one accessibility snapshot, storage keys,
and the module-preload list). Companion to
[website-audit.md](../website-audit.md) and [workflow-spec.md](../workflow-spec.md).
**Baseline compared:** this repository as it stood on 2026-10-17 — M0–M4, M6, and
the M7 job-targets surface shipped. (The commit id is omitted: the history was
rewritten on 2026-10-24, so older ids no longer resolve.)

---

## 1. How much this report actually proves

REA ran **passively**: one snapshot, no clicks, no navigation, no script source,
no DOM values. That makes three different kinds of claim, and they should not be
mixed when planning:

| Class | Examples in the report | Weight |
|---|---|---|
| **Observed** | Nav buttons (Modules, Voice Call, Voicemails, Mock Interview, Company Chat, Join Class, Leaderboard, profile/tier); the six-ticket queue with four severities; "PRO SILVER 🔥3 · 542 POINTS"; the `sd_*` storage keys; PWA caches | High — these exist |
| **Inferred from bundle names** | `ServerRoomPanel`, `AnalyticsView`, `DocsSplitContent`, `TutorialOverlay`, `AbandonModal`, `CloseModal`, `MissingStepsNotice`, `PhoneCallSimulation`, `MockInterviewPanel`, `tiers`, `credentialIssueDate` | Medium — a chunk exists, its behaviour does not follow from its name |
| **Not established** | How scoring works, what "missing steps" blocks, whether calls are scripted or AI, what the modules contain, how points/tiers are earned, what is gated | Unknown — do not design against guesses |

Two specific traps in the report:

- **`MissingStepsNotice` is not proof of pre-close validation.** It could be a
  checklist, a step counter, or a tutorial nudge. Our debrief already knows which
  rubric items failed, so pre-close validation is cheap to build regardless — but
  do not claim parity with behaviour nobody observed.
- **`tiers.js` + `appAccess` is not a feature to copy.** It is subscription
  gating, which conflicts with this project's local-first, no-gating stance.

Everything below therefore separates "the reference has a surface we lack" from
"we should build that surface".

---

## 2. What HelpDeskLab already covers

| Reference surface | Our state |
|---|---|
| Ticket queue, four severities, open count | **Have** — `/practice`, severity tags, open/closed counts, family filter |
| Seeded tickets with real injected faults | **Have and stronger** — deterministic generator over six families, 12 variants |
| Working a ticket: read, probe, fix, document, close | **Have** — ticket pane, terminal, caller intents, notes, closure codes, handoff note |
| Scoring and explained feedback | **Have and stronger** — declarative rubric, evidence gates, debrief with reference path |
| Local persistence, resume after reload | **Have** — SQLite/WASM over IndexedDB, active-session resume |
| PWA / offline shell | **Have** — `vite-plugin-pwa`, precached app shell and WASM |
| Progress stats | **Partial** — attempts, pass rate, best, weak topics, Leitner box/due |
| Directory / account work | **Terminal only** — `get-account`, `unlock-account`, `reset-password` |
| Network / DHCP / printer / shares / M365 work | **Terminal only** — no console panes |
| Interview preparation | **Static prompts only** — per-listing questions in Job targets, no mode |

The product's differentiator is intact: the reference exposes no evidence of a
stateful world model, discoverable faults, or evidence-based scoring. REA's
report shows breadth of *surfaces*, not depth of *simulation*. Do not trade the
latter for the former.

---

## 3. Missing surface, by area

Sizes are S (≤ half a day), M (1–2 days), L (a milestone). "Call" is a
recommendation, not a commitment.

### 3.1 Ticket lifecycle

| Capability | REA evidence | Today | Gap | Size | Call |
|---|---|---|---|---|---|
| Queue ordered by severity | Observed: Critical → High → Medium | Sorted by status, then newest | Priority ordering, then age | S | **Do** — the queue currently hides the thing triage teaches |
| Missing-steps notice before close | Bundle only | Rubric runs after resolve; no pre-close check | Dry-run the evaluator and show unmet critical items + unlogged evidence before the confirm | S | **Do** — reuses the evaluator, no new rules |
| Abandon a ticket | `AbandonModal` | `startAttempt` silently marks a prior session abandoned; no control | Explicit abandon with confirm, outcome `abandoned`, no score row, ticket returns to queue | S | **Do** — schema and outcome already exist |
| Close consequences named in the button | `CloseModal`; audit §3 records labels | One "Resolve ticket" button + closure code | Labels that state the outcome ("Close as resolved", "Escalate with handoff") | S | Nice-to-have |
| Human-readable ticket numbers | Observed `INC-7201` | `crypto.randomUUID()` | Short display number derived from seed, kept stable | S | Later |
| Assign / unassign | Observed | Auto-assigned on open | Not needed for a solo queue | — | Skip |
| Response/resolution clocks, pause, breach | Documented in audit | None | SLA timers | M | Backlog (R1 explicitly excludes SLAs) |
| Ticket draft form (player-authored ticket) | `TicketDraftForm` | Generator only | Content authoring | L | Skip for learners; revisit with `.hdpack` packs |

### 3.2 In-ticket guidance

| Capability | REA evidence | Today | Gap | Size | Call |
|---|---|---|---|---|---|
| Progressive hints | Audit §4.2 observed an "I don't know" hint chain in the demo | Rubric items already carry `hint` text, but it is only revealed in the debrief | A hint control that reveals rubric hints one at a time, logged as an action, with a professionalism/score consequence | S–M | **Do** — highest parity value per line of code |
| Verification code read-back | Audit §4.4 observed "Send verification code" | Badge ID / callback / manager | Send a code, caller reads it back, one live code at a time | S | **Do** — strengthens the existing safety gate |
| Free-form requester chat | `Company Chat`, audit documents quick replies and directory | Scripted intents only | Multi-turn chat, context-aware replies | M–L | Defer to the R2 dialogue expansion |
| Guided step sequence ("workflow suite") | Bundle only | Terminal + cheat sheet | A visible ordered task list per variant | M | Defer — it risks turning diagnosis into a click-through |

### 3.3 Tool consoles — the largest visible gap

The reference ships ten tool surfaces. We ship one terminal. Most map onto
state we already model; none maps onto a rule we lack.

| Console | Our model already has | Missing | Size | Call |
|---|---|---|---|---|
| Directory (profile, groups, licences, devices, auth) | Users, groups, licences, devices, lock/expiry/MFA | A browsable record pane over `get-account` and friends | M | **First console** — serves PWD-01, M365-01, FS-01 |
| Server Room (topology, devices, servers, ISP) | Link/WAN state, DNS, DHCP scopes, device health | Site and server inventory over the checks we already run | M | **Second console (delivered)** — serves NET-01, DHCP-01 |
| Remote Desktop | Device + OS + hostname; all commands are already device-scoped | A session shell with icons/panes | M–L | Later; terminal already does the work |
| Knowledge base / docs split view | Field-note content not written yet | Docked reference pane beside the terminal | S–M (after M8) | **Combine with M8** |
| Mail Admin (trace, mailbox, rules) | None | New world model + commands | L | New family, not a console |
| Mail Security (quarantine) | None | Same | L | New family |
| Asset register, PC Shelf, Ship Manager | None | Hardware lifecycle model | L each | Skip — different product |
| Computer Deployment | None | Imaging/task-sequence model | L | Skip |

**Recommendation:** build **one generic console shell** (record header, tabbed
facts, action buttons that dispatch existing commands) and instantiate it for
Directory first. Ten bespoke panels is how this project loses a month and gains
no diagnostic depth.

### 3.4 Communication surfaces

| Surface | Evidence | Today | Gap | Size | Call |
|---|---|---|---|---|---|
| Voice call | Nav button + `PhoneCallSimulation` bundle | Caller intents in the workspace | A turn-based text call with two decision points (verify, read back) | M | M10 as planned |
| Voicemail | Nav button, no bundle, no content | Nothing — not even in the roadmap | Inbox of missed calls that can become tickets | M | **Add to M10 scope**; cheap once call turns exist |
| Company chat | Nav button; audit documents group chat + outage announcements | Requester quick replies only | A second channel for announcements/teammates | M | Defer; only worth it if a rubric rewards announcing an outage |
| Mock interview | Nav button + `MockInterviewPanel` | Six static prompts per job listing | A mode with personas, deterministic scoring, summary | M–L | M11 as planned |
| Join Class | Nav button | Nothing | Classroom/session hosting | XL | Skip — contradicts local-first |

### 3.5 Learning content

| Surface | Evidence | Today | Gap | Size | Call |
|---|---|---|---|---|---|
| Modules / course | Nav button; audit counted 16 modules with paging and per-module progress | Nothing | Any structured teaching content | L (content-bound) | **Do the M8 field-note slice**, not a 16-module course |
| Tutorial overlay | `TutorialOverlay` bundle | Nothing | First-run 3-step orientation | S | **Do** — a first-time learner currently lands on a milestone dashboard |
| Learn-mode progress/resume | `sd.learn.progress.<uid>`, `sd.learn.resume.<uid>` | Session resume only | Per-note read state | S (with M8) | Do with M8 |
| In-world knowledge base | `docs-data`, `DocsSplitContent` | Nothing | 5–8 original articles: escalation policy, password standard, DNS/DHCP reference, share permissions | M (content) | Do after field notes |
| Split-screen reference | `sd_splitScreenMode` | Nothing | Docked pane, persisted preference | S–M | Do with the knowledge base |

### 3.6 Progression and analytics

| Surface | Evidence | Today | Gap | Size | Call |
|---|---|---|---|---|---|
| Points, rank tier, streak in the header | Observed: "PRO SILVER 🔥3 · 542 POINTS" | XP per debrief only; nothing aggregated | Total XP → rank title, weekly streak, header chip | S | **M9 as planned** |
| Analytics view | `AnalyticsView` | Attempts/pass/best/weak topics/Leitner | Category breakdown over time, priority mix, per-family trend | M | **Do a read-only slice** — the data is already in `scores.rubric_json` |
| Leaderboard | Nav button | Nothing | Global/class ranking | L | Skip |
| Certificates / credential issue | `credentialIssueDate` | Nothing | Completion records | M | Backlog |
| Free/Pro tiers and daily limits | `tiers`, `appAccess`; audit §7 | Nothing | Subscription gating | — | **Never** |
| Progress reset + reset date | `servicedesk_lastResetDate` | `createBackupService` has `resetDatabase`, but no UI; Settings says "reserved for later milestones" | Export, import, reset controls | S | **Do now** — it is an R1 checklist item that is only half-built |

### 3.7 Platform and operations

| Surface | Evidence | Today | Decision |
|---|---|---|---|
| Installable PWA with precache | Three `sd-*` caches | Have | Keep |
| Firebase auth, Firestore, cloud sync | `firebase-*` bundles, `sd_auth_uid` | None | Skip — local-first is the product |
| Sentry replay, Reddit pixel | Session storage keys; replay script **observed loading** in production (2026-10-18) | None | Skip — "no telemetry" is a stated promise |
| Device fingerprint | `sd_device_id` | None | Skip |
| RDP window geometry persistence | `rdpWindowPositions`/`Sizes` | N/A | Only relevant if RDP lands |

---

## 4. Ranked shortlist

**Tier 0 — close the release before adding surface.** These are ours to fix and
the contrast with the reference makes them obvious:

1. Backup export / import / reset UI (service exists; Settings is a placeholder).
2. Explicit abandon flow (the outcome type exists; there is no control).
3. Pre-close missing-steps notice (dry-run the existing evaluator).
4. Queue ordered by severity.
5. M5: fairness lint, three fixtures per variant, keyboard/resume audit.

**Tier 1 — cheap parity, no engine change.** Each reuses something already built:

6. Progressive hints from rubric text, logged and scored.
7. Verification-code read-back.
8. M9 rank + streak header.
9. M8 field notes with a docked pane (learn progress + split-screen parity in one).
10. Analytics slice: category trend and priority mix from stored rubrics.
11. Short display ticket numbers.

**Tier 2 — one real console bet.** Build the generic console once, instantiate
Directory (three families), then Server Room (two families). Stop there.

**Tier 3 — the planned bigger surfaces.** M10 call mode **plus voicemail** (the
reference has both, and voicemail is nearly free once call turns exist), then M11
interview drill. Knowledge base after field notes.

**Never / not now:** leaderboard, classroom, accounts and cloud sync, telemetry,
paid tiers and daily caps, certificate ladder, asset/deployment/shipping
consoles, a 16-module course.

---

## 5. What this report does *not* justify

- Copying any console layout, lesson text, tier name, or certificate ladder.
  The audit's originality guardrails still apply.
- Assuming the reference's "missing steps" gate, hint economy, or call quality.
  If those three matter, run `observe-web-session` against one ticket before
  designing parity — otherwise build our own defensible version and say so.

**Partly answered (2026-10-17).** A ticket-level observation now exists in
[rea-session-observation.md](rea-session-observation.md). Summary: the close gate
is a *priced warning* (`Close Anyway` exists), the real hint walkthrough is
progressive **and free** (`Hints don't affect your score`) with path choice and a
summary, and calls gate identity through a single active verification code read
back, penalising an unverified reset by points. The rendered close dialog, the
live hint walkthrough, and a real call still need a signed-in session.

**Structure recorded (2026-10-18).** A static bundle-graph run is written up in
[rea-bundle-architecture.md](rea-bundle-architecture.md): their directory
controller shares one hub chunk with speech synthesis and the ticket-state
managers, the fake Windows desktop keeps per-window geometry, calls run on
`SpeechRecognition` plus a VAD recorder into Cloud Functions, and the account
list is an 88-user fixture. It confirms the call mode is cloud-speech — so our
text call is a named divergence, not parity — and it identifies no scoring
module, which is the one thing we most need to know.
- Re-prioritising breadth above the simulated machine. REA counted **surfaces**;
  it did not test **faults**. Our six-family, evidence-scored loop remains the
  reason someone would use this instead.

---

## 6. Delivered — safe parity pass (2026-10-17)

Five items from §4 shipped on top of the M7 build. Nothing was copied from the
reference product: every surface is our own copy and layout over the existing
evaluator, repositories, and world model.

| Item | Where | Notes |
|---|---|---|
| Queue ordered by severity | `sortQueue` in `src/app/practiceService.ts` | Open work first, then Critical → High → Medium → Low, then newest report |
| Abandon flow | `abandonAttempt` + workspace action block | Records the session as abandoned, writes no score, returns the ticket to the queue; starting another ticket no longer leaves the previous one stuck in progress |
| Pre-close missing-steps notice | `reviewClosure` + workspace notice | Dry-runs the rubric with the pending handoff note and lists unmet critical items with their hints before the close is committed |
| Backup export / import / reset | `src/app/maintenanceService.ts` + Settings | Export downloads the `.sqlite` snapshot; import replaces it and keeps the previous file in the browser backup slot; reset needs a second confirmation and stays recoverable |
| Rank and streak | `src/domain/progress/rank.ts`, header chip, Progress page | Lifetime XP summed from stored evaluations, a rank ladder of original job titles, and a consecutive-day streak that survives until the end of the next day |
| Tool consoles | `src/domain/environment/console.ts`, `src/ui/components/ToolConsole.tsx` | One shared pane renders any console from a projection plus an action list. **Directory**: searchable accounts, profile and device facts, six audited actions. **Server room**: opens on a topology map of this machine, the site gateways, and the servers — every link starts dark and lights only when a recorded check proved it — with the inventory list one click away. The Workspace lists each console in one row, not one pane per tool |
| Progressive hints | `revealHint` in `src/app/practiceService.ts`, Hints block in the workspace, schema v3 | Each click reveals the next rung of a three-step chain, recorded as a `hint` action with its index. Every rubric item on every variant carries exactly three distinct rungs, guarded by a test. A rung costs 5 points of diagnostic reasoning up to 15, and the control states the price and the count left before the click |

### How the hint economy works

- **The queue is not a checklist.** `revealHint` scores the attempt in memory
  first and offers the hint for the first rubric step that is still unmet and
  has not been revealed yet. Revealed hints are skipped, so the list progresses
  instead of repeating.
- **Hints are a priced ladder.** Every rubric item authors three rungs: what
  evidence to gather, how to read it, and what finding it should produce.
  `revealHint` offers the next rung of the first unmet step, so a chain completes
  before the next step opens. Each rung is a `hint` action priced at 5 points of
  diagnostic reasoning, capped at 15 per attempt; three rungs reach the cap and
  the rest are free. The workspace states both the price and the count left on
  the control itself, so points are never spent blind, and the debrief repeats
  what was revealed and what it cost.
- **Procedure is what costs.** The evaluator prices two process mistakes from the
  same action log: changing a protected account before any successful
  verification (−10 from safety), and changing anything before a read-only check
  came first (−5 from diagnosis). Each is charged once however often it repeats.
  Nothing in the interface can claim a violation that was not recorded.
- **It survives a reload.** The revealed list, the count remaining, and the
  priced violations are rebuilt from the action log, and the debrief reads
  `hintsUsed`, `hintPenalty`, `violations`, and `procedurePenalty` out of the
  stored evaluation, with older rows defaulting to zero. The debrief's two
  sources are reconciled rather than assumed equal: it reports how many rungs the
  score charged but the log cannot place (a pruned or restored-without-rows log),
  states that difference once beside the steps, withholds the "worked out
  unaided" line from a step while a rung is unplaced, and, for a score that never
  recorded a count, takes the count from the rungs the steps already show.
- **Schema v3.** SQLite cannot alter a CHECK constraint, so migration 3 rebuilds
  `actions` with `hint` allowed, copying ids and sequence numbers unchanged. A
  migration test seeds a v2 database with an action row, upgrades, and asserts
  the row survives and a hint row is now accepted.
- **Coverage is enforced.** A guard test walks every family and every variant and
  fails unless each rubric item carries exactly three distinct, non-trivial
  rungs. It caught variants that authored a single nudge —
  PWD-01/disabled-account, NET-01/stale-dhcp-lease, PRN-01/job-stuck-offline —
  which now carry full chains on their diagnostic, safety, and note steps.
- **One dead end closed.** A step with no rung left used to fail silently. When
  every unmet step has been fully revealed, `revealHint` throws a typed
  `NoHintAvailableError` and the workspace retires the control with an
  explanation instead of repeating an error.

Every variant now offers 18–24 rungs (six to eight rubric items × three). Three
reveals reach the 15-point cap; the rest are free but still counted, so the
remaining figure tells a learner how much of the chain they have left rather
than how much money it will cost.

### How the console shell works

The console is a projection, not a second engine:

- **One pane, many tools.** A console is data: entries with facts, groups, and an
  action list. `ToolConsole` renders whatever it is handed, so the Server Room
  needed a domain projection, not a copy of the Directory pane. Adding a third
  tool is a row in `CONSOLE_TABS` plus a projection.
- **Inventory now, state on request.** Neither projection carries live state:
  the directory hides account status, groups, and MFA; the server room hides
  link state, device addresses, scope options, and leases. Those arrive only by
  running a check, which is also what puts them in the ticket log as evidence.
- **It cannot be a shortcut.** Everything state-changing goes through the same
  `executeCommand` path as the terminal, so the action log, the one-minute clock
  step, the effects, and `ran(...)`/`effect(...)` rubric checks are identical. A
  service test drives a PWD-01 attempt entirely through console actions and still
  scores 100, and a Server Room check writes the same command line into the
  terminal log.
- **The map is evidence, not scenery.** `buildTopology` reads the recorded
  commands: a `ping` with a reply lights that gateway or host, a `nslookup` that
  answered lights name resolution, an `ipconfig /all` that showed a live adapter
  lights the machine. A failed check lights the link red with the line that
  failed, the latest check wins, and nothing the learner has not tested can
  appear. Each row can run its own check through the console's audited action.
- **Provenance is recorded, not guessed.** Every `command` action stores the tool
  it came from (`terminal`, `directory`, or `server-room`), and both debrief paths
  — the fresh close and the reload — rebuild the same command trail from the log.
  The debrief lists each command with its source and marks the ones the simulator
  refused; rows written before provenance read as typed commands.
- **It shows no hidden state.** The projection is a new type, not the world's
  `DirectoryUser`: no account status, no password flags, no group membership, no
  MFA, no share grants. A domain test asserts the exact key set, and the JSON of
  a record is checked for `status`/`locked`/`groups`/`mfa`.
- **Availability never depends on the fault.** Every account offers the same six
  actions, including wrong ones. The command's own output is what tells the
  learner the action did not apply, which keeps the wrong-tool traps intact.
- **The tab keeps its place.** Both panes stay mounted and are hidden with the
  `hidden` attribute, so switching to the terminal and back preserves the search,
  the selected account, and the last output.

Groups, licences, and share grants are deliberately **not** in v1: FS-01 is scored
on `get-share-access`, and listing group membership in a browse pane would hand
the learner the answer.

Also fixed while in the lifecycle code: abandoning via `startAttempt` now
returns the previous ticket to the queue instead of leaving it `in_progress`.

**Evidence.** `tsc -b`, ESLint (including import boundaries), 168 tests, and the
production build all pass. New coverage: rank/streak boundaries and grace day,
queue ordering, abandon-without-score, pre-close review leaving the session
open, XP/rank/streak summary from a real SQLite attempt, Settings export and
two-step reset, and the workspace notice and abandon paths. Verified in the
browser at 127.0.0.1:5179: a real export reported the saved filename and size,
reset showed its confirmation step, the queue listed every High ticket above the
Medium ones, a genuinely missed close produced "would score 20/100" with the two
blocking critical items, and abandoning returned the ticket to the queue with no
active session. No console errors.

**Still open from §4:** text call plus voicemail, the interview drill, the
remaining tool consoles (Remote Desktop, Documentation, Mail Admin), and M5
(fairness lint, three fixtures per variant, keyboard/resume audit).

## 7. One-line answer

Missing, in order of value: **backup/reset UI, abandon, pre-close validation,
severity ordering** (release holes); **hints, verification codes, rank/streak,
field notes, analytics** (cheap parity); **a single console (Directory, then
Server Room)**; **call + voicemail**; **interview drill**. Everything else the
report lists is either deliberately out of scope or an unverified bundle name.
