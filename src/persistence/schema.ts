export interface Migration {
  version: number
  statements: readonly string[]
}

export const SCHEMA_VERSION = 1

export const REQUIRED_TABLES: readonly string[] = [
  'actions',
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
]
