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
      curriculum/               # the twenty-two-module course, exit criteria, evidence folding
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
  wall_ms       INTEGER,                -- when the step was appended (wall clock)
  kind          TEXT NOT NULL,          -- command, ask/verify/deny, note, hint, code-sent, rewind, console-read
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

### How the request arrived

A ticket can arrive as a conversation or as a message. The arrival is drawn after
the fault is built, from the ticket's own seed and from whether the variant took
the employee's handset out of action: `domain/tickets/voicemail.ts` puts one
ticket in three on the desk's voicemail, gives it a recorded length, and names
the line it asks to be rung back on — the mobile on file, or the desk line the
generator already gives a callback method when the handset is dead. The arrival is
written to the attempt's world and to the public ticket, so the queue can mark the
ticket, the workspace can play the message in place of the issue description, and
the curriculum can tell the attempt apart from one that came in live.

It is deliberately a property of the seed rather than of a second random stream.
A draw from the world's stream would change what every seed generates, and every
ticket already in someone's queue would become a different ticket; drawing from
the seed means a reload, a retry and a replay all read the same message. It also
means a caller that needs a voicemail ticket — module 5's Practice button — can
step the seed until the draw is one, instead of fighting the draw afterwards.

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
  work back. The same flag is what the workspace *names*: `accountChangingCommands()`
  reads the set back off the registry, and the terminal prints it above the prompt
  and the case file beside the recorded reason, so which commands are off the table
  is a rule the desk can read rather than a wall it walks into. One list, two
  places: a command added with `changesAccount` is refused and named together, with
  nothing to keep in step, and reads are never on it, because a refused ticket
  still has a log to fill and a report to write. That same flag is what the
  debrief invents a finding from: an account-changing command sitting *after* the
  denial in the log was tried against a refusal the fold already holds — the only
  thing that can lift the refusal is un-running the denial, which takes those
  steps out of the log with it — so the debrief sets the refusal beside what was
  tried after it (`refusalFindings`, id `change-after-refusal`, naming the verbs
  and the accounts). It is a finding and not a penalty: the command never ran and
  changed nothing, so the only thing wrong with it is that the attempt contradicted
  its own close. A refusal that was honoured produces no finding at all. The same
  selection is read while the ticket is open: the case file's refusal panel names
  each account change tried after it (`DenialView.retried`, from
  `accountChangesAfterRefusal`), because a learner who tries the change anyway
  should meet the decision there and then, not first in the debrief. One function
  answers "what came after the refusal", so the live callout and the debrief
  cannot hold different lists, and un-running the denial takes both away.
- **A decision is enforced in one place, and every command is asked about it.**
  The refusal above is the loudest example of a shape the simulator keeps
  producing: something the desk or the world has settled — a refused request, a
  stopped Print Spooler, a machine held on the shelf — is written down, and a
  later command would quietly walk over it. Those rules now live together in
  `src/domain/environment/policy.ts` and are asked in one pass by the reducer, so
  the answer is the same whether the command came from the terminal, a console
  button, or the Remote Desktop, and "what does this decision stop?" has one file
  to read. A rule names the commands it stops through a flag on the registry —
  `changesAccount`, `needsSpooler`, `needsRemoteSession` — rather than by listing
  names, so adding a command to the rule is adding the flag. A rule whose only
  input is the world and the command is asked by the reducer for every command
  (`request-refused`, `no-live-session`, `spooler-stopped`); a rule that needs the
  command's own
  arguments, or has to answer in the command's own order, is an exported helper
  the command calls at a documented point instead (`stockPolicy`, which both the
  shelf handover and the imaging run consult, so "held" means one thing in both).
  A command that acts on a machine it names, rather than on the one it was typed
  at, declares that machine once as `targetDevice`; the reducer resolves it a
  single time and passes the device both to the rules and to the command, so a
  rule about the target's state and the change it guards cannot end up looking at
  two different machines.
  Both kinds return the same refusal shape and are tested together, by rule id
  rather than by wording. Which decisions bind, which deliberately do not, and the
  order a new rule is added in are kept in
  [research/decision-binding-audit.md](research/decision-binding-audit.md).
- **Every command is either behind a console button or named terminal-only.** The
  reference replay proves the *scored* commands can be reached without typing;
  a command no scenario uses could still be added with no button at all. So the
  guard follows the whole registry: `tests/app/consoleParity.test.ts` walks every
  console's actions over the fixture world, each variant's own world, and each
  step along its reference path — a console grows actions as the work goes on, so
  a button that only appears mid-ticket still counts — and asks of every
  registered name whether some action would run it. A command that is not
  reachable has to be in that file's `TERMINAL_ONLY` map with the reason it never
  will be, so being terminal-only is a decision on the record rather than an
  omission: a command added tomorrow without a button fails the suite until
  somebody writes one or writes the reason. The list is checked the other way
  too, so a command that gains a button has to come off it — it may shrink, not
  grow quietly. Today it holds the session and diagnostic verbs (`whoami`, `dir`,
  `netstat`), the list commands a console already shows as its records
  (`get-sessions`, `get-messages`), and two changes no console offers yet
  (`remove-share-deny`, `set-default-printer`).
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

A callback proves only what the line proves. The caller's own mobile reaches the
caller; a shared team line on their record reaches whoever is at that desk, and
the check says so by naming the colleague who answered rather than passing as the
caller. The gate stays shut on that answer — the person on the ticket is still
unproven — and the attempt keeps the fact: the debrief quotes the colleague
beside the caller's own claim that a team-mate would vouch for them, and the
process cost records taking the word. The one variant that puts such a line on
the record (`PWD-01/shared-line-callback`) draws the answering colleague from the
caller's own department, and never the manager already listed as a contact.

The live code has a deadline the learner can see: the panel prints how many
simulated minutes are left and the clock time it ends at, and says plainly when
it has run out. The number comes from the attempt's own clock — the same one the
read-back check compares against, and the one each command advances by a minute —
so the countdown moves with the work done rather than with the wall. It is a
reading of the view, not a ticking timer: a real-time countdown would announce a
deadline that has not actually arrived, because sitting still in this simulation
spends no time at all.

The caller's clock is the exception, and deliberately so. A pressured ticket's
stall ladder is timed in wall minutes since the desk last acted, not in minutes
since the attempt began, because someone on a phone experiences the silence and
not the simulated minute. Every step the learner takes restarts it — a command, a
question, a note, a check, a hint, an un-run — while the caller's own
interruptions do not, since being spoken to is exactly what the ladder is waiting
out. An attempt that pauses after a run of work is therefore nagged afresh, and
one that starts slowly and then gets going is not charged for the quiet start.
Each action row keeps both clocks for this: `at_ms` is where the step sits on the
call, and `wall_ms` (stamped by the repository when the row is written) is when
it happened. Rows written before `wall_ms` existed read as the attempt's start,
so an old log's ladder still begins somewhere honest.

The script also hears the tools. Opening a console, or reading a record in one,
is recorded as a `console-read` action — the console's id, and the record's when
one is opened — because that look is the learner acting on the call even though
it runs no command and changes no machine. A line can then be written against
it: the pressed account caller reacts to the directory being opened, the angry
printer caller to their queue being read. A read is not work on the line, so it
does not by itself walk the stall ladder up by a step; it does restart the stall
clock, since a desk reading a record is plainly still there. And because the row
changes nothing in the world, it is not a step of the rubric, it keeps out of
the conversation, and a cut made before one can still be put back.

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

  Stating the gap is not the end of it. From that notice the learner can
  **reconstruct** the lost rungs: each one is priced again from the attempt's
  own policy, at the position it can only have held — after every rung the log
  still places — and the result is kept in `scores.hint_repair_json`, beside the
  evaluation rather than inside it, with `source: 'policy'` and the moment it
  was made. Under a flat rate capped per attempt those prices add up to exactly
  the part of the charge no step can show, so the repair reconciles the two
  numbers instead of inventing a third; when the policy read back is not the one
  the attempt was scored under, both numbers are kept and the debrief says the
  charge is what stands. What the repair never does is give a lost rung a step:
  the log cannot say which one it unstuck, and a guessed step would be a worse
  record than a gap. Every reading of it is labelled **Reconstructed**, and the
  action is idempotent, so a second press returns the record it already has
  rather than pricing the same rungs twice.

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

Between the two sits **How you used the tools**: the consoles the attempt opened,
in the order the log put them in front, with what each one saw — how many times it
came up, how many records were read in it, and how many commands it ran. It is
read by `toolUseReport` from the same rows: a `console-read` naming no record is a
console coming to the front, one naming a record is a read, and a `command` whose
`source` is a console id is work that console did. The two shells are counted
apart, because no console owns them. The reading says three things the trail
cannot: which console carried the work, which consoles were opened and never run,
and how much the attempt moved about — including how often it went back to a
console it had already opened. A console whose open row was never written still
appears from the command that ran in it, an attempt that never touched a console
has no section at all, and nothing here is stored: the section is rebuilt from the
log on every open, so a rewind or an older attempt reads the same way.

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
   ├── Resolve ticket → choose closure code + note → score → debrief
   │                                          └→ update stats + Leitner
   └── Refuse request → report to Security → score → debrief
                         └→ the same close, with the refusal's own code
```

- A refused ticket gets its own closing path rather than the ordinary resolve
  form. The catalogue marks the code a refusal takes (`refusal: true` on
  `denied-social-engineering`, read back by `refusalClosureCodes()`), and the
  denial view carries it as `closingCode`, so the heading, the note label, the
  prompt and the button all become the report — what was asked, what was checked
  before deciding, what Security should do next — with the disposition already
  chosen. Refusing also writes that code to the close draft when the learner has
  not chosen one, so a reload reopens the report instead of the default resolve.
  The report is the close's contract rather than a target to aim at: a refusal
  cannot be recorded until the note says what was asked, what was checked before
  refusing, and what Security should do next, and the close names the part that
  is missing — in the review the form reads (so it is said before the button is
  pressed) and in the service that refuses the close, which is what keeps a
  second surface from recording a refusal without one. Both ask one rule,
  `securityReportGaps` in `scoring/noteCoverage.ts`, which reads the note with
  the same matcher the scorer uses for the ordinary hand-off, so a note that
  covers a part is covered by both accounts of it; the refusal's report adds
  the identity evidence a refusal is decided on as the middle part, and leaves
  “verified” out of it because “unverified” contains the word and is the thing
  being refused. A close that is refused writes nothing at all — no note, no
  closed session — so the attempt stays open on the report it was writing.
  Nothing is locked: a learner can still pick another disposition, and a refused
  ticket whose right answer was a fix is told so by the scorer, which is the same
  feedback any wrong close gets. The code's outcome stays `escalated`, because a
  refusal is handed to Security rather than resolved at the desk, and that is the
  disposition the refusal variants' own rubric accepts.
- The refusal has a reason, and the reason can be the thing that was wrong. The
  deny control offers four — someone else's account, an unproven caller, a
  password or code asked for out loud, and urgency used to skip the checks — and
  every refusal variant names the one it needed (`denyCaller('third-party-request')`),
  in its rubric and on its reference path. The words for those reasons live in
  the domain (`scoring/refusal.ts`), so the control that offers a reason and the
  rubric that requests it cannot drift, and the debrief can quote both.
- The reason is scored as a share of the step, not as a gate. The reason the
  ticket needed earns the step; a recorded refusal under another reason earns
  half of it (`MISMATCHED_REFUSAL_CREDIT`); no refusal earns nothing. A refusal
  does two things — it stops the request and it records which rule the request
  broke — and a mismatched reason does the first and not the second. A partly
  earned step is therefore not a critical failure: the account was protected, so
  the attempt can still pass, but the half it did not earn keeps it short of the
  strong band. Steps carry that share as `credit`, and both the debrief (◐ partly
  met, with the points earned and a finding quoting both reasons and the rule
  behind the needed one) and the close preview, which opens before committing,
  say what is still owed.
- `PWD-01/credential-readout` is the ticket that needs the ask itself refused:
  the account is active and unexpired, nothing needs fixing, and the caller asks
  the desk to read out a password and then a code — the refusal is the whole
  answer, and the verification would not have changed it.

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
  what it paid. A debrief opened months later also says when the setting has
  moved underneath it: `hintPriceNow` carries the price the same ticket would be
  charged today, present only when that differs from the one the attempt paid, and
  the line reads *Settings have moved since* beside the steps. The score is not
  re-priced — the line exists so the number beside the steps is not read as the
  app's current price — and an exam never carries it, because its rate came from
  the exam and not from the catalogue. A budget change is not a price change: it
  rations rungs without moving what they cost, so it leaves the line off.
- What a hint will cost is answered before a ticket is opened: the practice queue
  lists every family's **effective** price — the default, or the family's own —
  and marks the rows that are only inheriting it, so the unpriced families (the
  interesting half of such a table) can be seen at a glance. The default is
  stated once above the list rather than repeated as a row, and that sentence also
  says a ticket keeps the price it started at. The panel reads the same
  `loadHintTargets` the Settings table edits, so the two cannot disagree about
  which families exist or what they charge, and it draws its price text with the
  same shape the debrief prints (`ui/routes/PracticePage.tsx`).
- What resuming an open ticket lands in is on its card: the console that was in
  front and how far in the work had got — *Left off in the Server room console, 9
  steps in* — with the same phrase in the resume bar above the queue and a
  **Resume** button on that row instead of **Open ticket**. Both halves are  the attempt's own record: the stored workspace layout, read through
  `normalizeWorkspaceLayout` exactly as a reopen reads it, and `countBySession`
  for the steps, so the card cannot promise a place the workspace would not reopen
  in. Only the attempt the app holds open has a point — `loadQueue` reads
  `sessions.findActive` once and marks that ticket alone — and a log with no steps
  yet reads as *the terminal, before the first step* (`ui/components/resumePoint.ts`).
- Where the learner was reading is remembered on the two long pages, in the same
  settings table as the dividers: a taste in viewing rather than attempt data.
  Progress stores **which section** was being read (`progressSection`) as an id
  like `progress-hints` rather than as a scroll offset, because the page is rebuilt
  from live history and a row added above would move an offset onto a different
  block; the page scrolled to it once the history is on screen, and writes the
  section only where the reading comes to rest, never while the page is still at
  the top of a restore. Job targets stores its **status filter**
  (`targetsFilter`), read beside the listings so the list first paints the way it
  was left rather than everything and then a jump. Both read back defensively: a
  filter this build does not offer is *All*, and an id that is not an id is no
  reading, so neither can hide a page behind a value nobody set
  (`app/settingsService.ts`, `ui/routes/sectionSpy.ts`).
- The close being written — the chosen code and the handoff note — is not an
  action, because nothing has happened yet. It is saved on the session
  (`closure_draft_json`) as the learner edits it, debounced and flushed when a
  close field loses focus, so a reload reopens the form where it was left.
  Closing the ticket clears it: the committed code is `sessions.resolution` and
  the note is appended as a `resolution` note action, which is what the debrief
  scores.
- Where the learner was *inside* a console is part of the attempt too, and
  stored beside the workspace rather than in it: `console_focus_json` on the
  session holds, per console id, the search typed in its box and the record left
  open in front, so a reopened ticket lands on the machine rather than on a bare
  list. The tab says which console; this says what it was showing, and it is a
  per-attempt record for the same reason the tab is: the next ticket's machines
  are different machines. It is written when the typing pauses (500ms) and again
  when the page is hidden, unloaded or left, one console at a time — only the
  consoles whose focus moved since the last write are sent — and a console left
  with an empty box and no record leaves no entry behind, so an emptied search
  is not restored as an empty one. A record that the attempt no longer has, after
  a rewind or a command that removed it, is not reopened: the console opens on
  its list. A console a later build no longer offers loses its entry, and a row
  written before this existed reads as no focus at all, which
  `normalizeConsoleFocus` guarantees whatever is in the column. Reading it back is
  not a change: arriving on a ticket writes nothing, and the pane only reports
  when the learner searches or opens a record.
- Where the learner was working is part of the attempt, like the close they were
  writing: which pane was in front, which tool console was showing, and which
  tabs were left open beside it. It is saved on the session
  (`workspace_layout_json`) as it changes — switching a pane or opening a console
  is a decision that has already happened, so it is written on the click rather
  than on the way out — and a reopened ticket lands back in that tool, with every
  restored tab read again from the world rather than put back as it was, because
  a console projects machines that may have moved on. A workspace the learner
  never left stores nothing and has the column cleared instead, and a console a
  later build no longer offers loses its tab and the front with it, which
  `normalizeWorkspaceLayout` guarantees however old or corrupt the row is. It is
  a per-attempt record rather than a setting, unlike the split beside it: the
  consoles in front project *this* ticket's machines and this attempt's evidence,
  and the next ticket opens on a clean terminal. The tab strip is the learner's
  own order — a tab can be dragged to a new place, or moved with Ctrl and an
  arrow key, because a drag is not available to everyone — and **tabs can be
  pinned as a group at the left of it**: the pinned ones are always first, in the
  order they were pinned, nothing can be dragged ahead of the group and no pinned
  tab can be dragged at all, so a working set stays where the hand expects it
  while other tabs come and go. The free tabs after the group keep the learner's
  order and are the only ones a drag can move. Pinning joins the end of the group
  rather than the front, so a group built one click at a time keeps the shape it
  was built in; unpinning puts the tab at the edge the group leaves — the front
  of what is free — rather than wherever it happened to be inside the group,
  because the group has to stay the front of the row and a released tab left in
  the middle of it would leave a pinned tab behind an unpinned one. A hairline in
  the gap before the first free tab says where the hold ends, and it is drawn on
  that tab rather than as an element of its own so the row's flex sizing does not
  move when the group grows. The rules are pure functions in the same domain
  module (`pinWorkspaceTool`, `reorderWorkspaceTools`), so the order on screen and
  the order in the row cannot drift apart, and they travel as part of the same
  JSON: `pinned` became a list of ids in place, and an attempt written when it
  was one id reads back as a group of one, which `normalizeWorkspaceLayout`
  handles because the column is JSON — no migration. **A tool can also be
  dragged out of the shelf and into the strip**, which opens it at the place it
  was dropped rather than at the end: the shelf is the one view that holds the
  picker and the strip at once, so it is the picker a drag starts from, and the
  dropdown in the card header does not offer the gesture because it covers the
  strip it would have to be dragged to. The place is read off the tabs' own
  boxes — each tab answers for its own middle, so a pointer in a tab's left half
  lands ahead of it — and the pin outranks the pointer exactly as it outranks a
  drag, so the place is `workspaceInsertIndex`'s answer rather than the raw sum:
  the caret between two tabs shows the place the tool will really take, never
  one it would be refused. A tool that is already open is moved by its own drop
  instead of being opened twice, a pinned tab cannot be moved at all, and the
  drop opens the console the way a click does — read and recorded — so a drop is
  a way to reach a tool, not a second kind of opening. The caret is drawn in the
  strip's own colour, in the gap it would open up, because a tab cannot be
  highlighted for a place it does not occupy yet.
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
- The Progress page reads three habits off the same logs rather than off stored
  counters: which rubric steps are bought as hints, where attempts are un-run,
  and which proof the desk reaches for when a caller has to be identified. All
  three are rebuilt by `loadProgress` from the action rows, so they follow an
  older attempt, a retry, or a later rewind with no migration and no column to
  keep in step. A rewind row names the family and the step, never the account:
  the cut's `boundary` is described by the same rule the timeline uses — a
  command by its verb (`unlock-account`, `.exe` dropped), anything else by what
  the learner was doing (`a troubleshooting note`, `a question to the caller`).
  A family's share is cuts per attempt, capped at 100% because an attempt cut
  and then abandoned never reaches the family's statistics; rows sort by that
  share before the raw count, so one cut in one attempt outranks four in forty —
  which is what "heavy rewinding on a family" means.
- The verification rows are read from every `verify-caller` action the logs hold:
  the method it used (`verification-code`, `callback`, `badge-scan`,
  `letter-pin`, `in-person`) and whether it proved the person on the ticket, by
  the same rule the scorer uses (`verified !== false && provesCaller !== false`).
  A callback a colleague answers is therefore a check that happened and proved
  somebody else: the row counts it as used, not proved, which is exactly what the
  shared-line variant teaches. Rows are per method, most used first with the
  desk's own order breaking ties, and each names its checks, the attempts they
  came from, and the share that proved the caller. The totals span every attempt
  in the logs, abandoned ones included: a proof the learner attempted is still a
  choice they made, and hiding it would make the habit look tidier than it is.

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard: the twenty-two-module course, module progress, next step in the course |
| `/modules/:moduleId` | Lesson for a playable module: the idea, one worked example, and the way into the tickets it is judged on |
| `/practice` | Scenario family picker + difficulty; "surprise me" |
| `/ticket/:sessionId` | Workspace: ticket + caller chat, terminal, quick actions, resolve flow |
| `/debrief/:sessionId` | Score breakdown, timeline, expert path, retry actions |
| `/progress` | Mastery per family, attempt history, Leitner due list, hint habits, how you verify callers, and where you un-run |
| `/settings` | Workspace theme and terminal surface, hint price (default and per scenario family), exam mode, backup/export/import, reset data |
| `/intune` | Device-management console: devices, compliance policies, apps and its practice tickets |
| `/azure` | Azure console: resources, network rules, access and its practice tickets |
| `/dsa` | Algorithm drill: the problem bank, filters and solved state |
| `/dsa/patterns` | The cue-to-technique pattern sheet, with links into the bank |
| `/dsa/:problemId` | One problem: statement, approach and edge-case questions, draft editor and the reference answers |
| `/languages` | Language tracks: Java, C#/.NET and Python, with lessons read and drills solved |
| `/languages/:trackId` | One track: what it covers, its lessons in reading order, its drills with their state |
| `/languages/:trackId/lessons/:lessonId` | One lesson, a read mark, and the neighbouring lessons |
| `/languages/:trackId/practice/:itemId` | One drill: the snippet, the answer options, and the explained result |

### Workspace layout

Three regions on desktop: ticket and caller chat (left), the tool card with the
terminal and the tool consoles (right), and the quick actions and command
reference under the case file. **The two columns themselves are draggable**: a
second divider stands between the case file and the card, so a learner can trade
width between the columns the way they trade it inside the card, and it holds the
same contract — a focusable `separator`, arrows, Shift, Home/End, Enter and a
double click restoring the `0.92 : 1.45` the grid shipped with. The trade is a
share of the stage rather than a pixel width, so it survives a window resize as it
was chosen, and it is stored with the split's preference: read with the session, so
the first paint is the shape it was left in, and written once it comes to rest.
What keeps a column readable is a pair of pixel minimums — 300px of case file and
420px of card — applied by the drag against the width the stage has *now*, because
the same share is a different pair of widths on a different screen; the tracks stay
fractions so the divider is exactly where the ratio says it is. Below 980px the
stage is one column and the divider goes with the second column, exactly as the one
inside the card goes when the halves stack. The tool card normally shows one pane at a time
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
since a `display: none` handle still sits between them). Whether the split is on
is the learner's own setting rather than attempt data: the workspace reads it
together with the session, so the first paint is the layout they left, and moves
it when the switch does. **Where the divider sits is stored with each ticket**:
the width is part of the attempt's workspace row beside the pane and the tabs, so
a ticket reopens with the two halves the size *that* ticket was worked at rather
than at whatever another ticket was last sized to. It is written once the divider
comes to rest — not on every pointer move, and not while it is under the pointer —
through the same clamp the pointer and the keyboard respect, to a thousandth of
the card, and it rides along with every other write of that row so a tab click
cannot wipe it. The move also writes the device's own width, which is what a
ticket with no width of its own opens at; an unwritten device width is the default
half. Nothing stored is not the same as a stored half: a learner who has never
moved the divider here has no width in this ticket's row, and the layout it
writes back is untouched, so opening a ticket never writes one. A row written
before widths were stored, or a width that will not read, is the device's own
preference rather than a stored half, and a preference that will not read falls
back to the tab layout and never keeps a ticket from opening.
**The divider also has stops**: a console-heavy quarter, the even half, and a
log-heavy three quarters, read by name from the card header while the split is on
and reachable from anywhere with `[` and `]`, which step to the next stop that way
and stay on the last one rather than leaving the card. **A drag is magnetised to
them too**: within half a rem — eight pixels at the shipped text size — the
divider lands exactly on the stop under the pointer, and the header lights it,
which is how a pointer user reaches the same three places the keys name. The
magnet is half the catch on a pane width (0.75rem) because a stop is a round
number the handle already states rather than a layout the content is asking for,
and all three kinds are candidates on one move: the nearest wins, and a tie keeps
the pane width. Past the magnet the divider follows the pointer again, which is
what keeps a stop from becoming a region the card cannot be put inside. A stop
is a ratio like any other, so a jump is written by the same settling timer as a drag: landing on a
stop and leaving never writes two rows for one decision. The keys stand aside for
any field that has the keyboard — a bracket is a character before it is a
shortcut — and for a divider that is not on screen, which is how they behave below
the stacking breakpoint without a second copy of the breakpoint to keep in step.
**And the drag catches on the console's own widths.** A console measures itself
rather than the window (`container-type: inline-size` in `ToolConsole.module.css`),
because in split view it is handed half a card: below 32rem a list no longer fits
beside its detail, and the detail is the part worth reading, so the list goes above
it. That width is a size the content wants, so a dragged divider that comes within
0.75rem of it settles a couple of pixels inside the wide layout — where the console
is at its tightest two-column size, rather than on the line where it has already
stacked — and the handle thickens to say it caught. The pane-to-console gutter is
measured from the console's own box once a drag starts rather than copied out of
the stylesheet, and the width list is one constant in the domain that
`tests/ui/consoleSnapWidths.test.ts` holds against the container queries in that
stylesheet, so a query added there without a snap here fails the build. The keys and
the header stops are left alone: a catch under the learner's finger is a convenience
for the pointer, and a key that would not go where it was pressed would be a bug in
the key.
**And the log measures itself, the way a console does.** `container-type:
inline-size` sits on the terminal's pane rather than on the card, because in split
view the pane is handed part of the card and the log's layout has to follow that
rather than the window. Below 22rem the pieces stop being a row and become a
column: the summary's three tiles turn into three label/value rows (the width of a
tile at that size is a word and an ellipsis), the step gutter narrows from 2.1rem
to 1.5rem, the log's padding tightens, and the prompt moves above its command
instead of sharing a line with a path and a long command. Those last two rules
live in `practice.module.css` — the entries are styled there — under the same
query, and `tests/ui/consoleSnapWidths.test.ts` holds both stylesheets' number to
the domain's list. 22rem is deliberately below the half-split a 1440px window
opens with (about 25rem of log), so the shipped desk is left in its wide shape.
**The divider catches on the log's width too**, not only the console's. The
terminal's container is the pane itself, so its width is simply the ratio's share
of the card with no gutter; the snap compares both panes and takes the nearer
width in reach, resting just inside the log's wide layout the same way it rests
just inside the console's. An empty tool half measures no console — the geometry
comes back with a `NaN` gutter — and the log's widths still apply, because the log
is always there to restructure.
**And the two trades can be asked for together.** Three presets — *Paperwork*,
*Balanced* and *Machine* — set the case-file/card share and the terminal/tools
split in one move: the number keys `1`, `2` and `3`, or a strip in the bar above
the columns that names each one and carries its key in the title. The ratios are
the domain's (`layoutPresets.ts`), paired by hand because they belong together: a
wide case file leaves the card narrow, so its log takes the larger half; a wide
card leaves room for a console, so the tools take the larger half. *Balanced* is
exactly the fractions the grid shipped with, so a preset is undone by pressing 2
— and a set of presets with no way back would be three one-way moves. Each
position is applied through the same clamp the divider it moves respects: the
stage against the room its two columns need at this width, the card against its
quarter bounds, so a preset can never leave either divider somewhere a drag would
refuse to put it. A preset's key stands aside for a field that has the keyboard
and for a window where the stage has stacked, read from the handle's own computed
display as the brackets are, so the shortcut and the control it drives cannot
disagree about which of them exists. The strip lights a preset only when *both*
dividers are on it: nudging one leaves the pair, and the strip says so rather
than claiming the nearest shape. The split is set even while the split switch is
off — the switch is the learner's, and a layout preset does not flick it — so the
position is where it will be when the split is turned on. Nothing new is stored:
a preset is a move like any other, and the dividers' settling timers write both
positions. On a stacked window the strip is hidden with the divider it moves.
The pane keeps several tools open at once: the consoles a learner has opened are
a tab strip above the console,
the tab acts as the switch, and only the console on screen is rendered, so the
work of one tool is never hidden behind another's. Opening a tool that is
already open brings it forward rather than adding a second copy. **← All tools**
returns to the shelf without closing anything, and **Close** drops the tool on
screen, choosing the neighbour the tab had or the shelf when it had none. Each
close forgets that tool's view, so reopening reads the machine again instead of
restoring a stale one, and every open tool — not only the visible one — is
reread after a command, a console action or a rewind, because the consoles
project machine state read at load time. Where that strip is kept is the per-attempt record described
above, unlike the split beside it, which is a setting; the two are kept apart on
purpose. With more tools open than fit, the strip scrolls sideways rather than
wrapping onto a second row, because a second row of tabs would take the height
the console needs: a scrollbar would be the honest way to say there is more, but
the row is too short for one, so each end with tabs still behind it fades out,
and the tab in front is scrolled into view whenever it changes — stopping clear
of that fade, because the start of its name is the part a tab in front has to
say for itself. The width of the fade is declared once, with the other
measurements in the token set (`--strip-fade`), and both the mask that draws it
and the script that follows the tabs read that one value, so the two cannot drift
apart. Those two promises are held as properties in
`tests/ui/toolStrip.property.test.ts` rather than as examples: over seeded strips
of every width the tests ask whether the tab in front can ever come to rest
inside a band the mask is drawing (it cannot — and a tab too wide for the clear
window keeps its own start on screen), and whether following the same tab twice
can move the strip (it cannot, because the follow reads the tab back in the
strip's own coordinates and the second sum lands on the same scroll). The corpus
asserts its own coverage — both ends faded, both kinds of tab, follows that move
and follows that do not — so a pass cannot come from testing nothing, and the
model clamps the scroll the way the browser does, since the page assigns a number
and the element quietly shortens it. The bar over the console keeps to one line at every width as well: the way
back and the two controls may not wrap without reading as broken, so the
console's name gives first, ending in an ellipsis with the whole name in its
title.

The strip also says which of its tabs has something the learner has not read: a
tab whose console would now print a different page than the one it last had in
front carries a dot, and its accessible name ends in ", new" so the mark is not
colour alone. A console projects machine state when it is read, so a command
typed anywhere — the terminal, another console, a desktop shell — can change a
tab that is not on screen. The workspace keeps one digest per console (the
`consoleNews` rule), taken from the fields a console actually prints, and
compares it with the digest that console had when it was last in front. The tab
in front is never marked, because it is the page being looked at, and neither is
anything behind the shelf, where nothing is being read. That is decided by the
render rather than only by the effect that files a read: a console is reread one
at a time, so the tab in front can have its new page for a frame before that read
is written down, and a dot on the tab being looked at — even for one frame — says
the opposite of what is true. The digest leaves out
what a console never prints — a record's filter ids, the map check's `atMs`, and
the fake desktop's clock, which follows every command — so a clock tick cannot
mark twelve tabs as news. It is per visit rather than per attempt, since the tabs
are the attempt's but "have I read this" is not, so a reopened ticket starts
quiet. **And the dot can be stepped to from the keyboard.** `N` opens the next
tab along the strip that carries news, starting after the tab in front and
wrapping once, so a second press carries on instead of landing on the tab already
showing. The tab it opens becomes the tab in front, which is what marks it read,
and the tools pane comes forward when the terminal was the pane in front: a dot
says that something is there, but a strip wider than the card and a pane behind
another one do not say where. It is a bare letter because nothing else in the
workspace claims one, it stands aside for a field being typed into as the
brackets do, and with every tab read it does nothing at all rather than cycling
the strip. The strip advertises it (`aria-keyshortcuts="N T"`, the second key
being the switcher below), a tab carrying news names it in its title, and the step
itself is the domain's `nextConsoleWithNews`, so which tab comes next is testable
without a browser.

**The strip is a signpost, though, not an index.** With more tools open than fit,
the ends fade and the middle is scrolled past, so a name can be on the card and
still be several presses of the keyboard away. `T` opens a switcher over the card:
a search field and the open tools in the strip's own order, each named as its tab
is and saying so when it has news or is the one on screen. It is the strip's
second bare letter, so it stands aside for a field being typed into and for a
workspace with nothing open, where a list of tools to switch to would be empty.
Typing narrows by any word of the name or of the console's id with its hyphens
read as spaces, so `admin mail` finds Mail Admin as `mail-admin` does, and words
count in any order because the learner should not have to remember how the card
labels things. The arrows walk the list as a ring, Home and End take its ends,
Enter switches and Escape gives the keyboard back to whatever had it — the button
or the tab the panel was opened from, unless that has left the document. The panel
declares itself modal, so it holds the keyboard while it is up: Tab is cancelled
rather than allowed to walk out into the page behind, and the arrows are what
move. A pick lands focus on the tab it opened, which is the anchor the learner
would have clicked, so the next key press belongs to the strip. Because the
shortcut must not be a secret, the Tools button names `T` in its title and the
strip names both keys. Which names a query keeps and where the arrows put the
highlight are `switcherMatches` and `stepSwitcherIndex` in
`src/ui/routes/toolSwitcher.ts`, kept out of the component and tested without
rendering anything.

Below the widest
layout the two halves stack in one column at the full card width — two 400px
columns would leave the log wrapping every few words and a console's detail pane
clipped — and each half scrolls inside about 42vh. The consoles measure
themselves rather than the window (`container-type: inline-size`), so a console
handed half the card puts its list above its detail instead of squeezing both.
**At the narrowest the divider allows, nothing sits beside anything.** A quarter
of a small card is about 12rem, so below 20rem the console's second turn stacks
what a row was holding: the search takes the line and the filter drops under it,
a record reads its label above its value instead of a value in the leftover
column, the detail's 8rem label stops being a floor, an action or an input takes
the pane's width, a picker's action falls under its row and its name and holder
wrap rather than ending in an ellipsis, and a tile's fact becomes two lines. The
automatic grid floors are `min(…, 100%)` too, so an 11rem tile or a 13rem action
column can never be wider than a 12rem pane and start a horizontal scrollbar the
learner cannot widen away from. That tier is written **after** the rules it takes
decisions back from, which is not cosmetic: a container query has no more
specificity than the base rule it competes with, so a tier placed above `nowrap`
or a fixed column is dead CSS that still reads correctly in review — which is how
the pane kept cutting picker names to three letters at its narrowest while every
line of the tier looked right. `tests/ui/consoleNarrow.test.ts` walks the
stylesheet and fails if a base rule after a tier reclaims a declaration the tier
makes, so the order cannot rot back. A
console can also be read a second way: the Directory declares a grid, and a
List/Grid switch above its records turns the same rows into tiles carrying the
account's name, its account and department, and the facts its definition names
for a tile — employee id and site. The list, the selection, and the actions are
the same either way, so a tile is pressed exactly where a row is; only the read
changes, and the tile grid uses the pane's width until a record is opened. A
console that declares no tiles keeps its rows even when the pane was last left
in grid, so the switch can never dress a runbook as a square. A console can
also declare itself a picker: the list sits under a centred heading and one
search, each row carries the button that does its next step, and the record opens
underneath the list when a row is read. Three consoles are pickers and each keeps
its own records and its own buttons — Remote Desktop offers connect or
end-session on a machine, the Directory offers the record read on an account, and
the Printers list offers the queue read on whichever kind of row it is, a
printer's held jobs or the local spooler's. A row button may only be an action
that needs no value typed into it: a button that could not run from a row stays
in the record, where its box is, which is why clearing a queue is not a row
button. The row button runs the same audited command as the record's own button,
so reaching the record this way is still a step in the log. Rows name what they
are — a machine, an account, a printer — through the record's `icon`, with the
console's `rowIcon` as the fallback for a list of one kind; the printers list
holds two kinds, so each row names its own. Picker rows are a *reading*: the
Directory keeps its tile grid, the switch reads the same records the other way,
and the rows' shortcut buttons belong to the rows. No hidden-state
inspector — the learner only learns what the tools show them. Keyboard-first:
focus lands in the terminal, `Tab` cycles regions, quick actions are reachable
without a mouse. A narrow-window layout stacks the regions, and phone width gets
the docked-console layout described below; a mobile app is still out of scope.

At phone width in portrait (`max-width: 600px` and `min-height: 481px` — a phone
on its side is the landscape paragraph's problem below) the two-column split is
the wrong shape rather than a smaller one: the case file alone runs to several
screens, so a
console stacked under it is a scroll away from every command and a second scroll
away from its output. The card therefore leaves the page's flow — `position:
fixed` against the bottom edge, a little over half the screen tall (`55dvh`, with
a `55vh` fallback for browsers without dynamic viewport units) — and the split
turns into a docked console: the tool pane takes the top row and scrolls inside
it, and the terminal takes the bottom row, where its log scrolls but the chip row
and the command line stay put. Pinned rather than merely tall is the point: the
case file and the open tools scroll behind the card instead of carrying it out of
sight, so the console is under the thumb on every screen of the paperwork rather
than at the end of it. The column keeps the card's own height clear at its foot,
from the same two numbers, so the last section can still scroll out from under
the card. Both rows scale with the window (`1.1fr` / `1fr`), but the console's
carries a floor of `10rem` — the chip row, the command line, the log's own inset
and two lines of log, at every text size Settings offers. Proportional alone was
not enough: on a 320×568 phone the pair left the log 27px, a line and a quarter,
so the terminal was on screen and unreadable. The floor is in rem rather than px
because everything it covers is, so raising the text size raises the floor with
it. `tests/ui/phoneLog.test.ts` measures the floor against two lines at every real
phone, in both pane states and at every text size. The DOM is terminal-first, so
the two panes are swapped with `order`. The controls in the
column carry `scroll-margin-bottom` equal to the card's height, so a control that
takes focus — by Tab, or because a script moved it — comes to rest above the card
rather than behind it; it is written on the controls and not on `:focus`, because
`:focus` stops matching when the window loses focus while a script can still
move it. The divider is hidden
and the ratio ignored, because a single column has nothing to drag, and the
quick-command row stops wrapping and scrolls sideways — three wrapped rows cost
the log more lines than a phone can spare. With the split off the same screen is
the ordinary tabbed pane. `tests/ui/workspaceNarrow.test.ts` holds this shape,
since jsdom applies no media queries and nothing else can see it, including that
the card sits under the sticky header in the stack and that the room reserved at
the page's foot still matches the card's height.

**The card's own height is the third divider**, and the workspace's only
horizontal one: on a phone the card's top edge is a bar 1.5rem tall with a grip
at its centre that thickens and takes the accent while it is held, and with the
share of the screen the card has come to at its right end for as long as the drag
lasts — and nothing written on it at rest, because a bar is a control rather than
a readout. It is a focusable `separator` with the other two's contract (arrows,
Shift, Home/End, Enter, and a double click putting back the share an untouched
card would have here: a log's 55%, or a desktop's 82% while a machine is on the
card), the same 0.3–0.92 clamp, and the same settling timer, so a drag writes one
row when it comes to rest rather than one per pointer move. The pointer maps to
the screen rather than to a container, because the card is fixed to the window:
the share is simply the part of the viewport below the edge. The bar is drawn
over the head's top padding by 0.4rem — the room it grew by comes out of padding
and not out of the log, so the console keeps the two lines
`tests/ui/phoneLog.test.ts` holds it to — and it exists only where the dock does:
a window without a pin has no edge to move, and the landscape sheet is docked by
width instead. The share is a plain number rather than a length, so it means the
same thing on the next phone and the clamp needs no window to measure.

A phone's keyboard is the one thing that pin does not survive. The on-screen
keyboard does not shrink the layout viewport — it floats over it — so `bottom: 0`
sits the command line under the keys exactly when the learner is typing in it.
The visual viewport is the only thing that knows: its height plus its scroll
offset is where the visible area ends, and whatever lies below that is keyboard.
`useKeyboardInsetRef` measures that strip (`innerHeight - (visualViewport.height +
visualViewport.offsetTop)`, floored at zero), follows it on both `resize` and
`scroll` — a keyboard opening is a resize, a page scrolling under one is a scroll
— and writes it onto the workspace as the `--keyboard-inset` custom property. It
returns a callback ref and writes to the element directly: the workspace root
only mounts once the ticket has loaded, and the viewport moves with every pixel
of the keyboard's animation, so neither a one-shot effect nor a state update
would do. The
phone dock adds it to its `bottom`, so the card climbs onto the keyboard, and
adds it to the room kept at the foot of the column and to the controls'
`scroll-margin-bottom`, so the case file still scrolls clear of a card that is no
longer against the floor. Lifted by the keyboard's height, a `55dvh` card would
climb behind the two-row header, so the card is capped at
`100dvh - var(--header-height) - var(--keyboard-inset)` and the console shrinks
rather than hiding its own chrome. The plain `bottom: 0` stays written first as
the fallback: a browser with no visual viewport, or one that resizes the layout
viewport for the keyboard instead of overlaying it, measures zero and is left
with the old bottom edge. The landscape sheet gets the same measured bottom,
because a phone on its side types into it too.

A landscape phone is the same problem turned on its side: 844×390, wide but
short. Stacking it the way a narrow desktop window does leaves a 544px card
under the case file, entirely off the screen. The phone's bottom pin does not
fit either: a bottom-docked card needs about 70% of a 390px screen, which leaves
61px of case file to read through. The width has room for both. So a short
window docks the card to the right edge instead: full height under the header,
the stage reserving its width so the case file keeps the column beside it, and
the stage bar confined to that column so the ticket's clock, cost and projection
do not end up under the sheet. The bar pays for it by wrapping to three or four
rows in the narrower column, and it scrolls away with the case file while the
card stays. The gate is height (`max-height: 480px`) with `min-width: 481px`
only to keep out a window too narrow to hold the dock beside anything at all —
width is what this window has. A 568×320 phone used to fall between the two
sheets, being both too short for the bottom pin and too narrow for this one; it
takes the side dock now, with a 20rem sheet and a 195px case-file column.

The console itself gets exactly the phone treatment inside the card — tool above
terminal, no divider — but with two differences. The chip row is dropped: on a
320px-tall card the row costs the log a line of its own, and it is the one piece
of the console a keyboard replaces, which on its side is a wider keyboard than
the portrait one. And the floor under the console row is `8rem` rather than
`10rem`, because without the chips that is what the command line, the log's inset
and two lines of log come to. Everything the chip row would have cost goes to
the pane that needs it: at 568×320 the split leaves 54px of log and 76px of tool,
where keeping the row would have left the tool 24px. The case file folds here
too, for a different reason than on a phone: the column beside the dock is 361px
wide, and unfolded the sections run to 3,309px — one ticket that is 3,603px of
page and a column you scroll rather than read. Folded, the column is 1,191px of
headings and the page 1,486px, so the section being worked on is the one that is
open and the dock has something to sit beside.

A remote desktop is the one console that is not a log, and it needed different
room. The fake screen asked for a fixed 520px, which on a bottom-docked card left
the pane about 230px at 390×844: the top of the wallpaper, the desktop's icons,
and the taskbar — the only way into an app there — below the fold along with
whichever window was open. The tiles themselves are drawn icons rather than typed
characters: ▤, ⚙ and 🖨 are only as present as the browser's font fallback, and on
a phone whose chain missed one the desktop was a blue rectangle with no way into
an app at all. Drawn strokes render wherever the rest of the shell's icons do,
and the tile is a box around the drawing rather than a font size for it. While a machine's desktop is on
screen the card takes 82% of the phone instead of 55%, and the desktop fills the
height it is given rather than asking for its own; the column's foot and every
control's scroll margin follow the taller card, so the case file still scrolls
clear of it. The Start menu gets a ceiling and scrolls, because a menu that opens
upward off a few hundred pixels of desktop loses its first actions. A landscape
phone keeps the side dock's shape unchanged: its console pane is 143px tall, which
no desktop fits, and shrinking the screen there would show less than the scroll it
has now. `tests/ui/desktopFit.test.ts` holds the two card shares together and
refuses a pixel height in the dock.

The case file folds on the way past that card. The pinned console gives the
paperwork a strip of the screen above it — about 280px under the two-row header
on a 390×844 window — so the six sections are read through a letterbox, and
unfolded they run to 2190px. So at the same phone width each section of the case
file — the verification gate, the requester prompts, the two note books, the
close, and the abandon — becomes a `<details>` closed until the learner opens
it, its heading the whole control and a thumb's worth of height. The ticket's own
card above them keeps the subject and the report open — folding the description
would leave a learner working blind — and folds the rest of its paperwork behind
one **Ticket details** summary: the reference, severity, assignee, requester,
impact and device are one disclosure, because they are reference rather than the
call. The stage bar still names the ticket reference, so nothing leaves the
screen entirely, and the summary is a fold of the card rather than a seventh
case-file section. These are the only breakpoints the page reads in JavaScript
(`useFoldedCaseFile`, over `PHONE_LAYOUT_QUERY` and `SHORT_LAYOUT_QUERY`),
because a folded section is a different document tree rather than a different
style, and `tests/ui/workspaceNarrow.test.ts` reads both queries back out of the
stylesheet — the phone dock's and the side dock's — so the folds and the docks
cannot drift apart. The
heading text is the same in both shapes, including the two that are renamed by a
refusal, so the folded case file and the unfolded one name the same things. A
window with room never renders a fold at all: no disclosure, nothing to explain,
and no open/closed state to fall out of step with the layout.

The header gets the same treatment, because a single phone line cannot hold the
brand, five sections, and the score: before the rewrite the brand was cut
mid-word and four of the five sections sat off-screen with nothing saying so.
Below the same breakpoint the header becomes two rows — identity and score
above, the sections on a row of their own below — and the phone block redefines
`--header-height` to the floors those rows add up to, so the sticky offset, the
rail, and the docked card measure the header there rather than the desktop one.
The section row tightens its type until all five labels fit inside 360px and
keeps each label at its own width (`flex: none`, `nowrap`) instead of squeezing
it. A label that still cannot fit wraps onto a second line, so the row is never
cut at the edge and never hides a section behind a sideways scroll with no bar
to say there is one. The phone grid's second row is `minmax(3.2rem, auto)` and
the header itself is sized by `min-height`, so a wrapped line — a narrower
window, a larger browser text size — grows the header instead of painting over
the page below. `tests/ui/appShellNarrow.test.ts` holds the shape: the floors
add up to the token, the token is a minimum rather than a fixed height, and the
nav wraps instead of scrolling.

The score takes the same route. Written out, it is a chip — lifetime XP, rank,
and streak side by side — which at phone width is either a second thing fighting
the brand for the line or a number with its rank and streak dropped. Below the
same breakpoint the chip is hidden and a compact button takes its place: the
button's own label carries the XP and the rank (so a screen reader reads the
score without opening anything), and one press opens a popover with the XP, the
rank, the gap to the next tier, the streak, and the way to the Progress page. A
popover rather than a third header row, because it is a fact you check, not a
place you live in. It closes on a second press, on Escape (returning the focus
to the button), on a press outside it, on a scroll — which folds the header
under it — on a resize, and on a change of section, which is held by remembering
the route the panel was opened on rather than by an effect resetting a boolean.
The panel is anchored to the button, right-aligned and capped at
`100vw - 1.2rem`, so it never reaches past the edge; while it is open it covers
the section row, which is the one thing it costs. `tests/ui/progressPopover.test.tsx`
holds each of those closes, and `tests/ui/appShellNarrow.test.ts` holds the swap
(chip hidden, button present) and the button's hit-target floor.

Once a phone page is scrolled, the header gives that second row back: it folds
to the single compact row of identity and score, and the sections return when
the learner is back near the top. The fold is a scroll state, not a width state —
`useScrolledPast` sets `data-scrolled` on the shell and only the phone block
reads it — so the tablet header keeps its sections and the desktop header is
untouched. Two thresholds (160px in, 40px out) rather than one are what make it
stable: folding shortens the page above the content by exactly the section row,
and the browser compensates by pulling the scroll position up by the same
amount, which a single threshold would read as "back at the top" and answer by
expanding again — a fold/unfold loop on one scroll event. The compact row is the
identity row's own floor, so folding never moves the brand or the score. The
cost is named rather than hidden: while folded, the five sections are not on
screen and not in the tab order either, and they are one short scroll back. The
row is hidden by the stylesheet and never removed from the page, so the DOMthe screen reader and the tests see is the same in both states; the phone-portrait
geometry (99px expanded, 48px folded) was measured in the browser.

A phone on its side starts in the folded state. The landscape dock hangs under
the header, so at 320px tall the expanded header's second row is 51px of a screen
the console has to fit in — and the console's own floor is measured against that
window in `tests/ui/phoneLog.test.ts`. Rather than invent a third header shape,
the side-on phone gets the row the scrolled phone already folds to: identity and
score in the compact row, the sections hidden until the window is tall enough to
hold them again. The cost is the same one the scrolled fold names, paid for the
same reason: 51px of a 320px screen. `tests/ui/appShellNarrow.test.ts` holds the
rest of that shape; the dock's own geometry is measured from the token by the
phone audit.

### State management

`zustand` per-session store holds only the view model: public ticket, caller
messages, terminal lines, simulated clock, and session status. The world —
including the hidden fault — is owned by `app` services and never enters React
state, so a DevTools inspection or an accidental render cannot reveal the
answer. Components call `app` services only; no repository imports in `ui`.
React Router for routes, CSS Modules and custom properties for styling (no UI
kit) so the terminal aesthetic stays bespoke and the bundle stays small.

### Curriculum tracker

The dashboard is organised around a twenty-two-module course rather than around
features. The catalog lives in `src/domain/curriculum/modules.ts`: one entry per
module with its position in the course, a scope of scenario families, and two or
three exit requirements, each naming a counter (`moduleProgress` reads them from
an evidence object). Copy, scope and targets are written for this app; nothing
is carried over from a reference product.

Six modules are practiced in a console rather than the ticket queue: the Intune
console's modules name their tickets in `intuneTemplates`, the Azure console's in
`azureTemplates`, and those ids are also what their XP is folded from. Both
consoles publish their own scored attempts through an app reader, so the same
evidence object carries ticket work, session behaviour, device decisions and
subscription decisions without either module reaching into the other.

The algorithm drill is a fourth practice surface and deliberately not part of
this tracker: its attempts are kept in `dsa_attempts` and read only by its own
module. The rubric's categories are the desk's four-way split, and an algorithm
answer has no diagnosis, documentation, resolution or safety to add to them, so
forcing the drill into the same XP and weak-topic pipeline would put a
non-comparable number beside the ticket ones. It also asks nothing of the app
beyond its own store, so the dependency direction is unchanged.

The **language tracks** at `/languages` are a fifth practice surface on the same
terms: the lessons and drills are code in `src/modules/languages`, the read marks
and answers are in `lang_lesson_reads` and `lang_attempts`, and the app reaches
the module through one function. They are deliberately outside the curriculum
tracker for the same reason as the drill — a lesson read is not a ticket resolved,
and mixing the counts would make both numbers mean less — and outside it for one
more: the track's own picker is the progress page that belongs to that content.

Each playable module also has a **lesson**, in
`src/domain/curriculum/lessons.ts`: a couple of paragraphs on the idea, one
worked example the learner can repeat in the simulator, and where the module is
practiced. The example never names a generated ticket — the queue draws a new
variant each time — so it shows the shape of the work and the reason behind each
step instead of a walkthrough of one attempt. The lesson is data, not markup: it
is read and tested without a browser, and `loadModuleLesson` pairs it with the
module's live progress, so the page can show the exit criteria beside the
concept. `practice` is either a list of families or the job targets for the one
module judged on saved listings; routes are built in the interface, never stored
in the domain. The family list is ordered: `startModulePractice` in
`app/practiceService.ts` starts the first one, so **Practice** and the lesson
agree on where a module begins. A lesson can pin `variantId` where a random draw
could miss the requirement (Asset Management's held shelf, Computer Deployment's
failed run); the entry point then reuses an available ticket of that exact
variant or generates one, instead of opening a ticket that cannot exercise the
module. It can also ask for `arrival: 'voicemail'`: how a ticket arrived is drawn
from its seed, so the entry point steps the seed until the draw is a message,
and the stored seed still rebuilds the same recording. A queued ticket is reused
only when it matches everything the lesson asked for — a live ticket is never
opened for the one module about messages. The other families stay available as `/practice?family=…` links — the
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
- sessions and their worlds → the attempts that arrived as a message on the
  desk's voicemail, joined to their scores by session id, so a pass, a callback
  placed on the attempt, and a note written on it are the evidence module 5 is
  built on — a pass on a live ticket counts for the course, not for Voicemails
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

Every module in the course is built, so the catalog has no `planned` row today.
The status stays in the model: a module that is listed before it can be worked
carries `status: 'planned'`, no scope and no requirements, plus a note explaining
what is missing, so the course reads in order and the gap is visible rather than
implied. Only a built module can be "complete"; `nextModule` skips planned rows
when it picks the next step, so a planned module never blocks progression.

The dashboard renders the list as a single ordered list of rows. Each row's
heading is a disclosure button (`aria-expanded` / `aria-controls`) over a panel
with the requirement list, the module note and its scope XP; the next unfinished
module opens by default. XP per module is the sum of attempt XP on the families
in its scope, so a ticket can feed more than one module — the section says so in
plain text instead of implying the numbers add up to lifetime XP. A playable,
unfinished, ticket-based module also carries **Practice**, which starts its
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
  the previous DB as the backup slot. Every setting travels in that file, because
  a setting is a row rather than a second store: the per-family hint prices are
  one JSON value keyed by family id, so a price set on a family this build knows
  and a price left behind by a build that knew more both arrive intact. The
  reader keeps an id it does not recognise instead of dropping it — the Settings
  list only shows the families this build has, and the row is written back out
  whole when another price changes.
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
| Persistence | Vitest (Node + sql.js) | migrations, round-trips, resume, export/import, corruption fallback, and a per-family price list exported to a real `.sqlite` file and imported into a fresh database, including a family id the build does not know |
| Curriculum | Vitest | catalog invariants, lesson existence and scope, lesson length limits, requirement evaluation, evidence folding, seeded service view |
| Theme | Vitest | preference and schedule parsing, system and dawn-to-dusk resolution, boundary timing, cache-then-database reconciliation, first-paint parity with the domain rule, token parity between the two palettes, and the route audit: every page in both palettes, AA on the surfaces it actually renders on, geometry identical across themes |
| UI | Testing Library | ticket workspace flow, debrief and dashboard rendering, keyboard path |
| E2E | Manual script in R1 (Playwright in R2) | start → diagnose → resolve → reload → resume → export |
| Build | `tsc --noEmit`, ESLint, `vite build` | no type escape hatches, import boundaries |

Performance targets: generate a ticket in < 20 ms, apply a command in < 5 ms,
boot with 1,000 stored actions in < 1 s on a modest laptop. The DB export per
action stays under ~2 MB for Release 1 content.

**What the page is allowed to load.** `scripts/securityHeaders.ts` is the one
place the Content-Security-Policy is written, and three things read it: the dev
server, the preview server, and the build, which writes it into `dist/_headers`
so a static host applies the same policy without the config knowing which host it
is. The app calls no server of its own, so `connect-src 'self'` is the whole of
its network reach, and `object-src`, `base-uri`, `form-action` and
`frame-ancestors` are all `'none'`. Two allowances are load-bearing rather than
convenient: `'wasm-unsafe-eval'` is what lets sql.js instantiate without
`'unsafe-eval'`, and `style-src 'unsafe-inline'` is React's `style` prop, which
the dividers and progress bars use.

The inline theme script is the part that breaks quietly — a hash that stops
matching it takes the first frame's colours and nothing else — so the hash is
read out of the HTML the browser is actually given, which is why it is computed
from the build's `index.html` rather than the source file. `tests/security/`
holds three promises: a build never allows inline or evaluated script, the hash
matches the script that is actually served, and the dev server's looser policy
(React Refresh's inline preamble and its websocket) stays in the dev server.

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
