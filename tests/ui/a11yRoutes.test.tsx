import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Persistence } from '../../src/persistence/database'
import { loadThemeAudit, prepareRules } from '../helpers/themeAudit'
import {
  hiddenInputFocusGaps,
  layoutTokens,
  readUiStylesheets,
  screenReaderGaps,
  targetAudit,
} from '../helpers/a11yAudit'
import appShellStyles from '../../src/ui/components/AppShell.module.css'
import fakeDesktopStyles from '../../src/ui/components/FakeDesktop.module.css'
import pageHeaderStyles from '../../src/ui/components/PageHeader.module.css'
import commandConsoleStyles from '../../src/ui/components/CommandConsole.module.css'
import toolConsoleStyles from '../../src/ui/components/ToolConsole.module.css'
import toolPickerStyles from '../../src/ui/components/ToolPicker.module.css'
import topologyMapStyles from '../../src/ui/components/TopologyMap.module.css'
import pagesStyles from '../../src/ui/routes/pages.module.css'
import practiceStyles from '../../src/ui/routes/practice.module.css'
import targetsStyles from '../../src/ui/routes/targets.module.css'
import workspaceStyles from '../../src/ui/routes/workspace.module.css'
import azureStyles from '../../src/modules/azure/ui/azure.module.css'
import intuneStyles from '../../src/modules/intune/ui/intune.module.css'
import dsaStyles from '../../src/modules/dsa/ui/dsa.module.css'
import netlabStyles from '../../src/modules/netlab/ui/netlab.module.css'
import desktopStyles from '../../src/modules/desktop/ui/desktop.module.css'
import academyStyles from '../../src/modules/academy/ui/academy.module.css'
import tutorialStyles from '../../src/modules/shared/TutorialPage.module.css'

/**
 * The rendered half of the accessibility audit: the labels a screen reader
 * reads, the size of the targets a pointer meets, and the ring on a control
 * that is hidden from sight.
 *
 * It renders the real pages over a real in-memory database, the same way the
 * theme audit does, so the audit sees a generated queue, an open attempt and a
 * finished debrief rather than empty shells. One theme is enough: the theme
 * audit proves that no `[data-theme]` block may change geometry, which is the
 * only thing target size depends on.
 */

const database = vi.hoisted(() => ({ current: null as Persistence | null }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => {
    if (!database.current) {
      throw new Error('The audit database is not ready.')
    }
    return database.current
  },
  getLocalDatabaseStatus: async () => {
    const db = database.current
    if (!db) {
      throw new Error('The audit database is not ready.')
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
import { AppRoutes } from '../../src/ui/routes/AppRoutes'
import {
  createTickets,
  loadQueue,
  resolveAttempt,
  rewindAttempt,
  startAttempt,
  submitCommand,
} from '../../src/app/practiceService'

const MODULES = {
  'src/ui/components/AppShell.module.css': appShellStyles,
  'src/ui/components/FakeDesktop.module.css': fakeDesktopStyles,
  'src/ui/components/PageHeader.module.css': pageHeaderStyles,
  'src/ui/components/CommandConsole.module.css': commandConsoleStyles,
  'src/ui/components/ToolConsole.module.css': toolConsoleStyles,
  'src/ui/components/ToolPicker.module.css': toolPickerStyles,
  'src/ui/components/TopologyMap.module.css': topologyMapStyles,
  'src/ui/routes/pages.module.css': pagesStyles,
  'src/ui/routes/practice.module.css': practiceStyles,
  'src/ui/routes/targets.module.css': targetsStyles,
  'src/ui/routes/workspace.module.css': workspaceStyles,
  'src/modules/azure/ui/azure.module.css': azureStyles,
  'src/modules/intune/ui/intune.module.css': intuneStyles,
  'src/modules/dsa/ui/dsa.module.css': dsaStyles,
  'src/modules/netlab/ui/netlab.module.css': netlabStyles,
  'src/modules/desktop/ui/desktop.module.css': desktopStyles,
  'src/modules/academy/ui/academy.module.css': academyStyles,
  'src/modules/shared/TutorialPage.module.css': tutorialStyles,
}

interface RouteCase {
  name: string
  path: string
  /** Text that only appears once the page's data has loaded. */
  ready?: string
}

let routes: RouteCase[] = []

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

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

  await createTickets(2)
  const queue = await loadQueue()
  const first = queue[0]
  const second = queue[1]
  if (!first || !second) {
    throw new Error('The audit needs at least two queued tickets.')
  }

  const finished = await startAttempt(first.id)
  await resolveAttempt({ code: 'resolved-remote', note: 'Audit seed.' })
  const open = await startAttempt(second.id)
  await submitCommand('help')
  await submitCommand('whoami')
  await rewindAttempt(2)

  routes = [
    { name: 'dashboard', path: '/' },
    { name: 'practice', path: '/practice' },
    { name: 'workspace', path: `/ticket/${open.sessionId}` },
    { name: 'debrief', path: `/debrief/${finished.sessionId}` },
    { name: 'lesson', path: '/modules/first-shift' },
    { name: 'job targets', path: '/targets' },
    { name: 'progress', path: '/progress' },
    { name: 'settings', path: '/settings' },
    // The Intune console seeds its own tables on first open, so its list pages
    // show their heading before any row exists: `ready` is a seeded string that
    // only a loaded estate can render.
    { name: 'intune devices', path: '/intune', ready: '15 of 15 devices' },
    { name: 'intune device', path: '/intune/devices/dev-lt-2207', ready: 'Compliance' },
    { name: 'intune policies', path: '/intune/policies', ready: 'Windows baseline' },
    { name: 'intune apps', path: '/intune/apps', ready: 'Northgate Portal' },
    { name: 'intune course', path: '/intune/course', ready: 'Intune: Device Compliance' },
    { name: 'intune tickets', path: '/intune/tickets', ready: 'Choose a ticket to open it.' },
    {
      name: 'intune terminal',
      path: '/intune/terminal',
      ready: 'Type help for every command. Nothing destructive can be run from here.',
    },
    // The Azure console seeds its own subscription, on the same terms.
    { name: 'azure inventory', path: '/azure', ready: '13 of 13 resources' },
    { name: 'azure resource', path: '/azure/resources/res-nsg-jump', ready: 'Findings' },
    { name: 'azure network', path: '/azure/network', ready: 'nsg-web-prod' },
    { name: 'azure access', path: '/azure/access', ready: 'Rowan Vale (contractor)' },
    { name: 'azure course', path: '/azure/course', ready: 'Azure: Compute and Cost' },
    { name: 'azure tickets', path: '/azure/tickets', ready: 'Choose a ticket to open it.' },
    {
      name: 'azure terminal',
      path: '/azure/terminal',
      ready: 'Type help for every command. Nothing destructive can be run from here.',
    },
    // The language tracks read their lessons from code and their marks from
    // SQLite, so `ready` is text only a rendered page can show.
    { name: 'language tracks', path: '/languages', ready: 'JDK 21, no framework' },
    { name: 'language track', path: '/languages/java', ready: 'What this track leaves you able to do' },
    {
      name: 'language lesson',
      path: '/languages/java/lessons/wrappers-and-equality',
      ready: 'Remember this',
    },
    {
      name: 'language drill',
      path: '/languages/java/practice/boxing-comparison',
      ready: 'Check answer',
    },
    { name: 'language run', path: '/languages/java/run', ready: 'Check answer' },
    // The algorithm drill reads its bank from code and its progress from SQLite.
    { name: 'dsa library', path: '/dsa', ready: 'Unsolved only' },
    { name: 'dsa pattern sheet', path: '/dsa/patterns', ready: 'The input is sorted' },
    { name: 'dsa problem', path: '/dsa/pair-sum-sorted', ready: 'What to notice first' },
    // The networking lab: a topology of links, an incident workspace with a
    // console and an action bar, and the concept cards with their quiz.
    { name: 'networking topology', path: '/networking', ready: 'VLAN 10 · Staff' },
    {
      name: 'networking incidents',
      path: '/networking/incidents',
      ready: 'One office PC has no network',
    },
    {
      name: 'networking incident',
      path: '/networking/incidents/one-pc-no-internet',
      ready: 'Read the equipment',
    },
    {
      name: 'networking device',
      path: '/networking/devices/sw-core',
      ready: 'show interfaces status',
    },
    { name: 'networking concepts', path: '/networking/concepts', ready: 'LAN, WAN and WLAN' },
    { name: 'networking tools', path: '/networking/tools', ready: 'ipconfig /all' },
    // The desktop bench: a case queue, a machine with a clickable diagram and a
    // checklist, and the bench and tool references.
    { name: 'desktop cases', path: '/desktop', ready: 'The office PC is completely dead' },
    {
      name: 'desktop case',
      path: '/desktop/cases/cmos-clock-reset',
      ready: 'Do the right thing',
    },
    {
      name: 'desktop case without a diagram',
      path: '/desktop/cases/outlook-profile-corrupt',
      ready: 'Reads that isolate it',
    },
    { name: 'desktop bench', path: '/desktop/bench', ready: 'Legacy mode · Windows 7' },
    { name: 'desktop tools', path: '/desktop/tools', ready: 'System File Checker' },
    // The Education IT pack: the desk, a visit mid-conversation, the onsite
    // checklist and the phrasebook.
    { name: 'academy desk', path: '/academy', ready: 'Who calls' },
    {
      name: 'academy visit',
      path: '/academy/cases/projector-no-signal',
      ready: 'Read the room',
    },
    { name: 'academy onsite checklist', path: '/academy/onsite', ready: 'Pack for the visit' },
    { name: 'academy phrases', path: '/academy/phrases', ready: 'Spanish for the school desk' },
    { name: 'networking tutorial', path: '/networking/tutorial', ready: 'Before you start' },
    { name: 'desktop tutorial', path: '/desktop/tutorial', ready: 'Before you start' },
    { name: 'academy tutorial', path: '/academy/tutorial', ready: 'Before you start' },
    { name: 'not found', path: '/no-such-route' },
  ]
}, 60_000)

afterAll(() => {
  database.current = null
})

describe('every rendered route', () => {
  const audit = loadThemeAudit()
  const index = prepareRules(audit, MODULES)
  const tokens = layoutTokens(readUiStylesheets())

  it('measures a real set of targets, so a clean pass is not a blind one', () => {
    expect(tokens.get('--root-font-size')).toBe('calc(16px * var(--ui-scale))')
    expect(tokens.get('--ui-scale')).toBeDefined()
  })

  it('names every control and wires every reference', async () => {
    const problems: string[] = []

    for (const route of routes) {
      const { unmount } = renderRoute(route.path)
      try {
        await screen.findByRole('heading', { level: 1 }, { timeout: 10_000 })
        if (route.ready) {
          await screen.findByText(route.ready, undefined, { timeout: 10_000 })
        }
        problems.push(...screenReaderGaps(document.body).map((gap) => `${route.name}: ${gap}`))
      } catch (caught) {
        problems.push(
          `${route.name}: ${caught instanceof Error ? caught.message.split('\n')[0] : String(caught)}`,
        )
      } finally {
        unmount()
      }
    }

    expect(problems).toEqual([])
  }, 180_000)

  it('gives every target enough room to be hit', async () => {
    const problems: string[] = []
    const unmeasured: string[] = []
    let measured = 0

    for (const route of routes) {
      const { unmount } = renderRoute(route.path)
      try {
        await screen.findByRole('heading', { level: 1 }, { timeout: 10_000 })
        if (route.ready) {
          await screen.findByText(route.ready, undefined, { timeout: 10_000 })
        }
        const result = targetAudit(document.body, 'dark', index, tokens)
        problems.push(...result.gaps.map((gap) => `${route.name}: ${gap}`))
        unmeasured.push(...result.unmeasured.map((element) => `${route.name}: ${element}`))
        measured += result.measured
      } catch (caught) {
        problems.push(
          `${route.name}: ${caught instanceof Error ? caught.message.split('\n')[0] : String(caught)}`,
        )
      } finally {
        unmount()
      }
    }

    expect(problems).toEqual([])
    expect(unmeasured).toEqual([])
    // Fourteen routes, and only a handful of controls on the smallest of them.
    expect(measured).toBeGreaterThan(150)
  }, 180_000)

  it('paints the focus ring on the tile around a control hidden from sight', async () => {
    const problems: string[] = []

    for (const route of routes) {
      const { unmount } = renderRoute(route.path)
      try {
        await screen.findByRole('heading', { level: 1 }, { timeout: 10_000 })
        if (route.ready) {
          await screen.findByText(route.ready, undefined, { timeout: 10_000 })
        }
        problems.push(
          ...hiddenInputFocusGaps(document.body, 'dark', index, audit.rules).map(
            (gap) => `${route.name}: ${gap}`,
          ),
        )
      } catch (caught) {
        problems.push(
          `${route.name}: ${caught instanceof Error ? caught.message.split('\n')[0] : String(caught)}`,
        )
      } finally {
        unmount()
      }
    }

    expect(problems).toEqual([])
  }, 180_000)
})

/**
 * The check behind that last pass, exercised on a control built by hand: a
 * matcher that stopped recognising an ancestor lift would otherwise report a
 * clean audit of every route.
 */
describe('the ring on a control hidden from sight', () => {
  const audit = loadThemeAudit()
  const index = prepareRules(audit, MODULES)

  it('reports a hidden control whose label paints nothing, and clears one that does', () => {
    const host = document.createElement('div')
    host.innerHTML = `<label class="${pagesStyles.fileLabel}"><input class="${pagesStyles.fileInput}" type="file" aria-label="Probe" /></label>`
    document.body.append(host)

    try {
      const withoutLift = audit.rules.filter((rule) => !rule.selector.includes(':focus-within'))
      const gaps = hiddenInputFocusGaps(host, 'dark', index, withoutLift)
      expect(gaps).toHaveLength(1)
      expect(gaps[0]).toContain('"Probe"')
      expect(gaps[0]).toContain('hidden from sight, so its focus ring needs an ancestor rule')

      expect(hiddenInputFocusGaps(host, 'dark', index, audit.rules)).toEqual([])
    } finally {
      host.remove()
    }
  })
})
