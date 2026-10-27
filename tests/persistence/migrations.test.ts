// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { SchemaValidationError, SchemaVersionError } from '../../src/persistence/errors'
import { listTables, runMigrations, validateMigrations } from '../../src/persistence/migrations'
import {
  MIGRATIONS,
  REQUIRED_TABLES,
  SCHEMA_VERSION,
  type Migration,
} from '../../src/persistence/schema'
import { createSqliteDriver } from '../../src/persistence/sqlite'
import { loadWasmBinary } from '../helpers/sqlite'

async function freshDriver() {
  return createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
}

describe('runMigrations', () => {
  it('migrates a fresh database to the current schema', async () => {
    const db = await freshDriver()

    const result = runMigrations(db)

    expect(result).toEqual({ from: 0, to: SCHEMA_VERSION, applied: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    expect(db.getUserVersion()).toBe(SCHEMA_VERSION)
    expect(listTables(db)).toEqual(expect.arrayContaining([...REQUIRED_TABLES]))

    db.close()
  })

  it('upgrades a v1 database in place and keeps its data', async () => {
    const db = await freshDriver()
    const v1 = MIGRATIONS.find((migration) => migration.version === 1)
    expect(v1).toBeDefined()
    for (const statement of v1?.statements ?? []) {
      db.run(statement)
    }
    db.setUserVersion(1)
    db.run("INSERT INTO settings (key, value) VALUES ('theme', '\"light\"')")
    expect(db.getUserVersion()).toBe(1)

    const result = runMigrations(db)

    expect(result).toEqual({ from: 1, to: SCHEMA_VERSION, applied: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    expect(db.exec("SELECT value FROM settings WHERE key = 'theme'")[0]?.value).toBe('"light"')
    expect(listTables(db)).toContain('job_targets')

    db.close()
  })

  it('rebuilds the actions table on a v2 database without losing rows', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 2)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json) VALUES ('s1', 't1', 1, '{}')",
    )
    db.run(
      "INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json)\n" +
        "VALUES ('s1', 1, 1, 'command', '{\"command\":\"help\"}', '{}')",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 2, to: SCHEMA_VERSION, applied: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    expect(db.exec('SELECT id, kind FROM actions')[0]).toMatchObject({ id: 1, kind: 'command' })

    // The rebuilt CHECK allows both recorded hints and recorded denials.
    db.run(
      "INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json)\n" +
        "VALUES ('s1', 2, 2, 'hint', '{\"itemId\":\"unlock\"}', '{}')",
    )
    db.run(
      "INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json)\n" +
        "VALUES ('s1', 3, 3, 'deny-caller', '{\"reason\":\"third-party-request\"}', '{}')",
    )
    expect(db.exec('SELECT kind FROM actions ORDER BY seq').map((row) => row.kind)).toEqual([
      'command',
      'hint',
      'deny-caller',
    ])

    db.close()
  })

  it('adds the pinned hint price to a session without touching its world', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 4)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json) VALUES ('s1', 't1', 1, '{\"clock\":1}')",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 4, to: SCHEMA_VERSION, applied: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    // A session that predates the setting keeps its world and reads back as null.
    expect(db.exec('SELECT world_json, hint_policy_json FROM sessions')[0]).toMatchObject({
      world_json: '{"clock":1}',
      hint_policy_json: null,
    })

    db.close()
  })

  it('adds the close draft to a session without disturbing its pinned price', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 5)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json, hint_policy_json)\n" +
        "VALUES ('s1', 't1', 1, '{\"clock\":1}', '{\"perHint\":5,\"cap\":15,\"budget\":2}')",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 5, to: SCHEMA_VERSION, applied: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    // An attempt that predates the draft reads back with nothing half-written.
    expect(db.exec('SELECT hint_policy_json, closure_draft_json FROM sessions')[0]).toMatchObject({
      hint_policy_json: '{"perHint":5,"cap":15,"budget":2}',
      closure_draft_json: null,
    })

    db.close()
  })

  it('adds the exam mode to a session already carrying a pinned price and a draft', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 6)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json, hint_policy_json, closure_draft_json)\n" +
        "VALUES ('s1', 't1', 1, '{\"clock\":1}', '{\"perHint\":5,\"cap\":15,\"budget\":0}', '{\"code\":\"escalated-tier2\",\"note\":\"mid-close\"}')",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 6, to: SCHEMA_VERSION, applied: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    // An attempt that predates the mode is a practice attempt, and it keeps the
    // close it was writing.
    expect(db.exec('SELECT exam_mode, closure_draft_json FROM sessions')[0]).toMatchObject({
      exam_mode: 0,
      closure_draft_json: '{"code":"escalated-tier2","note":"mid-close"}',
    })

    db.close()
  })

  it('adds the remembered workspace to a session already carrying a mode and a draft', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 8)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json, closure_draft_json, exam_mode)\n" +
        "VALUES ('s1', 't1', 1, '{\"clock\":1}', '{\"code\":null,\"note\":\"mid-close\"}', 1)",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 8, to: SCHEMA_VERSION, applied: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    // An attempt that predates the layout reopens on a clean terminal, and it
    // keeps the mode and the close it was sat with.
    expect(db.exec('SELECT exam_mode, closure_draft_json, workspace_layout_json FROM sessions')[0])
      .toMatchObject({
        exam_mode: 1,
        closure_draft_json: '{"code":null,"note":"mid-close"}',
        workspace_layout_json: null,
      })

    db.close()
  })

  it('adds somewhere to remember what a console was showing, without touching the desk', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 12)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json, workspace_layout_json)\n" +
        "VALUES ('s1', 't1', 1, '{\"clock\":1}', '{\"pane\":\"tools\",\"tool\":\"directory\",\"tabs\":[\"directory\"],\"pinned\":[],\"ratio\":null}')",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 12, to: SCHEMA_VERSION, applied: [13, 14, 15, 16, 17, 18, 19] })
    // An attempt written before the focus existed reopens its console on the
    // list, and the workspace it was left in is still there beside it.
    expect(db.exec('SELECT console_focus_json, workspace_layout_json FROM sessions')[0])
      .toMatchObject({
        console_focus_json: null,
        workspace_layout_json:
          '{"pane":"tools","tool":"directory","tabs":["directory"],"pinned":[],"ratio":null}',
      })

    db.close()
  })

  it('adds a place for a hint repair to a database that already has scores', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 9)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json) VALUES ('s1', 't1', 1, '{}')",
    )
    db.run(
      "INSERT INTO scores (session_id, total, passed, band, rubric_json, computed_at)\n" +
        "VALUES ('s1', 80, 1, 'pass', '{\"items\":[],\"hintsUsed\":2}', 2)",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 9, to: SCHEMA_VERSION, applied: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] })
    // The evaluation is untouched, and the attempt starts with no repair of its own.
    expect(db.exec('SELECT total, rubric_json, hint_repair_json FROM scores')[0]).toMatchObject({
      total: 80,
      rubric_json: '{"items":[],"hintsUsed":2}',
      hint_repair_json: null,
    })

    db.close()
  })

  it('gives a logged action a wall clock without inventing one for old rows', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 10)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json) VALUES ('s1', 't1', 1, '{}')",
    )
    db.run(
      "INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json)\n" +
        "VALUES ('s1', 1, 1, 'command', '{\"command\":\"help\"}', '{}')",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 10, to: SCHEMA_VERSION, applied: [11, 12, 13, 14, 15, 16, 17, 18, 19] })
    // The step was taken before wall time was kept, so it reads as unknown
    // rather than as a time somebody guessed.
    expect(db.exec('SELECT id, at_ms, wall_ms FROM actions')[0]).toMatchObject({
      id: 1,
      at_ms: 1,
      wall_ms: null,
    })

    // A step written now carries both clocks, and they are allowed to disagree.
    db.run(
      "INSERT INTO actions (session_id, seq, at_ms, wall_ms, kind, input_json, output_json)\n" +
        "VALUES ('s1', 2, 2, 1760000000000, 'note', '{}', '{}')",
    )
    expect(db.exec('SELECT wall_ms FROM actions WHERE seq = 2')[0]?.wall_ms).toBe(1760000000000)

    db.close()
  })

  it('lets the log record a tool read without losing the rows it already had', async () => {
    const db = await freshDriver()
    for (const migration of MIGRATIONS.filter((entry) => entry.version <= 11)) {
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
    }
    db.run(
      "INSERT INTO tickets (id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status)\n" +
        "VALUES ('t1', 'PWD-01', 'account-lockout', 1, 7, 'sig', '{}', 1, 'in_progress')",
    )
    db.run(
      "INSERT INTO sessions (id, ticket_id, started_at, world_json) VALUES ('s1', 't1', 1, '{}')",
    )
    db.run(
      "INSERT INTO actions (session_id, seq, at_ms, wall_ms, kind, input_json, output_json)\n" +
        "VALUES ('s1', 1, 1, 1760000000000, 'command', '{\"command\":\"help\"}', '{}')",
    )

    const result = runMigrations(db)

    expect(result).toEqual({ from: 11, to: SCHEMA_VERSION, applied: [12, 13, 14, 15, 16, 17, 18, 19] })
    expect(db.exec('SELECT kind, wall_ms FROM actions')[0]).toMatchObject({
      kind: 'command',
      wall_ms: 1760000000000,
    })

    // The rebuilt CHECK admits the new kind, and still refuses one it never had.
    db.run(
      "INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json)\n" +
        "VALUES ('s1', 2, 2, 'console-read', '{\"consoleId\":\"directory\"}', '{\"read\":true}')",
    )
    expect(db.exec('SELECT kind FROM actions ORDER BY seq').map((row) => row.kind)).toEqual([
      'command',
      'console-read',
    ])
    expect(() =>
      db.run(
        "INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json)\n" +
          "VALUES ('s1', 3, 3, 'teleport', '{}', '{}')",
      ),
    ).toThrow()

    db.close()
  })

  it('is idempotent and keeps existing rows', async () => {
    const db = await freshDriver()
    runMigrations(db)
    db.run("INSERT INTO settings (key, value) VALUES ('theme', '\"dark\"')")

    const second = runMigrations(db)

    expect(second).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION, applied: [] })
    expect(db.exec("SELECT value FROM settings WHERE key = 'theme'")[0]?.value).toBe('"dark"')

    db.close()
  })

  it('refuses a database created by a newer app version', async () => {
    const db = await freshDriver()
    runMigrations(db)
    db.run("INSERT INTO settings (key, value) VALUES ('keep', '1')")
    db.setUserVersion(SCHEMA_VERSION + 1)

    expect(() => runMigrations(db)).toThrow(SchemaVersionError)
    expect(db.getUserVersion()).toBe(SCHEMA_VERSION + 1)
    expect(db.exec("SELECT value FROM settings WHERE key = 'keep'")[0]?.value).toBe('1')

    db.close()
  })

  it('rolls back a failing migration without leaving partial tables', async () => {
    const db = await freshDriver()
    const broken: Migration[] = [
      {
        version: 1,
        statements: [
          'CREATE TABLE probe (id TEXT PRIMARY KEY) STRICT',
          'CREATE TABLE probe (id TEXT PRIMARY KEY) STRICT',
        ],
      },
    ]

    expect(() => runMigrations(db, broken)).toThrow()

    expect(db.getUserVersion()).toBe(0)
    expect(listTables(db)).not.toContain('probe')

    db.close()
  })

  it('rejects a non-contiguous migration list', async () => {
    const db = await freshDriver()
    const gap: Migration[] = [
      { version: 1, statements: [] },
      { version: 3, statements: [] },
    ]

    expect(() => runMigrations(db, gap)).toThrow(SchemaValidationError)

    db.close()
  })

  it('validates migration version numbering explicitly', () => {
    expect(() => validateMigrations([{ version: 2, statements: [] }])).toThrow(SchemaValidationError)
    expect(() => validateMigrations([{ version: 1, statements: [] }])).not.toThrow()
  })
})
