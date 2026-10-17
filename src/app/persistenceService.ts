import { openPersistence, type Persistence } from '../persistence/database'
import { IndexedDbSnapshotStore } from '../persistence/snapshotStore'

export interface LocalDatabaseStatus {
  engine: 'sqlite-wasm'
  storage: 'indexeddb'
  schemaVersion: number
  storedBytes: number
  persistentStorage: boolean | null
}

let persistencePromise: Promise<Persistence> | null = null

/** Opens the browser database once and shares it for the session. */
export function getLocalDatabase(): Promise<Persistence> {
  if (!persistencePromise) {
    persistencePromise = openPersistence({ snapshotStore: new IndexedDbSnapshotStore() })
    persistencePromise.catch(() => {
      // Allow a later attempt to retry after a transient failure.
      persistencePromise = null
    })
  }
  return persistencePromise
}

export async function getLocalDatabaseStatus(): Promise<LocalDatabaseStatus> {
  const database = await getLocalDatabase()
  const bytes = await database.exportDatabase()

  let persistentStorage: boolean | null = null
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try {
      persistentStorage = await navigator.storage.persist()
    } catch {
      persistentStorage = null
    }
  }

  return {
    engine: 'sqlite-wasm',
    storage: 'indexeddb',
    schemaVersion: database.schemaVersion(),
    storedBytes: bytes.byteLength,
    persistentStorage,
  }
}
