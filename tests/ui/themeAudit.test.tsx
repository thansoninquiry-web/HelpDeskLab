import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Persistence } from '../../src/persistence/database'
import {
  contrastFailures,
  declarationsFor,
  declaredPairs,
  INTERACTION_STATES,
  isAppearanceProperty,
  loadThemeAudit,
  pairForElement,
  pairForState,
  prepareRules,
  themeGeometryDrift,
  undeclaredTokens,
  type InteractionState,
  type Palette,
  type RuleIndex,
  type TextSurfacePair,
} from '../helpers/themeAudit'
import appShellStyles from '../../src/ui/components/AppShell.module.css'
import fakeDesktopStyles from '../../src/ui/components/FakeDesktop.module.css'
import pageHeaderStyles from '../../src/ui/components/PageHeader.module.css'
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
import languageStyles from '../../src/modules/languages/ui/languages.module.css'

/**
 * The theme audit: every route, in both themes, plus the palette itself.
 *
 * The build runs this with the rest of the suite, so a colour that stops being
 * readable, or a rule that only holds in one theme, fails `npm run check` rather
 * than being spotted by eye months later.
 *
 * The pages are the real ones, reading the real services and a real in-memory
 * SQLite database, so the audit sees what a learner sees: a generated queue, an
 * open attempt, a finished debrief, and the Settings form over a live database.
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
import { saveThemePreference } from '../../src/app/themeService'

type Theme = 'dark' | 'light'

const THEMES: readonly Theme[] = ['dark', 'light']

/** The module objects the components import, so their class names can be read. */
const MODULES = {
  'src/ui/components/AppShell.module.css': appShellStyles,
  'src/ui/components/FakeDesktop.module.css': fakeDesktopStyles,
  'src/ui/components/PageHeader.module.css': pageHeaderStyles,
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
  'src/modules/languages/ui/languages.module.css': languageStyles,
}

interface RouteCase {
  name: string
  path: string
  /** Text that only appears once the page's data has loaded. */
  ready?: string
}

let routes: RouteCase[] = []

/** What one render leaves behind, for the per-route checks below. */
interface Inspection {
  heading: string | null
  hasMain: boolean
  /** Inline styles, sorted, so two renders can be compared. */
  inlineStyles: string[]
  /** Inline styles that name a colour, which would bypass the palette. */
  inlineColours: string[]
  pairs: TextSurfacePair[]
  /** Every non-colour declaration that applied, by element path. */
  geometry: string[]
  /** Text pairs checked in each interactive state. */
  statePairs: Record<InteractionState, number>
}

const COLOUR_IN_STYLE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|(?:^|;)\s*(?:color|background(?:-color)?)\s*:/i

function hasOwnText(element: Element): boolean {
  for (const node of [...element.childNodes]) {
    if (node.nodeType === 3 && (node.textContent ?? '').trim().length > 0) {
      return true
    }
  }
  return false
}

/**
 * Walks the rendered page the way a browser would: resolves the declarations of
 * every element, collects the text-on-surface pair it produces, and records any
 * declaration that is not appearance, so the two themes can be compared.
 */
function inspect(theme: Theme, index: RuleIndex, palette: Palette): Inspection {
  const pairs: TextSurfacePair[] = []
  const geometry: string[] = []
  const statePairs = Object.fromEntries(
    INTERACTION_STATES.map((state) => [state, 0]),
  ) as Record<InteractionState, number>

  const walk = (element: Element, path: string) => {
    const declarations = declarationsFor(element, theme, index)
    for (const [property, value] of declarations) {
      if (!isAppearanceProperty(property)) {
        geometry.push(`${path} ${property}=${value}`)
      }
    }

    const tag = element.tagName.toLowerCase()
    if (hasOwnText(element) && !['script', 'style', 'title'].includes(tag)) {
      const pair = pairForElement(element, palette)
      if (pair) {
        pairs.push({ ...pair, where: `${path} ${pair.where}` })
      }

      // The same text while hovered, focused, or disabled. Each state is a
      // separate pair, so a hover colour cannot hide behind a passing resting one.
      for (const state of INTERACTION_STATES) {
        const statePair = pairForState(element, palette, theme, index, state)
        if (statePair) {
          pairs.push({ ...statePair, where: `${path} ${statePair.where}` })
          statePairs[state] += 1
        }
      }
    }

    const children = [...element.children]
    children.forEach((child, childIndex) => {
      walk(child, `${path}>${child.tagName.toLowerCase()}:${childIndex}`)
    })
  }

  walk(document.body, 'body')

  const styled = [...document.querySelectorAll('[style]')]
  const inlineStyles = styled
    .map((element) => element.getAttribute('style') ?? '')
    .filter((style) => style.trim().length > 0)
    .sort()

  return {
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    hasMain: document.querySelector('main') !== null,
    inlineStyles,
    inlineColours: inlineStyles.filter((style) => COLOUR_IN_STYLE.test(style)),
    pairs,
    geometry,
    statePairs,
  }
}

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/** The renders are compared across themes, so they are kept side by side. */
const inspections = new Map<string, Inspection[]>()

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

  // A queue, one finished attempt for the debrief, and one open attempt for the
  // workspace, so those two routes render their real panels.
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
  // Two steps and a cut, so the audit sees the log's step gutter and the marker
  // a rewind leaves behind, not just an empty terminal.
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
    { name: 'intune tickets', path: '/intune/tickets', ready: 'Choose a ticket to open it.' },
    // The Azure console seeds its own subscription, on the same terms.
    { name: 'azure inventory', path: '/azure', ready: '13 of 13 resources' },
    { name: 'azure resource', path: '/azure/resources/res-nsg-jump', ready: 'Findings' },
    { name: 'azure network', path: '/azure/network', ready: 'nsg-web-prod' },
    { name: 'azure access', path: '/azure/access', ready: 'Rowan Vale (contractor)' },
    { name: 'azure tickets', path: '/azure/tickets', ready: 'Choose a ticket to open it.' },
    // The algorithm drill reads its bank from code and its progress from SQLite.
    { name: 'dsa library', path: '/dsa', ready: 'Unsolved only' },
    { name: 'dsa pattern sheet', path: '/dsa/patterns', ready: 'The input is sorted' },
    { name: 'dsa problem', path: '/dsa/pair-sum-sorted', ready: 'What to notice first' },
    // The language tracks: three tracks, a lesson, and a drill whose result
    // panel is revealed by an answer, so the audit sees the quiet form first.
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
    { name: 'not found', path: '/no-such-route' },
  ]
}, 60_000)

afterAll(() => {
  database.current = null
})

describe('every route, in both themes', () => {
  const audit = loadThemeAudit()
  const index = prepareRules(audit, MODULES)

  for (const theme of THEMES) {
    it(`keeps the text readable and the geometry still in ${theme}`, async () => {
      await saveThemePreference(theme)

      const problems: string[] = []
      const seen: Inspection[] = []

      for (const route of routes) {
        const { unmount } = renderRoute(route.path)

        try {
          await screen.findByRole('heading', { level: 1 }, { timeout: 10_000 })
          if (route.ready) {
            await screen.findByText(route.ready, undefined, { timeout: 10_000 })
          }
          await waitFor(() => {
            expect(document.documentElement.dataset.theme).toBe(theme)
          })

          const inspection = inspect(theme, index, audit[theme])
          if (!inspection.hasMain) {
            problems.push(`${route.name}: no main landmark`)
          }
          if (inspection.inlineColours.length > 0) {
            problems.push(`${route.name}: inline colour in ${inspection.inlineColours.join(' / ')}`)
          }
          for (const failure of contrastFailures(inspection.pairs, audit[theme])) {
            problems.push(
              `${route.name}: ${failure.pair.text} on ${failure.pair.surface} is ${failure.ratio.toFixed(2)}:1 at ${failure.pair.where}`,
            )
          }
          seen.push(inspection)
        } catch (caught) {
          problems.push(
            `${route.name}: ${caught instanceof Error ? caught.message.split('\n')[0] : String(caught)}`,
          )
        } finally {
          unmount()
        }
      }

      inspections.set(theme, seen)
      expect(problems, `${theme} theme`).toEqual([])
      expect(seen).toHaveLength(routes.length)

      // A matcher that stops finding rules would report no problems at all, so
      // each route has to yield text it actually checked.
      const thin = seen
        .map((inspection, index) => ({ name: routes[index]?.name, pairs: inspection.pairs.length }))
        .filter((entry) => entry.pairs < 3)
      expect(thin, `${theme} theme: routes with too few text pairs`).toEqual([])

      // Each interactive state has to be reached by the pass, or a missing
      // state would look like a clean audit.
      for (const state of INTERACTION_STATES) {
        const checked = seen.reduce((total, inspection) => total + inspection.statePairs[state], 0)
        expect(checked, `${theme} theme: no ${state} pairs checked`).toBeGreaterThan(0)
      }
    }, 180_000)
  }

  it('keeps the terminal dark inside the light workspace', () => {
    const light = inspections.get('light') ?? []
    const workspace = light[routes.findIndex((route) => route.name === 'workspace')]
    expect(workspace).toBeDefined()

    const isDark = (colour: { r: number; g: number; b: number }) =>
      colour.r + colour.g + colour.b < 90

    // The command prompt sits on the terminal's sunken bar, which the scoped
    // terminal tokens re-point even though the workspace is on white paper.
    const terminal = workspace?.pairs.filter(
      (pair) =>
        pair.surface.includes('--surface-sunken') &&
        pair.surfaceColour !== undefined &&
        isDark(pair.surfaceColour),
    )
    expect(terminal?.length ?? 0).toBeGreaterThan(0)

    // Elsewhere the same token is still the light workspace's own sunken bar.
    const elsewhere = workspace?.pairs.filter(
      (pair) =>
        pair.surface.includes('--surface-sunken') &&
        pair.surfaceColour !== undefined &&
        !isDark(pair.surfaceColour),
    )
    expect(elsewhere?.length ?? 0).toBeGreaterThan(0)
  })

  it('checks a page worth of text in both themes', () => {
    const darkPairs = (inspections.get('dark') ?? []).reduce(
      (total, inspection) => total + inspection.pairs.length,
      0,
    )
    const lightPairs = (inspections.get('light') ?? []).reduce(
      (total, inspection) => total + inspection.pairs.length,
      0,
    )

    expect(darkPairs).toBeGreaterThan(200)
    expect(lightPairs).toBeGreaterThan(200)
  })

  it('lays every route out identically in both themes', () => {
    const dark = inspections.get('dark') ?? []
    const light = inspections.get('light') ?? []

    expect(dark).toHaveLength(routes.length)
    expect(light).toHaveLength(routes.length)

    const differences = routes.flatMap((route, routeIndex) => {
      const first = dark[routeIndex]
      const second = light[routeIndex]
      if (!first || !second) {
        return [`${route.name}: missing a render`]
      }

      const lines: string[] = []
      if (first.inlineStyles.join(' | ') !== second.inlineStyles.join(' | ')) {
        lines.push(
          `${route.name}: inline styles ${first.inlineStyles.join(' | ')} became ${second.inlineStyles.join(' | ')}`,
        )
      }

      const onlyDark = first.geometry.filter((entry) => !second.geometry.includes(entry))
      const onlyLight = second.geometry.filter((entry) => !first.geometry.includes(entry))
      if (onlyDark.length > 0 || onlyLight.length > 0) {
        lines.push(
          `${route.name}: geometry differs (dark only: ${onlyDark.slice(0, 4).join('; ') || 'none'} · light only: ${onlyLight.slice(0, 4).join('; ') || 'none'})`,
        )
      }

      return lines
    })

    expect(differences).toEqual([])
  })
})

describe('the palette', () => {
  const audit = loadThemeAudit()
  const pairs = declaredPairs(audit)

  it('finds the pairings it is meant to check', () => {
    expect(pairs.length).toBeGreaterThan(20)
    expect(audit.rules.length).toBeGreaterThan(100)
  })

  for (const theme of THEMES) {
    it(`keeps a declared text and surface pair at AA in ${theme}`, () => {
      const failures = contrastFailures(
        pairs.map((pair) => ({ ...pair, where: pair.from })),
        audit[theme],
      ).map(
        (failure) =>
          `${failure.pair.text} on ${failure.pair.surface} is ${failure.ratio.toFixed(2)}:1 (${failure.pair.where})`,
      )

      expect(failures).toEqual([])
    })
  }

  it('lets a theme block change appearance only, never geometry', () => {
    const drift = themeGeometryDrift(audit).map(
      (entry) => `${entry.rule.file} → ${entry.rule.selector}: ${entry.property}`,
    )

    expect(drift).toEqual([])
  })

  it('never asks for a token the palette does not declare', () => {
    const missing = undeclaredTokens(audit).map(
      (reference) => `${reference.token} in ${reference.file}`,
    )

    expect(missing).toEqual([])
  })
})
