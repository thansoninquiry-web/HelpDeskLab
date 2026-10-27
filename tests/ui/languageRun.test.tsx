import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { JAVA_TRACK } from '../../src/modules/languages/data/java'
import { LanguageRunPage } from '../../src/modules/languages/ui/RunPage'

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

function renderRun() {
  return render(
    <MemoryRouter initialEntries={['/languages/java/run']}>
      <Routes>
        <Route path="languages/:trackId/run" element={<LanguageRunPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a drill run', () => {
  it('asks the track one question at a time and keeps the tally', async () => {
    renderRun()

    // The run starts on the first drill, with the keys explained.
    expect(
      await screen.findByText(/Press 1 to .* to pick an answer/, undefined, { timeout: 10_000 }),
    ).toBeTruthy()
    expect(screen.getAllByText(JAVA_TRACK.practice[0]?.title ?? '').length).toBeGreaterThan(0)

    // A number key picks an answer without the mouse; Enter would check it.
    fireEvent.keyDown(window, { key: '1' })
    await waitFor(() => {
      expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    })
    // The chip that carries the key is drawn beside the answer it picked.
    expect(document.querySelector('[aria-pressed="true"]')?.textContent).toMatch(/^1/)

    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByText('Rule to remember', undefined, { timeout: 10_000 })).toBeTruthy()

    // Every remaining question is answered the same way, so the run reaches its
    // end however the seeded answers fall.
    for (let index = 1; index < JAVA_TRACK.practice.length; index += 1) {
      // Every step but the last moves on; the last one closes the run, which the
      // click below the loop does.
      fireEvent.click(screen.getByRole('button', { name: /Next question/ }))
      await screen.findByText(/Press 1 to .* to pick an answer/, undefined, { timeout: 10_000 })
      fireEvent.keyDown(window, { key: '2' })
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
      await screen.findByText('Rule to remember', undefined, { timeout: 10_000 })
    }

    fireEvent.click(screen.getByRole('button', { name: 'See the results' }))

    // The summary counts the run and names each question it asked.
    expect(await screen.findByRole('heading', { name: 'Run finished' })).toBeTruthy()
    const badge = screen.getByText(new RegExp(`^\\d of ${JAVA_TRACK.practice.length}$`))
    expect(badge).toBeTruthy()
    expect(
      screen.getByRole('link', { name: new RegExp(`^1\\. ${JAVA_TRACK.practice[0]?.title}`) }),
    ).toHaveAttribute('href', `/languages/java/practice/${JAVA_TRACK.practice[0]?.id}`)

    // It can be taken again without leaving the page.
    fireEvent.click(screen.getByRole('button', { name: 'Run it again' }))
    await waitFor(() => {
      expect(screen.getByText(/Press 1 to .* to pick an answer/)).toBeTruthy()
    })
  }, 60_000)
})
