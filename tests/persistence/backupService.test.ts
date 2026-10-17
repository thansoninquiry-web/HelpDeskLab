// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createBackupService } from '../../src/app/backupService'
import type { BackupStore } from '../../src/domain/ports'

function makeStore(overrides: Partial<BackupStore> = {}): BackupStore {
  return {
    exportDatabase: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    importDatabase: vi.fn().mockResolvedValue(undefined),
    resetDatabase: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('createBackupService', () => {
  it('names backups from the injected clock', async () => {
    const service = createBackupService(
      makeStore(),
      () => new Date('2026-10-16T12:34:56.789Z'),
    )

    const backup = await service.createBackup()

    expect(backup.filename).toBe('helpdesklab-2026-10-16T12-34-56-789Z.sqlite')
    expect(Array.from(backup.bytes)).toEqual([1, 2, 3])
  })

  it('delegates restore and reset to the store', async () => {
    const importDatabase = vi.fn().mockResolvedValue(undefined)
    const resetDatabase = vi.fn().mockResolvedValue(undefined)
    const service = createBackupService(makeStore({ importDatabase, resetDatabase }))

    await service.restoreBackup(new Uint8Array([4]))
    await service.resetDatabase()

    expect(importDatabase).toHaveBeenCalledWith(new Uint8Array([4]))
    expect(resetDatabase).toHaveBeenCalledTimes(1)
  })
})
