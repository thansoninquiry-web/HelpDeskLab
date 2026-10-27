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
import { AzureTerminalPage } from '../../src/modules/azure/ui/TerminalPage'
import { IntuneTerminalPage } from '../../src/modules/intune/ui/TerminalPage'

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

/** Types a command and presses the form's Run, the way Enter does. */
function type(prompt: string, command: string) {
  const input = screen.getByLabelText(prompt)
  fireEvent.change(input, { target: { value: command } })
  const form = input.closest('form')
  if (!form) {
    throw new Error('The console has no form to submit.')
  }
  fireEvent.submit(form)
}

describe('a terminal in a console', () => {
  it('reads the Intune estate and runs one safe action through the service', async () => {
    render(
      <MemoryRouter>
        <IntuneTerminalPage />
      </MemoryRouter>,
    )

    // The shell is a tab of the console, beside the pages and the tickets.
    expect(screen.getByRole('link', { name: 'Terminal' })).toHaveAttribute(
      'href',
      '/intune/terminal',
    )
    await screen.findByText(/the simulated estate, typed rather than clicked/i)

    type('PS>', 'Get-Devices')
    expect(await screen.findByText('15 devices.', undefined, { timeout: 10_000 })).toBeTruthy()

    // Reading a record in the shell is the step the attempt is scored on, so it
    // says the read was kept.
    type('PS>', 'Get-Device LT-2207')
    expect(
      await screen.findByText(/Read recorded against this attempt/, undefined, { timeout: 10_000 }),
    ).toBeTruthy()

    // An action typed here runs through the same service as the action bar.
    type('PS>', 'Sync-Device LT-2207')
    expect(
      await screen.findByText('LT-2207 checked in', undefined, { timeout: 10_000 }),
    ).toBeTruthy()

    // The destructive verbs are not the shell's to run.
    type('PS>', 'Wipe-Device LT-2207')
    expect(await screen.findByText(/not available in the shell/)).toBeTruthy()
  }, 60_000)

  it('reads the Azure subscription and runs one safe action through the service', async () => {
    render(
      <MemoryRouter>
        <AzureTerminalPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Terminal' })).toHaveAttribute(
      'href',
      '/azure/terminal',
    )
    await screen.findByText(/the simulated subscription, typed rather than clicked/i)

    type('az>', 'az resource list')
    expect(await screen.findByText('13 resources.', undefined, { timeout: 10_000 })).toBeTruthy()

    type('az>', 'az resource show --name stharbourapps')
    expect(
      await screen.findByText(/^Public blob access\s+enabled$/, undefined, { timeout: 10_000 }),
    ).toBeTruthy()
    expect(screen.getByText(/Read recorded against this attempt/)).toBeTruthy()

    type('az>', 'az vm deallocate --name vm-app-01')
    await waitFor(() => {
      expect(screen.getByText('vm-app-01 deallocated')).toBeTruthy()
    })

    type('az>', 'az vm delete --name vm-app-01')
    expect(await screen.findByText(/not available in the shell/)).toBeTruthy()
  }, 60_000)
})
