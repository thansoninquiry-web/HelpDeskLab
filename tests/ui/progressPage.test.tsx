import { render, screen } from '@testing-library/react'
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
