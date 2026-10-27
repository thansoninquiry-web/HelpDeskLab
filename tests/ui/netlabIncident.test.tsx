import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
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
import { NetlabIncidentPage } from '../../src/modules/netlab/ui/IncidentPage'
import { NetlabConceptsPage } from '../../src/modules/netlab/ui/ConceptsPage'

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

function openIncident(incidentId: string) {
  return render(
    <MemoryRouter initialEntries={[`/networking/incidents/${incidentId}`]}>
      <Routes>
        <Route path="networking/incidents/:incidentId" element={<NetlabIncidentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a networking incident', () => {
  it('reads the cable fault from the console, then fixes it and scores the read', async () => {
    openIncident('one-pc-no-internet')

    expect(await screen.findByRole('heading', { level: 1, name: 'One office PC has no network' })).toBeTruthy()
    // The report is on the page; the fix is not.
    expect(screen.getByText(/It worked on Friday/)).toBeTruthy()
    expect(screen.queryByText(/patch lead is loose/)).toBeNull()

    // Read the adapter through the tool console: the console records the read.
    const input = await screen.findByLabelText('C:\\Users\\lab>')
    fireEvent.change(input, { target: { value: 'ipconfig /all' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(
      await screen.findByText(/Media disconnected/, undefined, { timeout: 10_000 }),
    ).toBeTruthy()
    expect(await screen.findByText(/Read recorded: Read the adapter and lease/)).toBeTruthy()

    // Then the switch's own port status, which is the second read the path needs.
    fireEvent.change(screen.getByLabelText('Run against'), {
      target: { value: 'sw-core' },
    })
    const switchInput = await screen.findByLabelText('sw-core#')
    fireEvent.change(switchInput, { target: { value: 'show interfaces status' } })
    fireEvent.submit(switchInput.closest('form') as HTMLFormElement)
    expect(
      await screen.findByText(/PC-STAFF-02\s+notconnect/, undefined, { timeout: 10_000 }),
    ).toBeTruthy()

    // The action bar offers several changes, so the click is made in the row that
    // names the one the evidence pointed at.
    const row = screen
      .getByText('Reseat the network cable at the wall socket')
      .closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }))
    expect(
      await screen.findByText(
        /Reseat the network cable at the wall socket/,
        undefined,
        { timeout: 10_000 },
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(await screen.findByText('By category', undefined, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getAllByText('passed', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getByText('Diagnosis')).toBeTruthy()
    expect(screen.getByText('35 / 35')).toBeTruthy()
    expect(screen.getByText('Resolution')).toBeTruthy()
    expect(screen.getByText('55 / 55')).toBeTruthy()
    expect(screen.getByText('Safety')).toBeTruthy()
    expect(screen.getByText('10 / 10')).toBeTruthy()
  }, 90_000)

  it('shows the switch CLI only the reads, and refuses configuration', async () => {
    openIncident('classroom-offline')

    const select = await screen.findByLabelText('Run against', {}, { timeout: 10_000 })
    fireEvent.change(select, { target: { value: 'sw-core' } })
    const input = await screen.findByLabelText('sw-core#')
    fireEvent.change(input, { target: { value: 'configure terminal' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(
      await screen.findByText('Configuration mode is not available in this lab.', undefined, {
        timeout: 10_000,
      }),
    ).toBeTruthy()

    const trunk = await screen.findByLabelText('sw-core#')
    fireEvent.change(trunk, { target: { value: 'show interfaces trunk' } })
    fireEvent.submit(trunk.closest('form') as HTMLFormElement)
    await waitFor(() => {
      expect(screen.getByText(/Vlans allowed on trunk/)).toBeTruthy()
    })
  }, 90_000)

  it('answers a concept question and says what the wrong option got wrong', async () => {
    render(
      <MemoryRouter initialEntries={['/networking/concepts']}>
        <NetlabConceptsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('The layers, and why order matters')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'The WAN — the provider circuit',
      }),
    )

    expect(
      await screen.findByText(/Not quite — the answer is “The LAN/, undefined, {
        timeout: 10_000,
      }),
    ).toBeTruthy()
  }, 60_000)
})
