import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_SURFACE,
  DEFAULT_THEME_PREFERENCE,
  DEFAULT_THEME_SCHEDULE,
  TERMINAL_SURFACE_CHOICES,
  TERMINAL_SURFACES,
  THEME_CHOICES,
  THEME_PREFERENCES,
  describeTerminalSurface,
  describeTheme,
  isDaylight,
  isTerminalSurface,
  isThemePreference,
  isValidClockTime,
  minutesOfDay,
  nextScheduleBoundary,
  parseTerminalSurface,
  parseThemePreference,
  parseThemeSchedule,
  resolveTheme,
  type ThemeContext,
} from '../../../src/domain/appearance/theme'

const NOON = new Date(2026, 9, 17, 12, 0)

function context(overrides: Partial<ThemeContext> = {}): ThemeContext {
  return {
    prefersDark: false,
    now: NOON,
    schedule: DEFAULT_THEME_SCHEDULE,
    ...overrides,
  }
}

function at(hours: number, minutes = 0, seconds = 0): Date {
  return new Date(2026, 9, 17, hours, minutes, seconds)
}

describe('theme preference', () => {
  it('defaults to following the system, with the other three offered alongside', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system')
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark', 'schedule'])
  })

  it('accepts only the known choices', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('schedule')).toBe(true)
    expect(isThemePreference('DARK')).toBe(false)
    expect(isThemePreference('sepia')).toBe(false)
    expect(isThemePreference('dusk')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
    expect(isThemePreference(1)).toBe(false)
  })

  it('migrates a missing or unreadable choice to System, and keeps a saved one', () => {
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('light')).toBe('light')
    expect(parseThemePreference('system')).toBe('system')
    expect(parseThemePreference('schedule')).toBe('schedule')
    // An install written before System was the default has no row at all.
    expect(parseThemePreference(null)).toBe('system')
    expect(parseThemePreference(undefined)).toBe('system')
    expect(parseThemePreference('sepia')).toBe('system')
    expect(parseThemePreference({ theme: 'light' })).toBe('system')
  })

  it('resolves System against the operating system and pins the rest', () => {
    expect(resolveTheme('system', context({ prefersDark: true }))).toBe('dark')
    expect(resolveTheme('system', context({ prefersDark: false }))).toBe('light')
    expect(resolveTheme('light', context({ prefersDark: true }))).toBe('light')
    expect(resolveTheme('dark', context({ prefersDark: false }))).toBe('dark')
  })

  it('offers one labelled choice per preference', () => {
    expect(THEME_CHOICES.map((choice) => choice.value)).toEqual([...THEME_PREFERENCES])
    for (const choice of THEME_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0)
      expect(choice.detail.length).toBeGreaterThan(0)
    }
    expect(THEME_CHOICES.at(-1)?.label).toBe('Schedule')
  })

  it('says what the choice is doing right now', () => {
    expect(describeTheme('system', 'dark')).toBe(
      'Following your system setting: the workspace is dark right now.',
    )
    expect(describeTheme('dark', 'dark')).toBe(
      'The workspace is always dark, whatever your system prefers.',
    )
    expect(describeTheme('light', 'light')).toBe(
      'The workspace is always light, whatever your system prefers.',
    )
    expect(describeTheme('schedule', 'light')).toBe(
      'Light from 07:00 to 19:00: the workspace is light right now.',
    )
    expect(describeTheme('schedule', 'dark', { dawn: '06:30', dusk: '21:15' })).toBe(
      'Light from 06:30 to 21:15: the workspace is dark right now.',
    )
  })
})

describe('terminal surface', () => {
  it('defaults to the terminal keeping its dark surface', () => {
    expect(DEFAULT_TERMINAL_SURFACE).toBe('dark')
    expect(TERMINAL_SURFACES).toEqual(['dark', 'follow'])
    expect(TERMINAL_SURFACE_CHOICES.map((choice) => choice.value)).toEqual([...TERMINAL_SURFACES])
    for (const choice of TERMINAL_SURFACE_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0)
      expect(choice.detail.length).toBeGreaterThan(0)
    }
  })

  it('accepts only the two choices, and reads anything else as dark', () => {
    expect(isTerminalSurface('dark')).toBe(true)
    expect(isTerminalSurface('follow')).toBe(true)
    expect(isTerminalSurface('light')).toBe(false)
    expect(isTerminalSurface(null)).toBe(false)

    expect(parseTerminalSurface('follow')).toBe('follow')
    expect(parseTerminalSurface('sepia')).toBe('dark')
    expect(parseTerminalSurface(undefined)).toBe('dark')
  })

  it('says whether the terminal is pinned dark or following the paper', () => {
    expect(describeTerminalSurface('dark', 'light')).toBe(
      'The terminal keeps its own dark surface, whichever workspace theme is in use.',
    )
    expect(describeTerminalSurface('follow', 'light')).toBe(
      'The terminal follows the workspace: it is light right now.',
    )
    expect(describeTerminalSurface('follow', 'dark')).toBe(
      'The terminal follows the workspace: it is dark right now.',
    )
  })
})

describe('the schedule', () => {
  it('reads daylight from dawn up to dusk, and dark either side', () => {
    const schedule = DEFAULT_THEME_SCHEDULE

    expect(isDaylight(at(5, 59), schedule)).toBe(false)
    expect(isDaylight(at(7, 0), schedule)).toBe(true)
    expect(isDaylight(at(12, 0), schedule)).toBe(true)
    expect(isDaylight(at(18, 59), schedule)).toBe(true)
    // Dusk belongs to the dark workspace: the boundary is not shared.
    expect(isDaylight(at(19, 0), schedule)).toBe(false)
    expect(isDaylight(at(23, 30), schedule)).toBe(false)
  })

  it('carries a schedule that runs overnight', () => {
    const overnight = { dawn: '20:00', dusk: '06:00' }

    expect(isDaylight(at(22, 0), overnight)).toBe(true)
    expect(isDaylight(at(2, 0), overnight)).toBe(true)
    expect(isDaylight(at(12, 0), overnight)).toBe(false)
  })

  it('stays dark when both boundaries are the same minute', () => {
    const empty = { dawn: '08:00', dusk: '08:00' }

    expect(isDaylight(at(8, 0), empty)).toBe(false)
    expect(isDaylight(at(20, 0), empty)).toBe(false)
    expect(nextScheduleBoundary(at(8, 0), empty)).toBeNull()
  })

  it('resolves Schedule by the clock, whatever the system prefers', () => {
    expect(resolveTheme('schedule', context({ now: at(12, 0), prefersDark: true }))).toBe('light')
    expect(resolveTheme('schedule', context({ now: at(21, 0), prefersDark: false }))).toBe('dark')
    expect(resolveTheme('schedule', context({ now: at(4, 30), prefersDark: false }))).toBe('dark')
  })

  it('measures the wait to the next boundary', () => {
    const schedule = DEFAULT_THEME_SCHEDULE

    expect(nextScheduleBoundary(at(6, 0), schedule)).toBe(60 * 60_000)
    expect(nextScheduleBoundary(at(12, 0), schedule)).toBe(7 * 60 * 60_000)
    expect(nextScheduleBoundary(at(20, 0), schedule)).toBe(11 * 60 * 60_000)
    // Seconds count: the boundary is on the minute.
    expect(nextScheduleBoundary(at(6, 30, 30), schedule)).toBe(29 * 60_000 + 30_000)
  })

  it('accepts only `HH:MM` clock times', () => {
    expect(isValidClockTime('00:00')).toBe(true)
    expect(isValidClockTime('07:05')).toBe(true)
    expect(isValidClockTime('23:59')).toBe(true)
    expect(isValidClockTime('7:05')).toBe(false)
    expect(isValidClockTime('24:00')).toBe(false)
    expect(isValidClockTime('07:60')).toBe(false)
    expect(isValidClockTime('')).toBe(false)
    expect(isValidClockTime(700)).toBe(false)
    expect(isValidClockTime(null)).toBe(false)
  })

  it('counts minutes into the day', () => {
    expect(minutesOfDay('00:00')).toBe(0)
    expect(minutesOfDay('07:00')).toBe(420)
    expect(minutesOfDay('19:30')).toBe(19 * 60 + 30)
    expect(minutesOfDay('23:59')).toBe(1439)
    // Defensive: a schedule read from somewhere odd reads as midnight, not NaN.
    expect(minutesOfDay('half seven')).toBe(0)
  })

  it('falls back one boundary at a time when a stored schedule is unusable', () => {
    expect(parseThemeSchedule({ dawn: '06:15', dusk: '21:45' })).toEqual({
      dawn: '06:15',
      dusk: '21:45',
    })
    expect(parseThemeSchedule({ dawn: '06:15', dusk: 'tonight' })).toEqual({
      dawn: '06:15',
      dusk: DEFAULT_THEME_SCHEDULE.dusk,
    })
    expect(parseThemeSchedule({})).toEqual(DEFAULT_THEME_SCHEDULE)
    expect(parseThemeSchedule(null)).toEqual(DEFAULT_THEME_SCHEDULE)
    expect(parseThemeSchedule(['07:00', '19:00'])).toEqual(DEFAULT_THEME_SCHEDULE)
    expect(parseThemeSchedule('07:00-19:00')).toEqual(DEFAULT_THEME_SCHEDULE)
  })
})
