import type {
  ActionRepository,
  BackupStore,
  JobTargetRepository,
  ProgressRepository,
  ScoreRepository,
  SessionRepository,
  SettingsRepository,
  SnapshotStore,
  TicketRepository,
} from '../domain/ports'
import { AzureStore } from '../modules/azure/persistence/store'
import { DsaStore } from '../modules/dsa/persistence/store'
import { IntuneStore } from '../modules/intune/persistence/store'
import { LanguageStore } from '../modules/languages/persistence/store'
import { ImportError, PersistenceError } from './errors'
import { runMigrations } from './migrations'
import { createRepositories } from './repositories'
import type { RepositoryContext } from './repositories/context'
import { SCHEMA_VERSION } from './schema'
import { SQLITE_HEADER, createSqliteDriver, type SqliteDriver } from './sqlite'

/** Refuse to load unreasonable files instead of exhausting memory. */
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024

export interface Persistence {
  tickets: TicketRepository
  sessions: SessionRepository
  actions: ActionRepository
  scores: ScoreRepository
  progress: ProgressRepository
  settings: SettingsRepository
  targets: JobTargetRepository
  /**
   * The Intune simulator's tables. It is handed the same read/write context as
   * the repositories so its writes go through the one transaction queue and pick
   * up the snapshot save, but its SQL and its model stay inside the module.
   */
  intune: IntuneStore
  /**
   * The Azure simulator's tables, on the same terms as the Intune console: the
   * module's SQL and model stay inside its folder, but its writes share the one
   * transaction queue and the snapshot save.
   */
  azure: AzureStore
  /**
   * The DSA drill's own two tables. It keeps only attempts and drafts; the bank
   * itself is code, so the module owns its data without owning a schema.
   */
  dsa: DsaStore
  /**
   * The language tracks' two tables: one answer per practice attempt and one
   * mark per lesson read. The lessons and questions are code, so a new track is
   * a content change rather than a schema change.
   */
  languages: LanguageStore
  schemaVersion(): number
  exportDatabase(): Promise<Uint8Array>
  importDatabase(bytes: Uint8Array): Promise<void>
  resetDatabase(): Promise<void>
  close(): Promise<void>
}

export interface OpenPersistenceOptions {
  snapshotStore: SnapshotStore
  wasmBinary?: ArrayBuffer
}

function assertSqliteFile(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new ImportError('The selected file is empty.')
  }
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new ImportError(
      `The selected file is larger than ${Math.floor(MAX_IMPORT_BYTES / (1024 * 1024))} MB.`,
    )
  }
  let header = ''
  for (const byte of bytes.subarray(0, 16)) {
    header += String.fromCharCode(byte)
  }
  if (header !== SQLITE_HEADER) {
    throw new ImportError('The selected file is not a SQLite database.')
  }
}

export class SqlitePersistence implements Persistence, BackupStore {
  private db: SqliteDriver
  private readonly snapshotStore: SnapshotStore
  private readonly wasmBinary: ArrayBuffer | undefined
  private tail: Promise<void> = Promise.resolve()

  readonly tickets: TicketRepository
  readonly sessions: SessionRepository
  readonly actions: ActionRepository
  readonly scores: ScoreRepository
  readonly progress: ProgressRepository
  readonly settings: SettingsRepository
  readonly targets: JobTargetRepository
  readonly intune: IntuneStore
  readonly azure: AzureStore
  readonly dsa: DsaStore
  readonly languages: LanguageStore

  constructor(db: SqliteDriver, snapshotStore: SnapshotStore, wasmBinary?: ArrayBuffer) {
    this.db = db
    this.snapshotStore = snapshotStore
    this.wasmBinary = wasmBinary

    const context: RepositoryContext = {
      read: (operation) => this.read(operation),
      write: (operation) => this.write(operation),
    }
    const repositories = createRepositories(context)
    this.tickets = repositories.tickets
    this.sessions = repositories.sessions
    this.actions = repositories.actions
    this.scores = repositories.scores
    this.progress = repositories.progress
    this.settings = repositories.settings
    this.targets = repositories.targets
    this.intune = new IntuneStore(context)
    this.azure = new AzureStore(context)
    this.dsa = new DsaStore(context)
    this.languages = new LanguageStore(context)
  }

  schemaVersion(): number {
    return this.db.getUserVersion()
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private read<T>(operation: (db: SqliteDriver) => T): Promise<T> {
    return this.enqueue(async () => operation(this.db))
  }

  private write<T>(operation: (db: SqliteDriver) => T): Promise<T> {
    return this.enqueue(async () => {
      const value = this.db.transaction(() => operation(this.db))
      await this.snapshotStore.save(this.db.export())
      return value
    })
  }

  exportDatabase(): Promise<Uint8Array> {
    return this.enqueue(async () => this.db.export())
  }

  async importDatabase(bytes: Uint8Array): Promise<void> {
    assertSqliteFile(bytes)

    const candidate = await createSqliteDriver(bytes, { wasmBinary: this.wasmBinary })
    let adopted = false

    try {
      // Migrates older files and rejects files from a newer app version.
      runMigrations(candidate)
      const candidateBytes = candidate.export()

      await this.enqueue(async () => {
        // Keep the current database as the pre-import backup before swapping.
        await this.snapshotStore.saveBackup(this.db.export())
        await this.snapshotStore.save(candidateBytes)
        const previous = this.db
        this.db = candidate
        previous.close()
      })

      adopted = true
    } catch (error) {
      if (!adopted) {
        candidate.close()
      }
      if (error instanceof PersistenceError) {
        throw error
      }
      throw new ImportError('The selected file could not be imported.', { cause: error })
    }
  }

  async resetDatabase(): Promise<void> {
    const fresh = await createSqliteDriver(undefined, { wasmBinary: this.wasmBinary })
    let adopted = false

    try {
      runMigrations(fresh)
      const freshBytes = fresh.export()

      await this.enqueue(async () => {
        // Keep the pre-reset file in the backup slot so a reset is recoverable.
        await this.snapshotStore.saveBackup(this.db.export())
        await this.snapshotStore.clear()
        await this.snapshotStore.save(freshBytes)
        const previous = this.db
        this.db = fresh
        previous.close()
      })

      adopted = true
    } finally {
      if (!adopted) {
        fresh.close()
      }
    }
  }

  async close(): Promise<void> {
    await this.tail
    this.db.close()
  }
}

export async function openPersistence(options: OpenPersistenceOptions): Promise<Persistence> {
  const stored = await options.snapshotStore.load()
  const db = await createSqliteDriver(stored ?? undefined, { wasmBinary: options.wasmBinary })

  try {
    if (stored && db.getUserVersion() < SCHEMA_VERSION) {
      // Preserve the pre-migration file before touching the schema.
      await options.snapshotStore.saveBackup(stored)
    }

    const result = runMigrations(db)

    if (!stored || result.applied.length > 0) {
      await options.snapshotStore.save(db.export())
    }

    return new SqlitePersistence(db, options.snapshotStore, options.wasmBinary)
  } catch (error) {
    db.close()
    throw error
  }
}
