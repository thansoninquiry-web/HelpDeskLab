# HelpDeskLab — Architecture

**Status:** Proposed · awaiting approval · no code written yet
**Last updated:** 2026-10-16
**Companion:** [roadmap.md](roadmap.md)

## 1. What this is

HelpDeskLab is a local-first training app for Tier 1 IT support. It generates
fictional help desk tickets procedurally, drops the learner into a simulated
workstation and network, lets them diagnose and fix the problem with realistic
tools, and grades the attempt with actionable feedback.

There is no backend, no login, no telemetry, and no AI service call. Everything
runs in the browser and the database stays on the learner's machine.

### Product principles

1. **Practice is unlimited.** Any seed produces a valid, solvable ticket. Retrying
   is always allowed and never punished.
2. **Deterministic.** The same seed and the same learner actions produce the same
   ticket, world state, and score. Bugs are reproducible from a seed.
3. **Diagnosis beats guessing.** Grading reads the action log, not just the final
   machine state, so ending in the right place without evidence does not pass.
4. **Safe failures.** Unsafe habits (resetting a password without verifying the
   caller, disabling protections) are allowed in the simulation and fail the
   attempt with an explanation. Nothing real is touched.
5. **Every deduction teaches.** A debrief names the missed step, why it matters,
   and what an expert would have done.
6. **Original content only.** A wholly fictional company, directory, and tenant.

## 2. Decisions

These are the load-bearing choices for Release 1. Alternatives are listed so the
plan can be challenged before implementation starts.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Browser-first PWA**, React + TypeScript + Vite | Zero install, offline after first load, smallest possible release-1 surface. A desktop shell can be added later without touching the domain. |
| D2 | **SQLite compiled to WebAssembly (sql.js)** as the persistence engine, with the database file snapshotted into IndexedDB | Real SQLite (SQL, migrations, indexes) without a server or native module. Training data is small (single-digit MB after thousands of actions), so an in-memory DB plus atomic snapshots is enough. |
| D3 | **All domain logic in TypeScript, framework-free and pure** | The generator, environment, and scoring can be tested in Node with no UI. React is only a view. |
| D4 | **Seeded procedural generation from declarative scenario templates** | Unlimited variety with finite authored content, reproducible tests, no runtime content service. |
| D5 | **One root cause per ticket in Release 1**, plus plausible distractors | Keeps tickets fair and debuggable. Multi-fault tickets are a later release. |
| D6 | **Declarative rubric specs evaluated against the action log + end state** | Rubrics are serializable, inspectable in the debrief, and testable without custom code per ticket. |
| D7 | **Simulated clock, command-count efficiency** | Slow readers and careful learners are not penalized for wall-clock time. |

**Why not Electron/Tauri in Release 1?** Both would give a native SQLite file
and an installable binary, but add a Rust/Node-native toolchain, packaging, and
auto-update surface before the training loop is proven. The persistence layer is
behind a driver interface (§9), so a Tauri build with `rusqlite` can be added in
a later release with no domain changes.

**Why not `localStorage` JSON?** The product needs queryable history, per-scenario
statistics, and migrations. SQLite gives all three for very little code.

## 3. Module map

```
HelpDeskLab/
  docs/
    architecture-helpdesklab.md
    roadmap.md
  src/
    domain/                     # pure TypeScript, no React, no storage, no globals
      ports.ts                  # repository, settings, and snapshot ports (dependency inversion)
      shared/                   # JSON value types (seeded RNG and clock helpers land with M3)
      environment/              # the simulated IT world + commands
        types.ts                # World, Site, DirectoryUser, Device, Network, Effect
        fixtures.ts             # the fictional Larkspur Logistics world
        network.ts              # DNS resolver, reachability, DHCP, TCP ports
        parser.ts               # command-line tokenizer
        output.ts               # terminal line helpers
        reducer.ts              # applyCommand(world, input) -> CommandResult
        commands/               # types, one module per tool family, registry + help
      generator/                # procedural ticket generation
        catalog/                # one file per scenario family + variant data
        builder.ts              # template -> ticket + world + rubric
        selection.ts            # weighted scenario choice, duplicate avoidance
        fairness.ts             # achievability + observability lint (used in tests)
      scoring/                  # rubric types, spec evaluator, bands, feedback
      session/                  # ticket lifecycle, caller dialogue, resolution
      progress/                 # XP, streaks, Leitner scheduling, mastery stats
      curriculum/               # the sixteen-module course, exit criteria, evidence folding
      appearance/               # the workspace theme preference (pure, no DOM)
      targets/                  # job listings → skills, coverage, recommendations,
                                #   interview templates, share-safe export shape
    app/                        # orchestration services; the only layer UI calls
      persistenceService.ts     # opens and reports the browser database
      backupService.ts          # export / restore / reset wrapper
      practiceService.ts        # start / resume / abandon a ticket
      targetsService.ts         # job listings, weighted focus, share-safe export
      curriculumService.ts      # module progression derived from stored history
      themeService.ts           # applies the stored theme, mirrors it for first paint
      commandService.ts         # parse + reduce + persist one action
      resolutionService.ts      # finalize attempt, score, update progress
      backupService.ts          # export / import / reset
    persistence/                # SQLite + IndexedDB implementation of ports
      sqlite.ts                 # SqliteDriver interface + sql.js implementation
      snapshotStore.ts          # IndexedDB snapshot store (+ in-memory for tests)
      schema.ts                 # DDL + versioned migration list
      migrations.ts             # version guards, rollback, schema validation
      errors.ts                 # typed persistence errors
      database.ts               # open / export / import / reset facade
      repositories/             # tickets, sessions, actions, scores, progress, settings, targets
    ui/                         # React only; no SQL, no domain mutation
      routes/                   # dashboard, practice, ticket, debrief, targets, progress, settings
      components/               # terminal, ticket pane, caller chat, rubric report…
      state/                    # session store (zustand), app settings
      styles/                   # tokens.css (light + dark palette) + CSS Modules
    main.tsx
  tests/
    domain/                     # unit + property tests (Vitest)
    fixtures/                   # golden seeds and expected results
    persistence/                # repository tests against in-memory SQLite
  scripts/
    lint-content.ts             # replays reference scripts across sampled seeds
```

**Dependency rule:** `ui → app → domain` and `app → persistence`; `domain` imports
nothing from `app`, `persistence`, or `ui`. `persistence` imports domain *types*
only. This is enforced with an ESLint import-boundary rule, not convention.

Every module has a single exported public surface (`index.ts`), and all domain
functions are pure: given the same inputs they return the same outputs, no
`Date.now()`, no `Math.random()`, no I/O.

## 4. Data model

SQLite, seven tables plus migration bookkeeping. All timestamps are epoch
milliseconds; all generated content is stored as JSON text so the schema stays
small.

```sql
-- Schema version 1 (job_targets arrives in version 2). The migration runner sets
-- PRAGMA user_version after applying.

CREATE TABLE tickets (
  id            TEXT PRIMARY KEY,
  scenario_id   TEXT NOT NULL,          -- 'PWD-01', 'NET-01', 'PRN-01'
  variant_id    TEXT NOT NULL,          -- e.g. 'expired-password'
  difficulty    INTEGER NOT NULL,       -- 1..3
  seed          INTEGER NOT NULL,
  signature     TEXT NOT NULL,          -- hash of scenario+variant+context+fault
  public_json   TEXT NOT NULL,          -- text shown to the learner, requester card
  created_at    INTEGER NOT NULL,
  status        TEXT NOT NULL           -- 'available' | 'in_progress' | 'completed'
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  ticket_id     TEXT NOT NULL REFERENCES tickets(id),
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  world_json    TEXT NOT NULL,          -- current simulated state, incl. hidden truth
  resolution    TEXT,                   -- learner's chosen closure code
  outcome       TEXT                    -- 'resolved' | 'abandoned'
);

CREATE TABLE actions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  seq           INTEGER NOT NULL,       -- 1-based, contiguous per session
  at_ms         INTEGER NOT NULL,       -- simulated clock
  kind          TEXT NOT NULL,          -- 'command' | 'ask-user' | 'verify-caller' | 'note'
  input_json    TEXT NOT NULL,
  output_json   TEXT NOT NULL,
  UNIQUE(session_id, seq)
);

CREATE TABLE scores (
  session_id    TEXT PRIMARY KEY REFERENCES sessions(id),
  total         INTEGER NOT NULL,       -- 0..100
  passed        INTEGER NOT NULL,       -- 0 | 1
  band          TEXT NOT NULL,          -- 'fail' | 'pass' | 'strong'
  rubric_json   TEXT NOT NULL,          -- per-item results + explanations
  computed_at   INTEGER NOT NULL
);

CREATE TABLE scenario_stats (
  scenario_id   TEXT PRIMARY KEY,
  attempts      INTEGER NOT NULL DEFAULT 0,
  passes        INTEGER NOT NULL DEFAULT 0,
  best_score    INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER,
  leitner_box   INTEGER NOT NULL DEFAULT 1,   -- 1..5
  due_at        INTEGER
);

CREATE TABLE settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

-- Schema version 2: local job listings. raw_description stays local and is
-- absent from the share-safe JSON export; the full backup still contains it.
CREATE TABLE job_targets (
  id              TEXT PRIMARY KEY,
  company         TEXT NOT NULL,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL DEFAULT '',
  applied_on      TEXT,                 -- 'YYYY-MM-DD' or NULL
  status          TEXT NOT NULL,        -- researching|applied|interviewing|offer|closed
  raw_description TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
```

Indexes: `actions(session_id, seq)`, `sessions(ticket_id)`, `tickets(created_at)`,
`scenario_stats(due_at)`, `job_targets(created_at)`.

Notes:

- `world_json` holds hidden truth (root cause, correct DNS server) and is never
  passed to UI components directly. The UI only sees command output and the
  public ticket fields. Keeping it in `sessions` means resume is a single read.
- `public_json` is written once at generation; a retry is a new `session` over the
  same `ticket`, enabling "try this exact ticket again" without regenerating. A
  retried ticket moves back to `in_progress`; `completed` only means its most
  recent session was scored.
- Scores are immutable. Retrying creates a new session; stats are derived from
  sessions and scores, with `scenario_stats` as a cache for scheduling.

### Schema migrations

`PRAGMA user_version` drives a linear array of migration steps. On boot:
snapshot the current DB to the backup slot → run pending steps in one
transaction → verify the expected table set. If anything fails, the app offers
the pre-migration snapshot instead of a corrupted database.

## 5. Ticket generator

### Template contract

```ts
interface ScenarioTemplate {
  id: string;                       // 'NET-01'
  title: string;                    // 'No internet at the desk'
  category: 'identity' | 'network' | 'printer' | 'm365';
  difficulty: 1 | 2 | 3;
  variants: Variant[];
  build(ctx: BuildContext): ScenarioBuild;
}

interface ScenarioBuild {
  ticket: PublicTicket;             // requester, device card, subject, body
  world: World;                     // complete initial state, one fault present
  rubric: Rubric;
  referenceScript: string[];        // expert path, used by tests + debrief
  countReferenceSteps: number;      // efficiency baseline
}
```

`BuildContext` carries the seeded RNG, the fictional org directory, and the
chosen context (site, user, device, printer/tenant). A template never calls
`Math.random()` or `new Date()`; the session assigns the simulated clock start.

### Generation pipeline

1. **Select a scenario family** — weighted by `scenario_stats` (Leitner due date
   first, then least-played, then difficulty appropriate to the learner's
   setting). Explicit learner choice always wins.
2. **Select context** — site, requester, device, printer, and tenant from the
   fictional org so the same fault looks different each time (names, OS build,
   subnet, printer model, department).
3. **Select variant and fault parameters** — e.g. which DNS server was set, which
   account is locked, which queue is stuck.
4. **Inject distractors** — real but non-causal signals: a full disk, an old
   pending update, a second user's name in an error dialog, a printer that is
   merely paused rather than broken. Distractors must be *rulable-out* with the
   available tools (checked by the fairness lint).
5. **Phrase the ticket** — templates with slot substitution and several phrasings
   per variant, so wording varies without changing the puzzle.
6. **Build the rubric** from the variant, then run **uniqueness check**:
   `signature = hash(scenario, variant, contextIds, faultParams)`; if the last N
   tickets contain it, re-roll context/variant (bounded retries).
7. **Persist a queued ticket** with its seed so it can be replayed.

### Fairness lint (`scripts/lint-content.ts`)

Run in CI over a sampled seed set (e.g. 500 seeds per variant):

- every generated ticket passes schema validation and title/body length limits;
- the reference script completes the ticket and scores 100;
- every critical rubric item is reachable and every required clue is observable
  through at least one command or caller answer;
- no distractor makes the ticket ambiguous or unsolvable;
- no two sampled tickets share a signature within a session window;
- generated text contains only fictional domains and reserved example ranges.

### Release 1 catalog (proposed)

| ID | Family | Variants | Core learning objective |
|----|--------|----------|-------------------------|
| PWD-01 | Password reset / lockout | lockout, expired password | Verify identity, distinguish lockout from expiry, reset safely, explain next sign-in |
| NET-01 | No internet | bad static DNS, stale DHCP lease | Read `ipconfig /all`, isolate DNS vs link vs DHCP, apply the right fix |
| PRN-01 | Printer problems | spooler stopped, job stuck offline | Check device vs queue vs default printer, clear/restart in the right order |

Three families × two variants, further varied by context and phrasing, is enough
for a small release while still demonstrating every domain concept. M365 sign-in
is the first Release 2 family (§11).

## 6. Simulated environment

### World model

```ts
interface World {
  clock: number;                    // simulated epoch ms, advances 1 min/action
  org: { name: string; sites: Site[] };
  directory: DirectoryUser[];       // fictional employees only
  devices: Device[];                // hostname, OS, IP config, DNS, domain join,
                                    // logged-in user, printers, spooler, disk, updates
  network: NetworkState;            // subnets, gateways, DHCP scopes, DNS servers, WAN
  printers: Printer[];              // status, queue, driver, share
  tenant?: TenantState;             // M365 (Release 2)
  fault: FaultRecord;               // hidden root cause + injected distractors
}
```

The world is plain data. It is JSON-serializable, diffable, and safe to persist
in a single column.

The directory is larger than the cast. Eight named accounts carry every ticket
and own the machines; a hundred staff accounts fill the rest of the org chart,
built from fixed name pools with a fixed walk so no clock and no RNG reaches them
(`environment/fixtures.ts`). None of the staff is assigned a device, and that is
the point: the generator only draws a ticket from an account with a machine, so
adding the staff moved every seeded estate not at all. They are still accounts a
desk can look up, unlock, mail, and find in the tenant — and a few of them are
locked, gone, or past their password change, because a directory where everyone
is fine teaches nothing.

### Commands

Two kinds, both pure:

- **Probes** read state and return realistic output (`ipconfig`, `ping`,
  `nslookup`, `get-printer`, `get-printqueue`, `whoami`, `hostname`,
  `test-netconnection`).
- **Actions** mutate state and return an effect (`unlock-account`,
  `reset-password`, `set-dns`, `renew-lease`, `restart-spooler`,
  `clear-printqueue`, `set-default-printer`, `gpupdate`).

```ts
interface CommandResult {
  world: World;
  lines: OutputLine[];              // terminal output, pre-formatted
  effects: Effect[];                // typed facts for scoring, e.g. 'password_reset'
  ok: boolean;                      // command executed (not necessarily "fixed")
}
```

A command registry defines canonical names, aliases (`ipconfig /all` vs
`ipconfig -all`), help text, and tab-completion data. The parser is intentionally
forgiving about case and whitespace, and returns a helpful usage message instead
of failing silently.

Design rules:

- **Wrong tools give wrong answers, honestly.** A bad static DNS server makes
  `nslookup` time out while `ping 1.1.1.1` still works. A stopped spooler makes
  `get-printqueue` return an error. Learners discover the difference.
- **No magic fixes.** Fixing DNS requires knowing the correct DNS server, which
  is visible in the DHCP scope or on a working peer machine, never in hidden
  state.
- **Unsafe actions are executable.** Resetting a password without
  `verify-caller` succeeds in the sim, records an `unsafe_password_reset` effect,
  and fails the safety gate in scoring. The caller later reports the fallout in
  the debrief.
- **A refused request is a decided ticket, and the refusal holds.** Commands that
  change an account or what it can reach carry `changesAccount` in the registry —
  the same family the scorer treats as needing a verified caller — and
  `applyCommand` will not run one while `world.refusal` is set, whatever the
  target: the desk said no, so the account work the request asked for is over.
  The refusal is world state rather than a UI flag, so consoles, the desktop
  terminal, and the side terminal are all bound by it; it is written by the
  deny action, persisted with the world, and reproduced by the replay fold, which
  is what lets a learner un-run a refusal made by mistake and get the account
  work back.
- **Reads and changes are declared, not inferred.** Every entry in the registry
  carries `access: 'read' | 'change'`, and an argument that changes what a read
  does is named in `changingArgs` — `ipconfig /all` looks, while `ipconfig /renew`
  and `ipconfig /flushdns` renew the lease and flush the cache. The curriculum
  orders reads against changes on that label, so a read that printed a fact is
  not mistaken for a change, and a change that found nothing left to do is not
  mistaken for a look. A command that failed did neither, and an unknown line is
  neither. Session plumbing (`connect-remote`, `end-remote-session`) is labelled
  as the change it is to the session, and set aside by name when the machine's
  read-before-change order is judged. Choosing among open desktops
  (`use-remote-session`) is a read: it changes no machine and reports no effect,
  but it is still a logged step, because which desktop is in front is attempt
  state the replay has to fold.
- **Simulation time is explicit.** Each command advances the clock one minute;
  user replies advance it too. The ticket shows timestamps, not a countdown.
- **Fictional data only.** Phone numbers use 555 ranges, emails use
  `*.example.com`, external IPs are documented test ranges, and a first-run
  notice tells learners never to type real credentials.

### Caller dialogue

A deterministic responder maps the learner's question to an intent
(`what-error`, `since-when`, `others-affected`, `tried-restart`,
`confirm-identity`, `ask-for-error-code`, `other`) using quick-reply chips plus
keyword matching for free text. Answers are generated from what the fictional
user can plausibly know, with slots from the world. Unknown questions get an
honest "I'm not sure, it just doesn't work" rather than invented facts.

`verify-caller` is a first-class action: the learner confirms employee ID and a
callback number against the directory, and the action is logged for the rubric.
This is the key safety habit in PWD-01 and a reusable mechanic.

### Network teaching example (NET-01, bad DNS)

1. Ticket: "Internet is down, can't reach the intranet."
2. `ipconfig /all` → valid address, gateway reachable, DNS `10.20.4.53` (wrong;
   the site DNS servers are `.10` and `.11`).
3. `ping 10.20.4.1` → replies; `ping intranet.example.com` → name resolution
   failure. Learner learns link is fine, name resolution is not.
4. Fix with `set-dns` to a known-good server, then `ipconfig /flushdns` (or
   re-run `nslookup`). Resolution works and the rubric records the evidence path.
5. A distractor (full disk warning) is visible but irrelevant; the rubric does
   not require touching it.

## 7. Scoring engine

### Rubric model

```ts
type CheckSpec =
  | { kind: 'action'; type: string; where?: Record<string, string | number> }
  | { kind: 'world'; path: string; equals: unknown }
  | { kind: 'ordered'; of: CheckSpec[] }
  | { kind: 'absent'; of: CheckSpec };

interface RubricItem {
  id: string;
  label: string;                    // 'Verified the caller before resetting'
  why: string;                      // shown in debrief
  weight: number;
  critical: boolean;
  checks: CheckSpec[];
  hints: [string, string, string, ...string[]]; // three-step chain: evidence → reading → finding
}
```

Checks are declarative, so `rubric_json` is fully renderable in the debrief and
no rubric logic hides inside scenario code. `world` checks read the end state;
`action` checks read the log; `ordered` enforces a sequence (e.g. verify before
reset); `absent` encodes "did not do the dangerous thing".

### Score

| Component | Weight | Notes |
|-----------|--------|-------|
| Resolution | 55 | Correct fix present in log and in end state |
| Diagnosis | 20 | Evidence gathered before acting (probes, caller answers) |
| Safety | 15 | Identity verification, no forbidden actions |
| Professionalism | 10 | Accurate resolution note, user kept informed, no destructive shortcuts |

- Any failed **critical** item (or any forbidden action) fails the attempt
  regardless of points. Critical items are capped at 3 per ticket.
- `total = round(weighted score)`; pass at **≥ 75 with all critical items true**;
  strong at ≥ 90.
- Efficiency is a modifier, not a fourth category: up to 5 points off the
  Professionalism component when the command count far exceeds
  `referenceSteps`, never a bonus. It never affects the pass gate, so careful,
  slower learners cannot fail on step count.
- Hints are a three-rung chain per rubric item: evidence, interpretation, then
  the expected finding. Each revealed rung is recorded and costs **5 points of
  diagnostic reasoning, capped at 15 per attempt**; the workspace shows the
  remaining count and the next price on the control before it is used. The
  debrief repeats what was revealed and what it cost, and reconciles its two
  sources instead of assuming they agree: the charge comes from the stored
  evaluation, the rungs from the action log, so when a log has been pruned or
  restored without its rows the debrief states how many rungs the score paid for
  that no step can claim, withholds the "worked out unaided" line from a step
  while a rung is unplaced, and falls back to the rungs on the steps for a score
  that never recorded a count at all.

### Feedback

The debrief renders, per rubric item: pass/fail, what happened in the learner's
own log, why it matters, and the corresponding line from the reference script.

Beside that sits the **attempt trail**: every step a tool or a panel produced,
in order, each labelled with the surface it came from. Commands were the first
family to carry that — a typed `get-dhcp-scope` and one pressed in the Server
Room are the same action with different `source` — and hints, notes and identity
checks now carry it too. One vocabulary covers all of them
(`StepSource = CommandSource | PanelSource`), so the workspace log and the
debrief label steps the same way: a hint reads as "Hints", a note as the panel
it was written in (troubleshooting, customer, or the handoff), and a code sent, a
code checked, a callback or a refusal as "Verify the caller". Rows keep their own
shape rather than being flattened into a command line: a hint names the step it
unstuck and what its rung cost, a note shows the learner's words, and a check
says which way it went. A row written before this existed, or by hand, reads as
the panel that could have produced it — the same rule a command without a source
follows. Questions, caller interruptions and rewinds are deliberately not in the
trail: they are conversation and history rather than work a surface did.

On an identity ticket it also shows an **Identity check**: the caller's claims
that the evidence contradicted, each quoted beside the fact that answered it.
The findings are read from the attempt's own log — the directory rows its
`get-account` calls recorded, and its `code-sent` / `verify-caller` actions — so
a claim is never reported as contradicted without that evidence, and a rewind
that removes the read or the check removes the finding with it.

It also shows the resolved machine state, the caller's closing message, XP
earned, and a "practice this next" suggestion from `progress`.

Under the trail, **Commands by tool** groups those commands by the `source` that
ran them and says what the score made of each one. Credit is attributed by
`commandCreditLedger`, which reads the same rubric the score did and credits a
step to the actions that proved its checks — the first run, not a repeat, and
every action of a sequence the step's proof needed. A step the attempt did not
earn credits nothing, and a note or a closure code credits no command at all, so
the list does not flatter: a command that proved nothing is shown as the dead end
it was, and one the simulator refused says so.

On a network ticket, the debrief also draws the map itself. `buildTopology` reads
reachability from the action log alone — a link lights up only where a recorded
check proved it — and the view it returns is stored with the score as
`topologyMap`, beside the `topology` counts that price the proof bonus. Keeping
the picture, not only the tally, is what lets the debrief redraw the same map the
Server Room showed at the close, with each link's evidence line and no way to run
a check after the fact; a score written before the snapshot existed is redrawn
from the same log and the world the attempt ended on.

Scoring tests use three fixtures per variant: the reference script (100),
a competent-but-unverified script (fails safety gate), and a lucky end-state
script with no diagnosis (below pass). New variants are not merged without all
three.

## 8. Session lifecycle and UI

```
Practice → generate/select ticket → session active
   ├── submitCommand → parse → reduce → persist action → render output
   ├── ask caller    → intent → answer → persist action
   ├── verify caller → log action
   └── Resolve ticket → choose closure code + note → score → debrief
                                              └→ update stats + Leitner
```

- Sessions auto-save after every action (SQLite snapshot write, debounced 250 ms,
  flushed on resolve and on `visibilitychange`).
- On startup, an `active` session is offered as "Resume ticket"; resuming replays
  the stored world and log. Abandoning marks the session abandoned (no score).
- A crash can lose at most the action in flight; the action log keeps gaps
  impossible via the unique `(session_id, seq)` constraint.
- Exam mode is a setting, but the attempt is what counts: `sessions.exam_mode`
  is written when the attempt starts, so turning the mode off mid-ticket does not
  hand an in-flight exam its hints back, and a reload keeps them withheld. An
  exam attempt pins the standard price (`EXAM_HINT_POLICY`) instead of the
  learner's, family prices included, and the hint ladder is handed over in the
  debrief instead.
- Hint prices are a catalogue in the settings table: one default, plus a price
  for each scenario family the learner has priced differently. Overrides are
  keyed by family id, so a family added in a later build inherits the default
  with no migration and no list to keep in step. A device that has only ever had
  the older single price reads it as the default, and the resolved price is
  copied onto the session like every other attempt setting, so the attempt and
  its debrief stay priced by what it started under (`app/settingsService.ts`).
  The session also records where that price came from — the default, a family's
  own price, or the exam rate — and the default it departed from, and the score
  keeps the same record, so a debrief can say "priced for Accounts, not at the
  default" months later even after the family or the default has been re-priced.
  A row written before this was recorded reads as the default price, which is
  what it paid.
- The close being written — the chosen code and the handoff note — is not an
  action, because nothing has happened yet. It is saved on the session
  (`closure_draft_json`) as the learner edits it, debounced and flushed when a
  close field loses focus, so a reload reopens the form where it was left.
  Closing the ticket clears it: the committed code is `sessions.resolution` and
  the note is appended as a `resolution` note action, which is what the debrief
  scores.
- Un-running a step is a cut in the action log, not an undo stack in the UI. The
  log is the only source of truth for the world *and* the score, so a rewind
  deletes the named step and everything after it and replays what is left from
  the attempt's stored world; the score, the procedure penalties, the hint
  refund and the clock are all read again from the shortened log. Nothing is
  folded back in memory, so a reload cannot resurrect a step the world no longer
  reflects. A step for the world in hand that no longer replays to the same
  result is refused rather than silently applied, the exam attempts cannot be
  cut at all, and the `rewind` action the cut leaves behind is counted in the
  debrief tally (`rewinds`, `rewoundSteps`, read off the log at scoring time).
  The marker also carries the steps it took, so a cut made by mistake can be
  put back while it is still the last work in the log: the marker goes, its
  steps return at their old seq numbers, and the world, hint ledger and score
  are folded from the restored log. Caller lines after the cut do not block
  that; a command, note, hint or identity step does, because moving it would
  mean renumbering the log under work the learner has since done.

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard: the sixteen-module course, module progress, next step in the course |
| `/modules/:moduleId` | Lesson for a playable module: the idea, one worked example, and the way into the tickets it is judged on |
| `/practice` | Scenario family picker + difficulty; "surprise me" |
| `/ticket/:sessionId` | Workspace: ticket + caller chat, terminal, quick actions, resolve flow |
| `/debrief/:sessionId` | Score breakdown, timeline, expert path, retry actions |
| `/progress` | Mastery per family, attempt history, Leitner due list |
| `/settings` | Workspace theme and terminal surface, hint price (default and per scenario family), exam mode, backup/export/import, reset data |

### Workspace layout

Three regions on desktop: ticket and caller chat (left), the tool card with the
terminal and the tool consoles (right), and the quick actions and command
reference under the case file. The tool card normally shows one pane at a time
behind a Terminal/Tools tab pair; **Split screen view** shows both at once as two
labelled regions, so a learner can read a console while the command log stays on
screen. In split mode the tabs are hidden, because there is nothing left for them to
switch between, and each half is a named region instead; the
half with no tool in it says so and points at the tools menu. The halves are not
fixed at 50/50: a divider between them is draggable, starting at half the card
and clamped so neither half falls under a quarter of the width the two panes
share. It is a focusable `separator` with the standard window-splitter contract —
arrows nudge it, Shift moves five steps, Home and End take it to the extremes,
Enter and a double click restore the default — and it measures the card in the
DOM rather than in state, so the pointer maps to a ratio the stylesheet
multiplies (`calc((100% - 0.6rem) * var(--split-ratio))`): a dragged divider and
the pane beside it cannot disagree. Capture is taken after the ratio is applied
and may fail without ending the drag, because it is an optimisation, not the
drag. Below the stacking breakpoint the handle is hidden and the halves take the
full width, with the hairline drawn on the second pane (`:not(:first-child)`,
since a `display: none` handle still sits between them). The ratio is per visit
and is not persisted. Whether the split is
on is the learner's own setting rather than attempt data: the workspace reads it
together with the session, so the first paint is the layout they left, and moves
it when the switch does. A preference that will not read falls back to the tab
layout and never keeps a ticket from opening. The pane keeps several tools open
at once: the consoles a learner has opened are a tab strip above the console,
the tab acts as the switch, and only the console on screen is rendered, so the
work of one tool is never hidden behind another's. Opening a tool that is
already open brings it forward rather than adding a second copy. **← All tools**
returns to the shelf without closing anything, and **Close** drops the tool on
screen, choosing the neighbour the tab had or the shelf when it had none. Each
close forgets that tool's view, so reopening reads the machine again instead of
restoring a stale one, and every open tool — not only the visible one — is
reread after a command or a rewind, because the consoles project machine state
read at load time. The strip is per visit and is not persisted; the split
setting is, and the two are kept apart on purpose. Below the widest
layout the two halves stack in one column at the full card width — two 400px
columns would leave the log wrapping every few words and a console's detail pane
clipped — and each half scrolls inside about 42vh. The consoles measure
themselves rather than the window (`container-type: inline-size`), so a console
handed half the card puts its list above its detail instead of squeezing both. A
console can also be read a second way: the Directory declares a grid, and a
List/Grid switch above its records turns the same rows into tiles carrying the
account's name, its account and department, and the facts its definition names
for a tile — employee id and site. The list, the selection, and the actions are
the same either way, so a tile is pressed exactly where a row is; only the read
changes, and the tile grid uses the pane's width until a record is opened. A
console that declares no tiles keeps its rows even when the pane was last left
in grid, so the switch can never dress a runbook as a square. A console can
also declare itself a picker: Remote Desktop names its list in a centred heading
over one search, and every machine row carries the button that opens or ends the
session, so reaching a machine does not need its record opened first. The row
button runs the same audited command as the record's own button, and the record
still opens underneath the list when a row is read. No hidden-state
inspector — the learner only learns what the tools show them. Keyboard-first:
focus lands in the terminal, `Tab` cycles regions, quick actions are reachable
without a mouse. A narrow-window layout stacks the regions, and phone width gets
the docked-console layout described below; a mobile app is still out of scope.

At phone width (`max-width: 600px`) the two-column split is the wrong shape
rather than a smaller one: the case file alone runs to several screens, so a
console stacked under it is a scroll away from every command and a second scroll
away from its output. The card therefore becomes exactly one screen tall
(`100dvh` minus the sticky header, with a `100vh` fallback) and the split turns
into a docked console: the tool pane takes the top row and scrolls inside it,
and the terminal takes the bottom row, where its log scrolls but the chip row
and the command line stay put. Both rows are proportional (`1.1fr` / `1fr`) so a
short window shrinks the console instead of clipping it, and the DOM is
terminal-first, so the two panes are swapped with `order`. The divider is hidden
and the ratio ignored, because a single column has nothing to drag, and the
quick-command row stops wrapping and scrolls sideways — three wrapped rows cost
the log more lines than a phone can spare. With the split off the same screen is
the ordinary tabbed pane. `tests/ui/workspaceNarrow.test.ts` holds this shape,
since jsdom applies no media queries and nothing else can see it.

The header gets the same treatment, because a single phone line cannot hold the
brand, five sections, and the score: before the rewrite the brand was cut
mid-word and four of the five sections sat off-screen with nothing saying so.
Below the same breakpoint the header becomes two rows — identity and score
above, the sections on a row of their own below — and the phone block redefines
`--header-height` so the sticky offset, the rail, and the docked card all keep
measuring the header that is actually on screen rather than the desktop one. The
section row tightens its type until all five labels fit inside 360px, keeps each
label at its own width (`flex: none`, `nowrap`) instead of squeezing it, and
scrolls with snap points for anything narrower or for a larger browser text
size. When it does scroll, the shell centres the current section in the strip — the router's `aria-current`, or the practice tab on a ticket page, since
practice marks itself active there — so the strip never rests with a label
sliced by the edge. `tests/ui/appShellNarrow.test.ts` holds the shape, including
that the two rows still add up to the header height token.

### State management

`zustand` per-session store holds only the view model: public ticket, caller
messages, terminal lines, simulated clock, and session status. The world —
including the hidden fault — is owned by `app` services and never enters React
state, so a DevTools inspection or an accidental render cannot reveal the
answer. Components call `app` services only; no repository imports in `ui`.
React Router for routes, CSS Modules and custom properties for styling (no UI
kit) so the terminal aesthetic stays bespoke and the bundle stays small.

### Curriculum tracker

The dashboard is organised around a sixteen-module course rather than around
features. The catalog lives in `src/domain/curriculum/modules.ts`: one entry per
module with its position in the course, a scope of scenario families, and two or
three exit requirements, each naming a counter (`moduleProgress` reads them from
an evidence object). Copy, scope and targets are written for this app; nothing
is carried over from a reference product.

Each playable module also has a **lesson**, in
`src/domain/curriculum/lessons.ts`: a couple of paragraphs on the idea, one
worked example the learner can repeat in the simulator, and where the module is
practised. The example never names a generated ticket — the queue draws a new
variant each time — so it shows the shape of the work and the reason behind each
step instead of a walkthrough of one attempt. The lesson is data, not markup: it
is read and tested without a browser, and `loadModuleLesson` pairs it with the
module's live progress, so the page can show the exit criteria beside the
concept. `practice` is either a list of families or the job targets for the one
module judged on saved listings; routes are built in the interface, never stored
in the domain. The family list is ordered: `startModulePractice` in
`app/practiceService.ts` starts the first one, so **Practise** and the lesson
agree on where a module begins. A lesson can pin `variantId` where a random draw
could miss the requirement (Asset Management's held shelf, Computer Deployment's
failed run); the entry point then reuses an available ticket of that exact
variant or generates one, instead of opening a ticket that cannot exercise the
module. The other families stay available as `/practice?family=…` links — the
same filter the queue already offers. A lesson may also carry a **flow**: a connect-to-close checklist for a
family whose order does the work, where every step names the evidence it should
leave in the log. The flow is guidance, not progress: checking a box writes
nothing and resets with the page, and the log remains the only thing the module
scores. Remote Desktop is the first lesson with one. A lesson is required for
every playable module and forbidden for a planned one, and the catalog test
proves both, so content cannot outlive the module it belongs to.

Progress is **derived, never stored**. `app/curriculumService.ts` opens the
usual repositories, reads scores, ended sessions, actions and saved listings,
and folds them into the counters in `domain/curriculum/evidence.ts`:

- scores → attempts, passes, families played/passed, perfect categories per family
- sessions → resolutions, so an escalation or a refusal counts as a handoff
- actions → notes by kind, questions and their intents, verification order,
  refusals, whether a question or a verification came before the first command, and
  the Remote Desktop work on an attempt: the session that was opened, whether the
  machine was read before anything on it changed (every command filed under a
  machine other than the console's own counts, whatever surface typed it, and the
  registry's `access` label — not whether the run happened to report an effect —
  orders the read against the change), and whether that change was written up in
  a troubleshooting or resolution note
- mail commands and their effects → mailbox reads, message traces, quarantine
  releases, and sender blocks, which are the evidence modules 10 and 11 are built on
- deployment commands and their effects → shelf queue reads, machine record reads,
  and completed imaging runs; with scores, the DEP-01 passes behind modules 12 and
  13, including the pass on the held-machine variant that respected the shelf hold
- job listings → saved listings, extracted skills, and demand met by a pass

The consequences of that choice are deliberate: no migration or new table, no
ledger that can disagree with the history it summarises, and editing the catalog
re-scores every past attempt the next time the dashboard loads. Requirements are
counters rather than booleans, so a row can show `1 / 3` and the next unmet
requirement instead of only "not done".

Modules that are not built carry `status: 'planned'`, no scope and no
requirements, plus a note explaining what is missing. They stay in the list so
the course reads in order and the gap is visible rather than implied. Only a
built module can be "complete"; `nextModule` skips planned rows when it picks
the next step, so a planned module never blocks progression.

The dashboard renders the list as a single ordered list of rows. Each row's
heading is a disclosure button (`aria-expanded` / `aria-controls`) over a panel
with the requirement list, the module note and its scope XP; the next unfinished
module opens by default. XP per module is the sum of attempt XP on the families
in its scope, so a ticket can feed more than one module — the section says so in
plain text instead of implying the numbers add up to lifetime XP. A playable,
unfinished, ticket-based module also carries **Practise**, which starts its
lesson's ticket on demand and navigates straight to the workspace; the job-target
module links to `/targets` instead. The lesson page exposes the same entry point
through one shared hook, so the two cannot drift.

### Visual language

One token file (`src/ui/styles/tokens.css`) carries the whole look, so a page
costs CSS Modules and no component library:

- **Paper workspace, dark rail.** Content sits on `--bg` paper with white
  panels and hairline `--border` rules; only the top rail (`--rail`) is dark, so
  navigation keeps the console feel without tinting the working area.
- **Mono-led type.** Headings, labels, metadata, chips and the terminal use
  `--font-mono` in upper case with letter-spacing; only running prose uses
  `--font-sans`. A 15px root sets the density — rows, cards and action blocks
  are sized for a working shift, not for a landing page.
- **One accent, four status families.** `--accent*` covers links, active tabs
  and primary buttons; `--severity-*`, `--success*`, `--warning*` and
  `--danger*` each pair a border, a soft fill and a text colour so a chip or an
  alert stays legible on paper. Components reference tokens, not literals.
- **Radius and state.** Three small radii (3/5/8px), flat fills and border-led
  separation instead of shadows or gradients; hover is a token (`--hover`), so
  every surface reacts the same way.

Every value is checked against WCAG AA on the surfaces it is used on. The theme
audit below renders each route in both palettes and fails the build on any
failing text/background pair, so the claim is verified rather than asserted.

### Workspace theme

The same token names carry two palettes. `tokens.css` keeps geometry and the
fixed rail and terminal surfaces in `:root`, declares the dark colours in
`[data-theme='dark'], :root` and the light ones in `[data-theme='light']`, so no
component owns a theme rule, nothing in the interface hard-codes a colour, and
either look can be scoped to a subtree. That last part is what lets the schedule
preview paint the paper workspace inside a dark app (and the reverse) from the
same palette. A switch that only re-declares custom properties cannot move the
layout: geometry and type (`--radius-*`, `--font-*`, `--max-width`, `--gutter`,
`--header-height`) never appear in a palette block, and the rail (`--rail*`,
`--rail-accent`) is deliberately left alone, because the shell is already the
darkest surface in the app. Only the paper flips. `color-scheme` travels with
the palette so form controls, selects and scrollbars follow the workspace.

A guard over the shell stylesheet enforces the rail half of that: any colour
token used by the chrome must be rail-prefixed, with the page canvas classes as
the only exception because they are workspace surface. A workspace token cannot
creep back onto the dark header and vanish in Light, and the check proves it
still catches one by feeding itself a synthetic leak. Geometry and type tokens
remain available to the shell for layout.

The choice — `system`, `light`, `dark` or `schedule` — is one value in the
settings table, so it travels with a backup like every other setting. It is read
before the app renders: an inline script in `index.html` paints the cached choice
on `<html>` before the first frame, and `app/themeService.ts` reconciles that
with the database as soon as settings open, then follows
`prefers-color-scheme` while the choice is System. The cache is a mirror for
first paint, never a second source of truth. A token-parity test reads
`tokens.css` and fails if a workspace colour is added without a light value, or
if the light block starts overriding geometry or either fixed palette (the rail
and the terminal).

The Schedule fields also carry a **live preview**: a miniature service desk
scoped to the look the unsaved dawn and dusk pair gives at a chosen time. A
slider moves through the day at one-minute steps, and both the miniature and
its label change as the boundaries are edited, so a window can be tried before
it is saved.

**System is the default.** A missing `theme` row reads as System, which is also
how an install written before this default migrates: it never wrote a row unless
the learner picked a theme, so the absent row is exactly "never chose", and the
next read follows the operating system. An explicit `dark` stays Dark, and no
row is rewritten, so the distinction survives. The cached first frame of such an
old install may still hold the previous Dark default for one paint; the database
read corrects it to the system's look and rewrites the cache.

The **theme audit** turns that from a reading of the stylesheets into a test of
the rendered app. `tests/ui/themeAudit.test.tsx` boots a real in-memory database
and seeds a queue, an open attempt, and a finished debrief, then renders the
dashboard, practice queue, workspace, debrief, job targets, progress, Settings,
and the not-found page twice — once per palette. Because CSS modules are
compiled away, it is handed the module objects the components import, which map
a source class to the generated name in the DOM; that lets each rule's selector
be rewritten and matched with `Element.matches`. Every element with text is
then resolved to its colour and the nearest opaque background behind it, in the
palette in force, and any pair under 4.5:1 fails the run with the element path
and both declarations.

Each text element is resolved four times: resting, hovered, focus-visible, and
disabled. The matching state rules are layered over the resting declarations,
with theme-scoped state rules last, and a state that lowers opacity dims the
text onto its surface before the ratio is taken, so a control that fades when
disabled is checked at the colour a learner actually sees. The failure names the
state. Every route must contribute pairs in all three states, so a state that
quietly stops matching cannot pass as a clean run; a small unit test feeds the
pass a synthetic button to prove each layer is read. The disabled variants that
only dimmed a control with opacity now use `--surface-sunken` and
`--text-faint`, which keeps them legible instead of relying on translucency.

The same pass records every declaration that is not appearance — spacing,
sizes, type, layout — and requires the two renders of a route to agree on all of
it, so a rule that only holds in one theme shows up as geometry drift. Two
cheaper guards sit beside it: a theme block may only declare appearance
properties, and every `var()` in the stylesheets must name a declared token. The
audit also asserts it found text to check, so a matcher that stops resolving
classes cannot pass by finding nothing. It runs inside `npm run check`, which
means a palette change that dulls a label or a theme-specific tweak that moves a
card fails the build.

The **terminal surface** is a second Appearance choice, stored as its own
settings row. By default the terminal keeps the night-shift palette while the
workspace is light, because a command line on white paper is not the same tool;
choosing Follow the workspace makes it read the same tokens as everything else.
The fixed `--terminal-*` values live in `tokens.css` and are never redeclared
under the light theme; the terminal pane re-points the shared token names at
them under `[data-terminal='dark']`, so every entry, output tone and prompt
inside it follows without a second set of component rules. The choice is
mirrored as `helpdesklab.terminal` and painted on `<html data-terminal>` by the
same boot script, so a light workspace never flashes a light terminal. The
theme audit cascades scoped custom properties to the element they style, which
is what lets it check the dark terminal's text against the light workspace's
render.

Schedule is the one choice that changes with nobody looking, so
`domain/appearance/theme.ts` holds the rule — light from dawn up to, but not
including, dusk — and the milliseconds to the next boundary. Dusk before dawn
runs the light window across midnight; two identical times mean no daylight at
all. `app/themeService.ts` arms a single `setTimeout` for that boundary rather
than polling the clock, re-arms it whenever the choice or the times change, and
re-resolves late (a machine that slept through a boundary fires its timer on
wake). The two times are a second settings row beside the choice, repaired one
field at a time on read and refused rather than corrected on save. Because the
first frame cannot await the database, the boot script in `index.html` carries
the same rule and the same 07:00 / 19:00 defaults against the cached schedule;
a Node test runs that script at pinned hours and compares it with the domain
function, so the two copies cannot drift apart.

System stays the default: an install that never opens Settings follows the
operating system, and Light, Dark and Schedule are one click away. The boot
script carries the same fallback, so a first frame with nothing cached already
asks the system instead of assuming Dark.

## 9. Persistence details

```ts
interface SqliteDriver {
  exec(sql: string, params?: unknown[]): Row[];
  transaction<T>(fn: (tx: SqliteDriver) => T): T;
  export(): Uint8Array;
  close(): void;
}

interface SnapshotStore {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
  saveBackup(bytes: Uint8Array): Promise<void>;
  loadBackup(): Promise<Uint8Array | null>;
  clear(): Promise<void>;
}
```

- `SqlJsDriver` loads `sqlite3.wasm` once (bundled asset, cached by the PWA).
- `IndexedDbSnapshotStore` keeps one live snapshot and one pre-migration backup;
  writes are atomic per IndexedDB put.
- `MemorySnapshotStore` and an in-memory driver are used in tests, so repository
  tests run in Node against the same SQLite engine as the app.
- Backup/export writes a standard `.sqlite` file via download; import validates
  `user_version`, table shape, and a magic `app_id` before swapping in, keeping
  the previous DB as the backup slot.
- `navigator.storage.persist()` is requested on first run; the settings screen
  shows storage status and a one-click export reminder after 25 sessions.
- If the database fails to load, the app enters read-only recovery: it offers the
  backup snapshot, raw export, or a fresh database. It never silently deletes
  history.

### Repository ports

`TicketRepository`, `SessionRepository`, `ActionRepository`, `ScoreRepository`,
`ProgressRepository`, `SettingsRepository`. Services depend on these interfaces;
tests substitute in-memory implementations. The SQLite versions use prepared
statements and transactions — no string interpolation of values.

## 10. Testing and verification

| Layer | Tool | What is covered |
|-------|------|-----------------|
| Domain units | Vitest | reducer outputs, command parsing, rubric evaluator, dialogue intents |
| Generator | Vitest + seeded fixtures | reproducibility, uniqueness, schema, 500-seed fairness lint |
| Scoring | Vitest fixtures | reference / unsafe / lucky scripts per variant |
| Persistence | Vitest (Node + sql.js) | migrations, round-trips, resume, export/import, corruption fallback |
| Curriculum | Vitest | catalog invariants, lesson existence and scope, lesson length limits, requirement evaluation, evidence folding, seeded service view |
| Theme | Vitest | preference and schedule parsing, system and dawn-to-dusk resolution, boundary timing, cache-then-database reconciliation, first-paint parity with the domain rule, token parity between the two palettes, and the route audit: every page in both palettes, AA on the surfaces it actually renders on, geometry identical across themes |
| UI | Testing Library | ticket workspace flow, debrief and dashboard rendering, keyboard path |
| E2E | Manual script in R1 (Playwright in R2) | start → diagnose → resolve → reload → resume → export |
| Build | `tsc --noEmit`, ESLint, `vite build` | no type escape hatches, import boundaries |

Performance targets: generate a ticket in < 20 ms, apply a command in < 5 ms,
boot with 1,000 stored actions in < 1 s on a modest laptop. The DB export per
action stays under ~2 MB for Release 1 content.

## 11. Forward design (not Release 1)

- **M365 sign-in family (R2):** tenant state with account status, licenses, MFA
  methods, conditional access, and device compliance. Sign-in attempts return
  realistic error codes (invalid credentials, disabled account, MFA required,
  policy block). Fixes reuse the verification and unlock mechanics; new commands
  model sign-in retries and credential cache clearing. Same world/session shape,
  no schema change beyond optional tenant columns.
- **Adaptive selection (R2):** Leitner scheduling plus per-skill mastery to pick
  the next family; difficulty rises only after two passes at the current level.
- **Composite tickets (R3):** multiple faults behind one symptom, rubrics with
  dependency ordering; requires a `faults[]` model and a fairness lint that can
  prove each fault is independently observable.
- **Content packs (R3):** scenario templates as signed/validated JSON packs so
  instructors can author original tickets without touching the app.
- **Native shell (optional, R4):** Tauri + `rusqlite` behind the same driver
  port for labs that need an installable, file-backed app.

## 12. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Simulation scope creep | Command surface is capped per scenario and driven by rubric needs; new probes only when a scenario requires them. |
| Ambiguous tickets | Fairness lint + reference script + a scenario review checklist (single cause, observable clue, unambiguous fix). |
| Brittle scoring | Declarative checks, three fixture scripts per variant, versioned rubrics. |
| Browser storage eviction | Persistent-storage request, visible status, export reminder, import, backup slot. |
| sql.js bundle size / boot time | One WASM asset (~1.5 MB) cached by the PWA; measure boot at 1,000 actions. |
| WASM/IndexedDB quirks | Same engine in tests; recovery path never deletes data; import validates before swapping. |
| Content authoring bottleneck | Three families only in R1; template data separated from generator code. |

## 13. Decisions requested at approval

1. **R1 shell:** browser-first PWA with WASM SQLite (recommended) vs. native
   Tauri desktop from day one.
2. **Interaction model:** hybrid — terminal plus quick actions and caller chat
   (recommended) vs. form/button-driven GUI only.
3. **R1 scope:** the three families and two variants each in §5, with M365 sign-in
   and deeper DHCP in Release 2.
4. **Data retention:** keep every attempt locally forever, with export/import and
   a manual reset (recommended) vs. automatic pruning.

No implementation begins until these are confirmed and the roadmap is approved.
