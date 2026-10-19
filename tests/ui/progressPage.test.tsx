import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressView } from '../../src/app/practiceService'
import { ProgressPage } from '../../src/ui/routes/ProgressPage'

vi.mock('../../src/app/practiceService', () => ({
  loadProgress: vi.fn(),
}))

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
        'You lose the most marks on notes and handoff. Practise a FS-01 ticket and work on that before retrying.',
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

beforeEach(async () => {
  const practice = await import('../../src/app/practiceService')
  vi.mocked(practice.loadProgress).mockResolvedValue(weakView)
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

    const link = await screen.findByRole('link', { name: 'Practise FS-01' })
    expect(link).toHaveAttribute('href', '/practice?family=FS-01')
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

    expect(
      await screen.findByText(/No weak spots yet/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Practise/ })).not.toBeInTheDocument()
  })
})
