import { render, screen, within } from '@testing-library/react'
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
  voicemail: null,
  resume: null,
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

/**
 * The queue reads the price list beside the tickets, so the page renders with a
 * stand-in for the settings table's catalogue: a default and two families, one
 * of which prices itself.
 */
vi.mock('../src/app/settingsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/app/settingsService')>()),
  loadHintTargets: vi.fn().mockResolvedValue([
    { id: null, policy: { perHint: 5, cap: 15, budget: 0 }, own: true },
    { id: 'PWD-01', policy: { perHint: 5, cap: 15, budget: 0 }, own: false },
    { id: 'NET-01', policy: { perHint: 9, cap: 27, budget: 0 }, own: true },
    { id: 'PRN-01', policy: { perHint: 0, cap: 0, budget: 6 }, own: true },
  ]),
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

  it('says where the open ticket left off, and offers to resume from there', async () => {
    const practice = await import('../src/app/practiceService')
    await mockQueue([
      {
        ...queueTicket,
        status: 'in_progress',
        resume: { tool: 'printers', pane: 'tools', steps: 3 },
      },
    ])
    vi.mocked(practice.findActiveSessionId).mockResolvedValueOnce('session-printers')
    renderAt('/practice')

    // The card names the console and how far in the work had got, so a resume
    // is a known place rather than just a ticket title.
    expect(
      await screen.findByText('Left off in the Printers console, 3 steps in.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()

    // The bar at the top says the same thing, so resuming from there is no
    // more of a guess than resuming from the row.
    expect(
      screen.getByText(/You have a ticket open — left off in the Printers console, 3 steps in\./),
    ).toBeInTheDocument()
  })

  it('shows what a hint costs in each family, and marks the ones on the default', async () => {
    await mockQueue([queueTicket])
    renderAt('/practice')

    expect(await screen.findByRole('heading', { name: 'Hint prices' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Effective hint price by family' })

    // A family that has not been priced plays at the default, and says so.
    const accounts = within(list).getByText('Accounts').closest('li')
    expect(accounts).toHaveTextContent('5 pts a hint · cap 15')
    expect(accounts).toHaveTextContent('inherits default')

    // One with a price of its own shows that price instead.
    const network = within(list).getByText('Network').closest('li')
    expect(network).toHaveTextContent('9 pts a hint · cap 27')
    expect(network).toHaveTextContent('own price')

    // A free family says free, and its ration is the only number left to print.
    const printing = within(list).getByText('Printing').closest('li')
    expect(printing).toHaveTextContent('Free · 6 a ticket')

    // The default the inheriting families play at is stated once, above the list,
    // and the panel says when a price is fixed.
    const note = screen.getByText(/Every family plays at the default/)
    expect(note).toHaveTextContent('5 pts a hint · cap 15')
    expect(note).toHaveTextContent('keeps the price it started at')
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

  it('keeps every section in the header nav, with none hidden behind a scroll', () => {
    renderAt('/')

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      'Modules',
      'Practice',
      'DSA',
      'Languages',
      'Intune',
      'Azure',
      'Networking',
      'Desktop',
      'Education',
      'Job targets',
      'Progress',
      'Settings',
    ])
  })

  it('renders the not-found page for unknown routes', () => {
    renderAt('/does-not-exist')

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})
