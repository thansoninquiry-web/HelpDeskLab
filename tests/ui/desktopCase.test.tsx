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
import { DesktopCasePage } from '../../src/modules/desktop/ui/CasePage'

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

function openCase(caseId: string) {
  return render(
    <MemoryRouter initialEntries={[`/desktop/cases/${caseId}`]}>
      <Routes>
        <Route path="desktop/cases/:caseId" element={<DesktopCasePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a desktop case', () => {
  it('tests a part, backs the data up, ticks the checklist and scores a clean attempt', async () => {
    openCase('cmos-clock-reset')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'The clock resets every morning' }),
    ).toBeTruthy()
    // The report is on the page; the fix is not.
    expect(screen.getByText(/Every morning it tells me the date is 2011/)).toBeTruthy()

    // The diagram is the action surface: a part is selected and tested by name.
    fireEvent.click(await screen.findByRole('button', { name: /^CMOS battery/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Test cmos battery' }))
    expect(
      await screen.findByText(/CMOS battery: 2.41 V/, undefined, { timeout: 10_000 }),
    ).toBeTruthy()
    expect(
      await screen.findByText(/Read recorded: Check the CMOS battery voltage/),
    ).toBeTruthy()

    // The other two reads the reference path uses, through the same buttons.
    fireEvent.click(screen.getByRole('button', { name: 'Watch the power-on self test' }))
    await screen.findByText(/Read recorded: Watch the power-on self test/)
    fireEvent.click(screen.getByRole('button', { name: 'Read Event Viewer' }))
    await screen.findByText(/Read recorded: Read Event Viewer/)

    // Back the data up before the change, then identify the user.
    fireEvent.click(screen.getByRole('checkbox', { name: /Back up the data first/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Verify the user and the machine/ }))

    // Replace the cell from the action bar, the way the desk would. The part panel
    // offers the same change, so the row is picked by its list item.
    const row = screen
      .getAllByText('Replace the CMOS battery')
      .map((label) => label.closest('li'))
      .find((element): element is HTMLLIElement => element !== null) as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check my work' })).toBeEnabled()
    })

    // The note is the documentation step: too short is not saved.
    fireEvent.change(screen.getByLabelText('Note for the next person'), {
      target: { value: 'Clock resetting every cold start; CMOS cell read 2.41 V and was replaced.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Book the follow-up/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(await screen.findByText('By category', undefined, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.getByText('Diagnosis')).toBeTruthy()
    expect(screen.getByText('25 / 25')).toBeTruthy()
    expect(screen.getByText('Documentation')).toBeTruthy()
    expect(screen.getByText('20 / 20')).toBeTruthy()
    expect(screen.getByText('Resolution')).toBeTruthy()
    expect(screen.getByText('40 / 40')).toBeTruthy()
    expect(screen.getByText('Safety')).toBeTruthy()
    expect(screen.getByText('15 / 15')).toBeTruthy()
  }, 90_000)

  it('fails a drive replacement made before the data was backed up', async () => {
    openCase('failing-drive')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'The laptop takes ten minutes to start' }),
    ).toBeTruthy()

    const row = screen
      .getAllByText('Replace the failing drive')
      .map((label) => label.closest('li'))
      .find((element): element is HTMLLIElement => element !== null) as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check my work' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))

    expect(await screen.findByText('By category', undefined, { timeout: 10_000 })).toBeTruthy()
    expect(
      screen.getByText(/The data was put at risk before it was backed up/, { exact: false }),
    ).toBeTruthy()
    expect(screen.getByText(/not passed/)).toBeTruthy()
  }, 90_000)
})
