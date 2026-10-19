import {
  describeTerminalSurface,
  describeTheme,
  isDaylight,
  isTerminalSurface,
  isThemePreference,
  isValidClockTime,
  nextScheduleBoundary,
  parseTerminalSurface,
  parseThemePreference,
  parseThemeSchedule,
  resolveTheme,
  DEFAULT_TERMINAL_SURFACE,
  DEFAULT_THEME_PREFERENCE,
  DEFAULT_THEME_SCHEDULE,
  TERMINAL_SURFACE_CHOICES,
  THEME_CHOICES,
  type ResolvedTheme,
  type TerminalSurface,
  type TerminalSurfaceChoice,
  type ThemeChoice,
  type ThemePreference,
  type ThemeSchedule,
} from '../domain/appearance/theme'
import { getLocalDatabase } from './persistenceService'

/**
 * Workspace theme, stored as a value in the settings table so it travels with a
 * backup and follows the same rules as every other setting. The dawn and dusk
 * times of the Schedule choice are stored beside it, as one more row.
 *
 * The database is authoritative, but it opens asynchronously and the first frame
 * cannot wait for it, so the choice is mirrored into `localStorage` and applied
 * by a small inline script in `index.html` before the bundle runs. That mirror
 * is a cache, never a second source of truth: `startTheme` reconciles it against
 * the database on every boot, and each save writes both.
 *
 * The terminal surface is the workspace theme's sibling choice: its own settings
 * row, its own cache key, and a `data-terminal` attribute the terminal pane
 * reads. Keeping it separate is what lets the terminal stay dark on white paper,
 * or follow the workspace, without touching the workspace's own tokens.
 *
 * Keep `CACHE_KEY`, `CACHE_SCHEDULE_KEY`, `CACHE_TERMINAL_KEY` and the daylight
 * rule in step with the inline script in `index.html`.
 */

const THEME_KEY = 'theme'
const THEME_SCHEDULE_KEY = 'themeSchedule'
const TERMINAL_KEY = 'terminalSurface'
const CACHE_KEY = 'helpdesklab.theme'
const CACHE_SCHEDULE_KEY = 'helpdesklab.theme.schedule'
const CACHE_TERMINAL_KEY = 'helpdesklab.terminal'

let preference: ThemePreference = DEFAULT_THEME_PREFERENCE
let schedule: ThemeSchedule = DEFAULT_THEME_SCHEDULE
let terminalSurface: TerminalSurface = DEFAULT_TERMINAL_SURFACE
/** The look currently on the document; null until the first paint. */
let resolvedTheme: ResolvedTheme | null = null
let watchedQuery: MediaQueryList | null = null
let unwatchSystemTheme: (() => void) | null = null
let boundaryTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Anything that prints the resolved theme rather than styling it. The stylesheet
 * needs no notice, but Schedule changes the workspace at dawn and dusk while the
 * page sits open, so a sentence such as the one in Settings has to be told.
 */
type ThemeListener = () => void
const listeners = new Set<ThemeListener>()

export function subscribeToTheme(listener: ThemeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readCachedPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(CACHE_KEY))
  } catch {
    // Private modes and disabled storage are not a reason to fail a boot.
    return DEFAULT_THEME_PREFERENCE
  }
}

function readCachedSchedule(): ThemeSchedule {
  try {
    const cached = localStorage.getItem(CACHE_SCHEDULE_KEY)
    return cached === null ? DEFAULT_THEME_SCHEDULE : parseThemeSchedule(JSON.parse(cached))
  } catch {
    return DEFAULT_THEME_SCHEDULE
  }
}

function writeCachedPreference(value: ThemePreference): void {
  try {
    localStorage.setItem(CACHE_KEY, value)
  } catch {
    // The database already holds the choice; the cache is only for first paint.
  }
}

function writeCachedSchedule(value: ThemeSchedule): void {
  try {
    localStorage.setItem(CACHE_SCHEDULE_KEY, JSON.stringify(value))
  } catch {
    // Same story: the cache only spares the first frame a wrong guess.
  }
}

function readCachedTerminal(): TerminalSurface {
  try {
    return parseTerminalSurface(localStorage.getItem(CACHE_TERMINAL_KEY))
  } catch {
    return DEFAULT_TERMINAL_SURFACE
  }
}

function writeCachedTerminal(value: TerminalSurface): void {
  try {
    localStorage.setItem(CACHE_TERMINAL_KEY, value)
  } catch {
    // The database already holds the choice; the cache is only for first paint.
  }
}

/**
 * Schedule is the one choice that changes while nobody is looking, so a single
 * wake-up is armed for the next boundary rather than the clock being polled.
 * Every apply re-arms it, which covers a new choice, a new schedule, and a
 * machine that slept through a boundary and fires its timer late.
 */
function armBoundaryTimer(): void {
  if (boundaryTimer !== null) {
    clearTimeout(boundaryTimer)
    boundaryTimer = null
  }
  if (preference !== 'schedule' || typeof window === 'undefined') {
    return
  }

  const wait = nextScheduleBoundary(Date.now(), schedule)
  if (wait === null) {
    return
  }
  boundaryTimer = setTimeout(() => {
    boundaryTimer = null
    applyTheme('schedule')
  }, wait)
}

/** Sets the attribute the stylesheet reads, and mirrors the choice for next boot. */
export function applyTheme(next: ThemePreference): ResolvedTheme {
  preference = next
  const look = resolveTheme(next, {
    prefersDark: systemPrefersDark(),
    now: Date.now(),
    schedule,
  })

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = look
    document.documentElement.dataset.terminal = terminalSurface
  }
  writeCachedPreference(next)
  armBoundaryTimer()

  // Only a visible change is news: saving a different choice that keeps the
  // same look should not redraw the pages that merely describe the workspace.
  if (look !== resolvedTheme) {
    resolvedTheme = look
    for (const listener of listeners) {
      listener()
    }
  }

  return look
}

/** What the Settings form may offer, so the UI never imports the domain. */
export function themeChoices(): readonly ThemeChoice[] {
  return THEME_CHOICES
}

export function currentThemePreference(): ThemePreference {
  return preference
}

/** The dawn and dusk times in force, saved or not yet. */
export function currentThemeSchedule(): ThemeSchedule {
  return schedule
}

export function defaultThemeSchedule(): ThemeSchedule {
  return DEFAULT_THEME_SCHEDULE
}

export function currentResolvedTheme(): ResolvedTheme {
  return resolveTheme(preference, {
    prefersDark: systemPrefersDark(),
    now: Date.now(),
    schedule,
  })
}

/**
 * The look a schedule puts on the workspace at a local time of day, for the
 * Appearance preview. The date is arbitrary because only the clock is read, and
 * a fixed one keeps the answer independent of the day the page is open.
 */
export function themeAtMinute(minute: number, schedule: ThemeSchedule): ResolvedTheme {
  const moment = new Date(2000, 0, 1, Math.floor(minute / 60) % 24, minute % 60)
  return isDaylight(moment, schedule) ? 'light' : 'dark'
}

export function describeCurrentTheme(): string {
  return describeTheme(preference, currentResolvedTheme(), schedule)
}

/** What the Settings form may offer for the terminal, so the UI never imports the domain. */
export function terminalSurfaceChoices(): readonly TerminalSurfaceChoice[] {
  return TERMINAL_SURFACE_CHOICES
}

export function currentTerminalSurface(): TerminalSurface {
  return terminalSurface
}

export function describeCurrentTerminal(): string {
  return describeTerminalSurface(terminalSurface, currentResolvedTheme())
}

/** Older Chromium and WebKit exposed only these names. */
interface LegacyMediaQueryList {
  addListener?: (listener: () => void) => void
  removeListener?: (listener: () => void) => void
}

/**
 * Re-resolves when the system flips, but only while the choice is System:
 * an explicit Light, Dark or Schedule ignores the operating system. The
 * listener lives as long as the app does, so the workspace repaints the moment
 * the operating system switches rather than at the next launch.
 */
function watchSystemTheme(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }

  const query = window.matchMedia('(prefers-color-scheme: dark)')
  // A repeated boot, or a re-created query, replaces the old listener instead of
  // stacking a second one on the same media query.
  if (watchedQuery === query && unwatchSystemTheme) {
    return
  }
  unwatchSystemTheme?.()
  unwatchSystemTheme = null
  watchedQuery = query

  const onSystemThemeChange = () => {
    if (preference === 'system') {
      applyTheme('system')
    }
  }

  const legacy = query as MediaQueryList & LegacyMediaQueryList
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onSystemThemeChange)
    unwatchSystemTheme = () => query.removeEventListener('change', onSystemThemeChange)
  } else if (typeof legacy.addListener === 'function') {
    legacy.addListener(onSystemThemeChange)
    unwatchSystemTheme = () => legacy.removeListener?.(onSystemThemeChange)
  }
}

/** Paints the cached choice immediately, then corrects it from the database. */
export function startTheme(): void {
  schedule = readCachedSchedule()
  terminalSurface = readCachedTerminal()
  // Listen before painting: a flip that lands between the two is then already
  // on the query when applyTheme reads it, instead of waiting for the next one.
  watchSystemTheme()
  applyTheme(readCachedPreference())

  void Promise.all([loadThemePreference(), loadThemeSchedule(), loadTerminalSurface()]).then(
    ([storedPreference]) => {
      applyTheme(storedPreference)
    },
    () => {
      // An unreadable setting leaves the cached choice on screen.
    },
  )
}

export async function loadThemePreference(): Promise<ThemePreference> {
  const db = await getLocalDatabase()
  const stored = parseThemePreference(await db.settings.get(THEME_KEY))
  writeCachedPreference(stored)
  return stored
}

/**
 * Reads the stored boundaries into force as well as into the caller's hands, so
 * a Schedule choice resolves against the real times and not the defaults.
 */
export async function loadThemeSchedule(): Promise<ThemeSchedule> {
  const db = await getLocalDatabase()
  const stored = parseThemeSchedule(await db.settings.get(THEME_SCHEDULE_KEY))
  schedule = stored
  writeCachedSchedule(stored)
  return stored
}

export async function saveThemePreference(value: string): Promise<ThemePreference> {
  if (!isThemePreference(value)) {
    throw new Error(`Unknown theme: ${value}`)
  }

  const db = await getLocalDatabase()
  await db.settings.set(THEME_KEY, value)
  applyTheme(value)

  return value
}

export async function loadTerminalSurface(): Promise<TerminalSurface> {
  const db = await getLocalDatabase()
  const stored = parseTerminalSurface(await db.settings.get(TERMINAL_KEY))
  terminalSurface = stored
  writeCachedTerminal(stored)
  return stored
}

/** Stored beside the workspace theme, but applied on its own attribute. */
export async function saveTerminalSurface(value: string): Promise<TerminalSurface> {
  if (!isTerminalSurface(value)) {
    throw new Error(`Unknown terminal surface: ${value}`)
  }

  const db = await getLocalDatabase()
  await db.settings.set(TERMINAL_KEY, value)
  terminalSurface = value
  writeCachedTerminal(value)
  applyTheme(preference)

  return value
}

const THEME_SCHEDULE_ERROR = 'Dawn and dusk have to be times like 07:00 and 19:00.'

/** The two times, or null when either one is not a time. */
function readThemeSchedule(input: { dawn?: unknown; dusk?: unknown }): ThemeSchedule | null {
  return isValidClockTime(input.dawn) && isValidClockTime(input.dusk)
    ? { dawn: input.dawn, dusk: input.dusk }
    : null
}

/** The reason these times cannot be saved, or null when they can. */
export function validateThemeSchedule(input: {
  dawn?: unknown
  dusk?: unknown
}): string | null {
  return readThemeSchedule(input) === null ? THEME_SCHEDULE_ERROR : null
}

/** The dawn and dusk times, refused rather than corrected when they are not times. */
export async function saveThemeSchedule(value: {
  dawn?: unknown
  dusk?: unknown
}): Promise<ThemeSchedule> {
  const saved = readThemeSchedule(value)
  if (!saved) {
    throw new Error(THEME_SCHEDULE_ERROR)
  }
  const db = await getLocalDatabase()
  await db.settings.set(THEME_SCHEDULE_KEY, { dawn: saved.dawn, dusk: saved.dusk })

  schedule = saved
  writeCachedSchedule(saved)
  // The new boundaries take effect at once, including the one the timer waits on.
  applyTheme(preference)

  return saved
}

export type {
  ResolvedTheme,
  TerminalSurface,
  TerminalSurfaceChoice,
  ThemeChoice,
  ThemePreference,
  ThemeSchedule,
}
