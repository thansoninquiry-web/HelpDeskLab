import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Persistence } from '../../src/persistence/database'

const database = vi.hoisted(() => ({ current: null as Persistence | null }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => {
    if (!database.current) {
      throw new Error('The test database is not ready.')
    }
    return database.current
  },
  getLocalDatabaseStatus: async () => {
    const db = database.current
    if (!db) {
      throw new Error('The test database is not ready.')
    }
    const bytes = await db.exportDatabase()
    return {
      engine: 'sqlite-wasm',
      storage: 'indexeddb',
      schemaVersion: db.schemaVersion(),
      storedBytes: bytes.byteLength,
      persistentStorage: null,
    }
  },
}))

import { openPersistence } from '../../src/persistence/database'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { IntuneTicketsPage } from '../../src/modules/intune/ui/TicketsPage'

/** The SQLite WASM build, read from disk: jsdom has no asset URL to fetch. */
function wasmBinary(): ArrayBuffer {
  const file = readFileSync(join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))
  const binary = new ArrayBuffer(file.byteLength)
  new Uint8Array(binary).set(file)
  return binary
}

beforeAll(async () => {
  database.current = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: wasmBinary(),
  })
}, 60_000)

afterAll(() => {
  database.current = null
})

describe('an Intune attempt on the console page', () => {
  it('shows the rubric split beside the score', async () => {
    render(
      <MemoryRouter>
        <IntuneTicketsPage />
      </MemoryRouter>,
    )

    // The queue is filled by the module's registration seam and does not wait
    // for the estate; opening a ticket waits for the seeded device below it.
    fireEvent.click(
      await screen.findByRole('button', { name: /Laptop reported as non-compliant/ }),
    )
    await screen.findByRole('link', { name: 'LT-2207' }, { timeout: 10_000 })

    // The read step comes first, the way the ticket's hints ask for it: the
    // console answers with the reasons the record holds.
    fireEvent.click(screen.getByRole('button', { name: 'Read the device record' }))
    expect(await screen.findByText(/Windows baseline: BitLocker is off/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check my work' })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))

    // The split the rest of the app keeps, printed in the app's own words.
    expect(await screen.findByText('By category', undefined, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByText('Diagnostic reasoning')).toBeTruthy()
    expect(screen.getByText('10 / 10')).toBeTruthy()
    expect(screen.getByText('Resolution')).toBeTruthy()
    expect(screen.getByText('75 / 75')).toBeTruthy()
    expect(screen.getByText('Safety')).toBeTruthy()
    expect(screen.getByText('15 / 15')).toBeTruthy()
    // The console records no notes and says so.
    expect(screen.getAllByText('not scored in the console')).toHaveLength(1)
  }, 60_000)
})
