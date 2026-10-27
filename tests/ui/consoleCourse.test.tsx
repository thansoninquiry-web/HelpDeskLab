import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
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
import { AzureCoursePage } from '../../src/modules/azure/ui/CoursePage'
import { IntuneCoursePage } from '../../src/modules/intune/ui/CoursePage'

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

/**
 * The console's course tab exists so a lesson is reachable without opening a
 * ticket first. These hold the two halves of that: the tab is in the console's
 * own navigation, and each course lists only its own console's lessons, each
 * opening the module page the dashboard would have sent a learner to.
 */
describe('the course tab in a console', () => {
  it('lists the Intune lessons and no others', async () => {
    render(
      <MemoryRouter>
        <IntuneCoursePage />
      </MemoryRouter>,
    )

    // The tab the learner presses, from the console's own navigation.
    expect(screen.getByRole('link', { name: 'Course' })).toHaveAttribute(
      'href',
      '/intune/course',
    )

    expect(await screen.findByText('Intune: Device Compliance', undefined, { timeout: 10_000 }))
      .toBeTruthy()
    expect(screen.getByText('Intune: App Deployment')).toBeTruthy()
    expect(screen.getByText('Intune: Device Lifecycle')).toBeTruthy()

    // Every row opens its lesson, in course order.
    const open = screen.getAllByRole('link', { name: 'Open lesson' })
    expect(open.map((link) => link.getAttribute('href'))).toEqual([
      '/modules/intune-compliance',
      '/modules/intune-apps',
      '/modules/intune-lifecycle',
    ])

    // The other console's lessons are not this console's course.
    expect(screen.queryByText('Azure: Compute and Cost')).toBeNull()
  }, 60_000)

  it('lists the Azure lessons and no others', async () => {
    render(
      <MemoryRouter>
        <AzureCoursePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Course' })).toHaveAttribute(
      'href',
      '/azure/course',
    )

    expect(
      await screen.findByText('Azure: Compute and Cost', undefined, { timeout: 10_000 }),
    ).toBeTruthy()
    expect(screen.getByText('Azure: Network Exposure')).toBeTruthy()
    expect(screen.getByText('Azure: Storage and Access')).toBeTruthy()

    const open = screen.getAllByRole('link', { name: 'Open lesson' })
    expect(open.map((link) => link.getAttribute('href'))).toEqual([
      '/modules/azure-compute',
      '/modules/azure-network',
      '/modules/azure-access',
    ])

    expect(screen.queryByText('Intune: Device Compliance')).toBeNull()
  }, 60_000)
})
