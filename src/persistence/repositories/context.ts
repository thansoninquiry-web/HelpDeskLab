import type { SqliteDriver } from '../sqlite'

export interface RepositoryContext {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  /** Runs the operation in a transaction, then persists a snapshot. */
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}
