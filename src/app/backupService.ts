import type { BackupStore } from '../domain/ports'

export interface BackupFile {
  filename: string
  bytes: Uint8Array
}

export interface BackupService {
  createBackup(): Promise<BackupFile>
  restoreBackup(bytes: Uint8Array): Promise<void>
  resetDatabase(): Promise<void>
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

export function createBackupService(store: BackupStore, now: () => Date = () => new Date()): BackupService {
  return {
    async createBackup() {
      const bytes = await store.exportDatabase()
      return { filename: `helpdesklab-${timestampForFilename(now())}.sqlite`, bytes }
    },
    restoreBackup: (bytes) => store.importDatabase(bytes),
    resetDatabase: () => store.resetDatabase(),
  }
}
