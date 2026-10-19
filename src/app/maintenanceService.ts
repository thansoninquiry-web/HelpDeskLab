import { createBackupService, type BackupFile } from './backupService'
import { getLocalDatabase } from './persistenceService'
import { clearActiveAttempt } from './practiceService'

async function backupService() {
  return createBackupService(await getLocalDatabase())
}

/** Snapshot of the live SQLite database, ready to save as a file. */
export async function exportBackupFile(): Promise<BackupFile> {
  return (await backupService()).createBackup()
}

/**
 * Replaces the live database with an uploaded file. The current database is
 * kept in the snapshot backup slot by the persistence layer.
 */
export async function importBackupBytes(bytes: Uint8Array): Promise<void> {
  await (await backupService()).restoreBackup(bytes)
  clearActiveAttempt()
}

/** Starts a fresh database; the pre-reset file stays in the backup slot. */
export async function resetLocalDatabase(): Promise<void> {
  await (await backupService()).resetDatabase()
  clearActiveAttempt()
}
