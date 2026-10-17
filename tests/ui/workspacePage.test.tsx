import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceView } from '../../src/app/practiceService'
import { TicketWorkspacePage } from '../../src/ui/routes/TicketWorkspacePage'

function makeView(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    sessionId: 'session-1',
    ticket: {
      id: 'ticket-1',
      scenarioId: 'NET-01',
      variantId: 'bad-static-dns',
      scenarioTitle: 'Network and name resolution',
      variantLabel: 'Wrong DNS server',
      difficulty: 2,
      severity: 'high',
      category: 'network',
      status: 'in_progress',
      subject: 'Dana cannot reach the file server',
      body: 'Nothing loads since I restarted my laptop. Teams still works.',
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
    },
    entries: [
      {
        kind: 'command',
        text: 'nslookup fileserver',
        atMs: Date.UTC(2026, 9, 16, 9, 31),
        ok: false,
        lines: [{ text: 'DNS request timed out.', tone: 'error' }],
      },
    ],
    simulatedClock: Date.UTC(2026, 9, 16, 9, 31),
    minutesElapsed: 1,
    hasVerifiedCaller: false,
    troubleshootingNotes: [],
    customerNotes: [],
    commandsRun: 1,
    ...overrides,
  }
}

vi.mock('../../src/app/practiceService', () => ({
  openSession: vi.fn(),
  addNote: vi.fn(),
  askCaller: vi.fn(),
  callerPrompts: vi.fn().mockReturnValue([
    { intent: 'what-error', label: 'What does the message say?' },
  ]),
  closureOptions: vi.fn().mockReturnValue([
    { code: 'resolved-remote', label: 'Resolved remotely', outcome: 'resolved' },
    { code: 'escalated-tier2', label: 'Escalated to Tier 2', outcome: 'escalated' },
  ]),
  formatSimClock: vi.fn().mockReturnValue('09:31'),
  resolveAttempt: vi.fn(),
  submitCommand: vi.fn(),
  verifyCaller: vi.fn(),
}))

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/ticket/session-1']}>
      <Routes>
        <Route path="ticket/:sessionId" element={<TicketWorkspacePage />} />
        <Route path="debrief/:sessionId" element={<p>Debrief landing</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  const practice = await import('../../src/app/practiceService')
  vi.mocked(practice.openSession).mockResolvedValue(makeView())
  vi.mocked(practice.submitCommand).mockResolvedValue(makeView())
  vi.mocked(practice.verifyCaller).mockResolvedValue(makeView({ hasVerifiedCaller: true }))
  vi.mocked(practice.addNote).mockResolvedValue(makeView())
})

describe('TicketWorkspacePage', () => {
  it('shows the ticket, its evidence, and the simulated terminal', async () => {
    renderWorkspace()

    expect(await screen.findByText('Dana cannot reach the file server')).toBeInTheDocument()
    expect(screen.getByText('Names fail while IP addresses work')).toBeInTheDocument()
    expect(screen.getByText('DNS request timed out.')).toBeInTheDocument()
    expect(screen.getByLabelText('Command')).toBeInTheDocument()
    expect(screen.getByText(/1 min elapsed/)).toBeInTheDocument()
  })

  it('submits a command through the practice service', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    const input = await screen.findByLabelText('Command')
    fireEvent.change(input, { target: { value: 'ipconfig /all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(practice.submitCommand).toHaveBeenCalledWith('ipconfig /all')
    })
  })

  it('verifies the caller and reflects the result', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    fireEvent.click(await screen.findByRole('button', { name: 'Badge ID' }))

    await waitFor(() => {
      expect(practice.verifyCaller).toHaveBeenCalledWith('employee-id')
    })
    expect(
      await screen.findByText('Caller verified. Account changes are now defensible.'),
    ).toBeInTheDocument()
  })

  it('saves a troubleshooting note', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    const note = await screen.findByPlaceholderText(
      'What did you check, what did you find, and what did you change?',
    )
    fireEvent.change(note, {
      target: { value: 'Adapter shows the wrong DNS server configured statically.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log troubleshooting note' }))

    await waitFor(() => {
      expect(practice.addNote).toHaveBeenCalledWith(
        'troubleshooting',
        'Adapter shows the wrong DNS server configured statically.',
      )
    })
  })
})
