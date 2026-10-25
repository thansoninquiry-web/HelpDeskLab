export interface Migration {
  version: number
  statements: readonly string[]
}

export const SCHEMA_VERSION = 17

export const REQUIRED_TABLES: readonly string[] = [
  'actions',
  'azure_attempts',
  'azure_events',
  'azure_nsg_rules',
  'azure_resource_groups',
  'azure_resources',
  'azure_role_assignments',
  'dsa_attempts',
  'dsa_drafts',
  'lang_attempts',
  'lang_lesson_reads',
  'intune_apps',
  'intune_attempts',
  'intune_device_apps',
  'intune_devices',
  'intune_events',
  'intune_policies',
  'intune_users',
  'job_targets',
  'scenario_stats',
  'scores',
  'sessions',
  'settings',
  'tickets',
]

const TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
    seed INTEGER NOT NULL,
    signature TEXT NOT NULL,
    public_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'in_progress', 'completed'))
  ) STRICT`,
  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    world_json TEXT NOT NULL,
    resolution TEXT,
    outcome TEXT CHECK (outcome IS NULL OR outcome IN ('resolved', 'abandoned')),
    CHECK (ended_at IS NULL OR outcome IS NOT NULL),
    CHECK (outcome IS NULL OR resolution IS NOT NULL)
  ) STRICT`,
  `CREATE TABLE actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL CHECK (seq >= 1),
    at_ms INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('command', 'ask-user', 'verify-caller', 'note')),
    input_json TEXT NOT NULL,
    output_json TEXT NOT NULL,
    UNIQUE (session_id, seq)
  ) STRICT`,
  `CREATE TABLE scores (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    total INTEGER NOT NULL CHECK (total BETWEEN 0 AND 100),
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    band TEXT NOT NULL CHECK (band IN ('fail', 'pass', 'strong')),
    rubric_json TEXT NOT NULL,
    computed_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE scenario_stats (
    scenario_id TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    passes INTEGER NOT NULL DEFAULT 0 CHECK (passes >= 0),
    best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100),
    last_played_at INTEGER,
    leitner_box INTEGER NOT NULL DEFAULT 1 CHECK (leitner_box BETWEEN 1 AND 5),
    due_at INTEGER
  ) STRICT`,
  `CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT`,
]

const INDEX_STATEMENTS: readonly string[] = [
  'CREATE INDEX idx_sessions_ticket ON sessions(ticket_id)',
  'CREATE INDEX idx_tickets_created_at ON tickets(created_at)',
  'CREATE INDEX idx_scenario_stats_due_at ON scenario_stats(due_at)',
]

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [...TABLE_STATEMENTS, ...INDEX_STATEMENTS],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE job_targets (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        applied_on TEXT,
        status TEXT NOT NULL CHECK (status IN ('researching', 'applied', 'interviewing', 'offer', 'closed')),
        raw_description TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT`,
      'CREATE INDEX idx_job_targets_created_at ON job_targets(created_at DESC)',
    ],
  },
  {
    version: 3,
    // SQLite cannot alter a CHECK constraint, so the table is rebuilt. Ids and
    // sequence numbers are copied unchanged; nothing else about a row moves.
    statements: [
      `CREATE TABLE actions_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL CHECK (seq >= 1),
        at_ms INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('command', 'ask-user', 'verify-caller', 'note', 'hint')),
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        UNIQUE (session_id, seq)
      ) STRICT`,
      `INSERT INTO actions_v3 (id, session_id, seq, at_ms, kind, input_json, output_json)
       SELECT id, session_id, seq, at_ms, kind, input_json, output_json FROM actions`,
      'DROP TABLE actions',
      'ALTER TABLE actions_v3 RENAME TO actions',
    ],
  },
  {
    version: 4,
    // The deny action is its own kind, and a CHECK cannot be altered in place.
    // Ids and sequence numbers are copied unchanged, as in the v3 rebuild.
    statements: [
      `CREATE TABLE actions_v4 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL CHECK (seq >= 1),
        at_ms INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('command', 'ask-user', 'verify-caller', 'deny-caller', 'note', 'hint')),
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        UNIQUE (session_id, seq)
      ) STRICT`,
      `INSERT INTO actions_v4 (id, session_id, seq, at_ms, kind, input_json, output_json)
       SELECT id, session_id, seq, at_ms, kind, input_json, output_json FROM actions`,
      'DROP TABLE actions',
      'ALTER TABLE actions_v4 RENAME TO actions',
    ],
  },
  {
    version: 5,
    // The hint price is pinned when an attempt starts, so a later change in
    // Settings cannot re-price an attempt already in flight. NULL means the row
    // predates the setting and is read back as the standard price.
    statements: ['ALTER TABLE sessions ADD COLUMN hint_policy_json TEXT'],
  },
  {
    version: 6,
    // The close a learner is half-way through belongs to the attempt, not to the
    // page: the chosen code and the handoff note are pinned here so a reload
    // restores them. A closed session clears the column; its decision is in
    // `resolution` and its note in the action log.
    statements: ['ALTER TABLE sessions ADD COLUMN closure_draft_json TEXT'],
  },
  {
    version: 7,
    // An exam attempt withholds hints until it is scored, and the workspace has
    // to keep them withheld after a reload, so the mode belongs to the attempt
    // rather than to the page. 0 is every attempt written before the mode.
    statements: ['ALTER TABLE sessions ADD COLUMN exam_mode INTEGER NOT NULL DEFAULT 0'],
  },
  {
    version: 8,
    // A rewind drops the tail of an attempt's log, which means the log has to be
    // able to say so: `rewind` marks the cut. `code-sent` exists for the same
    // feature from the other side — a code going out changes the world, and
    // without it recorded the log could not be folded back into the world. A
    // CHECK cannot be altered in place, so the table is rebuilt as in v3 and v4.
    statements: [
      `CREATE TABLE actions_v8 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL CHECK (seq >= 1),
        at_ms INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('command', 'ask-user', 'verify-caller', 'deny-caller', 'note', 'hint', 'code-sent', 'rewind')),
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        UNIQUE (session_id, seq)
      ) STRICT`,
      `INSERT INTO actions_v8 (id, session_id, seq, at_ms, kind, input_json, output_json)
       SELECT id, session_id, seq, at_ms, kind, input_json, output_json FROM actions`,
      'DROP TABLE actions',
      'ALTER TABLE actions_v8 RENAME TO actions',
    ],
  },
  {
    version: 9,
    // Where the learner was working belongs to the attempt, not to the page: the
    // console in front and the tabs open beside it are pinned here so a reopened
    // ticket lands back in the tool that was being worked in. A closed session
    // clears the column, because a finished ticket has no workspace to return to.
    statements: ['ALTER TABLE sessions ADD COLUMN workspace_layout_json TEXT'],
  },
  {
    version: 10,
    // A restore can keep a score and lose the action rows behind it, and the
    // debrief then knows how many hint rungs were charged without knowing which
    // ones. The repair a learner makes — those rungs priced again from the
    // attempt's own policy — lives beside the score rather than inside it, so the
    // evaluation a debrief reports is never rewritten by a later act. NULL means
    // no repair, which is every score until one is made.
    statements: ['ALTER TABLE scores ADD COLUMN hint_repair_json TEXT'],
  },
  {
    version: 11,
    // `at_ms` is the simulated call clock, which only moves when a command runs,
    // so it cannot say how long the desk has been quiet. The caller's stall
    // ladder is measured in wall time since the learner last acted, so each step
    // keeps both clocks: `wall_ms` is when it was appended, `at_ms` is where it
    // sits in the call. NULL means the row predates the column, and reads as the
    // attempt's start.
    statements: ['ALTER TABLE actions ADD COLUMN wall_ms INTEGER'],
  },
  {
    version: 12,
    // Opening a tool or reading one of its records is the learner acting on the
    // call, and the caller has to be able to hear it — the console row that ran a
    // command was already in the log, but looking at a record was not. A CHECK
    // cannot be altered in place, so the table is rebuilt as in v3, v4 and v8,
    // this time carrying the wall clock added in v11.
    statements: [
      `CREATE TABLE actions_v12 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL CHECK (seq >= 1),
        at_ms INTEGER NOT NULL,
        wall_ms INTEGER,
        kind TEXT NOT NULL CHECK (kind IN ('command', 'ask-user', 'verify-caller', 'deny-caller', 'note', 'hint', 'code-sent', 'rewind', 'console-read')),
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        UNIQUE (session_id, seq)
      ) STRICT`,
      `INSERT INTO actions_v12 (id, session_id, seq, at_ms, wall_ms, kind, input_json, output_json)
       SELECT id, session_id, seq, at_ms, wall_ms, kind, input_json, output_json FROM actions`,
      'DROP TABLE actions',
      'ALTER TABLE actions_v12 RENAME TO actions',
    ],
  },
  {
    version: 13,
    // Where the learner was *inside* the console in front — the search typed and
    // the record opened — belongs to the attempt beside the pane and the tabs, so
    // a reopened ticket lands back on the machine rather than on a bare list.
    // NULL means no console was worked in, and the column is cleared when the
    // session closes, like the workspace layout.
    statements: ['ALTER TABLE sessions ADD COLUMN console_focus_json TEXT'],
  },
  {
    version: 14,
    // The Intune simulator keeps its own estate, deliberately in its own tables:
    // the module is meant to be lifted out whole, and nothing here references the
    // ticket tables. `intune_` prefixes every one so the owner is obvious from a
    // schema dump, and the estate is seeded from `src/modules/intune` rather than
    // from SQL, so one file describes both the shapes and the starting state.
    statements: [
      `CREATE TABLE intune_users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        upn TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        job_title TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        group_id TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE intune_policies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('Windows', 'mobile')),
        rules_json TEXT NOT NULL,
        grace_days INTEGER NOT NULL CHECK (grace_days >= 0)
      ) STRICT`,
      `CREATE TABLE intune_apps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        publisher TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('Windows', 'iOS', 'Android', 'all')),
        assignment_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE intune_devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_user_id TEXT REFERENCES intune_users(id) ON DELETE SET NULL,
        platform TEXT NOT NULL CHECK (platform IN ('Windows', 'iOS', 'Android')),
        os_version TEXT NOT NULL,
        enrolled_at INTEGER NOT NULL,
        last_check_in INTEGER,
        lifecycle TEXT NOT NULL CHECK (lifecycle IN ('managed', 'retired', 'wiped')),
        group_id TEXT,
        bitlocker INTEGER NOT NULL CHECK (bitlocker IN (0, 1)),
        passcode_set INTEGER NOT NULL CHECK (passcode_set IN (0, 1)),
        encrypted INTEGER NOT NULL CHECK (encrypted IN (0, 1)),
        lost INTEGER NOT NULL CHECK (lost IN (0, 1)),
        policy_stale INTEGER NOT NULL CHECK (policy_stale IN (0, 1)),
        non_compliance_since INTEGER,
        compliance TEXT NOT NULL CHECK (compliance IN ('compliant', 'non-compliant', 'in-grace', 'not-evaluated')),
        reasons_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE intune_device_apps (
        device_id TEXT NOT NULL REFERENCES intune_devices(id) ON DELETE CASCADE,
        app_id TEXT NOT NULL REFERENCES intune_apps(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('installed', 'pending', 'failed', 'not-installed')),
        last_attempt INTEGER,
        PRIMARY KEY (device_id, app_id)
      ) STRICT`,
      `CREATE TABLE intune_events (
        id INTEGER PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES intune_devices(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        at_ms INTEGER NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'refused', 'failed')),
        summary TEXT NOT NULL,
        notes_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE intune_attempts (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
        score_json TEXT
      ) STRICT`,
      'CREATE INDEX idx_intune_events_device ON intune_events(device_id, at_ms)',
      'CREATE INDEX idx_intune_attempts_template ON intune_attempts(template_id)',
    ],
  },
  {
    version: 15,
    // The Azure console is the second simulator and keeps the same bargain as
    // the first: its estate lives in its own `azure_` tables, seeded from
    // `src/modules/azure`, so the folder can be lifted out without a migration
    // elsewhere. Events and attempts carry no foreign key on purpose: deleting a
    // machine or a whole resource group is an action the console offers, and the
    // audit trail has to survive the resource it describes.
    statements: [
      `CREATE TABLE azure_resource_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        region TEXT NOT NULL CHECK (region IN ('uksouth', 'ukwest', 'westeurope')),
        owner_team TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE azure_resources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        resource_group_id TEXT NOT NULL REFERENCES azure_resource_groups(id) ON DELETE CASCADE,
        region TEXT NOT NULL CHECK (region IN ('uksouth', 'ukwest', 'westeurope')),
        kind TEXT NOT NULL CHECK (kind IN ('vm', 'storage', 'nsg', 'webapp')),
        properties_json TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
      ) STRICT`,
      `CREATE TABLE azure_nsg_rules (
        id TEXT PRIMARY KEY,
        nsg_id TEXT NOT NULL REFERENCES azure_resources(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        priority INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        access TEXT NOT NULL CHECK (access IN ('allow', 'deny')),
        protocol TEXT NOT NULL CHECK (protocol IN ('TCP', 'UDP', 'Any')),
        port INTEGER,
        source TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE azure_role_assignments (
        id TEXT PRIMARY KEY,
        principal TEXT NOT NULL,
        principal_label TEXT NOT NULL,
        scope TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('Reader', 'Contributor', 'Owner'))
      ) STRICT`,
      `CREATE TABLE azure_events (
        id INTEGER PRIMARY KEY,
        resource_id TEXT NOT NULL,
        action TEXT NOT NULL,
        at_ms INTEGER NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'refused', 'failed')),
        summary TEXT NOT NULL,
        notes_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE azure_attempts (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
        score_json TEXT
      ) STRICT`,
      'CREATE INDEX idx_azure_events_resource ON azure_events(resource_id, at_ms)',
      'CREATE INDEX idx_azure_attempts_template ON azure_attempts(template_id)',
    ],
  },
  {
    version: 16,
    // The DSA drill keeps only what the learner did: the answers they submitted
    // and the code they wrote out by hand. The problems themselves stay in
    // `src/modules/dsa`, so editing the bank is a code change with no migration.
    statements: [
      `CREATE TABLE dsa_attempts (
        id TEXT PRIMARY KEY,
        problem_id TEXT NOT NULL,
        pattern_choice TEXT NOT NULL,
        edge_choice TEXT NOT NULL,
        solved INTEGER NOT NULL CHECK (solved IN (0, 1)),
        hints_used INTEGER NOT NULL CHECK (hints_used >= 0),
        code TEXT,
        created_at INTEGER NOT NULL
      ) STRICT`,
      `CREATE TABLE dsa_drafts (
        problem_id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT`,
      'CREATE INDEX idx_dsa_attempts_problem ON dsa_attempts(problem_id, created_at)',
    ],
  },
  {
    version: 17,
    // The language tracks keep what the learner did, not what they read from:
    // an answer per attempt and a mark per lesson. The lessons and the questions
    // are code in `src/modules/languages`, so adding a track needs no migration.
    statements: [
      `CREATE TABLE lang_attempts (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL CHECK (track_id IN ('java', 'csharp', 'python')),
        item_id TEXT NOT NULL,
        choice TEXT NOT NULL,
        correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
        created_at INTEGER NOT NULL
      ) STRICT`,
      `CREATE TABLE lang_lesson_reads (
        track_id TEXT NOT NULL CHECK (track_id IN ('java', 'csharp', 'python')),
        lesson_id TEXT NOT NULL,
        read_at INTEGER NOT NULL,
        PRIMARY KEY (track_id, lesson_id)
      ) STRICT`,
      'CREATE INDEX idx_lang_attempts_item ON lang_attempts(track_id, item_id, created_at)',
    ],
  },
]
