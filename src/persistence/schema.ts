export interface Migration {
  version: number
  statements: readonly string[]
}

export const SCHEMA_VERSION = 8

export const REQUIRED_TABLES: readonly string[] = [
  'actions',
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
]
