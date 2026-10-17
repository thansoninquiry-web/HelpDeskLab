import { render, screen } from '@testing-library/react'
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

vi.mock('../src/app/practiceService', () => ({
  loadQueue: vi.fn().mockResolvedValue([]),
  findActiveSessionId: vi.fn().mockResolvedValue(null),
  createTickets: vi.fn().mockResolvedValue([]),
  startAttempt: vi.fn(),
  formatSimClock: vi.fn().mockReturnValue('09:30'),
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
  it('renders the dashboard and primary navigation at the root route', () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Modules' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Practice' })).toHaveAttribute('href', '/practice')
    expect(screen.getByRole('link', { name: 'Open the ticket queue' })).toHaveAttribute(
      'href',
      '/practice',
    )
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

  it('renders the not-found page for unknown routes', () => {
    renderAt('/does-not-exist')

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})
