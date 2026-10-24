import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startTheme } from '../../src/app/themeService'
import { SettingsPage } from '../../src/ui/routes/SettingsPage'

// The real settings services run against this stand-in for the settings table,
// so the tests also cover their normalizing and validation rather than a stub.
const settingsStore = vi.hoisted(() => ({
  /** The single price an older build wrote, which this build migrates. */
  hint: null as unknown,
  /** The per-family prices this build writes. */
  prices: null as unknown,
  exam: null as unknown,
  theme: null as unknown,
  schedule: null as unknown,
  terminal: null as unknown,
  textSize: null as unknown,
  /** Set by the tests that need a write to fail, as a full disk would. */
  failWrite: false,
  writes: [] as unknown[],
}))

vi.mock('../../src/app/persistenceService', () => ({
  getLocalDatabaseStatus: vi.fn().mockResolvedValue({
    engine: 'sqlite-wasm',
    storage: 'indexeddb',
    schemaVersion: 5,
    storedBytes: 20480,
    persistentStorage: true,
  }),
  getLocalDatabase: async () => ({
    settings: {
      get: async (key: string) => {
        if (key === 'theme') {
          return settingsStore.theme
        }
        if (key === 'themeSchedule') {
          return settingsStore.schedule
        }
        if (key === 'terminalSurface') {
          return settingsStore.terminal
        }
        if (key === 'textSize') {
          return settingsStore.textSize
        }
        if (key === 'examMode') {
          return settingsStore.exam
        }
        return key === 'hintPolicies' ? settingsStore.prices : settingsStore.hint
      },
      set: async (key: string, value: unknown) => {
        if (settingsStore.failWrite) {
          throw new Error('IndexedDB is unavailable')
        }
        settingsStore.writes.push(value)
        if (key === 'theme') {
          settingsStore.theme = value
        } else if (key === 'themeSchedule') {
          settingsStore.schedule = value
        } else if (key === 'terminalSurface') {
          settingsStore.terminal = value
        } else if (key === 'textSize') {
          settingsStore.textSize = value
        } else if (key === 'examMode') {
          settingsStore.exam = value
        } else if (key === 'hintPolicies') {
          settingsStore.prices = value
        } else {
          settingsStore.hint = value
        }
      },
    },
  }),
}))

vi.mock('../../src/app/maintenanceService', () => ({
  exportBackupFile: vi.fn(),
  importBackupBytes: vi.fn(),
  resetLocalDatabase: vi.fn(),
}))

/** Fakes the clock without faking the timers the page's waits rely on. */
function freezeClock(moment: Date): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(moment)
}

/** jsdom ships no matchMedia, so the operating system is ours to set. */
function stubOperatingSystem(matches: boolean) {
  let current = matches
  const listeners: Array<() => void> = []
  const query = {
    get matches() {
      return current
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener)
    },
    removeEventListener: () => {},
  } as unknown as MediaQueryList

  window.matchMedia = (() => query) as unknown as typeof window.matchMedia

  return {
    flip(next: boolean) {
      current = next
      for (const listener of [...listeners]) {
        listener()
      }
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'matchMedia')
})

beforeEach(async () => {
  settingsStore.hint = null
  settingsStore.prices = null
  settingsStore.exam = null
  settingsStore.theme = null
  settingsStore.schedule = null
  settingsStore.terminal = null
  settingsStore.textSize = null
  settingsStore.failWrite = false
  settingsStore.writes = []
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.terminal
  delete document.documentElement.dataset.textSize

  const maintenance = await import('../../src/app/maintenanceService')
  vi.mocked(maintenance.exportBackupFile).mockResolvedValue({
    filename: 'helpdesklab-test.sqlite',
    bytes: new Uint8Array([1, 2, 3]),
  })
  vi.mocked(maintenance.importBackupBytes).mockResolvedValue(undefined)
  vi.mocked(maintenance.resetLocalDatabase).mockResolvedValue(undefined)
})

describe('SettingsPage', () => {
  it('shows the live local database details', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('SQLite (WebAssembly) · schema v5')).toBeInTheDocument()
    expect(screen.getByText('IndexedDB snapshot')).toBeInTheDocument()
    expect(screen.getByText('20 KB')).toBeInTheDocument()
    expect(screen.getByText('Granted')).toBeInTheDocument()
  })

  it('exports a backup file and reports what was saved', async () => {
    render(<SettingsPage />)
    const maintenance = await import('../../src/app/maintenanceService')

    fireEvent.click(await screen.findByRole('button', { name: 'Export backup' }))

    await waitFor(() => {
      expect(maintenance.exportBackupFile).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText(/Saved helpdesklab-test\.sqlite/)).toBeInTheDocument()
  })

  it('imports a backup through the file picker', async () => {
    render(<SettingsPage />)
    const maintenance = await import('../../src/app/maintenanceService')

    const file = new File([new Uint8Array([1, 2, 3])], 'backup.sqlite', {
      type: 'application/vnd.sqlite3',
    })
    fireEvent.change(screen.getByLabelText('Import a backup'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(maintenance.importBackupBytes).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText(/Imported backup\.sqlite/)).toBeInTheDocument()
  })

  it('requires a second confirmation before resetting history', async () => {
    render(<SettingsPage />)
    const maintenance = await import('../../src/app/maintenanceService')

    fireEvent.click(await screen.findByRole('button', { name: 'Reset local history…' }))
    expect(screen.getByText(/replaces your queue, scores, and progress/)).toBeInTheDocument()
    expect(maintenance.resetLocalDatabase).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset local history' }))

    await waitFor(() => {
      expect(maintenance.resetLocalDatabase).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText(/Local history reset/)).toBeInTheDocument()
  })

  it('shows the standard hint price and what it means', async () => {
    render(<SettingsPage />)

    expect(await screen.findByLabelText('Points per hint')).toHaveValue(5)
    expect(screen.getByLabelText('Cap per ticket')).toHaveValue(15)
    expect(screen.getByLabelText('Hints per attempt')).toHaveValue(0)
    expect(screen.getByText('0 means no limit')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Each hint costs 5 points of diagnostic reasoning, up to 15 points on a ticket; after that they are free.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save hint price' })).toBeEnabled()
  })

  it('offers exam mode off, naming the rate an exam would pin', async () => {
    render(<SettingsPage />)

    const toggle = await screen.findByLabelText(/Exam mode/)

    expect(toggle).not.toBeChecked()
    expect(screen.getByText(/hides every hint while the ticket is open/)).toBeInTheDocument()
    expect(screen.getByText(/5 points a rung, capped at 15/)).toBeInTheDocument()
  })

  it('turns exam mode on without touching the learner price', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByLabelText(/Exam mode/))

    expect(await screen.findByText(/Exam mode is on\./)).toBeInTheDocument()
    expect(settingsStore.writes).toEqual([{ on: true }])
    expect(settingsStore.hint).toBeNull()
    expect(screen.getByLabelText(/Exam mode/)).toBeChecked()

    fireEvent.click(screen.getByLabelText(/Exam mode/))

    expect(await screen.findByText(/Exam mode is off\./)).toBeInTheDocument()
    expect(settingsStore.writes).toEqual([{ on: true }, { on: false }])
  })

  it('opens with a saved exam mode already ticked', async () => {
    settingsStore.exam = { on: true }
    render(<SettingsPage />)

    expect(await screen.findByLabelText(/Exam mode/)).toBeChecked()
  })

  it('saves a new price and cap and repeats them back', async () => {
    render(<SettingsPage />)

    fireEvent.change(await screen.findByLabelText('Points per hint'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Cap per ticket'), { target: { value: '40' } })
    expect(screen.getByText(/costs 10 points .* up to 40 points/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save hint price' }))

    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument()
    expect(settingsStore.writes).toEqual([
      { default: { perHint: 10, cap: 40, budget: 0 }, families: {} },
    ])
  })

  it('saves a per-attempt hint budget and says it in words', async () => {
    render(<SettingsPage />)

    fireEvent.change(await screen.findByLabelText('Hints per attempt'), { target: { value: '4' } })

    expect(screen.getByText(/Each attempt may take up to 4 hints\.$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save hint price' }))

    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument()
    expect(settingsStore.writes).toEqual([
      { default: { perHint: 5, cap: 15, budget: 4 }, families: {} },
    ])
  })

  it('keeps the budget editable when hints are free, because it rations them', async () => {
    settingsStore.hint = { perHint: 0, cap: 0, budget: 2 }
    render(<SettingsPage />)

    const budget = await screen.findByLabelText('Hints per attempt')
    expect(budget).toHaveValue(2)
    expect(budget).toBeEnabled()
    expect(screen.getByLabelText('Points per hint')).toBeDisabled()
    expect(
      screen.getByText(
        'Hints are free on this device: every rung you reveal costs 0 points. Each attempt may take up to 2 hints.',
      ),
    ).toBeInTheDocument()
  })

  it('refuses a budget beyond what one attempt may take', async () => {
    render(<SettingsPage />)

    fireEvent.change(await screen.findByLabelText('Hints per attempt'), { target: { value: '99' } })

    expect(
      screen.getByText('One attempt cannot be given more than 50 hints.'),
    ).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save hint price' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(settingsStore.writes).toEqual([])
  })

  it('refuses a cap that is lower than a single hint', async () => {
    render(<SettingsPage />)

    const cap = await screen.findByLabelText('Cap per ticket')
    fireEvent.change(cap, { target: { value: '3' } })

    expect(screen.getByText('The cap cannot be lower than one hint.')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save hint price' })
    expect(save).toBeDisabled()

    fireEvent.click(save)
    expect(settingsStore.writes).toEqual([])
  })

  it('lets the learner make hints free and saves that as a zero price', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByLabelText('Hints are free'))

    expect(screen.getByLabelText('Points per hint')).toBeDisabled()
    expect(screen.getByText(/Hints are free on this device/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save hint price' }))

    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument()
    expect(settingsStore.writes).toEqual([
      { default: { perHint: 0, cap: 0, budget: 0 }, families: {} },
    ])
  })

  it('opens with a saved free policy already ticked', async () => {
    settingsStore.hint = { perHint: 0, cap: 0 }
    render(<SettingsPage />)

    expect(await screen.findByLabelText('Hints are free')).toBeChecked()
    expect(screen.getByLabelText('Points per hint')).toBeDisabled()
  })

  it('puts the standard price back without saving it', async () => {
    settingsStore.hint = { perHint: 12, cap: 36, budget: 5 }
    render(<SettingsPage />)

    expect(await screen.findByLabelText('Points per hint')).toHaveValue(12)
    fireEvent.click(screen.getByRole('button', { name: 'Reset to 5 / 15' }))

    expect(screen.getByLabelText('Points per hint')).toHaveValue(5)
    expect(screen.getByLabelText('Cap per ticket')).toHaveValue(15)
    expect(screen.getByLabelText('Hints per attempt')).toHaveValue(0)
    expect(settingsStore.writes).toEqual([])
  })

  it('prices one scenario family on its own, leaving the default alone', async () => {
    render(<SettingsPage />)

    const picker = await screen.findByLabelText('Price for')
    expect(
      within(picker).getByRole('option', {
        name: 'Default — every family without its own price',
      }),
    ).toBeInTheDocument()
    expect(
      within(picker).getByRole('option', { name: 'Accounts — the default price' }),
    ).toBeInTheDocument()

    fireEvent.change(picker, { target: { value: 'PWD-01' } })
    // A family with no price of its own opens on the default, ready to change.
    expect(screen.getByLabelText('Points per hint')).toHaveValue(5)

    fireEvent.change(screen.getByLabelText('Points per hint'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Cap per ticket'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save this family/ }))

    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument()
    expect(settingsStore.writes).toEqual([
      {
        default: { perHint: 5, cap: 15, budget: 0 },
        families: { 'PWD-01': { perHint: 3, cap: 9, budget: 0 } },
      },
    ])
    expect(screen.getByRole('option', { name: 'Accounts — its own price' })).toBeInTheDocument()
    // The other families still read as inheriting the default.
    expect(
      screen.getByRole('option', { name: 'Network — the default price' }),
    ).toBeInTheDocument()
  })

  it('hands a family back to the default when its own price is dropped', async () => {
    settingsStore.prices = {
      default: { perHint: 5, cap: 15, budget: 0 },
      families: { 'PWD-01': { perHint: 3, cap: 9, budget: 0 } },
    }
    render(<SettingsPage />)

    fireEvent.change(await screen.findByLabelText('Price for'), { target: { value: 'PWD-01' } })
    expect(screen.getByLabelText('Points per hint')).toHaveValue(3)

    fireEvent.click(screen.getByRole('button', { name: 'Use the default' }))

    expect(await screen.findByText(/plays at the default again/)).toBeInTheDocument()
    expect(settingsStore.prices).toEqual({
      default: { perHint: 5, cap: 15, budget: 0 },
      families: {},
    })
    expect(screen.getByLabelText('Points per hint')).toHaveValue(5)
    expect(screen.queryByRole('button', { name: 'Use the default' })).not.toBeInTheDocument()
  })

  it('treats a price saved before families existed as the one every family inherits', async () => {
    settingsStore.hint = { perHint: 12, cap: 36, budget: 2 }
    render(<SettingsPage />)

    expect(await screen.findByLabelText('Points per hint')).toHaveValue(12)

    fireEvent.change(screen.getByLabelText('Price for'), { target: { value: 'NET-01' } })
    expect(screen.getByLabelText('Points per hint')).toHaveValue(12)
    expect(screen.getByLabelText('Cap per ticket')).toHaveValue(36)
    expect(screen.getByLabelText('Hints per attempt')).toHaveValue(2)
    expect(screen.getByRole('option', { name: 'Network — the default price' })).toBeInTheDocument()
  })

  it('offers the workspace themes and starts by following the system', async () => {
    render(<SettingsPage />)

    const group = await screen.findByRole('radiogroup', { name: 'Workspace theme' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Schedule' })).not.toBeChecked()
    // jsdom has no matchMedia, so the system reads as light here.
    expect(
      screen.getByText('Following your system setting: the workspace is light right now.'),
    ).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('pins the workspace to Dark when the system default is not wanted', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('radio', { name: 'Dark' }))

    await waitFor(() => {
      expect(settingsStore.theme).toBe('dark')
    })
    expect(
      screen.getByText('The workspace is always dark, whatever your system prefers.'),
    ).toBeInTheDocument()
  })

  it('saves a theme change and repaints the document at once', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('radio', { name: 'Light' }))

    await waitFor(() => {
      expect(settingsStore.theme).toBe('light')
    })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('helpdesklab.theme')).toBe('light')
    expect(
      screen.getByText('The workspace is always light, whatever your system prefers.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    await waitFor(() => {
      expect(settingsStore.theme).toBe('dark')
    })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('helpdesklab.theme')).toBe('dark')
  })

  it('repaints the open workspace when the operating system switches', async () => {
    const system = stubOperatingSystem(false)
    // main.tsx boots the theme before React renders; the page is then already
    // listening when the operating system flips underneath it.
    startTheme()
    render(<SettingsPage />)

    expect(await screen.findByRole('radio', { name: 'System' })).toBeChecked()
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light')
    })
    expect(
      screen.getByText('Following your system setting: the workspace is light right now.'),
    ).toBeInTheDocument()

    system.flip(true)

    // No click and no save: the OS switch alone repaints the tokens and the
    // sentence that describes them.
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark')
    })
    expect(
      screen.getByText('Following your system setting: the workspace is dark right now.'),
    ).toBeInTheDocument()
    expect(settingsStore.writes).toEqual([])

    // A pinned choice stops listening, so the next switch is ignored.
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    await waitFor(() => {
      expect(settingsStore.theme).toBe('dark')
    })

    system.flip(false)

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(
      screen.getByText('The workspace is always dark, whatever your system prefers.'),
    ).toBeInTheDocument()
  })

  it('offers the text sizes and opens on the size the layout was designed at', async () => {
    render(<SettingsPage />)

    const group = await screen.findByRole('radiogroup', { name: 'Text size' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Small' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Large' })).not.toBeChecked()
    expect(
      screen.getByText('The workspace is at the size it was laid out at.'),
    ).toBeInTheDocument()
    // The attribute the stylesheet scales from is on the document, not on a
    // component, so the whole workspace moves with it.
    expect(document.documentElement.dataset.textSize).toBe('default')
  })

  it('scales the workspace from one choice and remembers it', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('radio', { name: 'Large' }))

    await waitFor(() => {
      expect(settingsStore.textSize).toBe('large')
    })
    expect(document.documentElement.dataset.textSize).toBe('large')
    expect(localStorage.getItem('helpdesklab.textSize')).toBe('large')
    expect(
      screen.getByText(
        'The workspace is scaled up, spacing included, so the same layout takes more room.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Small' }))

    await waitFor(() => {
      expect(settingsStore.textSize).toBe('small')
    })
    expect(document.documentElement.dataset.textSize).toBe('small')
    expect(localStorage.getItem('helpdesklab.textSize')).toBe('small')
  })

  it('opens on a saved text size', async () => {
    settingsStore.textSize = 'small'
    render(<SettingsPage />)

    expect(await screen.findByRole('radio', { name: 'Small' })).toBeChecked()
    expect(document.documentElement.dataset.textSize).toBe('small')
    expect(
      screen.getByText(
        'The workspace is scaled down, spacing included, so more of it fits on the screen.',
      ),
    ).toBeInTheDocument()
  })

  it('puts the size it had back when the choice cannot be saved', async () => {
    render(<SettingsPage />)
    expect(await screen.findByRole('radio', { name: 'Default' })).toBeChecked()

    settingsStore.failWrite = true
    fireEvent.click(screen.getByRole('radio', { name: 'Large' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('IndexedDB is unavailable')
    expect(document.documentElement.dataset.textSize).toBe('default')
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Large' })).not.toBeChecked()
  })

  it('lets the terminal keep its dark surface, as its own choice', async () => {
    render(<SettingsPage />)

    const group = await screen.findByRole('radiogroup', { name: 'Terminal surface' })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'Always dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Follow the workspace' })).not.toBeChecked()
    expect(
      screen.getByText(
        'The terminal keeps its own dark surface, whichever workspace theme is in use.',
      ),
    ).toBeInTheDocument()
    expect(document.documentElement.dataset.terminal).toBe('dark')

    fireEvent.click(screen.getByRole('radio', { name: 'Follow the workspace' }))

    await waitFor(() => {
      expect(settingsStore.terminal).toBe('follow')
    })
    expect(document.documentElement.dataset.terminal).toBe('follow')
    expect(localStorage.getItem('helpdesklab.terminal')).toBe('follow')
    // The workspace follows the system here, and jsdom's system reads as light.
    expect(
      screen.getByText('The terminal follows the workspace: it is light right now.'),
    ).toBeInTheDocument()
  })

  it('opens the terminal choice from the saved setting', async () => {
    settingsStore.terminal = 'follow'
    render(<SettingsPage />)

    expect(await screen.findByRole('radio', { name: 'Follow the workspace' })).toBeChecked()
    await waitFor(() => {
      expect(document.documentElement.dataset.terminal).toBe('follow')
    })
  })

  it('opens with a saved dark choice already ticked', async () => {
    settingsStore.theme = 'dark'
    render(<SettingsPage />)

    expect(await screen.findByRole('radio', { name: 'Dark' })).toBeChecked()
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark')
    })
    expect(settingsStore.writes).toEqual([])
  })

  it('offers the schedule as the fourth choice, with its boundaries kept back', async () => {
    freezeClock(new Date(2026, 9, 17, 12, 0))
    settingsStore.schedule = { dawn: '06:30', dusk: '18:30' }
    render(<SettingsPage />)

    const schedule = await screen.findByRole('radio', { name: 'Schedule' })
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument()
    // The fields belong to the choice, so they are not in the way until it is picked.
    expect(screen.queryByLabelText('Dawn')).not.toBeInTheDocument()

    fireEvent.click(schedule)

    await waitFor(() => {
      expect(settingsStore.theme).toBe('schedule')
    })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByLabelText('Dawn')).toHaveValue('06:30')
    expect(screen.getByLabelText('Dusk')).toHaveValue('18:30')
    expect(
      screen.getByText('Light from 06:30 to 18:30: the workspace is light right now.'),
    ).toBeInTheDocument()
  })

  it('saves new boundaries and repaints by them at once', async () => {
    freezeClock(new Date(2026, 9, 17, 20, 0))
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('radio', { name: 'Schedule' }))
    // The default window closed at 19:00, so the schedule starts out dark.
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    fireEvent.change(screen.getByLabelText('Dawn'), { target: { value: '19:00' } })
    fireEvent.change(screen.getByLabelText('Dusk'), { target: { value: '23:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }))

    await waitFor(() => {
      expect(settingsStore.schedule).toEqual({ dawn: '19:00', dusk: '23:00' })
    })
    expect(await screen.findByText(/^Saved\./)).toBeInTheDocument()
    // 20:00 sits inside the new window, so the same clock now reads light.
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('helpdesklab.theme.schedule')).toBe(
      JSON.stringify({ dawn: '19:00', dusk: '23:00' }),
    )
  })

  it('previews the workspace at any time of day before the schedule is saved', async () => {
    freezeClock(new Date(2026, 9, 17, 12, 0))
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('radio', { name: 'Schedule' }))
    await waitFor(() => {
      expect(settingsStore.theme).toBe('schedule')
    })

    // The default 07:00–19:00 window is daylight at the hour the page opened.
    const stage = screen.getByRole('img', { name: 'The light workspace at 12:00' })
    expect(stage).toHaveAttribute('data-theme', 'light')

    fireEvent.change(screen.getByLabelText('Preview time of day'), { target: { value: '1380' } })
    expect(screen.getByRole('img', { name: 'The dark workspace at 23:00' })).toHaveAttribute(
      'data-theme',
      'dark',
    )

    // A boundary that has not been saved yet is already in the preview.
    fireEvent.change(screen.getByLabelText('Dusk'), { target: { value: '23:30' } })
    expect(screen.getByRole('img', { name: 'The light workspace at 23:00' })).toHaveAttribute(
      'data-theme',
      'light',
    )
    expect(settingsStore.schedule).toBeNull()
  })

  it('will not save a boundary that is not a time', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('radio', { name: 'Schedule' }))
    fireEvent.change(screen.getByLabelText('Dusk'), { target: { value: '' } })

    expect(screen.getByRole('button', { name: 'Save schedule' })).toBeDisabled()
    expect(screen.getByText(/have to be times like 07:00 and 19:00/)).toBeInTheDocument()
    expect(settingsStore.schedule).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Reset to 07:00/ }))
    expect(screen.getByLabelText('Dusk')).toHaveValue('19:00')
    expect(screen.getByRole('button', { name: 'Save schedule' })).toBeEnabled()
  })
})
