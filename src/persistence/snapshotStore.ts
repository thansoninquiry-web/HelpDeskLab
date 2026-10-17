import type { SnapshotStore } from '../domain/ports'

const DEFAULT_DATABASE_NAME = 'helpdesklab'
const DEFAULT_STORE_NAME = 'snapshots'
const LIVE_KEY = 'live'
const BACKUP_KEY = 'backup'

export interface IndexedDbSnapshotStoreOptions {
  databaseName?: string
  storeName?: string
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  return null
}

/** Stores the SQLite file as one live snapshot plus one pre-migration backup. */
export class IndexedDbSnapshotStore implements SnapshotStore {
  readonly databaseName: string
  private readonly storeName: string
  private databasePromise: Promise<IDBDatabase> | null = null

  constructor(options: IndexedDbSnapshotStoreOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is not available in this environment'))
          return
        }

        const request = indexedDB.open(this.databaseName, 1)

        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(this.storeName)) {
            database.createObjectStore(this.storeName)
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'))
        request.onblocked = () =>
          reject(new Error('IndexedDB upgrade is blocked by another open tab'))
      })
    }
    return this.databasePromise
  }

  private async read(key: string): Promise<Uint8Array | null> {
    const database = await this.open()
    return new Promise<Uint8Array | null>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readonly')
      const request = transaction.objectStore(this.storeName).get(key)
      request.onsuccess = () => resolve(toBytes(request.result))
      request.onerror = () => reject(request.error ?? new Error('Could not read the snapshot'))
    })
  }

  private async write(key: string, bytes: Uint8Array): Promise<void> {
    const database = await this.open()
    const copy = new Uint8Array(bytes)
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite')
      transaction.objectStore(this.storeName).put(copy, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not write the snapshot'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Snapshot write was aborted'))
    })
  }

  load(): Promise<Uint8Array | null> {
    return this.read(LIVE_KEY)
  }

  save(bytes: Uint8Array): Promise<void> {
    return this.write(LIVE_KEY, bytes)
  }

  saveBackup(bytes: Uint8Array): Promise<void> {
    return this.write(BACKUP_KEY, bytes)
  }

  loadBackup(): Promise<Uint8Array | null> {
    return this.read(BACKUP_KEY)
  }

  /** Removes only the live snapshot; the backup slot is kept for recovery. */
  async clear(): Promise<void> {
    const database = await this.open()
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, 'readwrite')
      transaction.objectStore(this.storeName).delete(LIVE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear the snapshot'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Clear was aborted'))
    })
  }
}

/** Deterministic store for tests and non-browser environments. */
export class MemorySnapshotStore implements SnapshotStore {
  private live: Uint8Array | null = null
  private backup: Uint8Array | null = null

  load(): Promise<Uint8Array | null> {
    return Promise.resolve(this.live ? new Uint8Array(this.live) : null)
  }

  save(bytes: Uint8Array): Promise<void> {
    this.live = new Uint8Array(bytes)
    return Promise.resolve()
  }

  saveBackup(bytes: Uint8Array): Promise<void> {
    this.backup = new Uint8Array(bytes)
    return Promise.resolve()
  }

  loadBackup(): Promise<Uint8Array | null> {
    return Promise.resolve(this.backup ? new Uint8Array(this.backup) : null)
  }

  clear(): Promise<void> {
    this.live = null
    return Promise.resolve()
  }
}
