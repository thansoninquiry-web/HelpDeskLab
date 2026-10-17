// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { SchemaValidationError, SchemaVersionError } from '../../src/persistence/errors'
import { listTables, runMigrations, validateMigrations } from '../../src/persistence/migrations'
import { REQUIRED_TABLES, SCHEMA_VERSION, type Migration } from '../../src/persistence/schema'
import { createSqliteDriver } from '../../src/persistence/sqlite'
import { loadWasmBinary } from '../helpers/sqlite'

async function freshDriver() {
  return createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
}

describe('runMigrations', () => {
  it('migrates a fresh database to the current schema', async () => {
    const db = await freshDriver()

    const result = runMigrations(db)

    expect(result).toEqual({ from: 0, to: SCHEMA_VERSION, applied: [1] })
    expect(db.getUserVersion()).toBe(SCHEMA_VERSION)
    expect(listTables(db)).toEqual(expect.arrayContaining([...REQUIRED_TABLES]))

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
