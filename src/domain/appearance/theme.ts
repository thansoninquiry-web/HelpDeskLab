/**
 * The workspace theme: one choice in Settings that swaps the colour tokens the
 * interface already reads, so the shell, the type scale and the density stay
 * exactly as they are. Only `src/ui/styles/tokens.css` knows what the values
 * are; every component keeps referring to the same custom properties.
 *
 * Four choices resolve to two looks. System answers to the operating system and
 * Schedule to the clock, so the resolver is handed both rather than reaching for
 * either itself: this module has no window, no media query and no clock of its
 * own, which is what makes the schedule testable at any hour.
 */

export type ThemePreference = 'system' | 'light' | 'dark' | 'schedule'
export type ResolvedTheme = 'light' | 'dark'

/**
 * Offered in this order in Settings. The default follows the operating system,
 * so a desk that already runs light opens light and a night-shift machine opens
 * the dark workspace the simulator is designed around. Light, Dark and Schedule
 * stay one click away for anyone who wants to pin it.
 */
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
  'schedule',
]

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system'

export interface ThemeChoice {
  value: ThemePreference
  label: string
  detail: string
}

export const THEME_CHOICES: readonly ThemeChoice[] = [
  {
    value: 'system',
    label: 'System',
    detail: 'Follow the operating system, and change with it.',
  },
  {
    value: 'light',
    label: 'Light',
    detail: 'Paper workspace, whatever the system prefers.',
  },
  {
    value: 'dark',
    label: 'Dark',
    detail: 'Dark workspace, whatever the system prefers.',
  },
  {
    value: 'schedule',
    label: 'Schedule',
    detail: 'Light from dawn to dusk, dark for the rest of the day.',
  },
]

/**
 * The terminal's own surface. "dark" pins it to the night-shift palette whatever
 * the workspace is doing, which is the default: the command line is the one
 * panel a learner expects to stay dark on white paper. "follow" paints it out of
 * the same tokens as the rest of the workspace.
 */
export type TerminalSurface = 'dark' | 'follow'

export const TERMINAL_SURFACES: readonly TerminalSurface[] = ['dark', 'follow']

export const DEFAULT_TERMINAL_SURFACE: TerminalSurface = 'dark'

export interface TerminalSurfaceChoice {
  value: TerminalSurface
  label: string
  detail: string
}

export const TERMINAL_SURFACE_CHOICES: readonly TerminalSurfaceChoice[] = [
  {
    value: 'dark',
    label: 'Always dark',
    detail: 'The terminal keeps its dark surface even while the workspace is light.',
  },
  {
    value: 'follow',
    label: 'Follow the workspace',
    detail: 'The terminal uses the same paper as the rest of the workspace.',
  },
]

export function isTerminalSurface(value: unknown): value is TerminalSurface {
  return typeof value === 'string' && (TERMINAL_SURFACES as readonly string[]).includes(value)
}

/** Anything unrecognizable reads as the default dark terminal. */
export function parseTerminalSurface(value: unknown): TerminalSurface {
  return isTerminalSurface(value) ? value : DEFAULT_TERMINAL_SURFACE
}

/** When the light workspace starts and the dark one comes back, on the local clock. */
export interface ThemeSchedule {
  /** The time the light workspace starts, `HH:MM`, local. */
  dawn: string
  /** The time the dark workspace starts again, `HH:MM`, local. */
  dusk: string
}

/** Working hours for anyone who never opens the schedule fields. */
export const DEFAULT_THEME_SCHEDULE: ThemeSchedule = { dawn: '07:00', dusk: '19:00' }

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/**
 * Anything unrecognizable — a hand-edited backup, a missing row, nothing chosen
 * yet — reads as the default System. A missing row is exactly an install that
 * never picked a theme, including one written before System was the default, so
 * those installs follow the operating system from their next read instead of
 * staying on the dark workspace they never asked for. A stored `dark` is an
 * explicit choice and stays Dark.
 */
export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE
}

/** A local clock time in `HH:MM`: the only shape a schedule field may hold. */
export function isValidClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** Minutes since midnight for a clock time. Anything else reads as midnight. */
export function minutesOfDay(time: string): number {
  if (!isValidClockTime(time)) {
    return 0
  }
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/**
 * Reads a stored schedule, falling back one field at a time: half an edit is
 * still better than losing the other boundary to the default.
 */
export function parseThemeSchedule(value: unknown): ThemeSchedule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_THEME_SCHEDULE
  }
  const record = value as Record<string, unknown>
  return {
    dawn: isValidClockTime(record.dawn) ? record.dawn : DEFAULT_THEME_SCHEDULE.dawn,
    dusk: isValidClockTime(record.dusk) ? record.dusk : DEFAULT_THEME_SCHEDULE.dusk,
  }
}

/**
 * True while the light workspace is due: from dawn up to, but not including,
 * dusk. Dusk before dawn is a schedule that runs overnight, so the daylight sits
 * across midnight and the working day is dark. A schedule with both boundaries
 * at the same minute has no daylight in it at all.
 */
export function isDaylight(now: Date | number, schedule: ThemeSchedule): boolean {
  const at = typeof now === 'number' ? new Date(now) : now
  const minutes = at.getHours() * 60 + at.getMinutes()
  const dawn = minutesOfDay(schedule.dawn)
  const dusk = minutesOfDay(schedule.dusk)

  if (dawn === dusk) {
    return false
  }
  return dawn < dusk ? minutes >= dawn && minutes < dusk : minutes >= dawn || minutes < dusk
}

/**
 * The milliseconds until the schedule next changes the workspace, or null when
 * it never does. A boundary timer is armed from this, so the theme changes at
 * dawn and dusk without the app polling the clock every minute.
 */
export function nextScheduleBoundary(now: Date | number, schedule: ThemeSchedule): number | null {
  const at = typeof now === 'number' ? new Date(now) : now
  const dawn = minutesOfDay(schedule.dawn)
  const dusk = minutesOfDay(schedule.dusk)
  if (dawn === dusk) {
    return null
  }

  const minutes = at.getHours() * 60 + at.getMinutes()
  const intoMinute = at.getSeconds() * 1000 + at.getMilliseconds()
  const waits = [dawn, dusk].map((boundary) => {
    const minutesAway = boundary - minutes <= 0 ? boundary - minutes + 24 * 60 : boundary - minutes
    return minutesAway * 60_000 - intoMinute
  })

  return Math.min(...waits)
}

/** Everything the choice of theme can depend on. */
export interface ThemeContext {
  prefersDark: boolean
  /** The local moment the theme is being resolved for. */
  now: Date | number
  schedule: ThemeSchedule
}

export function resolveTheme(preference: ThemePreference, context: ThemeContext): ResolvedTheme {
  switch (preference) {
    case 'system':
      return context.prefersDark ? 'dark' : 'light'
    case 'schedule':
      return isDaylight(context.now, context.schedule) ? 'light' : 'dark'
    default:
      return preference
  }
}

/** One sentence saying what the choice is doing right now. */
export function describeTheme(
  preference: ThemePreference,
  resolved: ResolvedTheme,
  schedule: ThemeSchedule = DEFAULT_THEME_SCHEDULE,
): string {
  if (preference === 'system') {
    return `Following your system setting: the workspace is ${resolved} right now.`
  }
  if (preference === 'schedule') {
    return `Light from ${schedule.dawn} to ${schedule.dusk}: the workspace is ${resolved} right now.`
  }
  return `The workspace is always ${resolved}, whatever your system prefers.`
}

/** One sentence saying what the terminal is doing right now. */
export function describeTerminalSurface(
  surface: TerminalSurface,
  resolved: ResolvedTheme,
): string {
  if (surface === 'follow') {
    return `The terminal follows the workspace: it is ${resolved} right now.`
  }
  return 'The terminal keeps its own dark surface, whichever workspace theme is in use.'
}
