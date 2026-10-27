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
import { AcademyCasePage } from '../../src/modules/academy/ui/CasePage'

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

function openVisit(scenarioId: string) {
  return render(
    <MemoryRouter initialEntries={[`/academy/cases/${scenarioId}`]}>
      <Routes>
        <Route path="academy/cases/:scenarioId" element={<AcademyCasePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function rowFor(label: string): HTMLElement {
  const labelNode = screen.getAllByText(label).find((node) => node.closest('li') !== null)
  return labelNode?.closest('li') as HTMLElement
}

/** A write leaves the page busy for a turn; a disabled button would swallow the click. */
async function clickWhenReady(button: HTMLElement): Promise<void> {
  await waitFor(() => {
    expect(button).toBeEnabled()
  })
  fireEvent.click(button)
}

async function settle(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Check my work' })).toBeEnabled()
  })
}

describe('a school visit', () => {
  it('reads the room, speaks to a Spanish-first caller and scores a clean visit at 100', async () => {
    openVisit('projector-no-signal')

    expect(
      await screen.findByRole('heading', { level: 1, name: /The projector says/i }),
    ).toBeTruthy()
    expect(screen.getByText(/I have plugged the laptop in myself/)).toBeTruthy()

    // The caller is Spanish-first; the gloss is a button, not the default.
    fireEvent.click(screen.getByRole('button', { name: 'Show English gloss' }))
    expect(screen.getByText(/Can you look at it now/)).toBeTruthy()
    await settle()

    for (const label of ['Check the cable and the input light', 'Read the projector status page']) {
      const row = rowFor(label)
      fireEvent.click(within(row).getByRole('button', { name: 'Read' }))
      await waitFor(() => {
        expect(row.getAttribute('data-done')).toBe('true')
      })
    }
    expect(screen.getByText(/it sits in the projector’s HDMI 2 socket/)).toBeTruthy()

    // The first call: greet the caller and take the fault seriously.
    await clickWhenReady(
      screen.getByRole('button', {
        name: /Buenos días, señora Vargas. Voy a mirar el cable/,
      }),
    )
    await screen.findByText(/You said/)
    await settle()
    await clickWhenReady(
      screen.getByRole('button', {
        name: /Si el cable no lo arregla, tengo un proyector de repuesto/,
      }),
    )
    await settle()

    const reseat = rowFor('Reseat the HDMI cable')
    await clickWhenReady(within(reseat).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(reseat.getAttribute('data-done')).toBe('true')
    })
    const input = rowFor('Select the right input')
    await clickWhenReady(within(input).getByRole('button', { name: 'Apply' }))

    await clickWhenReady(screen.getByRole('checkbox', { name: /Pack the kit/ }))
    await settle()
    await clickWhenReady(screen.getByRole('checkbox', { name: /Check the room before you lift/ }))
    await settle()
    fireEvent.change(screen.getByLabelText('Visit note for the next person'), {
      target: {
        value:
          'Room 3, HDMI lead half out and the projector on HDMI 1; reseated and selected HDMI 2. Ask Mrs Vargas to call if it drops again.',
      },
    })
    await clickWhenReady(screen.getByRole('button', { name: 'Save note' }))
    await settle()
    await clickWhenReady(screen.getByRole('checkbox', { name: /Book the follow-up/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check my work' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))

    expect(await screen.findByText('By category', undefined, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByText('100')).toBeTruthy()
    // Diagnosis and communication both max out at 20; both rows have to be there.
    expect(screen.getAllByText('20 / 20')).toHaveLength(2)
    expect(screen.getByText('48 / 48')).toBeTruthy()
    expect(screen.getByText('12 / 12')).toBeTruthy()
    expect(screen.getByText(/Every answer was plain, specific and honest/)).toBeTruthy()
  }, 90_000)

  it('turns a filter shortcut into an unsafe visit and names the walk-up', async () => {
    openVisit('gradebook-blocked')

    expect(
      await screen.findByRole('heading', { level: 1, name: /grade-book site is blocked/i }),
    ).toBeTruthy()

    for (const label of ['Read the web filter block log', 'Read the room timetable']) {
      const row = rowFor(label)
      fireEvent.click(within(row).getByRole('button', { name: 'Read' }))
      await waitFor(() => {
        expect(row.getAttribute('data-done')).toBe('true')
      })
    }

    // Two actions in, the walk-up arrives at the door.
    expect(await screen.findByText('Someone is at the door')).toBeTruthy()
    await clickWhenReady(
      screen.getByRole('button', { name: /Turn filtering off for the whole school/ }),
    )
    await settle()

    const shortcut = rowFor('Disable the web filter')
    await clickWhenReady(within(shortcut).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(shortcut.getAttribute('data-done')).toBe('true')
    })

    await clickWhenReady(screen.getByRole('button', { name: 'Check my work' }))
    expect(await screen.findByText('By category', undefined, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByText(/A change that makes the school less safe was made/)).toBeTruthy()
    expect(screen.getByText(/not passed/)).toBeTruthy()
    expect(
      screen.getByText(/The walk-up was never triaged|Turn filtering off for the whole school/),
    ).toBeTruthy()
  }, 90_000)
})
