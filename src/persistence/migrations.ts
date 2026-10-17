import { SchemaValidationError, SchemaVersionError } from './errors'
import { MIGRATIONS, REQUIRED_TABLES, type Migration } from './schema'
import type { SqliteDriver } from './sqlite'

export interface MigrationResult {
  from: number
  to: number
  applied: number[]
}

export function validateMigrations(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new SchemaValidationError(
        `Migration list is not contiguous: expected version ${index + 1}, found ${migration.version}`,
      )
    }
  })
}

export function listTables(db: SqliteDriver): string[] {
  return db
    .exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")
    .map((row) => String(row.name))
}

export function validateSchema(db: SqliteDriver, requiredTables = REQUIRED_TABLES): void {
  const tables = new Set(listTables(db))
  const missing = requiredTables.filter((table) => !tables.has(table))
  if (missing.length > 0) {
    throw new SchemaValidationError(`Database is missing required tables: ${missing.join(', ')}`)
  }
}

/**
 * Applies pending migrations in one transaction. Never mutates a database that
 * is newer than this app understands, and never leaves a half-migrated file.
 */
export function runMigrations(
  db: SqliteDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationResult {
  validateMigrations(migrations)

  const from = db.getUserVersion()
  const latest = migrations.length

  if (from > latest) {
    throw new SchemaVersionError(
      `Database schema v${from} is newer than this app supports (v${latest}). ` +
        'Open it with a newer version of HelpDeskLab or import a compatible backup.',
    )
  }

  if (from === latest) {
    validateSchema(db)
    return { from, to: from, applied: [] }
  }

  const applied: number[] = []
  db.transaction(() => {
    for (const migration of migrations) {
      if (migration.version <= from) {
        continue
      }
      for (const statement of migration.statements) {
        db.run(statement)
      }
      db.setUserVersion(migration.version)
      applied.push(migration.version)
    }
  })

  validateSchema(db)
  return { from, to: latest, applied }
}
