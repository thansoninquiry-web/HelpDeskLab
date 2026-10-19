import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { TicketView } from '../src/app/practiceService'
import { AppRoutes } from '../src/ui/routes/AppRoutes'

const queueTicket: TicketView = {
  id: 'ticket-net',
  scenarioId: 'NET-01',
  variantId: 'bad-static-dns',
  scenarioTitle: 'Network and name resolution',
  variantLabel: 'Wrong DNS server',
  difficulty: 2,
  severity: 'high',
  category: 'network',
  status: 'available',
  subject: 'Dana cannot reach the file server',
  body: 'Nothing loads since I restarted my laptop.',
  requester: {
    name: 'Dana Whitfield',
    samAccountName: 'dwhitfield',
    employeeId: 'E-8842',
    department: 'Finance',
    email: 'dana.whitfield@larkspur.example',
    siteName: 'Larkspur HQ',
  },
  device: {
    hostname: 'LT-4471',
    kind: 'laptop',
    os: 'Windows 11 Enterprise 23H2',
    siteName: 'Larkspur HQ',
  },
  symptoms: ['Names fail while IP addresses work'],
  reportedAt: Date.UTC(2026, 9, 16, 9, 30),
}

vi.mock('../src/app/curriculumService', () => ({
  loadCurriculum: vi.fn().mockResolvedValue({
    modules: [],
    playable: 0,
    complete: 0,
    met: 0,
    total: 0,
    percent: 0,
    next: null,
  }),
}))

vi.mock('../src/app/practiceService', () => ({
  commandCheatSheet: vi.fn().mockReturnValue([]),
  loadQueue: vi.fn().mockResolvedValue([]),
  findActiveSessionId: vi.fn().mockResolvedValue(null),
  loadPracticeRecommendations: vi.fn().mockResolvedValue([]),
  createTickets: vi.fn().mockResolvedValue([]),
  startAttempt: vi.fn(),
  formatSimClock: vi.fn().mockReturnValue('09:30'),
  loadProgressSummary: vi.fn().mockResolvedValue({
    totalXp: 420,
    rank: {
      title: 'Tier 1 technician',
      xp: 420,
      nextTitle: 'Escalation ready',
      nextAt: 800,
      percent: 15,
    },
    streakDays: 3,
  }),
}))

async function mockQueue(tickets: TicketView[]) {
  const practice = await import('../src/app/practiceService')
  vi.mocked(practice.loadQueue).mockResolvedValue(tickets)
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('app shell', () => {
  it('renders the dashboard and primary navigation at the root route', async () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Modules' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/practice')
    expect(screen.getByRole('link', { name: 'Open the ticket queue' })).toHaveAttribute(
      'href',
      '/practice',
    )
    expect(await screen.findByText('Tier 1 technician')).toBeInTheDocument()
    expect(screen.getByText('420 XP')).toBeInTheDocument()
    expect(screen.getByText('3-day streak')).toBeInTheDocument()
  })

  it('renders generated tickets with requester, severity, and status', async () => {
    await mockQueue([queueTicket])
    renderAt('/practice')

    expect(screen.getByRole('heading', { level: 1, name: 'Practice' })).toBeInTheDocument()
    expect(await screen.findByText('Dana cannot reach the file server')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.getByText(/Dana Whitfield/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open ticket' })).toBeInTheDocument()
  })

  it('filters the queue to the family passed from a weak-topic link', async () => {
    await mockQueue([
      queueTicket,
      {
        ...queueTicket,
        id: 'ticket-m365',
        scenarioId: 'M365-01',
        scenarioTitle: 'Microsoft 365 sign-in',
        variantId: 'smart-lockout',
        category: 'identity',
        subject: 'Dana cannot sign in to Microsoft 365',
      },
    ])
    renderAt('/practice?family=M365-01')

    expect(await screen.findByText('Dana cannot sign in to Microsoft 365')).toBeInTheDocument()
    expect(screen.queryByText('Dana cannot reach the file server')).not.toBeInTheDocument()
    expect(screen.getByText(/Focused on Microsoft 365/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate three of this family' })).toBeInTheDocument()
  })

  it('centres the current section when the nav strip cannot show them all', async () => {
    renderAt('/')

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // jsdom has no layout, so the strip is measured the way a phone measures it.
    Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: 640 })
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 320 })
    const scrollTo = vi.fn()
    Object.assign(nav, { scrollTo })

    const practice = screen.getByRole('link', { name: 'Practice' })
    Object.defineProperty(practice, 'offsetLeft', { configurable: true, value: 400 })
    Object.defineProperty(practice, 'offsetWidth', { configurable: true, value: 80 })
    fireEvent.click(practice)

    // 400 − (320 − 80) / 2: the link's middle lands on the strip's middle.
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ left: 280 }))
  })

  it('renders the not-found page for unknown routes', () => {
    renderAt('/does-not-exist')

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})
