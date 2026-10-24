// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZE_CHOICES,
} from '../../src/domain/appearance/textSize'
import {
  DEFAULT_THEME_SCHEDULE,
  isDaylight,
  parseThemeSchedule,
  THEME_PREFERENCES,
  type ThemeSchedule,
} from '../../src/domain/appearance/theme'

function inlineScript(): string {
  const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')
  const match = /<script>([\s\S]*?)<\/script>/.exec(html)
  if (!match || !match[1]) {
    throw new Error('index.html carries no inline theme script')
  }
  return match[1]
}

interface Cached {
  choice?: string
  /** Left undefined when nothing has been cached yet. */
  schedule?: unknown
  terminal?: string
  textSize?: string
  prefersLight?: boolean
}

/** Every attribute the boot script paints, before the bundle loads. */
function firstFrame(cached: Cached, at: string): Record<string, string> {
  const storage = new Map<string, string>()
  if (cached.choice !== undefined) {
    storage.set('helpdesklab.theme', cached.choice)
  }
  if (cached.schedule !== undefined) {
    storage.set('helpdesklab.theme.schedule', JSON.stringify(cached.schedule))
  }
  if (cached.terminal !== undefined) {
    storage.set('helpdesklab.terminal', cached.terminal)
  }
  if (cached.textSize !== undefined) {
    storage.set('helpdesklab.textSize', cached.textSize)
  }

  const dataset: Record<string, string> = {}
  const now = new Date(at)
  // The script only asks for the wall clock; a constructor that hands back this
  // fixed moment keeps the check away from timers.
  const FrozenDate = function FrozenDate() {
    return now
  }

  runInNewContext(inlineScript(), {
    document: { documentElement: { dataset } },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
    // The query is for dark, so `matches` is true when the system prefers dark.
    window: { matchMedia: () => ({ matches: cached.prefersLight !== true }) },
    Date: FrozenDate,
  })

  return dataset
}

function firstFrameTheme(cached: Cached, at: string): string | undefined {
  return firstFrame(cached, at).theme
}

/** The rule both the boot script and the theme service must obey. */
function expectedTheme(schedule: ThemeSchedule, at: string): 'light' | 'dark' {
  return isDaylight(new Date(at), schedule) ? 'light' : 'dark'
}

const DAY: ThemeSchedule = { dawn: '07:00', dusk: '19:00' }
const NIGHT: ThemeSchedule = { dawn: '20:00', dusk: '06:00' }

describe('the first frame', () => {
  it('follows the system when nothing has been saved', () => {
    expect(firstFrameTheme({ prefersLight: false }, '2026-10-17T12:00:00')).toBe('dark')
    expect(firstFrameTheme({ prefersLight: true }, '2026-10-17T12:00:00')).toBe('light')
  })

  it('paints a saved Light or Dark without asking the system', () => {
    expect(firstFrameTheme({ choice: 'light', prefersLight: false }, '2026-10-17T23:00:00')).toBe(
      'light',
    )
    expect(firstFrameTheme({ choice: 'dark', prefersLight: true }, '2026-10-17T12:00:00')).toBe(
      'dark',
    )
  })

  it('follows the system while the choice is System', () => {
    expect(firstFrameTheme({ choice: 'system', prefersLight: true }, '2026-10-17T22:00:00')).toBe(
      'light',
    )
    expect(firstFrameTheme({ choice: 'system', prefersLight: false }, '2026-10-17T12:00:00')).toBe(
      'dark',
    )
  })

  it.each([
    '2026-10-17T00:00:00',
    '2026-10-17T06:59:00',
    '2026-10-17T07:00:00',
    '2026-10-17T12:00:00',
    '2026-10-17T18:59:00',
    '2026-10-17T19:00:00',
    '2026-10-17T23:59:00',
  ])('puts the daylight window where the domain puts it, at %s', (at) => {
    expect(firstFrameTheme({ choice: 'schedule', schedule: DAY }, at)).toBe(expectedTheme(DAY, at))
  })

  it.each([
    '2026-10-17T03:00:00',
    '2026-10-17T05:59:00',
    '2026-10-17T06:00:00',
    '2026-10-17T12:00:00',
    '2026-10-17T19:59:00',
    '2026-10-17T20:00:00',
    '2026-10-17T23:30:00',
  ])('wraps a dusk-before-dawn schedule across midnight, at %s', (at) => {
    expect(firstFrameTheme({ choice: 'schedule', schedule: NIGHT }, at)).toBe(
      expectedTheme(NIGHT, at),
    )
  })

  it('falls back to the same defaults and repairs the same fields as the service', () => {
    for (const at of ['2026-10-17T03:00:00', '2026-10-17T12:00:00', '2026-10-17T20:00:00']) {
      // Nothing cached: the first frame must already honour the default window.
      expect(firstFrameTheme({ choice: 'schedule' }, at)).toBe(
        expectedTheme(DEFAULT_THEME_SCHEDULE, at),
      )
    }

    const half = { dawn: '7am', dusk: '23:00' }
    expect(firstFrameTheme({ choice: 'schedule', schedule: half }, '2026-10-17T22:00:00')).toBe(
      expectedTheme(parseThemeSchedule(half), '2026-10-17T22:00:00'),
    )
    expect(firstFrameTheme({ choice: 'schedule', schedule: half }, '2026-10-17T06:00:00')).toBe(
      expectedTheme(parseThemeSchedule(half), '2026-10-17T06:00:00'),
    )
  })

  it('stays dark for a schedule whose dawn and dusk are the same minute', () => {
    const flat: ThemeSchedule = { dawn: '12:00', dusk: '12:00' }
    expect(firstFrameTheme({ choice: 'schedule', schedule: flat }, '2026-10-17T12:00:00')).toBe(
      expectedTheme(flat, '2026-10-17T12:00:00'),
    )
    expect(firstFrameTheme({ choice: 'schedule', schedule: flat }, '2026-10-17T12:00:00')).toBe(
      'dark',
    )
  })

  it('survives a corrupt cached schedule', () => {
    expect(firstFrameTheme({ choice: 'schedule', schedule: null }, '2026-10-17T12:00:00')).toBe(
      expectedTheme(DEFAULT_THEME_SCHEDULE, '2026-10-17T12:00:00'),
    )
    expect(firstFrameTheme({ choice: 'schedule', schedule: 'evening' }, '2026-10-17T03:00:00')).toBe(
      'dark',
    )
  })

  it('reads every choice the settings offer, and treats anything else as System', () => {
    for (const choice of THEME_PREFERENCES) {
      const theme = firstFrameTheme({ choice, prefersLight: true }, '2026-10-17T12:00:00')
      expect({ choice, theme }).toEqual({
        choice,
        theme: choice === 'dark' ? 'dark' : 'light',
      })
    }

    expect(firstFrameTheme({ choice: 'sepia', prefersLight: true }, '2026-10-17T12:00:00')).toBe(
      'light',
    )
    expect(firstFrameTheme({ choice: 'sepia', prefersLight: false }, '2026-10-17T12:00:00')).toBe(
      'dark',
    )
  })

  it('paints the terminal dark by default, even when the workspace is light', () => {
    expect(firstFrame({ choice: 'light' }, '2026-10-17T12:00:00')).toEqual({
      theme: 'light',
      terminal: 'dark',
      textSize: 'default',
    })
  })

  it('paints a first frame that follows the system on an install with no saved choice', () => {
    expect(firstFrame({ prefersLight: true }, '2026-10-17T12:00:00')).toEqual({
      theme: 'light',
      terminal: 'dark',
      textSize: 'default',
    })
    expect(firstFrame({ prefersLight: false }, '2026-10-17T12:00:00')).toEqual({
      theme: 'dark',
      terminal: 'dark',
      textSize: 'default',
    })
  })

  it('paints a terminal that follows the workspace, and falls back to dark', () => {
    expect(firstFrame({ choice: 'dark', terminal: 'follow' }, '2026-10-17T12:00:00')).toEqual({
      theme: 'dark',
      terminal: 'follow',
      textSize: 'default',
    })
    expect(firstFrame({ choice: 'light', terminal: 'sepia' }, '2026-10-17T12:00:00')).toEqual({
      theme: 'light',
      terminal: 'dark',
      textSize: 'default',
    })
  })

  it('paints the cached text size before the bundle, and the design size for anything else', () => {
    const at = '2026-10-17T12:00:00'

    // Nothing saved, and a value from another build: the design size, the same
    // one the service reads an unreadable row as.
    expect(firstFrame({}, at).textSize).toBe('default')
    expect(firstFrame({ textSize: 'gigantic' }, at).textSize).toBe('default')
    expect(firstFrame({ textSize: 'DEFAULT' }, at).textSize).toBe('default')

    expect(firstFrame({ textSize: 'small' }, at).textSize).toBe('small')
    expect(firstFrame({ textSize: 'large' }, at).textSize).toBe('large')
  })

  it('reads every size the settings offer, so a new one cannot miss the first frame', () => {
    for (const choice of TEXT_SIZE_CHOICES) {
      expect(firstFrame({ textSize: choice.value }, '2026-10-17T12:00:00').textSize).toBe(
        choice.value,
      )
    }
    expect(TEXT_SIZE_CHOICES.map((choice) => choice.value)).toContain(DEFAULT_TEXT_SIZE)
  })
})
