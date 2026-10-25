# Implementation roadmap — independent helpdesk simulator

Status: **proposal for approval.** No implementation begins until the audit and
this roadmap are reviewed. Estimates are rough focused-days for one developer
already familiar with the codebase, and assume the layered structure in
[architecture.md](architecture.md).

Ordering rule: **depth before breadth.** One complete, replayable ticket loop
with three consoles is worth more than twelve shallow screens. Each phase must be
playable and tested before the next begins.

Status note, October 2026: the shelf in `domain/environment/tools.ts` now opens
all twelve tool consoles, Mail Admin, Mail Security, Remote Desktop and Computer
Deployment included — each one a read-out plus the audited commands behind it.
The phases below still describe the deeper flows those tools need (undo, kits,
escalation), so read the per-tool bullets as the remaining depth rather than as
the first cut.

---

## Phase 0 — Foundations and content spine (3–4 days)

**Build**

- Fictional company (name, sites, departments, staff directory) with original
  names and prose.
- Typed world state, command reducer, effect vocabulary, injected clock, seeded
  RNG.
- Ticket model, completion predicates, rubric model, hint chain model.
- SQLite schema v1 + migrations + snapshot persistence; export/import/reset.
- Generator skeleton: family/variant registry, builder, weighted selection,
  duplicate avoidance.
- Fairness lint harness and golden-seed fixtures.

**Acceptance**

- A seeded ticket can be created, serialized, restored and reproduced
  byte-for-byte.
- Fairness lint runs in CI and fails on an unsatisfiable rubric or a hint that
  names a command, switch, field or setting the simulation does not have
  (`domain/generator/hintLint.ts`, held by `tests/domain/generator/hintQuality.test.ts`).
- Export → reset → import restores tickets, progress and settings.
- `npm run check` is green.

**Exit criteria:** no UI beyond a debug page; the engine is trustworthy.

---

## Phase 1 — The loop (4–5 days)

**Build**

- Dashboard: incident list, My Queue, daily counters, points/tier strip.
- Ticket workspace: ticket pane, assignment, status banner, hint panel with
  progressive reveal, close dialog (resolved / claim / unresolved), resolution
  notes.
- Scoring: rubric evaluation from the action log, difficulty multipliers,
  close penalty, identity-violation item.
- Debrief: score, rubric checklist with evidence, model steps, notes.
- Six starting families: account lockout, password reset, new-hire onboarding,
  WiFi outage, wrong time zone, printer offline.

**Acceptance**

- Claim → act → resolve → close works for all six families on a fresh database.
- Closing unresolved shows the exact penalty before commit and cannot be undone.
- Hints are priced in diagnostic reasoning at the rate set in Settings (nothing
  at all when the learner makes them free), and may be rationed by a per-attempt
  budget that blocks further hints without deducting a point; the debrief
  explains every awarded and deducted point.
- Reloading mid-ticket restores the world and the ticket state.
- Playwright/Testing Library walkthrough of one family per console.

**Exit criteria:** a stranger can complete a ticket without instructions.

---

## Phase 2 — The three core consoles (6–8 days)

**Build**

1. **Directory** — search, record tabs, group/licence/device views, reset
   password, lock/unlock, enable/disable, reset MFA, identity-verification code
   flow, temporary-password handoff (chat or manager).
2. **Server Room** — overview tiles, ISP check, device table with status-aware
   actions, server table, reboot countdowns, announcements.
3. **Remote Desktop** — host picker, domain sign-in, desktop shell with the
   minimum apps the families need (settings, terminal, event log, file
   explorer), explicit disconnect.

**Acceptance**

- Every Phase 1 family is solvable using only these consoles where appropriate.
- A wrong action produces a visible, honest consequence (state change or
  penalty), never a silent no-op.
- Rebooting a device transitions `error → rebooting → online` and can satisfy a
  ticket predicate.
- Remote Desktop cannot be left without disconnecting; the dashboard back
  control is hidden while connected.
- Keyboard-only path through each console's primary action.

**Exit criteria:** the estate feels like a place, not a set of forms.

---

## Phase 3 — Documentation, chat and confirmation-gated tickets (3–4 days)

**Build**

- In-world knowledge base: 10 categories, search, persistent open article.
- Company Chat: contacts, direct threads, group announcement, locked-out users,
  quick replies.
- Confirmation evidence: "confirm the fix with the user" and "post an ETA
  announcement" as first-class completion requirements.
- Two intermittent-outage families that specifically cannot be fixed by
  rebooting.

**Acceptance**

- At least two tickets require a chat confirmation before they resolve.
- Documentation state survives tool switching.
- ISP-down tickets resolve only through an announcement with an ETA; rebooting
  devices does not.
- Search returns the SOP/credential article a build needs.

---

## Phase 4 — Hardware pipeline (5–6 days)

**Build**

- Asset Management: by-user / by-asset / site views, checkout kit, replacement,
  return with label, check-in, register a build.
- Computer Deployment: two methods (imaging, manual domain join), SOP viewer,
  hints toggle, pause/resume, two-credential gate.
- PC Shelf and Ship Manager: equipment list, onboarding kit, shelf selection,
  speeds, return labels.

**Acceptance**

- New-hire flow works in order: build → shelf → register (when required) →
  check out kit → ship.
- Shipping a computer without a shelf unit blocks with a link to Deployment.
- Returning a device without a label blocks with an explanatory message.
- A build resumed after reload continues at the same step.

---

## Phase 5 — Email and security judgement (3–4 days)

**Build**

- Mail Admin: message trace windows, mailbox capacity vs enabled state, inbox
  rules.
- Mail Security: quarantine release/undo, blocked senders/undo.
- Escalation to a security queue as a terminal action with a scoring judgement.
- Families: quota, disabled mailbox, hidden rule, false-positive quarantine,
  phishing release, account compromise escalation.

**Acceptance**

- A trace distinguishes not-sent, delivered-elsewhere, rejected and filtered.
- Releasing a real phishing message is penalised; escalating the compromise
  scores correctly.
- Routine escalation costs points and says so in the dialog.

---

## Phase 6 — Original differentiators (4–5 days)

These are the parts the reference product does not publicly document, and the
reason to build this rather than practice there.

**Build**

- Job targets: paste a listing (company, title, URL, date, status, raw text),
  local-only storage, deterministic keyword extraction to families and skills.
- Coverage view: skills requested with counts, practiced vs not yet covered.
- Queue weighting by listing demand × personal weakness, with a visible "why".
- Interview prep per listing: template-bank questions tied to extracted skills,
  each with a short "what this tests" note.
- Share-safe export that cannot contain raw listing text.

**Acceptance**

- The same listing always extracts the same skills; paraphrases that miss a
  keyword are documented as a known limitation.
- Requested-skill counts, practiced/not-covered split and weighted queue order
  are covered by unit tests.
- A share export contains no raw text field, and a test asserts it.
- `data/job-listings/` is ignored and the README warns against committing real
  listings.

**Exit criteria:** practice is driven by the learner's actual job market.

---

## Phase 7 — Deterministic caller mode (4–5 days)

**Build**

- Typed caller dialogue (no speech, no AI): scripted turns with branching,
  including one social-engineering caller per tier.
- Call UI: transcript, keypad-free, "verify identity" path, end call.
- Voicemail generated from missed/declined calls; create ticket or archive.
- Call activity stats.

**Acceptance**

- A caller cannot be satisfied by guessing; the verification branch is the only
  path that avoids a penalty.
- A declined call produces a voicemail whose ticket is faithful to the message.
- All dialogue is deterministic per seed and fully local.

---

## Phase 8 — Progress, polish and release (4–6 days)

**Build**

- Analytics: accuracy, resolved count, per-family breakdown, priority mix, weak
  areas.
- Streak and badges (local only).
- Accessibility pass: focus order, dialog semantics, table navigation, reduced
  motion, contrast.
- Performance: first paint, snapshot debounce, large-history query timings.
- Final content pass for originality and tone; README and docs.

**Acceptance**

- A full week of use (50+ tickets) keeps the dashboard responsive (<100 ms
  interactions on a mid-range laptop).
- No network requests in production build after load (verified in devtools).
- axe/Lighthouse accessibility checks pass for the primary routes.
- Backup round-trip verified through the UI.

---

## Suggested release slices

| Slice | Phases | What a user can do |
| --- | --- | --- |
| **R1 — Core desk** | 0–2 | Work 10+ ticket types with Directory, Server Room, Remote Desktop |
| **R2 — Knowledge and judgement** | 3, 5 | Confirm in chat, use the KB, handle mail and escalation |
| **R3 — Hardware** | 4 | Onboard, build, ship and reclaim equipment |
| **R4 — Personal practice** | 6 | Practice toward real job listings, with interview prep |
| **R5 — Calls and polish** | 7–8 | Take typed calls, track progress, ship |

R1 is the approval checkpoint: if the core loop is not fun and legible, later
phases do not fix it.

---

## Cross-cutting work (every phase)

- Tests for new rules; property tests for new generator families.
- Determinism fixture per family.
- Content review: no real people, no copied prose, no trademarked names.
- Migration for any schema change, with a vN→vN+1 test.
- Docs: roadmap entry, help-style page for each new console.
- Performance budget: no quadratic queries on history; paginate lists.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Scope creep across 12 tools | High | Phase gates; ship R1 before adding consoles |
| Engine and UI couple over time | Medium | Boundary lint; UI never imports SQLite or reducers |
| Tickets read like quizzes | Medium | Predicates + confirmations + fairness lint |
| Remote Desktop becomes a fake screenshot | Medium | Only build the apps families need; test actions, not pixels |
| Determinism regressions | Medium | No ambient time/random; golden-seed tests |
| Content resembles the reference | Medium | Original company, prose and components; copy review each phase |
| Local data loss | Low | Debounced snapshot + explicit export; storage-persistence request |

---

## Needs manual investigation before certain phases

1. **Phase 2:** how the full app signals a wrong action (block vs warn vs
   penalty), and whether all ticket types auto-resolve.
2. **Phase 4:** pause/resume semantics and what a failed build step does.
3. **Phase 5:** escalation point settlement and whether penalties stack.
4. **Phase 6:** nothing external — this is our own design.
5. **Phase 7:** how caller verification codes expire and whether voicemail
   tickets are scored differently.
6. **Phase 8:** certificate verification URL behaviour if we ever add public
   credentials.

These require an account on the reference product or an interview with someone
who has one, and were intentionally not pursued during this audit.

---

## Definition of done for v1

- 20+ ticket variants across six families, all replayable from a seed.
- Six consoles with keyboard-accessible primary actions.
- A debrief that explains every point.
- Queue weighting driven by job targets and measured weakness.
- Local-only storage with tested export/import/reset.
- No network dependency, no copied assets or prose.
- `npm run check` green; fairness lint green; accessibility checks green.

## Decisions requested

1. Approve R1 scope (Phases 0–2) or reorder.
2. Confirm typed caller mode instead of AI voice for v1.
3. Confirm local-only (no accounts/sync) as a product constraint.
4. Confirm job-target weighting as the headline differentiator.
5. Confirm the tool set for R1: Directory, Server Room, Remote Desktop only.
