import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressView, VerificationMethodRow } from '../../src/app/practiceService'
import { ProgressPage } from '../../src/ui/routes/ProgressPage'

vi.mock('../../src/app/practiceService', () => ({
  loadProgress: vi.fn(),
}))

vi.mock('../../src/app/settingsService', () => ({
  loadProgressSection: vi.fn(),
  saveProgressSection: vi.fn(),
}))

const verificationRows: VerificationMethodRow[] = [
  {
    method: 'verification-code',
    label: 'Code read-back',
    checks: 7,
    proved: 5,
    failed: 2,
    attempts: 5,
    provedPercent: 71,
  },
  {
    method: 'callback',
    label: 'Callback',
    checks: 3,
    proved: 2,
    failed: 1,
    attempts: 3,
    provedPercent: 67,
  },
]

const weakView: ProgressView = {
  attempts: 3,
  passes: 1,
  bestScore: 80,
  averageBest: 70,
  totalXp: 420,
  rank: {
    title: 'Tier 1 technician',
    xp: 420,
    nextTitle: 'Escalation ready',
    nextAt: 800,
    percent: 15,
  },
  streakDays: 3,
  rows: [
    {
      scenarioId: 'FS-01',
      scenarioTitle: 'Shared drives and permissions',
      simulator: 'service-desk',
      attempts: 2,
      passes: 1,
      bestScore: 80,
      lastPlayedAt: 1_760_000_400_000,
      leitnerBox: 2,
      dueAt: null,
    },
  ],
  hintHabits: [
    {
      itemId: 'verify-caller',
      label: 'Verified the caller before touching the account',
      attempts: 3,
      bought: 3,
      rungs: 5,
      boughtPercent: 100,
      band: 'bought-every-time',
    },
    {
      itemId: 'unlock',
      label: 'Unlocked the account and confirmed it',
      attempts: 3,
      bought: 1,
      rungs: 1,
      boughtPercent: 33,
      band: 'sometimes-bought',
    },
    {
      itemId: 'document',
      label: 'Left a troubleshooting note',
      attempts: 3,
      bought: 0,
      rungs: 0,
      boughtPercent: 0,
      band: 'worked-alone',
    },
  ],
  hintHabitSummary: {
    attempts: 3,
    attemptsWithHints: 2,
    steps: 3,
    everBought: 2,
    workedAlone: 1,
    rungs: 6,
    unaccountedRungs: 0,
    attemptsWithUnaccountedHints: 0,
  },
  verificationHabits: verificationRows,
  verificationSummary: {
    rows: verificationRows,
    checks: 10,
    proved: 7,
    attempts: 6,
    provedPercent: 70,
  },
  familyRewinds: [
    {
      scenarioId: 'PWD-01',
      scenarioTitle: 'Password and account access',
      rewinds: 3,
      attempts: 4,
      attemptsWithRewind: 2,
      stepsUnrun: 6,
      rewindPercent: 50,
      band: 'heavy',
      worstStep: { label: 'reset-password', times: 2 },
    },
    {
      scenarioId: 'FS-01',
      scenarioTitle: 'Shared drives and permissions',
      rewinds: 1,
      attempts: 10,
      attemptsWithRewind: 1,
      stepsUnrun: 2,
      rewindPercent: 10,
      band: 'rare',
      worstStep: { label: 'add-group-member', times: 1 },
    },
  ],
  rewindSummary: {
    rewinds: 4,
    attemptsWithRewind: 3,
    stepsUnrun: 8,
    families: 2,
  },
  targetRecommendations: [],
  weakTopics: [
    {
      scenarioId: 'FS-01',
      scenarioTitle: 'Shared drives and permissions',
      attempts: 2,
      averageScore: 65,
      passRate: 50,
      weakestCategory: {
        category: 'documentation',
        label: 'notes and handoff',
        earned: 4,
        possible: 20,
        percent: 20,
      },
      recommendation:
        'You lose the most marks on notes and handoff. Practice a FS-01 ticket and work on that before retrying.',
      simulator: 'service-desk',
      href: '/practice?family=FS-01',
      actionLabel: 'Practice FS-01',
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>,
  )
}

/** Where each section sits in the viewport, as the browser would measure it. */
function place(tops: Record<string, number>): void {
  for (const [id, top] of Object.entries(tops)) {
    const element = document.getElementById(id)
    if (!element) {
      throw new Error(`The page has no section ${id}`)
    }
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect)
  }
}

let scrollIntoView: ReturnType<typeof vi.fn>

beforeEach(async () => {
  const practice = await import('../../src/app/practiceService')
  const settings = await import('../../src/app/settingsService')
  vi.mocked(practice.loadProgress).mockResolvedValue(weakView)
  vi.mocked(settings.loadProgressSection).mockResolvedValue(null)
  vi.mocked(settings.saveProgressSection).mockResolvedValue(null)
  // jsdom has no scrolling, so the call the page makes is all there is to see.
  scrollIntoView = vi.fn()
  HTMLElement.prototype.scrollIntoView = scrollIntoView as unknown as typeof HTMLElement.prototype.scrollIntoView
})

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('ProgressPage weak topics', () => {
  it('shows the lowest-scoring family with its weakest category', async () => {
    renderPage()

    expect(await screen.findByRole('region', { name: 'Focus next' })).toBeInTheDocument()
    expect(screen.getAllByText('Shared drives and permissions').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/notes and handoff/).length).toBeGreaterThan(0)
    expect(screen.getByText(/average/)).toHaveTextContent('65')
  })

  it('links the recommendation to a filtered ticket queue', async () => {
    renderPage()

    // Scoped to the section the recommendation lives in: the rewind section
    // below offers the same way into practice for the families it names.
    const focus = await screen.findByRole('region', { name: 'Focus next' })
    expect(within(focus).getByRole('link', { name: 'Practice FS-01' })).toHaveAttribute(
      'href',
      '/practice?family=FS-01',
    )
  })

  it('reads as one record: a receipt, then ruled sections with their counts', async () => {
    renderPage()

    const record = await screen.findByRole('region', { name: 'Record' })
    expect(record).toHaveTextContent('Lifetime XP')
    expect(record).toHaveTextContent('Pass rate')
    expect(record).toHaveTextContent('Average best')

    // The count beside each heading is the one that section governs.
    expect(screen.getByRole('region', { name: 'Focus next' })).toHaveTextContent('1 family')
    expect(screen.getByRole('region', { name: 'Hint habits' })).toHaveTextContent('3 steps')
    expect(screen.getByRole('region', { name: 'Scenario mastery' })).toHaveTextContent('1 family')
  })

  it('shows lifetime XP, rank, and streak', async () => {
    renderPage()

    expect(await screen.findByText('Tier 1 technician')).toBeInTheDocument()
    expect(screen.getByText('420')).toBeInTheDocument()
    expect(screen.getByText(/3 days/)).toBeInTheDocument()
    expect(screen.getByText(/380 XP to Escalation ready/)).toBeInTheDocument()
  })

  it('shows which steps were bought and which were worked out alone', async () => {
    renderPage()

    const section = await screen.findByRole('region', { name: 'Hint habits' })
    expect(within(section).getByText(/6 rungs on 2 of 3 steps/)).toBeInTheDocument()
    expect(within(section).getByText(/the other 1 steps you worked out alone/)).toBeInTheDocument()

    const rows = within(section).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Verified the caller before touching the account')
    expect(rows[0]).toHaveTextContent('Bought in 3 of 3 attempts')
    expect(rows[0]).toHaveTextContent('Always bought')
    expect(rows[1]).toHaveTextContent('Bought in 1 of 3 attempts')
    expect(rows[1]).toHaveTextContent('Sometimes bought')
    expect(rows[2]).toHaveTextContent('Worked alone')
    expect(rows[2]).toHaveTextContent('Bought in 0 of 3 attempts')
  })

  it('reports the rungs the scores charged that the log can no longer place', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue({
      ...weakView,
      hintHabitSummary: {
        ...weakView.hintHabitSummary,
        // The rows add up to five: one charged rung has no row behind it.
        rungs: 5,
        unaccountedRungs: 1,
        attemptsWithUnaccountedHints: 1,
      },
    })

    renderPage()

    const section = await screen.findByRole('region', { name: 'Hint habits' })
    // The headline is what the learner paid, so it includes the rung with no row.
    expect(within(section).getByText(/6 rungs on 2 of 3 steps/)).toBeInTheDocument()
    expect(section).toHaveTextContent(/1 rung of those was charged on 1 attempt/)
    expect(section).toHaveTextContent(/no row below can place it/)
  })

  it('says nothing about unplaced rungs when the log accounts for all of them', async () => {
    renderPage()

    const section = await screen.findByRole('region', { name: 'Hint habits' })
    expect(section).not.toHaveTextContent(/charged on/)
  })

  it('explains the empty state before any attempt is scored', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue({
      ...weakView,
      hintHabits: [],
      hintHabitSummary: {
        attempts: 0,
        attemptsWithHints: 0,
        steps: 0,
        everBought: 0,
        workedAlone: 0,
        rungs: 0,
        unaccountedRungs: 0,
        attemptsWithUnaccountedHints: 0,
      },
    })

    renderPage()

    const section = await screen.findByRole('region', { name: 'Hint habits' })
    expect(section).toHaveTextContent(/No scored step yet/)
    expect(within(section).queryByRole('list')).not.toBeInTheDocument()
  })

  it('explains the empty state when nothing averages below 90', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue({ ...weakView, weakTopics: [] })

    renderPage()

    const focus = await screen.findByRole('region', { name: 'Focus next' })
    expect(within(focus).getByText(/No weak spots yet/)).toBeInTheDocument()
    expect(within(focus).queryByRole('link', { name: /Practice/ })).not.toBeInTheDocument()
  })
})

describe('ProgressPage simulator tags', () => {
  it('says which simulator each family is practiced in', async () => {
    renderPage()

    const focus = await screen.findByRole('region', { name: 'Focus next' })
    expect(within(focus).getAllByRole('listitem')[0]).toHaveTextContent('Service desk')

    const scenarios = await screen.findByRole('region', { name: 'Scenario mastery' })
    expect(
      within(scenarios).getByRole('row', { name: /Shared drives and permissions/ }),
    ).toHaveTextContent('Service desk')
  })

  it('marks a console scenario as Intune and sends its row to the console', async () => {
    const practice = await import('../../src/app/practiceService')
    const consoleTitle = 'Laptop reported as non-compliant'
    vi.mocked(practice.loadProgress).mockResolvedValue({
      ...weakView,
      rows: [
        {
          ...weakView.rows[0]!,
          scenarioId: 'tpl-bitlocker-off',
          scenarioTitle: consoleTitle,
          simulator: 'intune',
          href: '/intune/tickets',
        },
      ],
      weakTopics: [
        {
          ...weakView.weakTopics[0]!,
          scenarioId: 'tpl-bitlocker-off',
          scenarioTitle: consoleTitle,
          simulator: 'intune',
          href: '/intune/tickets',
          actionLabel: 'Open the console',
        },
      ],
    })

    renderPage()

    const focus = await screen.findByRole('region', { name: 'Focus next' })
    expect(within(focus).getAllByRole('listitem')[0]).toHaveTextContent('Intune')
    expect(within(focus).getByRole('link', { name: 'Open the console' })).toHaveAttribute(
      'href',
      '/intune/tickets',
    )

    const scenarios = screen.getByRole('region', { name: 'Scenario mastery' })
    expect(within(scenarios).getByRole('row', { name: new RegExp(consoleTitle) })).toHaveTextContent(
      'Intune',
    )
    expect(within(scenarios).getByRole('link', { name: consoleTitle })).toHaveAttribute(
      'href',
      '/intune/tickets',
    )
  })
})

describe('ProgressPage simulator filter', () => {
  const consoleTitle = 'Laptop reported as non-compliant'
  const mixedView: ProgressView = {
    ...weakView,
    rows: [
      weakView.rows[0]!,
      {
        ...weakView.rows[0]!,
        scenarioId: 'tpl-bitlocker-off',
        scenarioTitle: consoleTitle,
        simulator: 'intune',
        href: '/intune/tickets',
      },
    ],
    weakTopics: [
      weakView.weakTopics[0]!,
      {
        ...weakView.weakTopics[0]!,
        scenarioId: 'tpl-bitlocker-off',
        scenarioTitle: consoleTitle,
        simulator: 'intune',
        href: '/intune/tickets',
        actionLabel: 'Open the console',
      },
    ],
  }

  it('shows one simulator in both lists, and all of them again', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue(mixedView)

    renderPage()

    const focus = await screen.findByRole('region', { name: 'Focus next' })
    const scenarios = screen.getByRole('region', { name: 'Scenario mastery' })
    expect(within(focus).getByText('Shared drives and permissions')).toBeInTheDocument()
    expect(within(focus).getByText(consoleTitle)).toBeInTheDocument()
    expect(within(scenarios).getByRole('row', { name: /Shared drives and permissions/ })).toBeInTheDocument()
    expect(within(scenarios).getByRole('row', { name: new RegExp(consoleTitle) })).toBeInTheDocument()

    fireEvent.click(within(focus).getByRole('button', { name: 'Intune' }))

    expect(within(focus).queryByText('Shared drives and permissions')).not.toBeInTheDocument()
    expect(within(focus).getByText(consoleTitle)).toBeInTheDocument()
    expect(within(focus).getByRole('button', { name: 'Intune' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(focus).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(focus).toHaveTextContent('1 family · Intune only')

    // The second control is the same filter, so the table narrowed with it.
    expect(within(scenarios).queryByRole('row', { name: /Shared drives and permissions/ })).not.toBeInTheDocument()
    expect(within(scenarios).getByRole('row', { name: new RegExp(consoleTitle) })).toBeInTheDocument()
    expect(scenarios).toHaveTextContent('1 family · Intune only')

    fireEvent.click(within(scenarios).getByRole('button', { name: 'All' }))

    expect(within(focus).getByText('Shared drives and permissions')).toBeInTheDocument()
    expect(within(scenarios).getByRole('row', { name: /Shared drives and permissions/ })).toBeInTheDocument()
    expect(within(scenarios).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('says so when the chosen simulator has nothing to show', async () => {
    renderPage()

    const focus = await screen.findByRole('region', { name: 'Focus next' })
    fireEvent.click(within(focus).getByRole('button', { name: 'Intune' }))

    expect(focus).toHaveTextContent('No Intune scenario is below 90 right now.')
    expect(focus).toHaveTextContent('Nothing below 90')

    const scenarios = screen.getByRole('region', { name: 'Scenario mastery' })
    expect(scenarios).toHaveTextContent('No Intune scenario has been scored yet.')
    expect(scenarios).toHaveTextContent('No scored attempts')
  })
})

describe('ProgressPage verification methods', () => {
  it('breaks caller checks down by the proof used, most used first', async () => {
    renderPage()

    const section = await screen.findByRole('region', { name: 'How you verify callers' })
    expect(section).toHaveTextContent('2 methods')
    expect(section).toHaveTextContent('7 of 10 checks proved who was on the line')
    expect(section).toHaveTextContent('the other 3 checks did not')

    const rows = within(section).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    // The code read-back was used more often than the callback, so it leads.
    expect(rows[0]).toHaveTextContent('Code read-back')
    expect(rows[0]).toHaveTextContent('7 checks in 5 attempts · 5 proved the caller · 2 did not')
    expect(rows[0]).toHaveTextContent('71% proved')
    expect(rows[1]).toHaveTextContent('Callback')
    expect(rows[1]).toHaveTextContent('3 checks in 3 attempts · 2 proved the caller · 1 did not')
    expect(rows[1]).toHaveTextContent('67% proved')
  })

  it('does not claim checks failed when every one proved the caller', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue({
      ...weakView,
      verificationHabits: verificationRows.slice(0, 1),
      verificationSummary: {
        rows: verificationRows.slice(0, 1),
        checks: 7,
        proved: 7,
        attempts: 5,
        provedPercent: 100,
      },
    })

    renderPage()

    const section = await screen.findByRole('region', { name: 'How you verify callers' })
    expect(section).toHaveTextContent('7 of 7 checks proved who was on the line.')
    expect(section).not.toHaveTextContent(/did not, which is what/)
  })

  it('explains the empty state before any caller is checked', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue({
      ...weakView,
      verificationHabits: [],
      verificationSummary: { rows: [], checks: 0, proved: 0, attempts: 0, provedPercent: 0 },
    })

    renderPage()

    const section = await screen.findByRole('region', { name: 'How you verify callers' })
    expect(section).toHaveTextContent('No checks yet')
    expect(section).toHaveTextContent(/No caller check yet/)
    expect(within(section).queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('ProgressPage rewinds', () => {
  it('names the family cut most and the step the cuts start at', async () => {
    renderPage()

    const section = await screen.findByRole('region', { name: 'Rewinds' })
    const rows = within(section).getAllByRole('listitem')

    expect(rows).toHaveLength(2)
    // Heaviest first: half the attempts on PWD-01 were cut, one in ten on FS-01.
    expect(rows[0]).toHaveTextContent('Password and account access')
    expect(rows[0]).toHaveTextContent('3 rewinds in 4 attempts')
    expect(rows[0]).toHaveTextContent('6 steps un-run')
    expect(rows[0]).toHaveTextContent('Most un-run: reset-password (2 of 3)')
    expect(rows[0]).toHaveTextContent('Heavy · 50%')
    expect(rows[1]).toHaveTextContent('Most un-run: add-group-member (1 of 1)')
    expect(rows[1]).toHaveTextContent('Rarely · 10%')
  })

  it('reads the cuts back to the learner, then offers the way in', async () => {
    renderPage()

    const section = await screen.findByRole('region', { name: 'Rewinds' })
    expect(section).toHaveTextContent('2 families')
    expect(section).toHaveTextContent(/Across 4 cuts on 3 attempts you have un-run 8 steps/)
    expect(within(section).getByRole('link', { name: 'Practice PWD-01' })).toHaveAttribute(
      'href',
      '/practice?family=PWD-01',
    )
  })

  it('says so when a family has no step worth naming yet', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue({
      ...weakView,
      familyRewinds: [{ ...weakView.familyRewinds[0]!, worstStep: null }],
      rewindSummary: { rewinds: 3, attemptsWithRewind: 2, stepsUnrun: 6, families: 1 },
    })

    renderPage()

    const section = await screen.findByRole('region', { name: 'Rewinds' })
    expect(within(section).getByText(/No single step stands out yet/)).toBeInTheDocument()
  })

  it('explains the empty state before anything has been un-run', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadProgress).mockResolvedValue({
      ...weakView,
      familyRewinds: [],
      rewindSummary: { rewinds: 0, attemptsWithRewind: 0, stepsUnrun: 0, families: 0 },
    })

    renderPage()

    const section = await screen.findByRole('region', { name: 'Rewinds' })
    expect(section).toHaveTextContent('No rewinds')
    expect(section).toHaveTextContent(/No rewinds yet/)
    expect(within(section).queryByRole('list')).not.toBeInTheDocument()
  })
})

/**
 * Coming back to the page lands where the reading stopped, which is a section of
 * the page rather than a scroll offset: the page is rebuilt from live history, so
 * a row added above would move an offset onto a different block.
 */
describe('the section the page was left on', () => {
  it('opens on the section it was left on', async () => {
    const settings = await import('../../src/app/settingsService')
    vi.mocked(settings.loadProgressSection).mockResolvedValue('progress-hints')

    renderPage()

    await screen.findByRole('region', { name: 'Hint habits' })
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('progress-hints'))
  })

  it('opens at the top when it has never been left anywhere', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Record' })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('writes the section the reading came to rest on', async () => {
    const settings = await import('../../src/app/settingsService')

    renderPage()
    await screen.findByRole('region', { name: 'Rewinds' })

    // Scrolled so the Hint habits heading has passed the line and the section
    // below it has not.
    place({
      'progress-record': -2600,
      'progress-rank': -2100,
      'progress-focus': -1400,
      'progress-hints': -60,
      'progress-verification': 520,
      'progress-rewinds': 1100,
      'progress-scenarios': 2500,
    })
    fireEvent.scroll(window)

    await waitFor(() => expect(settings.saveProgressSection).toHaveBeenCalledWith('progress-hints'), {
      timeout: 1500,
    })
  })

  it('writes nothing when the reading settles where it was already stored', async () => {
    const settings = await import('../../src/app/settingsService')
    vi.mocked(settings.loadProgressSection).mockResolvedValue('progress-rewinds')

    renderPage()
    await screen.findByRole('region', { name: 'Rewinds' })

    place({
      'progress-record': -4000,
      'progress-rank': -3400,
      'progress-focus': -2600,
      'progress-hints': -1200,
      'progress-verification': -300,
      'progress-rewinds': 40,
      'progress-scenarios': 800,
    })
    fireEvent.scroll(window)

    // Past the settle delay, so a write had every chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(settings.saveProgressSection).not.toHaveBeenCalled()
  })
})
