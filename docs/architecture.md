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
    architecture.md
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
    app/                        # orchestration services; the only layer UI calls
      persistenceService.ts     # opens and reports the browser database
      backupService.ts          # export / restore / reset wrapper
      practiceService.ts        # start / resume / abandon a ticket
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
      repositories/             # tickets, sessions, actions, scores, progress, settings
    ui/                         # React only; no SQL, no domain mutation
      routes/                   # dashboard, practice, ticket, debrief, progress, settings
      components/               # terminal, ticket pane, caller chat, rubric report…
      state/                    # session store (zustand), app settings
      styles/                   # CSS custom properties + CSS Modules
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

SQLite, six tables plus migration bookkeeping. All timestamps are epoch
milliseconds; all generated content is stored as JSON text so the schema stays
small.

```sql
-- Schema version 1. The migration runner sets PRAGMA user_version after applying.

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
```

Indexes: `actions(session_id, seq)`, `sessions(ticket_id)`, `tickets(created_at)`,
`scenario_stats(due_at)`.

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
  hint?: string;
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
- Hints, if used, cost Professionalism points and are recorded for progress
  stats. Hints are Release 2; the rubric field exists now.

### Feedback

The debrief renders, per rubric item: pass/fail, what happened in the learner's
own log, why it matters, and the corresponding line from the reference script.
It also shows the resolved machine state, the caller's closing message, XP
earned, and a "practice this next" suggestion from `progress`.

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

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard: continue session, today's practice, streaks, recent scores |
| `/practice` | Scenario family picker + difficulty; "surprise me" |
| `/ticket/:sessionId` | Workspace: ticket + caller chat, terminal, quick actions, resolve flow |
| `/debrief/:sessionId` | Score breakdown, timeline, expert path, retry actions |
| `/progress` | Mastery per family, attempt history, Leitner due list |
| `/settings` | Backup/export/import, reset data, accessibility options, about |

### Workspace layout

Three regions on desktop: ticket and caller chat (left), terminal (center),
contextual quick actions with a command reference (right). No hidden-state
inspector — the learner only learns what the tools show them. Keyboard-first:
focus lands in the terminal, `Tab` cycles regions, quick actions are reachable
without a mouse. A narrow-window layout stacks the regions; mobile is out of
scope for Release 1.

### State management

`zustand` per-session store holds only the view model: public ticket, caller
messages, terminal lines, simulated clock, and session status. The world —
including the hidden fault — is owned by `app` services and never enters React
state, so a DevTools inspection or an accidental render cannot reveal the
answer. Components call `app` services only; no repository imports in `ui`.
React Router for routes, CSS Modules and custom properties for styling (no UI
kit) so the terminal aesthetic stays bespoke and the bundle stays small.

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
| UI | Testing Library | ticket workspace flow, debrief rendering, keyboard path |
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
