import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The service reads and writes one settings row; this stand-in keeps the real
// normalizing in play instead of stubbing the service itself.
const settings = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, failRead: false }))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabase: async () => ({
    settings: {
      get: async (key: string) => {
        if (settings.failRead) {
          throw new Error('IndexedDB is unavailable')
        }
        return settings.rows[key] ?? null
      },
      set: async (key: string, value: unknown) => {
        settings.rows[key] = value
      },
    },
  }),
}))

import {
  applyTheme,
  currentResolvedTheme,
  currentTerminalSurface,
  currentThemePreference,
  currentThemeSchedule,
  defaultThemeSchedule,
  describeCurrentTerminal,
  describeCurrentTheme,
  loadTerminalSurface,
  loadThemePreference,
  loadThemeSchedule,
  saveTerminalSurface,
  saveThemePreference,
  saveThemeSchedule,
  startTheme,
  subscribeToTheme,
  terminalSurfaceChoices,
  themeAtMinute,
  themeChoices,
  validateThemeSchedule,
} from '../../src/app/themeService'

const CACHE_KEY = 'helpdesklab.theme'
const CACHE_SCHEDULE_KEY = 'helpdesklab.theme.schedule'
const CACHE_TERMINAL_KEY = 'helpdesklab.terminal'

function at(hours: number, minutes = 0): Date {
  return new Date(2026, 9, 17, hours, minutes)
}

/** Fakes the clock without faking timers the other tests wait on. */
function freezeClock(moment: Date): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(moment)
}

function documentTheme(): string | undefined {
  return document.documentElement.dataset.theme
}

/**
 * jsdom ships no matchMedia, so the operating system is ours to set. `legacy`
 * models the older `addListener`/`removeListener` pair.
 */
function stubOperatingSystem(matches: boolean, options: { legacy?: boolean } = {}) {
  let current = matches
  let listeners: Array<() => void> = []
  const query: Record<string, unknown> = {
    get matches() {
      return current
    },
    media: '(prefers-color-scheme: dark)',
  }

  if (options.legacy) {
    query.addListener = (listener: () => void) => {
      listeners.push(listener)
    }
    query.removeListener = (listener: () => void) => {
      listeners = listeners.filter((candidate) => candidate !== listener)
    }
  } else {
    query.addEventListener = (_type: string, listener: () => void) => {
      listeners.push(listener)
    }
    query.removeEventListener = (_type: string, listener: () => void) => {
      listeners = listeners.filter((candidate) => candidate !== listener)
    }
  }

  window.matchMedia = (() => query) as unknown as typeof window.matchMedia

  return {
    flip(next: boolean) {
      current = next
      for (const listener of [...listeners]) {
        listener()
      }
    },
    listenerCount: () => listeners.length,
  }
}

beforeEach(async () => {
  settings.rows = {}
  settings.failRead = false
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.terminal
  // The terminal choice is module state, so a test that changed it puts the
  // default back through the same reader the app uses.
  await loadTerminalSurface()
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('applying the theme', () => {
  it('writes the choice to the document and mirrors it for the next boot', () => {
    stubOperatingSystem(false)

    expect(applyTheme('dark')).toBe('dark')
    expect(documentTheme()).toBe('dark')
    expect(localStorage.getItem(CACHE_KEY)).toBe('dark')
    expect(currentThemePreference()).toBe('dark')

    expect(applyTheme('light')).toBe('light')
    expect(documentTheme()).toBe('light')
    expect(localStorage.getItem(CACHE_KEY)).toBe('light')
  })

  it('resolves System against the operating system', () => {
    stubOperatingSystem(true)

    expect(applyTheme('system')).toBe('dark')
    expect(documentTheme()).toBe('dark')
    expect(currentResolvedTheme()).toBe('dark')
    expect(describeCurrentTheme()).toBe(
      'Following your system setting: the workspace is dark right now.',
    )
  })

  it('follows a system change only while the choice is System', () => {
    const system = stubOperatingSystem(false)

    startTheme()
    expect(system.listenerCount()).toBe(1)
    // Nothing chosen yet: System is the default, so the operating system decides.
    expect(documentTheme()).toBe('light')

    system.flip(true)
    expect(documentTheme()).toBe('dark')

    applyTheme('system')
    expect(documentTheme()).toBe('dark')

    system.flip(false)
    expect(documentTheme()).toBe('light')

    applyTheme('dark')
    system.flip(true)
    expect(documentTheme()).toBe('dark')
  })

  it('repaints a System workspace on an operating-system flip with no save', () => {
    const system = stubOperatingSystem(false)
    const seen: string[] = []
    const stop = subscribeToTheme(() => seen.push(currentResolvedTheme()))

    startTheme()
    expect(documentTheme()).toBe('light')

    system.flip(true)

    // The document attribute is what tokens.css keys the light palette off, and
    // readers of the resolved look are told on the same turn.
    expect(documentTheme()).toBe('dark')
    expect(seen.at(-1)).toBe('dark')
    expect(describeCurrentTheme()).toContain('dark right now')
    expect(settings.rows.theme).toBeUndefined()
    expect(localStorage.getItem(CACHE_KEY)).toBe('system')

    stop()
  })

  it('keeps one listener when boot runs more than once', () => {
    const system = stubOperatingSystem(false)

    startTheme()
    startTheme()

    expect(system.listenerCount()).toBe(1)
  })

  it('replaces the listener from a previous query instead of stacking another', () => {
    const first = stubOperatingSystem(false)
    startTheme()
    expect(first.listenerCount()).toBe(1)

    const second = stubOperatingSystem(false)
    startTheme()

    expect(first.listenerCount()).toBe(0)
    expect(second.listenerCount()).toBe(1)

    second.flip(true)
    expect(documentTheme()).toBe('dark')
  })

  it('follows the system through the older addListener API too', () => {
    const system = stubOperatingSystem(false, { legacy: true })

    startTheme()
    expect(system.listenerCount()).toBe(1)
    expect(documentTheme()).toBe('light')

    system.flip(true)
    expect(documentTheme()).toBe('dark')
  })

  it('offers the choices the Settings form renders', () => {
    expect(themeChoices().map((choice) => choice.value)).toEqual([
      'system',
      'light',
      'dark',
      'schedule',
    ])
  })

  it('resolves Schedule against the clock, not the operating system', () => {
    stubOperatingSystem(true)

    freezeClock(at(12, 0))
    expect(applyTheme('schedule')).toBe('light')
    expect(documentTheme()).toBe('light')
    expect(localStorage.getItem(CACHE_KEY)).toBe('schedule')
    expect(currentThemeSchedule()).toEqual(defaultThemeSchedule())

    vi.setSystemTime(at(23, 30))
    expect(applyTheme('schedule')).toBe('dark')
    expect(documentTheme()).toBe('dark')

    // The system preference is irrelevant to a schedule.
    vi.setSystemTime(at(6, 0))
    expect(applyTheme('schedule')).toBe('dark')
  })

  it('changes by itself at the boundary, with no polling', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at(18, 59))
    stubOperatingSystem(false)

    expect(applyTheme('schedule')).toBe('light')

    vi.advanceTimersByTime(60_000)

    expect(documentTheme()).toBe('dark')
    expect(currentResolvedTheme()).toBe('dark')
    expect(currentThemePreference()).toBe('schedule')
  })

  it('tells a page that describes the theme when the workspace flips', () => {
    vi.useFakeTimers()
    vi.setSystemTime(at(18, 59))
    stubOperatingSystem(false)

    const seen: string[] = []
    const stop = subscribeToTheme(() => seen.push(currentResolvedTheme()))

    applyTheme('schedule')
    expect(seen.at(-1)).toBe('light')

    const beforeBoundary = seen.length
    vi.advanceTimersByTime(60_000)
    expect(seen.slice(beforeBoundary)).toEqual(['dark'])
    // The sentence under the choices follows the workspace without a click.
    expect(describeCurrentTheme()).toContain('dark right now')

    // A different choice that keeps the same look is not news.
    const beforeNoop = seen.length
    applyTheme('dark')
    expect(seen.length).toBe(beforeNoop)

    stop()
    applyTheme('light')
    expect(seen.length).toBe(beforeNoop)
  })
})

describe('previewing a schedule', () => {
  it('answers with the look the boundaries give at a chosen time of day', () => {
    const day = { dawn: '07:00', dusk: '19:00' }
    expect(themeAtMinute(12 * 60, day)).toBe('light')
    expect(themeAtMinute(23 * 60, day)).toBe('dark')

    // Dusk before dawn runs the daylight across midnight.
    const night = { dawn: '20:00', dusk: '06:00' }
    expect(themeAtMinute(23 * 60, night)).toBe('light')
    expect(themeAtMinute(12 * 60, night)).toBe('dark')

    // Equal boundaries leave no daylight at all.
    expect(themeAtMinute(12 * 60, { dawn: '12:00', dusk: '12:00' })).toBe('dark')
  })
})

describe('the terminal surface', () => {
  it('keeps the terminal dark by default, even in the light workspace', () => {
    stubOperatingSystem(false)

    expect(applyTheme('light')).toBe('light')
    expect(documentTheme()).toBe('light')
    expect(document.documentElement.dataset.terminal).toBe('dark')
    expect(currentTerminalSurface()).toBe('dark')
    expect(describeCurrentTerminal()).toBe(
      'The terminal keeps its own dark surface, whichever workspace theme is in use.',
    )
  })

  it('offers two choices: always dark, or follow the workspace', () => {
    expect(terminalSurfaceChoices().map((choice) => choice.value)).toEqual(['dark', 'follow'])
    expect(terminalSurfaceChoices().map((choice) => choice.label)).toEqual([
      'Always dark',
      'Follow the workspace',
    ])
  })

  it('saves a choice and repaints the terminal at once', async () => {
    stubOperatingSystem(false)
    applyTheme('light')

    expect(await saveTerminalSurface('follow')).toBe('follow')
    expect(settings.rows.terminalSurface).toBe('follow')
    expect(document.documentElement.dataset.terminal).toBe('follow')
    expect(localStorage.getItem(CACHE_TERMINAL_KEY)).toBe('follow')
    expect(describeCurrentTerminal()).toBe(
      'The terminal follows the workspace: it is light right now.',
    )

    // The workspace theme is unchanged by the terminal's own choice.
    expect(documentTheme()).toBe('light')
  })

  it('refuses a choice it does not know', async () => {
    await expect(saveTerminalSurface('sepia')).rejects.toThrow(/Unknown terminal surface/)
    expect(settings.rows.terminalSurface).toBeUndefined()
    expect(currentTerminalSurface()).toBe('dark')
  })

  it('reads a stored choice, and treats an unreadable one as the default', async () => {
    settings.rows.terminalSurface = 'follow'
    expect(await loadTerminalSurface()).toBe('follow')
    expect(localStorage.getItem(CACHE_TERMINAL_KEY)).toBe('follow')

    settings.rows.terminalSurface = 'sepia'
    expect(await loadTerminalSurface()).toBe('dark')

    settings.rows = {}
    expect(await loadTerminalSurface()).toBe('dark')
  })

  it('paints the cached terminal first, then corrects it from the database', async () => {
    stubOperatingSystem(false)
    localStorage.setItem(CACHE_TERMINAL_KEY, 'dark')
    settings.rows.terminalSurface = 'follow'

    startTheme()
    expect(document.documentElement.dataset.terminal).toBe('dark')

    await vi.waitFor(() => {
      expect(document.documentElement.dataset.terminal).toBe('follow')
    })
    expect(localStorage.getItem(CACHE_TERMINAL_KEY)).toBe('follow')
  })

  it('leaves the terminal choice alone when the workspace flips', () => {
    stubOperatingSystem(false)
    applyTheme('light')
    expect(document.documentElement.dataset.terminal).toBe('dark')

    applyTheme('dark')
    expect(document.documentElement.dataset.terminal).toBe('dark')
  })
})

describe('storing the theme', () => {
  it('saves the choice and applies it at once', async () => {
    stubOperatingSystem(false)

    expect(await saveThemePreference('dark')).toBe('dark')
    expect(settings.rows.theme).toBe('dark')
    expect(documentTheme()).toBe('dark')
    expect(localStorage.getItem(CACHE_KEY)).toBe('dark')
  })

  it('refuses a choice it does not know', async () => {
    stubOperatingSystem(false)

    await expect(saveThemePreference('sepia')).rejects.toThrow(/Unknown theme/)
    expect(settings.rows.theme).toBeUndefined()
  })

  it('reads a stored choice, and migrates a missing or unreadable one to System', async () => {
    settings.rows.theme = 'system'
    expect(await loadThemePreference()).toBe('system')

    settings.rows.theme = 'dark'
    expect(await loadThemePreference()).toBe('dark')

    settings.rows.theme = 'sepia'
    expect(await loadThemePreference()).toBe('system')

    // No row at all is an install that never picked a theme, including one
    // written before System was the default.
    settings.rows = {}
    expect(await loadThemePreference()).toBe('system')
    expect(localStorage.getItem(CACHE_KEY)).toBe('system')
  })

  it('paints the cache first, then corrects it from the database', async () => {
    stubOperatingSystem(false)
    localStorage.setItem(CACHE_KEY, 'dark')
    settings.rows.theme = 'light'

    startTheme()
    expect(documentTheme()).toBe('dark')

    await vi.waitFor(() => {
      expect(documentTheme()).toBe('light')
    })
    expect(localStorage.getItem(CACHE_KEY)).toBe('light')
    expect(currentThemePreference()).toBe('light')
  })

  it('migrates an old install that never chose a theme to the system setting', async () => {
    // The previous build cached Dark for an install with no stored choice.
    stubOperatingSystem(false)
    localStorage.setItem(CACHE_KEY, 'dark')

    startTheme()
    expect(documentTheme()).toBe('dark')

    await vi.waitFor(() => {
      expect(documentTheme()).toBe('light')
    })
    expect(currentThemePreference()).toBe('system')
    expect(localStorage.getItem(CACHE_KEY)).toBe('system')
    // Reading the absent row is the migration: nothing is written over it, so
    // an explicit Dark choice is never mistaken for one that was never made.
    expect(settings.rows.theme).toBeUndefined()
  })

  it('leaves an install that chose Dark on Dark', async () => {
    stubOperatingSystem(false)
    localStorage.setItem(CACHE_KEY, 'dark')
    settings.rows.theme = 'dark'

    startTheme()

    await vi.waitFor(() => {
      expect(currentThemePreference()).toBe('dark')
    })
    expect(documentTheme()).toBe('dark')
    expect(localStorage.getItem(CACHE_KEY)).toBe('dark')
  })

  it('keeps the cached choice when the setting cannot be read', async () => {
    stubOperatingSystem(false)
    localStorage.setItem(CACHE_KEY, 'dark')
    settings.failRead = true

    startTheme()
    expect(documentTheme()).toBe('dark')

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(documentTheme()).toBe('dark')
    expect(currentThemePreference()).toBe('dark')
  })

  it('saves dawn and dusk together, and repaints by the new window', async () => {
    stubOperatingSystem(true)
    freezeClock(at(20, 0))

    // The default window ends at 19:00, so the workspace is dark right now.
    applyTheme('schedule')
    expect(documentTheme()).toBe('dark')

    const saved = await saveThemeSchedule({ dawn: '19:00', dusk: '23:30' })

    expect(saved).toEqual({ dawn: '19:00', dusk: '23:30' })
    expect(settings.rows.themeSchedule).toEqual({ dawn: '19:00', dusk: '23:30' })
    expect(localStorage.getItem(CACHE_SCHEDULE_KEY)).toBe(
      JSON.stringify({ dawn: '19:00', dusk: '23:30' }),
    )
    // 20:00 is inside the new window, so the same clock now reads light.
    expect(documentTheme()).toBe('light')
    expect(describeCurrentTheme()).toBe(
      'Light from 19:00 to 23:30: the workspace is light right now.',
    )
  })

  it('refuses a schedule that is not a pair of clock times', async () => {
    stubOperatingSystem(false)

    expect(validateThemeSchedule({ dawn: '07:00', dusk: '19:00' })).toBeNull()
    expect(validateThemeSchedule({ dawn: '7am', dusk: '19:00' })).toMatch(/07:00 and 19:00/)
    expect(validateThemeSchedule({ dawn: '07:00' })).toMatch(/07:00 and 19:00/)

    await expect(saveThemeSchedule({ dawn: '7am', dusk: '19:00' })).rejects.toThrow(
      /07:00 and 19:00/,
    )
    expect(settings.rows.themeSchedule).toBeUndefined()
  })

  it('reads a stored schedule, and falls back when it is unusable', async () => {
    settings.rows.themeSchedule = { dawn: '05:45', dusk: '21:15' }
    expect(await loadThemeSchedule()).toEqual({ dawn: '05:45', dusk: '21:15' })
    expect(localStorage.getItem(CACHE_SCHEDULE_KEY)).toBe(
      JSON.stringify({ dawn: '05:45', dusk: '21:15' }),
    )

    settings.rows.themeSchedule = { dawn: 'five in the morning', dusk: '21:15' }
    expect(await loadThemeSchedule()).toEqual({ dawn: '07:00', dusk: '21:15' })

    settings.rows.themeSchedule = 'dawn to dusk'
    expect(await loadThemeSchedule()).toEqual(defaultThemeSchedule())
  })

  it('paints the cached schedule on the first frame, then corrects it', async () => {
    stubOperatingSystem(false)
    freezeClock(at(21, 0))
    localStorage.setItem(CACHE_KEY, 'schedule')
    localStorage.setItem(CACHE_SCHEDULE_KEY, JSON.stringify({ dawn: '07:00', dusk: '19:00' }))
    settings.rows.theme = 'schedule'
    settings.rows.themeSchedule = { dawn: '20:00', dusk: '23:00' }

    startTheme()
    // The cached window closed at 19:00, so the first frame is dark.
    expect(documentTheme()).toBe('dark')

    await vi.waitFor(() => {
      expect(currentThemeSchedule()).toEqual({ dawn: '20:00', dusk: '23:00' })
    })
    // The stored window covers 21:00, so the correction turns the workspace light.
    expect(documentTheme()).toBe('light')
  })
})
