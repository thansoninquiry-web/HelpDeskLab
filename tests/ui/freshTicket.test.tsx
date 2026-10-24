import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Persistence } from '../../src/persistence/database'

/**
 * A ticket opened after another one is opened fresh: no console and no pane
 * carried over from the attempt before it.
 *
 * This is the end-to-end half of a guard the service already keeps on its own —
 * a new attempt starts on the default layout — because the page could still
 * hand a fresh ticket the strip it was showing. The audit routes prove a page
 * renders over a real database; this drives two tickets through the real queue,
 * the real workspace and the real store, and reads back what the second one
 * opened on.
 */

const database = vi.hoisted(() => ({ current: null as Persistence | null }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => {
    if (!database.current) {
      throw new Error('The test database is not ready.')
    }
    return database.current
  },
}))

import { openPersistence } from '../../src/persistence/database'
import { MemorySnapshotStore } from '../../src/persistence/snapshotStore'
import { AppRoutes } from '../../src/ui/routes/AppRoutes'
import { getWorkspace, loadQueue, type TicketView } from '../../src/app/practiceService'

/** The SQLite WASM build, read from disk: jsdom has no asset URL to fetch. */
function wasmBinary(): ArrayBuffer {
  const file = readFileSync(join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))
  const binary = new ArrayBuffer(file.byteLength)
  new Uint8Array(binary).set(file)
  return binary
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/** The queue row of one ticket, found by the subject the learner reads. */
async function queueRow(ticket: TicketView): Promise<HTMLElement> {
  const subject = await screen.findByRole('heading', { level: 2, name: ticket.subject })
  const row = subject.closest('li')
  if (!row) {
    throw new Error(`No queue row for ${ticket.subject}`)
  }
  return row
}

/** Opens a queued ticket from its row, and waits for the workspace to be up. */
async function openTicket(ticket: TicketView): Promise<void> {
  const row = await queueRow(ticket)
  fireEvent.click(within(row).getByRole('button', { name: 'Open ticket' }))
  await screen.findByRole('region', { name: 'Simulated tools' })
}

/**
 * Opens a console from the header's Tools menu, which lists every console
 * whatever the card is already showing — the tool pane after the first one is
 * the console itself, not the shelf.
 */
async function openConsole(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /^Tools/ }))
  const menu = await screen.findByRole('dialog', { name: 'Tools menu' })
  fireEvent.click(within(menu).getByRole('button', { name: new RegExp(`^${name}`) }))
  await screen.findByRole('tab', { name: name })
}

let first: TicketView
let second: TicketView

beforeAll(async () => {
  database.current = await openPersistence({
    snapshotStore: new MemorySnapshotStore(),
    wasmBinary: wasmBinary(),
  })

  // The queue fills itself to five, so this seeds it through the real service.
  const queue = await loadQueue()
  const opened = queue[0]
  const other = queue.find((ticket) => ticket.id !== opened?.id && ticket.subject !== opened?.subject)
  if (!opened || !other) {
    throw new Error('The guard needs two tickets with their own subjects.')
  }
  first = opened
  second = other
})

describe('a fresh ticket', () => {
  it('opens on the terminal with no console carried over from the ticket before it', async () => {
    renderAt('/practice')

    // The first ticket is worked in, not merely opened: two consoles are open
    // and the newer one is in front when the desk goes back to the queue.
    await openTicket(first)
    await openConsole('Directory')
    await openConsole('Mail Admin')

    await waitFor(async () => {
      const layout = (await getWorkspace()).layout
      expect(layout.tabs).toEqual(['directory', 'mail-admin'])
      expect(layout.tool).toBe('mail-admin')
      expect(layout.pane).toBe('tools')
    })

    fireEvent.click(screen.getByRole('link', { name: /back to queue/i }))
    await screen.findByRole('heading', { level: 1, name: 'Practice' })

    // A different ticket, opened from its own row.
    await openTicket(second)

    // No punchline is needed here: the strip is empty, the terminal is the pane
    // in front, and no console from the previous ticket is anywhere on screen.
    const terminal = await screen.findByRole('tab', { name: 'Terminal' })
    expect(terminal).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tablist', { name: 'Open tools' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Directory|Mail Admin/ })).not.toBeInTheDocument()

    // And it is the store rather than the renderer: the new attempt's own row
    // holds the default workspace, so a reload of this ticket agrees.
    await waitFor(async () => {
      expect((await getWorkspace()).layout).toEqual({
        pane: 'terminal',
        tool: null,
        tabs: [],
        pinned: [],
        // A fresh ticket is not sized: it opens at the device's width and
        // stores none of its own until the divider is moved here.
        ratio: null,
      })
    })
  })
})
