import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ConsoleAction,
  ConsoleActionArgument,
  ConsoleEntry,
  ConsoleId,
  ConsoleView,
  DesktopView,
  Reachability,
  TopologyCheck,
  TopologyView,
  WorkspaceEntry,
  WorkspaceView,
} from '../../src/app/practiceService'
import { CONSOLE_DEFINITIONS } from '../../src/domain/environment/console'
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
        seq: 1,
        kind: 'command',
        text: 'nslookup fileserver',
        atMs: Date.UTC(2026, 9, 16, 9, 31),
        ok: false,
        lines: [{ text: 'DNS request timed out.', tone: 'error' }],
        source: 'terminal',
        machine: null,
      },
    ],
    simulatedClock: Date.UTC(2026, 9, 16, 9, 31),
    minutesElapsed: 1,
    hasVerifiedCaller: false,
    troubleshootingNotes: [],
    customerNotes: [],
    commandsRun: 1,
    hints: [],
    hintPenalty: 0,
    hintPolicy: { perHint: 5, cap: 15, budget: 0 },
    hintsRemaining: 21,
    hintBudgetSpent: false,
    procedurePenalty: 0,
    procedureViolations: [],
    verification: {
      callerId: 'requester',
      contradictions: [],
      recipients: [
        {
          id: 'requester',
          name: 'Dana Whitfield',
          role: 'caller',
          destination: 'mobile •••-•••-8842',
          methods: ['verification-code', 'callback'],
          reachable: true,
        },
        {
          id: 'manager',
          name: 'Priya Raman',
          role: 'manager',
          destination: 'office •••-•••-0197',
          methods: ['verification-code', 'callback'],
          reachable: true,
        },
      ],
      active: null,
      lastAttempt: null,
      callback: null,
      methods: {
        badge: { available: false, badgeId: 'LK-4821' },
        letterPin: { available: true, attemptsLeft: 3, locked: false, readBack: '731 204' },
        inPerson: { available: false },
      },
      methodAttempt: null,
    },
    denial: null,
    closureDraft: { code: null, note: '' },
    exam: false,
    canRewind: true,
    ...overrides,
  }
}

const stubs = vi.hoisted(() => ({
  noHintAvailable: class MockNoHintAvailableError extends Error {},
  hintBudgetSpent: class MockHintBudgetSpentError extends Error {},
}))

// The real module is kept for everything the tests do not replace — the tool
// catalog is catalog data, so the picker is exercised against the shipped one.
vi.mock('../../src/app/practiceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/practiceService')>()
  return {
    ...actual,
    HintBudgetSpentError: stubs.hintBudgetSpent,
    NoHintAvailableError: stubs.noHintAvailable,
    openSession: vi.fn(),
    abandonAttempt: vi.fn(),
    callerInterjection: vi.fn(),
    addNote: vi.fn(),
    askCaller: vi.fn(),
    callerPrompts: vi.fn().mockReturnValue([
      { intent: 'what-error', label: 'What does the message say?' },
    ]),
    closureOptions: vi.fn().mockReturnValue([
      { code: 'resolved-remote', label: 'Resolved remotely', outcome: 'resolved' },
      { code: 'escalated-tier2', label: 'Escalated to Tier 2', outcome: 'escalated' },
    ]),
    denialReasons: vi.fn().mockReturnValue([
      {
        reason: 'third-party-request',
        label: 'Asked for someone else’s account',
        detail: 'Only the owner can authorise it.',
      },
      {
        reason: 'credential-request',
        label: 'Asked for a password or a code',
        detail: 'The desk never reads those out.',
      },
    ]),
    denyCaller: vi.fn(),
    formatSimClock: vi.fn().mockReturnValue('09:31'),
    resolveAttempt: vi.fn(),
    reviewClosure: vi.fn(),
    submitCommand: vi.fn(),
    submitDesktopTerminalCommand: vi.fn(),
    placeCallback: vi.fn(),
    sendVerificationCode: vi.fn(),
    verifyCallerWithCode: vi.fn(),
    loadConsole: vi.fn(),
    runConsoleAction: vi.fn(),
    searchConsole: vi.fn(actual.searchConsole),
    revealHint: vi.fn(),
    rewindAttempt: vi.fn(),
    reapplyRewind: vi.fn(),
    saveClosureDraft: vi.fn(),
  }
})

// The layout preference is a settings read, not attempt data, so it is stubbed
// here and asserted through the service rather than through a database.
vi.mock('../../src/app/settingsService', () => ({
  loadSplitView: vi.fn(),
  saveSplitView: vi.fn(),
}))

/** Opening a tool is two steps now: the Tools tab, then the tool itself. */
async function openTool(name: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('tab', { name: 'Tools' }))
  const panel = await screen.findByRole('tabpanel', { name: 'Tools' })
  fireEvent.click(within(panel).getByRole('button', { name: new RegExp(`^${name}`) }))
  return panel
}

function consoleAction(
  id: string,
  label: string,
  command: (target: string, args?: readonly string[]) => string,
  args?: ConsoleActionArgument[],
): ConsoleAction {
  return { id, label, detail: `${label} — console fixture.`, command, args }
}

/**
 * The same tool, opened the way a learner would in split view: from the Tools
 * menu in the card header, which is there whether or not the tabs are.
 */
async function openToolFromMenu(name: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^Tools/ }))
  const menu = await screen.findByRole('dialog', { name: 'Tools menu' })
  fireEvent.click(within(menu).getByRole('button', { name: new RegExp(`^${name}`) }))
  return menu
}

/** The tool half of the card, whether it is split or showing one pane. */
function toolPane(): HTMLElement {
  return screen.queryByRole('region', { name: 'Tools' }) ?? screen.getByRole('tabpanel', { name: 'Tools' })
}

/** Back to the shelf without closing what is already open. */
function backToShelf(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: '← All tools' }))
  return toolPane()
}

/** A fixture input that only insists on a value, like the real account one. */
const ACCOUNT_FIXTURE: ConsoleActionArgument = {
  id: 'account',
  label: 'Account',
  placeholder: 'account-name',
  hint: 'the account to act on, as one word',
  validate: (value) => value.trim().length > 1,
}

/** The same input, with the values its console can offer for it. */
const ACCOUNT_CHOICES: ConsoleActionArgument = {
  ...ACCOUNT_FIXTURE,
  choices: ['asingh', 'dwhitfield', 'tbrooks'],
}

const GROUP_FIXTURE: ConsoleActionArgument = {
  id: 'group',
  label: 'Access group',
  placeholder: 'group-name',
  hint: 'the access group the check names, as a single word',
  validate: (value) => value.trim().length > 1,
}

function consoleEntry(overrides: Partial<ConsoleEntry> & { id: string }): ConsoleEntry {
  return {
    title: overrides.id,
    subtitle: 'fixture entry',
    facts: [],
    groups: [],
    actions: [],
    ...overrides,
  }
}

function consoleView(
  consoleId: ConsoleId,
  entries: ConsoleEntry[],
  topology: TopologyView | null = null,
  desktop: DesktopView | null = null,
): ConsoleView {
  return {
    sessionId: 'session-1',
    hostname: 'LT-4471',
    consoleId,
    definition: CONSOLE_DEFINITIONS[consoleId],
    entries,
    topology,
    desktop,
  }
}

function makeDesktop(overrides: Partial<DesktopView> = {}): DesktopView {
  return {
    entryId: 'LT-4472',
    hostname: 'LT-4472',
    userName: 'Marcus Chen',
    userAccount: 'mchen',
    signedIn: true,
    siteName: 'Larkspur HQ',
    domain: 'LARKSPUR',
    os: 'Windows 11 Enterprise 23H2',
    ipMode: 'dhcp',
    ipAddress: '10.20.4.58',
    dnsServers: ['10.20.4.10', '10.20.4.11'],
    diskFreePercent: 41,
    lastUpdateDays: 3,
    pendingReboot: true,
    spoolerStatus: 'running',
    printers: [
      {
        id: 'prn-fin-01',
        name: 'PRN-FIN-01',
        model: 'HP LaserJet Enterprise M507',
        status: 'offline',
        isDefault: false,
        jobs: [
          {
            id: 'job-1041',
            document: 'Q3-reconciliation.xlsx',
            owner: 'dwhitfield',
            status: 'queued',
          },
        ],
      },
    ],
    clock: Date.UTC(2026, 9, 16, 9, 31),
    sessionStartedAt: Date.UTC(2026, 9, 16, 9, 28),
    openDesktops: [
      {
        entryId: 'LT-4472',
        hostname: 'LT-4472',
        userName: 'Marcus Chen',
        focused: true,
        startedAt: Date.UTC(2026, 9, 16, 9, 28),
      },
    ],
    ...overrides,
  }
}

/** A Remote Desktop view with a live session, so the fake shell is open. */
function remoteDesktopConsoleView(desktop: DesktopView = makeDesktop()): ConsoleView {
  return consoleView(
    'remote-desktop',
    [
      consoleEntry({
        id: 'LT-4472',
        title: 'LT-4472',
        subtitle: 'Marcus Chen · Session active',
        facts: [{ label: 'Machine', value: 'LT-4472' }],
        actions: [
          consoleAction('end-session', 'End the session', (id) => `end-remote-session ${id}`),
          consoleAction('flush-dns', 'Flush the DNS cache', (id) => `remote-flush-dns ${id}`),
          consoleAction(
            'default-printer',
            'Set the default printer',
            (id, args) => `remote-set-default-printer ${id} ${args?.[0] ?? ''}`,
            [
              {
                id: 'printer',
                label: 'Printer',
                placeholder: 'PRN-FIN-01',
                hint: 'a printer name from the machine’s printer list',
                validate: (value) => value.trim().length > 1,
              },
            ],
          ),
        ],
      }),
    ],
    null,
    desktop,
  )
}

function topologyCheck(
  id: string,
  label: string,
  command: string,
  entryId: string,
  actionId: string,
  state: Reachability,
): TopologyCheck {
  return {
    id,
    label,
    command,
    entryId,
    actionId,
    state,
    evidence: state === 'proved' ? 'Reply from 10.20.4.1: bytes=32 time=2ms TTL=128' : null,
    atMs: state === 'proved' ? Date.UTC(2026, 9, 16, 9, 34) : null,
  }
}

/** The gateway link starts dark and lights only once its check has run. */
function makeTopology(gatewayState: Reachability): TopologyView {
  return {
    originHostname: 'LT-4471',
    originSiteName: 'Larkspur HQ',
    groups: [
      {
        id: 'origin',
        kind: 'origin',
        title: 'This machine',
        subtitle: 'LT-4471 · Larkspur HQ',
        checks: [
          topologyCheck('origin:adapter', 'Adapter and lease', 'ipconfig /all', 'LT-4471', 'machine-adapter', 'unknown'),
        ],
      },
      {
        id: 'site:hq',
        kind: 'site',
        title: 'Larkspur HQ',
        subtitle: '10.20.4.0/24 · gateway 10.20.4.1',
        checks: [
          topologyCheck('site:hq:gateway', 'Gateway', 'ping 10.20.4.1', 'hq', 'site-gateway', gatewayState),
        ],
      },
      {
        id: 'servers',
        kind: 'servers',
        title: 'Servers',
        subtitle: '1 host',
        checks: [
          topologyCheck('server:srv-fs01:host', 'SRV-FS01', 'ping SRV-FS01', 'srv-fs01', 'server-ping', 'unknown'),
        ],
      },
    ],
    proved: gatewayState === 'proved' ? 1 : 0,
    failed: 0,
    total: 3,
  }
}

/** The one command the default view has already logged. */
function firstStep(): WorkspaceEntry {
  const [step] = makeView().entries
  if (!step) {
    throw new Error('The fixture view has no entries')
  }
  return step
}

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/ticket/session-1']}>
      <Routes>
        <Route path="ticket/:sessionId" element={<TicketWorkspacePage />} />
        <Route path="debrief/:sessionId" element={<p>Debrief landing</p>} />
        <Route path="practice" element={<p>Queue landing</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

let serverRoomTopology: TopologyView

beforeEach(async () => {
  const practice = await import('../../src/app/practiceService')
  const settings = await import('../../src/app/settingsService')
  vi.mocked(settings.loadSplitView).mockResolvedValue(false)
  vi.mocked(settings.saveSplitView).mockResolvedValue(true)
  serverRoomTopology = makeTopology('unknown')
  vi.mocked(practice.openSession).mockResolvedValue(makeView())
  vi.mocked(practice.submitCommand).mockResolvedValue(makeView())
  vi.mocked(practice.sendVerificationCode).mockResolvedValue(makeView())
  vi.mocked(practice.placeCallback).mockResolvedValue(makeView())
  vi.mocked(practice.verifyCallerWithCode).mockResolvedValue(makeView({ hasVerifiedCaller: true }))
  vi.mocked(practice.addNote).mockResolvedValue(makeView())
  vi.mocked(practice.abandonAttempt).mockResolvedValue(undefined)
  // The caller has nothing to say unless a test gives them a line.
  vi.mocked(practice.callerInterjection).mockResolvedValue(null)
  vi.mocked(practice.loadConsole).mockImplementation(async (consoleId) =>
    consoleId === 'directory'
      ? consoleView('directory', [
          consoleEntry({
            id: 'dwhitfield',
            title: 'Dana Whitfield',
            subtitle: 'dwhitfield · Finance',
            facts: [
              { label: 'Employee ID', value: 'E-8842' },
              { label: 'Department', value: 'Finance' },
              { label: 'Site', value: 'Larkspur HQ' },
              { label: 'Manager', value: 'Priya Raman' },
            ],
            groups: [
              {
                label: 'Devices',
                items: ['LT-4471 · laptop · Larkspur HQ'],
                empty: 'No device is assigned to this account.',
              },
            ],
            actions: [
              consoleAction('open-record', 'Open the account record', (id) => `get-account ${id}`),
              consoleAction('unlock', 'Unlock the account', (id) => `unlock-account ${id}`),
            ],
            note: 'The state filter reads the live directory. The record withholds account state.',
            filterIds: [],
            history: [
              {
                kind: 'ticket',
                atMs: Date.UTC(2026, 9, 16, 8, 40),
                text: 'Dana is locked out of her laptop',
                ticket: 'Password and account access',
                outcome: 'resolved',
              },
              {
                kind: 'command',
                atMs: Date.UTC(2026, 9, 16, 8, 35),
                text: 'get-account dwhitfield',
                ticket: 'Password and account access',
              },
            ],
          }),
          consoleEntry({
            id: 'mchen',
            title: 'Marcus Chen',
            subtitle: 'mchen · Operations',
            facts: [
              { label: 'Employee ID', value: 'E-4421' },
              { label: 'Department', value: 'Operations' },
              { label: 'Site', value: 'Larkspur HQ' },
              { label: 'Manager', value: 'Theo Brooks' },
            ],
            filterIds: ['locked'],
          }),
        ])
      : consoleId === 'mail-admin'
        ? consoleView('mail-admin', [
            consoleEntry({
              id: 'dwhitfield',
              title: 'Dana Whitfield',
              subtitle: 'dana.whitfield@larkspur.example · 18% of quota used',
              facts: [{ label: 'Account', value: 'dwhitfield' }],
              actions: [
                consoleAction('trace', 'Trace a message', (_id, args) => `trace-message ${args?.[0] ?? ''}`),
              ],
              note: 'Quota, forwarding, and holds are read here.',
            }),
          ])
      : consoleId === 'documentation'
        ? consoleView('documentation', [
            consoleEntry({
              id: 'verify-the-caller',
              title: 'Verify a caller before anything changes',
              subtitle: 'Identity checks, and why they come first',
              facts: [{ label: 'Applies to', value: 'Any request that changes an account' }],
              groups: [
                {
                  label: 'Steps',
                  items: ['Send a verification code to the person on the ticket.'],
                  empty: 'No steps recorded.',
                },
              ],
              note: 'Reference material only.',
            }),
          ])
      : consoleId === 'shares'
        ? consoleView('shares', [
            consoleEntry({
              id: 'share-operations',
              title: 'Operations',
              subtitle: 'SRV-FS01 · \\SRV-FS01\\Operations',
              actions: [
                consoleAction(
                  'share-access',
                  'Check access for an account',
                  (_id, args) => `get-share-access Operations ${args?.[0] ?? ''}`,
                  [ACCOUNT_CHOICES],
                ),
                consoleAction(
                  'share-grant',
                  'Add an account to an access group',
                  (_id, args) => `add-group-member ${args?.[0] ?? ''} ${args?.[1] ?? ''}`,
                  // Named apart from the check above, so a test can address each
                  // box the way a sighted learner reads them.
                  [GROUP_FIXTURE, { ...ACCOUNT_FIXTURE, label: 'Account to add' }],
                ),
              ],
            }),
          ])
        : consoleView('server-room', [
          consoleEntry({
            id: 'LT-4471',
            title: 'LT-4471',
            subtitle: 'This machine · Larkspur HQ',
            facts: [{ label: 'Site', value: 'Larkspur HQ' }],
            actions: [
              consoleAction('machine-adapter', 'Show the adapter and lease', () => 'ipconfig /all'),
            ],
            note: 'Link, addressing, and DNS state are not listed here.',
          }),
          consoleEntry({
            id: 'srv-fs01',
            title: 'SRV-FS01',
            subtitle: 'Larkspur HQ · server',
            facts: [{ label: 'Site', value: 'Larkspur HQ' }],
            actions: [consoleAction('server-ping', 'Ping the server', () => 'ping SRV-FS01')],
          }),
        ],
        serverRoomTopology,
      ),
  )
  vi.mocked(practice.runConsoleAction).mockResolvedValue(
    makeView({
      entries: [
        {
          seq: 1,
          kind: 'command',
          text: 'get-account dwhitfield',
          atMs: Date.UTC(2026, 9, 16, 9, 32),
          ok: true,
          lines: [{ text: 'status          : locked', tone: 'default' }],
          source: 'directory',
          machine: null,
        },
        {
          seq: 2,
          kind: 'command',
          text: 'ping SRV-FS01',
          atMs: Date.UTC(2026, 9, 16, 9, 33),
          ok: true,
          lines: [{ text: 'Reply from 10.20.4.25: bytes=32 time=2ms TTL=128', tone: 'default' }],
          source: 'server-room',
          machine: null,
        },
      ],
    }),
  )
  vi.mocked(practice.reviewClosure).mockResolvedValue({
    total: 62,
    passed: false,
    procedurePenalty: 0,
    hintPenalty: 0,
    criticalFailures: ['Verified the caller before touching the account'],
    blocking: [
      {
        id: 'verify-caller',
        label: 'Verified the caller before touching the account',
        hint: 'Confirm identity before acting.',
      },
    ],
    topology: null,
    pendingBonusXp: 0,
  })
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

  it('projects the close score with both charges already taken out', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({ procedurePenalty: 15, hintPenalty: 5 }),
    )
    vi.mocked(practice.reviewClosure).mockResolvedValue({
      total: 62,
      passed: false,
      procedurePenalty: 15,
      hintPenalty: 5,
      criticalFailures: [],
      blocking: [],
      topology: null,
      pendingBonusXp: 0,
    })

    renderWorkspace()

    const label = await screen.findByText('Projected close')
    const chip = label.closest('button')
    expect(chip).not.toBeNull()
    // One number, with each charge named against it rather than shown apart.
    expect(chip?.textContent).toContain('62/100')
    expect(chip?.textContent).toContain('−15 process · −5 hints')
    // It is the same dry run the close button makes, priced from the form.
    expect(practice.reviewClosure).toHaveBeenCalledWith({ code: 'resolved-remote', note: '' })
  })

  it('re-prices the projection as the close form changes', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({ procedurePenalty: 15, hintPenalty: 5 }),
    )
    vi.mocked(practice.reviewClosure).mockResolvedValue({
      total: 62,
      passed: false,
      procedurePenalty: 15,
      hintPenalty: 5,
      criticalFailures: [],
      blocking: [],
      topology: null,
      pendingBonusXp: 0,
    })

    renderWorkspace()
    fireEvent.click(await screen.findByText('Projected close'))

    const breakdown = screen.getByRole('group', { name: 'Projected score' })
    expect(within(breakdown).getByText('−15 pts')).toBeInTheDocument()
    expect(within(breakdown).getByText('−5 pts')).toBeInTheDocument()
    expect(within(breakdown).getByText(/Resolved remotely/)).toBeInTheDocument()

    vi.mocked(practice.reviewClosure).mockResolvedValue({
      total: 71,
      passed: true,
      procedurePenalty: 15,
      hintPenalty: 5,
      criticalFailures: [],
      blocking: [],
      topology: null,
      pendingBonusXp: 0,
    })
    fireEvent.change(screen.getByLabelText('Closure code'), {
      target: { value: 'escalated-tier2' },
    })

    await waitFor(() => {
      expect(practice.reviewClosure).toHaveBeenLastCalledWith({
        code: 'escalated-tier2',
        note: '',
      })
    })
    await waitFor(() => {
      expect(screen.getByText('Projected close').closest('button')?.textContent).toContain('71/100')
    })
    expect(within(breakdown).getByText(/Escalated to Tier 2/)).toBeInTheDocument()

    // A handoff note counts before it is saved: the projection reads the form.
    fireEvent.change(screen.getByLabelText('Handoff note'), {
      target: { value: 'Verified the caller before unlocking.' },
    })
    await waitFor(() => {
      expect(practice.reviewClosure).toHaveBeenLastCalledWith({
        code: 'escalated-tier2',
        note: 'Verified the caller before unlocking.',
      })
    })
  })

  it('shows the caller cutting in on the call log', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        entries: [
          ...makeView().entries,
          {
            seq: 2,
            kind: 'interruption',
            message: 'Hello? Are you still there? I am on a clock.',
            atMs: Date.UTC(2026, 9, 16, 9, 32),
          },
        ],
      }),
    )
    renderWorkspace()

    expect(await screen.findByText(/Hello\? Are you still there\?/)).toBeInTheDocument()
    // It is the caller speaking, not a question the desk asked.
    expect(screen.getByText('Caller, unprompted')).toBeInTheDocument()
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

  it('lets the caller break in while the desk is doing nothing', async () => {
    vi.useFakeTimers()
    try {
      const practice = await import('../../src/app/practiceService')
      const idle = makeView()
      vi.mocked(practice.callerInterjection).mockResolvedValue(
        makeView({
          entries: [
            ...idle.entries,
            {
              seq: 9,
              kind: 'interruption',
              message: 'Hello? Are you still there?',
              atMs: idle.simulatedClock,
            },
          ],
        }),
      )

      renderWorkspace()
      // The session is opened on a microtask, so the panel is drawn first.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('Case file')).toBeInTheDocument()
      expect(practice.callerInterjection).not.toHaveBeenCalled()

      // Nothing has been typed or clicked: the panel is what asks.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000)
      })

      expect(practice.callerInterjection).toHaveBeenCalled()
      expect(screen.getByText('Caller, unprompted')).toBeInTheDocument()
      expect(screen.getByText('Hello? Are you still there?')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens on the tools the ticket is worked with and folds the rest away', async () => {
    renderWorkspace()

    const summary = await screen.findByText('Command cheat sheet')
    const details = summary.closest('details')
    if (!details) {
      throw new Error('The cheat sheet is not a details element')
    }
    fireEvent.click(summary)

    // This ticket is a NET-01 job: the network and workstation tools lead.
    expect(within(details).getByText('Network')).toBeInTheDocument()
    expect(within(details).getByText('Workstation')).toBeInTheDocument()
    expect(within(details).getByText('nslookup <name> [dns-server]')).toBeInTheDocument()
    // The mail tools are in the reference, but not in the way until asked for.
    expect(within(details).queryByText('Mail')).not.toBeInTheDocument()
    expect(within(details).queryByText('get-mailbox <samAccountName>')).not.toBeInTheDocument()

    const full = within(details).getByRole('button', { name: /^Full reference/ })
    expect(full).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(full)

    expect(full).toHaveAttribute('aria-expanded', 'true')
    expect(within(details).getByText('Mail')).toBeInTheDocument()
    expect(within(details).getByText('get-mailbox <samAccountName>')).toBeInTheDocument()

    // Every row the terminal can run is in the reference, in its own wording.
    const practice = await import('../../src/app/practiceService')
    for (const group of practice.commandCheatSheet()) {
      for (const entry of group.entries) {
        expect(within(details).getByText(entry.usage)).toBeInTheDocument()
      }
    }
  })

  it('offers the two real methods, a code and a callback, and no shortcuts', async () => {
    renderWorkspace()

    expect(
      await screen.findByRole('button', { name: 'Send verification code' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ring this contact back' })).toBeInTheDocument()
    expect(screen.getByText(/Only one code is live at a time/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Badge ID instead' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask the manager instead' })).not.toBeInTheDocument()
  })

  it('prices the callback in the panel when a code could reach the caller', async () => {
    renderWorkspace()

    expect(
      await screen.findByText(/ringing back instead costs 5 safety points/),
    ).toBeInTheDocument()
  })

  it('does not price the callback when the caller’s handset is out of action', async () => {
    const practice = await import('../../src/app/practiceService')
    const view = makeView()
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        verification: {
          ...view.verification,
          recipients: view.verification.recipients.map((recipient) =>
            recipient.id === view.verification.callerId
              ? { ...recipient, reachable: false }
              : recipient,
          ),
        },
      }),
    )
    renderWorkspace()

    expect(
      await screen.findByRole('button', { name: 'Ring this contact back' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ringing back instead costs/)).not.toBeInTheDocument()
  })

  it('will not send a code to a line that cannot take one', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          recipients: [
            {
              id: 'requester',
              name: 'Dana Whitfield',
              role: 'caller',
              destination: 'mobile •••-•••-8842',
              methods: ['verification-code', 'callback'],
              reachable: false,
            },
            {
              id: 'requester-desk',
              name: 'Dana Whitfield',
              role: 'caller',
              destination: 'desk •••-•••-3311',
              methods: ['callback'],
              reachable: true,
            },
          ],
        },
      }),
    )
    renderWorkspace()

    fireEvent.change(await screen.findByLabelText('Contact to reach'), {
      target: { value: 'requester-desk' },
    })

    expect(screen.getByRole('button', { name: 'Send verification code' })).toBeDisabled()
    expect(screen.getByText(/cannot take a code/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ring this contact back' })).toBeEnabled()
  })

  it('places a callback and shows what came back from the line', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.placeCallback).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          callback: {
            result: 'verified',
            message:
              'Dana Whitfield answered the desk •••-•••-3311 and confirmed the request is theirs.',
            contactId: 'requester-desk',
            contactName: 'Dana Whitfield',
            destination: 'desk •••-•••-3311',
            atMs: Date.UTC(2026, 9, 16, 9, 32),
          },
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Ring this contact back' }))

    await waitFor(() => {
      expect(practice.placeCallback).toHaveBeenCalledWith('requester')
    })
    expect(await screen.findByText(/confirmed the request is theirs/)).toBeInTheDocument()
  })

  it('shows a call that reached nobody as a failure, not a check', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.placeCallback).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          callback: {
            result: 'no-answer',
            message:
              'Nobody answered the mobile •••-•••-8842, so the caller is still unverified. Ring a line the person is actually on.',
            contactId: 'requester',
            contactName: 'Dana Whitfield',
            destination: 'mobile •••-•••-8842',
            atMs: Date.UTC(2026, 9, 16, 9, 32),
          },
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Ring this contact back' }))

    expect(await screen.findByText(/still unverified/)).toBeInTheDocument()
    expect(
      screen.queryByText('Caller verified. Account changes are now defensible.'),
    ).not.toBeInTheDocument()
  })

  it('explains a code sitting on a line that cannot reach the caller', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.sendVerificationCode).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          active: {
            recipientId: 'requester',
            recipientName: 'Dana Whitfield',
            destination: 'mobile •••-•••-8842',
            issuedAt: Date.UTC(2026, 9, 16, 9, 31),
            expiresAt: Date.UTC(2026, 9, 16, 9, 41),
            forCaller: false,
            callerImpersonating: false,
            recipientReachable: false,
            readBack: null,
          },
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Send verification code' }))

    expect(await screen.findByText(/that line cannot reach them/)).toBeInTheDocument()
    expect(screen.queryByText(/482 913/)).not.toBeInTheDocument()
  })

  it('sends one code to the caller and accepts the read-back', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.sendVerificationCode).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          active: {
            recipientId: 'requester',
            recipientName: 'Dana Whitfield',
            destination: 'mobile •••-•••-8842',
            issuedAt: Date.UTC(2026, 9, 16, 9, 31),
            expiresAt: Date.UTC(2026, 9, 16, 9, 41),
            forCaller: true,
            callerImpersonating: false,
            recipientReachable: true,
            readBack: '482 913',
          },
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Send verification code' }))

    await waitFor(() => {
      expect(practice.sendVerificationCode).toHaveBeenCalledWith('requester')
    })
    expect(await screen.findByText(/482 913/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Code the caller read back'), {
      target: { value: '482 913' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm code' }))

    await waitFor(() => {
      expect(practice.verifyCallerWithCode).toHaveBeenCalledWith('482 913')
    })
    expect(
      await screen.findByText('Caller verified. Account changes are now defensible.'),
    ).toBeInTheDocument()
  })

  it('shows that a code sent to the manager is not on this ticket', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.sendVerificationCode).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          active: {
            recipientId: 'manager',
            recipientName: 'Priya Raman',
            destination: 'office •••-•••-0197',
            issuedAt: Date.UTC(2026, 9, 16, 9, 31),
            expiresAt: Date.UTC(2026, 9, 16, 9, 41),
            forCaller: false,
            callerImpersonating: false,
            recipientReachable: true,
            readBack: null,
          },
        },
      }),
    )
    fireEvent.change(await screen.findByLabelText('Contact to reach'), {
      target: { value: 'manager' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }))

    await waitFor(() => {
      expect(practice.sendVerificationCode).toHaveBeenCalledWith('manager')
    })
    expect(
      await screen.findByText(/went to Priya Raman — not this ticket/),
    ).toBeInTheDocument()
    expect(screen.queryByText('482 913')).not.toBeInTheDocument()
  })

  it('shows that a code with the employee is not readable by an impersonator', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.sendVerificationCode).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          active: {
            recipientId: 'requester',
            recipientName: 'Dana Whitfield',
            destination: 'mobile •••-•••-8842',
            issuedAt: Date.UTC(2026, 9, 16, 9, 31),
            expiresAt: Date.UTC(2026, 9, 16, 9, 41),
            forCaller: false,
            callerImpersonating: true,
            recipientReachable: true,
            readBack: null,
          },
          methods: {
            ...makeView().verification.methods,
            letterPin: { available: true, attemptsLeft: 3, locked: false, readBack: null },
          },
          contradictions: [
            {
              id: 'claimed-lockout',
              claim: 'My account is locked out and I need it unlocked.',
              evidence: 'The directory shows status: active.',
            },
            {
              id: 'claimed-owner',
              claim: 'I am Dana Whitfield, the account owner.',
              evidence:
                'The live code went to Dana Whitfield’s own contact on the ticket, and the caller could not read it back.',
            },
          ],
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Send verification code' }))

    expect(
      await screen.findByText(/Whoever is on this call is not them/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/482 913/)).not.toBeInTheDocument()
    expect(screen.queryByText(/731 204/)).not.toBeInTheDocument()

    // The panel sets the caller's story beside the evidence that answered it.
    const findings = screen.getByLabelText('Contradicted claims')
    expect(
      within(findings).getByText(/My account is locked out and I need it unlocked/),
    ).toBeInTheDocument()
    expect(within(findings).getByText(/status: active/)).toBeInTheDocument()
    expect(within(findings).getByText(/could not read it back/)).toBeInTheDocument()

    // A guess is recorded as a failure, so the refusal has evidence behind it.
    vi.mocked(practice.verifyCallerWithCode).mockResolvedValue(
      makeView({
        verification: {
          ...makeView().verification,
          active: {
            recipientId: 'requester',
            recipientName: 'Dana Whitfield',
            destination: 'mobile •••-•••-8842',
            issuedAt: Date.UTC(2026, 9, 16, 9, 31),
            expiresAt: Date.UTC(2026, 9, 16, 9, 41),
            forCaller: false,
            callerImpersonating: true,
            recipientReachable: true,
            readBack: null,
          },
          lastAttempt: {
            result: 'not-the-caller',
            message:
              'The live code went to Dana Whitfield, the person on this ticket. Whoever is on this call is not them, so no code can be read back.',
            atMs: Date.UTC(2026, 9, 16, 9, 33),
          },
        },
      }),
    )

    fireEvent.change(screen.getByLabelText('Code the caller read back'), {
      target: { value: '000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm code' }))

    await waitFor(() => {
      expect(practice.verifyCallerWithCode).toHaveBeenCalledWith('000000')
    })
    expect(
      await screen.findByText(/no code can be read back/i),
    ).toBeInTheDocument()
  })

  it('records a refusal only after the reason is confirmed', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.denyCaller).mockResolvedValue(
      makeView({
        denial: {
          reason: 'credential-request',
          label: 'Asked for a password or a code',
          summary: 'Refused the request — asked for a password or a code.',
          atMs: Date.UTC(2026, 9, 16, 9, 33),
        },
        verification: {
          ...makeView().verification,
          contradictions: [
            {
              id: 'claimed-lockout',
              claim: 'My account is locked out and I need it unlocked.',
              evidence: 'The directory shows status: active.',
            },
          ],
        },
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Deny (social engineering)' }))
    expect(practice.denyCaller).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Reason for refusing'), {
      target: { value: 'credential-request' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm denial' }))

    await waitFor(() => {
      expect(practice.denyCaller).toHaveBeenCalledWith('credential-request')
    })
    expect(await screen.findByText('Asked for a password or a code')).toBeInTheDocument()
    expect(
      screen.getByText(/No account changes were made on the caller’s word/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Deny (social engineering)' }),
    ).not.toBeInTheDocument()
    // The evidence stays beside the refusal, not only in the debrief.
    const findings = screen.getByLabelText('Contradicted claims')
    expect(within(findings).getByText(/status: active/)).toBeInTheDocument()
  })

  it('asks for the value an action cannot run without, and sends it', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('File shares')
    fireEvent.click(await screen.findByRole('button', { name: /Operations/ }))

    const run = screen.getByRole('button', { name: /Check access for an account/ })
    // A half-typed value never becomes a command.
    expect(run).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'tbrooks' } })
    expect(run).toBeEnabled()
    fireEvent.click(run)

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith('shares', 'share-operations', 'share-access', [
        'tbrooks',
      ])
    })
  })

  it('offers the values an action could take as chips, choosing none of them', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('File shares')
    fireEvent.click(await screen.findByRole('button', { name: /Operations/ }))

    const account = screen.getByLabelText('Account')
    const run = screen.getByRole('button', { name: /Check access for an account/ })
    // Nothing is filled in or picked for the learner.
    expect(account).toHaveValue('')
    expect(run).toBeDisabled()

    const chips = screen.getByRole('group', { name: 'Possible values for Account' })
    const offered = within(chips)
      .getAllByRole('button')
      .map((chip) => chip.textContent)
    expect(offered).toEqual(['asingh', 'dwhitfield', 'tbrooks'])
    for (const chip of within(chips).getAllByRole('button')) {
      // A chip is an offer, not a selected option: none of them is the answer.
      expect(chip).not.toHaveAttribute('data-chosen', 'true')
      expect(chip).toBeEnabled()
    }

    // A chip fills the box; the command still runs only when the learner asks.
    fireEvent.click(within(chips).getByRole('button', { name: 'dwhitfield' }))
    expect(account).toHaveValue('dwhitfield')
    expect(within(chips).getByRole('button', { name: 'dwhitfield' })).toHaveAttribute(
      'data-chosen',
      'true',
    )
    expect(run).toBeEnabled()
    expect(practice.runConsoleAction).not.toHaveBeenCalled()

    fireEvent.click(run)
    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith('shares', 'share-operations', 'share-access', [
        'dwhitfield',
      ])
    })
  })

  it('offers chips per input, and only for the inputs the console can name values for', async () => {
    renderWorkspace()

    await openTool('File shares')
    fireEvent.click(await screen.findByRole('button', { name: /Operations/ }))

    // The add-member action takes two values, and this fixture names candidates
    // for neither of them: a box with nothing to offer stays a plain box.
    expect(screen.getByLabelText('Access group')).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('group', { name: /Possible values for/ })
        .map((group) => group.getAttribute('aria-label')),
    ).toEqual(['Possible values for Account'])
  })

  it('browses the directory and runs an audited console action', async () => {
    const { container } = renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('Directory')

    const record = await screen.findByRole('button', { name: /dwhitfield · Finance/ })
    fireEvent.change(screen.getByLabelText('Search the directory'), {
      target: { value: 'whitfield' },
    })
    expect(practice.searchConsole).toHaveBeenCalledWith(expect.any(Array), 'whitfield', null)

    fireEvent.click(record)
    expect(screen.getByText('E-8842')).toBeInTheDocument()
    expect(screen.getByText(/LT-4471 · laptop/)).toBeInTheDocument()

    // The record carries the desk's past with this account, not the whole log.
    const history = screen.getByRole('list', { name: 'Recent desk history' })
    expect(within(history).getByText('Dana is locked out of her laptop')).toBeInTheDocument()
    expect(within(history).getByText('closed resolved')).toBeInTheDocument()
    expect(within(history).getByText('get-account dwhitfield')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Open the account record/ }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith('directory', 'dwhitfield', 'open-record')
    })
    const output = await screen.findByRole('status')
    expect(output).toHaveTextContent('> get-account dwhitfield')
    expect(output).toHaveTextContent('status : locked')

    // The same command landed in the terminal log, tagged with the tool that ran it.
    const terminalPane = container.querySelector('#pane-terminal')
    expect(terminalPane).not.toBeNull()
    expect(terminalPane).toHaveTextContent('get-account dwhitfield')
    expect(terminalPane).toHaveTextContent('via Directory')
  })

  it('filters the directory by the account state the world reports', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('Directory')
    await screen.findByRole('button', { name: /dwhitfield · Finance/ })

    const filter = screen.getByLabelText('Filter by account state')
    expect(within(filter).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All accounts',
      'Locked',
      'Password expired',
      'Disabled',
    ])

    fireEvent.change(filter, { target: { value: 'locked' } })
    expect(practice.searchConsole).toHaveBeenLastCalledWith(expect.any(Array), '', 'locked')
    expect(screen.queryByRole('button', { name: /Dana Whitfield/ })).not.toBeInTheDocument()
    const locked = screen.getByRole('button', { name: /Marcus Chen/ })
    expect(locked).toBeInTheDocument()

    // Clearing the filter brings every account back.
    fireEvent.change(filter, { target: { value: '' } })
    expect(screen.getByRole('button', { name: /Dana Whitfield/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marcus Chen/ })).toBeInTheDocument()
  })

  it('reads the directory as tiles once the grid view is chosen', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('Directory')
    // The pane arrives before its records do; the switch belongs to the pane.
    await screen.findByRole('button', { name: /dwhitfield · Finance/ })

    const viewSwitch = screen.getByRole('group', { name: 'Directory view' })
    const asList = within(viewSwitch).getByRole('button', { name: 'List' })
    const asGrid = within(viewSwitch).getByRole('button', { name: 'Grid' })
    // Records read as a list until the learner says otherwise.
    expect(asList).toHaveAttribute('aria-pressed', 'true')
    expect(asGrid).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(asGrid)

    expect(asGrid).toHaveAttribute('aria-pressed', 'true')
    expect(asList).toHaveAttribute('aria-pressed', 'false')

    const accountList = screen.getByRole('list', { name: 'Directory accounts' })
    expect(accountList).toHaveAttribute('data-view', 'grid')

    // A tile carries the record's own line and the facts the console declares,
    // so an account can be scanned without opening it.
    const tile = screen.getByRole('button', { name: /Dana Whitfield/ })
    expect(tile).toHaveTextContent('dwhitfield · Finance')
    expect(tile).toHaveTextContent('E-8842')
    expect(tile).toHaveTextContent('Larkspur HQ')

    // Pressing a tile selects the record and runs its actions as a row does.
    fireEvent.click(tile)
    expect(screen.getByText(/LT-4471 · laptop/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Open the account record/ }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith(
        'directory',
        'dwhitfield',
        'open-record',
      )
    })
    expect(await screen.findByRole('status')).toHaveTextContent('> get-account dwhitfield')

    // Going back to the list keeps the record the learner picked.
    fireEvent.click(asList)
    expect(asList).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/LT-4471 · laptop/)).toBeInTheDocument()
  })

  it('keeps a console that has no grid reading as rows', async () => {
    renderWorkspace()

    // The choice belongs to the pane, so a grid picked in the directory is
    // still set when the next console opens — and must not leak into one whose
    // records were never declared as tiles.
    await openTool('Directory')
    await screen.findByRole('button', { name: /dwhitfield · Finance/ })
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Directory view' })).getByRole('button', {
        name: 'Grid',
      }),
    )
    expect(screen.getByRole('list', { name: 'Directory accounts' })).toHaveAttribute(
      'data-view',
      'grid',
    )

    await openToolFromMenu('File shares')
    const shares = await within(toolPane()).findByRole('list', { name: 'File shares' })
    expect(shares).toHaveAttribute('data-view', 'list')
    // A grid is only ever a second way to read records that were declared as
    // tiles; this console's rows stay rows.
    expect(within(shares).queryByText('Employee ID')).not.toBeInTheDocument()

    // And the directory keeps the grid it was left in.
    fireEvent.click(within(toolPane()).getByRole('tab', { name: 'Directory' }))
    expect(
      await within(toolPane()).findByRole('list', { name: 'Directory accounts' }),
    ).toHaveAttribute('data-view', 'grid')
  })

  it('offers no grid view to a console that does not declare one', async () => {
    renderWorkspace()

    await openTool('File shares')
    expect(await screen.findByRole('button', { name: /Operations/ })).toBeInTheDocument()

    // Shares read as a list of shares with a detail beside them, and nothing in
    // that console says otherwise.
    expect(screen.queryByRole('group', { name: 'File shares view' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Grid' })).not.toBeInTheDocument()
  })

  it('splits the card so the terminal and a tool are both on screen', async () => {
    const { container } = renderWorkspace()

    const toggle = await screen.findByRole('switch', { name: 'Split screen view' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(container.querySelector('[data-split="true"]')).toBeNull()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(container.querySelector('[data-split="true"]')).not.toBeNull()
    // The tabs have nothing left to switch between, so they step aside.
    expect(
      container.querySelector('[role="tablist"][aria-label="Tool"]')?.hasAttribute('hidden'),
    ).toBe(true)
    expect(screen.queryByRole('tab', { name: 'Terminal' })).not.toBeInTheDocument()

    // Both halves are on screen, and the empty one says how to fill it.
    expect(screen.getByRole('region', { name: 'Terminal' })).toHaveTextContent(
      'DNS request timed out.',
    )
    expect(screen.getByRole('region', { name: 'Tools' })).toHaveTextContent(
      'Open a tool from the Tools menu to work on it beside this ticket.',
    )
  })

  it('points at the tools menu from the empty half of a split', async () => {
    renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open the tools menu' }))

    expect(await screen.findByRole('dialog', { name: 'Tools menu' })).toBeInTheDocument()
  })

  it('works a tool beside the terminal, with the log still in front of the learner', async () => {
    const practice = await import('../../src/app/practiceService')
    renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))
    await openToolFromMenu('Directory')

    await waitFor(() => {
      expect(practice.loadConsole).toHaveBeenCalledWith('directory')
    })

    const terminal = screen.getByRole('region', { name: 'Terminal' })
    const tools = screen.getByRole('region', { name: 'Tools' })
    expect(terminal).not.toHaveAttribute('hidden')
    expect(tools).not.toHaveAttribute('hidden')
    // The console is the loaded one, and the command line is still there.
    expect(tools).toHaveTextContent('Dana Whitfield')
    expect(within(terminal).getByLabelText('Command')).toBeInTheDocument()
  })

  it('sizes the split from a divider, half the card until it is moved', async () => {
    const { container } = renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))

    const divider = screen.getByRole('separator', {
      name: 'Resize the terminal and tools panes',
    })
    expect(divider).toHaveAttribute('aria-orientation', 'vertical')
    expect(divider).toHaveAttribute('aria-valuenow', '50')
    expect(divider).toHaveAttribute('aria-valuemin', '25')
    expect(divider).toHaveAttribute('aria-valuemax', '75')
    // The ratio the stylesheet multiplies, not a percentage it has to re-derive.
    expect((container.querySelector('[data-split="true"]') as HTMLElement).style.getPropertyValue('--split-ratio')).toBe(
      '0.5',
    )
  })

  it('leaves the divider out when the card is not split', async () => {
    renderWorkspace()

    await screen.findByRole('switch', { name: 'Split screen view' })
    expect(
      screen.queryByRole('separator', { name: 'Resize the terminal and tools panes' }),
    ).not.toBeInTheDocument()
  })

  it('adjusts the divider from the keyboard, and puts it back on Enter', async () => {
    renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))
    const divider = screen.getByRole('separator', {
      name: 'Resize the terminal and tools panes',
    })

    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '52')
    fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    expect(divider).toHaveAttribute('aria-valuenow', '50')

    // Shift crosses the card in fewer presses.
    fireEvent.keyDown(divider, { key: 'ArrowRight', shiftKey: true })
    expect(divider).toHaveAttribute('aria-valuenow', '60')

    // Home and End take a half to its narrowest and widest, and no further.
    fireEvent.keyDown(divider, { key: 'Home' })
    expect(divider).toHaveAttribute('aria-valuenow', '25')
    fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    expect(divider).toHaveAttribute('aria-valuenow', '25')
    fireEvent.keyDown(divider, { key: 'End' })
    expect(divider).toHaveAttribute('aria-valuenow', '75')
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '75')

    fireEvent.keyDown(divider, { key: 'Enter' })
    expect(divider).toHaveAttribute('aria-valuenow', '50')
  })

  it('ignores keys the divider has no meaning for', async () => {
    renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))
    const divider = screen.getByRole('separator', {
      name: 'Resize the terminal and tools panes',
    })

    fireEvent.keyDown(divider, { key: 'a' })
    fireEvent.keyDown(divider, { key: 'Tab' })
    expect(divider).toHaveAttribute('aria-valuenow', '50')
  })

  it('follows the pointer while the divider is dragged', async () => {
    const { container } = renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))
    const card = container.querySelector('[data-split="true"]') as HTMLElement
    const divider = screen.getByRole('separator', {
      name: 'Resize the terminal and tools panes',
    })
    // jsdom has no layout, so the box the drag reads is stated outright: a 1000px
    // card with a 10px handle, which leaves 990px for the two panes.
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
    } as DOMRect)
    vi.spyOn(divider, 'getBoundingClientRect').mockReturnValue({ width: 10 } as DOMRect)

    fireEvent.pointerDown(divider, { clientX: 300 })
    expect(divider).toHaveAttribute('aria-valuenow', '30')

    fireEvent.pointerMove(divider, { clientX: 500 })
    expect(divider).toHaveAttribute('aria-valuenow', '50')

    // Past the edges it stops at the narrowest and widest a half may be.
    fireEvent.pointerMove(divider, { clientX: 999 })
    expect(divider).toHaveAttribute('aria-valuenow', '75')
    fireEvent.pointerMove(divider, { clientX: -40 })
    expect(divider).toHaveAttribute('aria-valuenow', '25')

    // Releasing ends the drag: the pointer no longer moves the divider.
    fireEvent.pointerUp(divider, { clientX: -40 })
    fireEvent.pointerMove(divider, { clientX: 600 })
    expect(divider).toHaveAttribute('aria-valuenow', '25')
  })

  it('puts the divider back in the middle on a double click', async () => {
    renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))
    const divider = screen.getByRole('separator', {
      name: 'Resize the terminal and tools panes',
    })

    fireEvent.keyDown(divider, { key: 'End' })
    expect(divider).toHaveAttribute('aria-valuenow', '75')

    fireEvent.doubleClick(divider)
    expect(divider).toHaveAttribute('aria-valuenow', '50')
  })

  it('closes the split back to the single pane the learner was using', async () => {
    const { container } = renderWorkspace()

    const toggle = await screen.findByRole('switch', { name: 'Split screen view' })
    fireEvent.click(toggle)
    await openToolFromMenu('Directory')
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    // Opening a tool moved the single pane to it, so that is what is left.
    const panel = screen.getByRole('tabpanel', { name: 'Tools' })
    expect(panel).toHaveTextContent('Dana Whitfield')
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('#pane-terminal')).toHaveAttribute('hidden')
  })

  it('opens the workspace in the split the learner left it in', async () => {
    const settings = await import('../../src/app/settingsService')
    vi.mocked(settings.loadSplitView).mockResolvedValue(true)

    const { container } = renderWorkspace()

    // No click: the first paint is already the stored layout.
    expect(await screen.findByRole('switch', { name: 'Split screen view' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(container.querySelector('[data-split="true"]')).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Tools' })).toBeInTheDocument()
  })

  it('stores the split the learner chooses for the next visit', async () => {
    const settings = await import('../../src/app/settingsService')
    renderWorkspace()

    const toggle = await screen.findByRole('switch', { name: 'Split screen view' })
    fireEvent.click(toggle)

    await waitFor(() => expect(settings.saveSplitView).toHaveBeenCalledWith(true))

    fireEvent.click(toggle)
    await waitFor(() => expect(settings.saveSplitView).toHaveBeenLastCalledWith(false))
  })

  it('opens the ticket even when the stored layout cannot be read', async () => {
    const settings = await import('../../src/app/settingsService')
    vi.mocked(settings.loadSplitView).mockRejectedValue(new Error('settings unavailable'))

    renderWorkspace()

    expect(await screen.findByRole('switch', { name: 'Split screen view' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('tabpanel', { name: 'Terminal' })).toHaveTextContent(
      'DNS request timed out.',
    )
  })

  it('works a console from the shelf: its map, its records, and an action', async () => {
    const { container } = renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    const panel = await openTool('Server Room')

    await waitFor(() => {
      expect(practice.loadConsole).toHaveBeenCalledWith('server-room')
    })

    // Only the tool that was picked renders, in the pane the picker opened it in.
    expect(container.querySelector('#pane-directory')).toBeNull()
    expect(within(panel).getByRole('tab', { name: 'Server Room' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(panel).getByRole('button', { name: '← All tools' })).toBeInTheDocument()

    // The pane opens on the map; its records are one click away.
    expect(await screen.findByLabelText('Network topology')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.queryByLabelText('Network topology')).not.toBeInTheDocument()

    // The machine entry states the state the console will not reveal for free.
    fireEvent.click(await screen.findByRole('button', { name: /This machine · Larkspur HQ/ }))
    expect(screen.getByText(/Link, addressing, and DNS state are not listed here/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Larkspur HQ · server/ }))
    expect(screen.queryByText(/Link, addressing, and DNS state/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Ping the server/ }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith('server-room', 'srv-fs01', 'server-ping')
    })
    const output = await screen.findByRole('status')
    expect(output).toHaveTextContent('> ping SRV-FS01')
    expect(output).toHaveTextContent('Reply from 10.20.4.25')
  })

  it('keeps the first tool open when a second one is opened beside it', async () => {
    renderWorkspace()

    fireEvent.click(await screen.findByRole('switch', { name: 'Split screen view' }))
    await openToolFromMenu('Directory')
    await openToolFromMenu('Server Room')

    const tools = toolPane()
    const tabs = within(tools).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Directory', 'Server Room'])
    // The new tool is on screen; the one opened before it is a click away.
    expect(within(tools).getByRole('tab', { name: 'Server Room' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(tools).getByRole('tab', { name: 'Directory' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(within(tools).queryByText('Dana Whitfield')).not.toBeInTheDocument()
  })

  it('switches between the tools it has open instead of reopening them', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('Directory')
    const shelf = backToShelf()
    fireEvent.click(within(shelf).getByRole('button', { name: /^Server Room/ }))
    await waitFor(() => expect(practice.loadConsole).toHaveBeenCalledWith('server-room'))

    fireEvent.click(within(toolPane()).getByRole('tab', { name: 'Directory' }))

    // The directory is back on screen, and the shelf is still one click away.
    expect(await within(toolPane()).findByText('Dana Whitfield')).toBeInTheDocument()
    expect(within(toolPane()).getByRole('button', { name: '← All tools' })).toBeInTheDocument()
    expect(within(toolPane()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Directory',
      'Server Room',
    ])
  })

  it('closes a tool from the bar and leaves the others open', async () => {
    renderWorkspace()

    await openTool('Directory')
    const shelf = backToShelf()
    fireEvent.click(within(shelf).getByRole('button', { name: /^Server Room/ }))
    expect(await within(toolPane()).findByRole('tab', { name: 'Server Room' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    fireEvent.click(within(toolPane()).getByRole('button', { name: 'Close Server Room' }))

    expect(within(toolPane()).queryByRole('tab', { name: 'Server Room' })).not.toBeInTheDocument()
    expect(within(toolPane()).getByRole('tab', { name: 'Directory' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(toolPane()).getByText('Dana Whitfield')).toBeInTheDocument()
  })

  it('goes back to the shelf when the last open tool is closed', async () => {
    renderWorkspace()

    await openTool('Directory')
    fireEvent.click(within(toolPane()).getByRole('button', { name: 'Close Directory' }))

    expect(within(toolPane()).queryAllByRole('tab')).toHaveLength(0)
    // The shelf is what is left, with the tool it just closed still on it.
    expect(within(toolPane()).getByRole('heading', { name: 'Infrastructure' })).toBeInTheDocument()
    expect(
      within(toolPane()).getByRole('button', { name: /^Directory/ }),
    ).toBeInTheDocument()
  })

  it('rereads every open tool after a command typed in the terminal', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('Directory')
    const shelf = backToShelf()
    fireEvent.click(within(shelf).getByRole('button', { name: /^Server Room/ }))
    await waitFor(() => expect(practice.loadConsole).toHaveBeenCalledWith('server-room'))
    vi.mocked(practice.loadConsole).mockClear()

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'ipconfig /all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    // Both tabs would otherwise show the machine as it was before the command.
    await waitFor(() => expect(practice.loadConsole).toHaveBeenCalledTimes(2))
    expect(practice.loadConsole).toHaveBeenCalledWith('directory')
    expect(practice.loadConsole).toHaveBeenCalledWith('server-room')
  })

  it('lights a gateway link only after its check has run', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    await openTool('Server Room')

    const map = await screen.findByLabelText('Network topology')
    expect(within(map).getByText(/0 of 3 links proved/)).toBeInTheDocument()
    expect(within(map).getByText(/Not checked yet — run ping 10\.20\.4\.1/)).toBeInTheDocument()
    expect(within(map).queryByText(/Reply from/)).not.toBeInTheDocument()

    // The next read of the console reports the check that the action just ran.
    serverRoomTopology = makeTopology('proved')
    fireEvent.click(within(map).getByRole('button', { name: 'Run check: ping 10.20.4.1' }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith('server-room', 'hq', 'site-gateway')
    })
    const litMap = await screen.findByLabelText('Network topology')
    expect(within(litMap).getByText(/1 of 3 links proved/)).toBeInTheDocument()
    expect(within(litMap).getByText(/Proved — Reply from 10\.20\.4\.1/)).toBeInTheDocument()
    expect(within(litMap).queryByText(/Not checked yet — run ping 10\.20\.4\.1/)).not.toBeInTheDocument()
  })

  it('keeps the terminal available and warns when no ticket is open', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadConsole).mockResolvedValue(null)

    renderWorkspace()
    await openTool('Directory')

    expect(
      await screen.findByText('Open a ticket before using this console.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    expect(screen.getByLabelText('Command')).toBeInTheDocument()
    expect(screen.getByText('DNS request timed out.')).toBeInTheDocument()
  })

  it('reveals a hint and shows the points it cost with the count still available', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.revealHint).mockResolvedValue(
      makeView({
        hints: [{ id: 'diagnose-account', text: 'The account lookup shows the lock state.' }],
        hintPenalty: 5,
        hintsRemaining: 20,
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: /Reveal the first hint/ }))

    await waitFor(() => {
      expect(practice.revealHint).toHaveBeenCalledTimes(1)
    })
    expect(
      (await screen.findAllByText('The account lookup shows the lock state.')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/1 revealed/)).toBeInTheDocument()
    expect(screen.getByText(/−5 points so far/)).toBeInTheDocument()
    expect(screen.getByText(/20 hints remain/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reveal the next hint/ })).toHaveTextContent(
      '−5 points · 20 left',
    )
  })

  it('retires the hint control when every hinted step has been revealed', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.revealHint).mockRejectedValue(new stubs.noHintAvailable())

    fireEvent.click(await screen.findByRole('button', { name: /Reveal the first hint/ }))

    expect(
      await screen.findByText(/Every hinted step on this ticket has been revealed/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reveal the/ })).not.toBeInTheDocument()
  })

  it('shows the cost and how many hints remain before the first one is taken', async () => {
    renderWorkspace()

    expect(
      await screen.findByText(/Each rung costs 5 points of diagnostic reasoning, up to 15/),
    ).toBeInTheDocument()
    expect(screen.getByText(/21 hints remain/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reveal the first hint/ })).toHaveTextContent(
      '−5 points · 21 left',
    )
  })

  it('says hints are free when the attempt was started under a free policy', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({ hintPolicy: { perHint: 0, cap: 0, budget: 0 } }),
    )

    renderWorkspace()

    expect(await screen.findByText(/Hints are free on this device/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reveal the first hint/ })).toHaveTextContent(
      'free · 21 left',
    )
  })

  it('says hints are free when the attempt was started with a free policy', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.revealHint).mockResolvedValue(
      makeView({
        hintPolicy: { perHint: 0, cap: 0, budget: 0 },
        hints: [{ id: 'diagnose-account#0', text: 'Read the account state before changing anything.' }],
        hintPenalty: 0,
        hintsRemaining: 20,
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: /Reveal the first hint/ }))

    expect(await screen.findByText(/Hints are free on this device/)).toBeInTheDocument()
    expect(screen.getByText(/1 revealed/)).toBeInTheDocument()
    expect(screen.getByText(/no points spent \(no further charge/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reveal the next hint/ })).toHaveTextContent(
      'free · 20 left',
    )
  })

  it('counts hints against the attempt budget and holds the count down', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.revealHint).mockResolvedValue(
      makeView({
        hintPolicy: { perHint: 5, cap: 15, budget: 3 },
        hints: [{ id: 'diagnose-account#0', text: 'Read the account state before changing anything.' }],
        hintPenalty: 5,
        // Two rungs are left in the budget, not the 20 left on the ticket.
        hintsRemaining: 2,
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: /Reveal the first hint/ }))

    expect(await screen.findByText(/This attempt may take up to 3 hints/)).toBeInTheDocument()
    expect(screen.getByText(/Hints used:/)).toHaveTextContent('Hints used: 1 of 3 for this attempt.')
    const next = screen.getByRole('button', { name: /Reveal the next hint/ })
    expect(next).toHaveTextContent('−5 points · 2 left')
  })

  it('takes the hint control away once the attempt has spent its budget', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.revealHint).mockResolvedValue(
      makeView({
        hintPolicy: { perHint: 5, cap: 15, budget: 2 },
        hints: [
          { id: 'diagnose-account#0', text: 'Read the account state before changing anything.' },
          { id: 'diagnose-account#1', text: 'A locked status changes the whole path; note it down.' },
        ],
        hintPenalty: 10,
        hintsRemaining: 0,
        hintBudgetSpent: true,
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: /Reveal the first hint/ }))

    expect(
      await screen.findByText(/You have used all 2 hints this attempt's budget allows/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reveal the/ })).not.toBeInTheDocument()
    // The remaining rungs are still described, they are just out of reach now.
    expect(screen.getByRole('button', { name: 'Resolve ticket' })).toBeEnabled()
  })

  it('withholds every hint on an exam attempt', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(makeView({ exam: true }))

    renderWorkspace()

    expect(await screen.findByText('Withheld')).toBeInTheDocument()
    expect(screen.getByText('exam attempt')).toBeInTheDocument()
    expect(screen.getByText(/every hint stays closed until it is scored/)).toBeInTheDocument()
    expect(screen.getByText(/5 points a rung on this attempt/)).toBeInTheDocument()
    // No control at all, not a disabled one: there is nothing to take.
    expect(screen.queryByRole('button', { name: /Reveal the/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument()
  })

  it('reports a budget that ran out while the learner was looking at the ticket', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.revealHint).mockRejectedValue(
      new stubs.hintBudgetSpent(
        'This attempt has used all 1 hint in its budget. Carry on without them, or raise the budget in Settings for the next attempt.',
      ),
    )

    fireEvent.click(await screen.findByRole('button', { name: /Reveal the first hint/ }))

    expect(
      await screen.findByText(/This attempt has used all 1 hint in its budget/),
    ).toBeInTheDocument()
    // The control goes with it: the attempt is out of hints, not out of steps.
    expect(screen.queryByRole('button', { name: /Reveal the/ })).not.toBeInTheDocument()
  })

  it('stops charging once the cap is reached while still counting what is left', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.revealHint).mockResolvedValue(
      makeView({
        hints: [
          { id: 'diagnose-account#0', text: 'Read the account state before changing anything.' },
          { id: 'diagnose-account#1', text: 'A locked status changes the whole path; note it down.' },
          { id: 'diagnose-account#2', text: 'status: locked is the line to record in your notes.' },
        ],
        hintPenalty: 15,
        hintsRemaining: 18,
      }),
    )

    fireEvent.click(await screen.findByRole('button', { name: /Reveal the first hint/ }))

    expect(
      await screen.findByText(/no further charge — the rest are free/),
    ).toBeInTheDocument()
    const next = screen.getByRole('button', { name: /Reveal the next hint/ })
    expect(next).toHaveTextContent('free · 18 left')
  })

  it('warns about missing critical steps before recording a close', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve ticket' }))

    expect(await screen.findByText('This attempt would not pass yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Verified the caller before touching the account/),
    ).toBeInTheDocument()
    expect(practice.resolveAttempt).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Close anyway and score' }))

    await waitFor(() => {
      expect(practice.resolveAttempt).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Debrief landing')).toBeInTheDocument()
  })

  it('shows the network bonus still on the table before a passing close', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.reviewClosure).mockResolvedValue({
      total: 92,
      passed: true,
      procedurePenalty: 0,
      hintPenalty: 0,
      criticalFailures: [],
      blocking: [],
      topology: {
        totalLinks: 6,
        provedLinks: 2,
        bonusXp: 0,
        untested: [{ label: 'Larkspur Depot · Gateway', command: 'ping 10.20.4.1' }],
        failed: [{ label: 'Larkspur Depot · Name resolution', command: 'nslookup fileserver' }],
      },
      pendingBonusXp: 25,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve ticket' }))

    const heading = await screen.findByText('The network proof bonus is still available')
    const notice = heading.closest('div') as HTMLElement
    expect(within(notice).getByText(/2 of 6 links proved/)).toBeInTheDocument()
    expect(within(notice).getByText(/\+25 XP/)).toBeInTheDocument()
    // Every link still missing is named with the check that would prove it.
    expect(within(notice).getByText('Larkspur Depot · Gateway')).toBeInTheDocument()
    expect(within(notice).getByText('ping 10.20.4.1')).toBeInTheDocument()
    expect(within(notice).getByText('Larkspur Depot · Name resolution')).toBeInTheDocument()
    expect(within(notice).getByText('nslookup fileserver')).toBeInTheDocument()
    expect(practice.resolveAttempt).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Close without the bonus' }))

    await waitFor(() => {
      expect(practice.resolveAttempt).toHaveBeenCalledTimes(1)
    })
  })

  it('does not call a short attempt a pass while showing the missing proof', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.reviewClosure).mockResolvedValue({
      total: 58,
      passed: false,
      procedurePenalty: 0,
      hintPenalty: 0,
      criticalFailures: [],
      blocking: [],
      topology: {
        totalLinks: 3,
        provedLinks: 1,
        bonusXp: 0,
        untested: [{ label: 'This machine · Address', command: 'ipconfig /all' }],
        failed: [],
      },
      pendingBonusXp: 25,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve ticket' }))

    const heading = await screen.findByText('This attempt would not pass yet')
    const notice = heading.closest('div') as HTMLElement
    expect(within(notice).getByText(/below the pass mark/)).toBeInTheDocument()
    expect(within(notice).queryByText(/and pass/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close anyway and score' })).toBeInTheDocument()
  })

  it('reopens the close a reloaded attempt was writing', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        closureDraft: {
          code: 'escalated-tier2',
          note: 'Unlocked twice; the identity team owns the repeat lockout.',
        },
      }),
    )

    renderWorkspace()

    expect(await screen.findByLabelText('Handoff note')).toHaveValue(
      'Unlocked twice; the identity team owns the repeat lockout.',
    )
    expect(screen.getByLabelText('Closure code')).toHaveValue('escalated-tier2')

    // Restoring is not a change, so reopening costs the session no write.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(practice.saveClosureDraft).not.toHaveBeenCalled()
  })

  it('saves the code and the handoff note with the attempt', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    const note = await screen.findByLabelText('Handoff note')

    fireEvent.change(note, { target: { value: 'Checked the spooler before escalating.' } })
    fireEvent.blur(note)

    await waitFor(() => {
      expect(practice.saveClosureDraft).toHaveBeenCalledWith({
        code: 'resolved-remote',
        note: 'Checked the spooler before escalating.',
      })
    })

    const code = screen.getByLabelText('Closure code')
    fireEvent.change(code, { target: { value: 'escalated-tier2' } })
    fireEvent.blur(code)

    await waitFor(() => {
      expect(practice.saveClosureDraft).toHaveBeenLastCalledWith({
        code: 'escalated-tier2',
        note: 'Checked the spooler before escalating.',
      })
    })
  })

  it('saves a typed note once typing pauses, without waiting for a blur', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    const note = await screen.findByLabelText('Handoff note')

    fireEvent.change(note, { target: { value: 'Rebooted the print spooler.' } })

    await waitFor(
      () => {
        expect(practice.saveClosureDraft).toHaveBeenCalledWith({
          code: 'resolved-remote',
          note: 'Rebooted the print spooler.',
        })
      },
      { timeout: 3000 },
    )
  })

  it('saves a typed note when the page unloads, before the pause is over', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    const note = await screen.findByLabelText('Handoff note')

    fireEvent.change(note, { target: { value: 'Spooler restarted at 09:14.' } })
    // The debounce is still running: a reload or a tab close gets there first.
    expect(practice.saveClosureDraft).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('pagehide'))

    expect(practice.saveClosureDraft).toHaveBeenCalledWith({
      code: 'resolved-remote',
      note: 'Spooler restarted at 09:14.',
    })

    // The flush takes the pending timer with it, so the note is written once.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(practice.saveClosureDraft).toHaveBeenCalledTimes(1)
  })

  it('saves a typed note when the ticket is left before the pause is over', async () => {
    const view = renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    const note = await screen.findByLabelText('Handoff note')

    fireEvent.change(note, { target: { value: 'Handed on with the queue check.' } })
    view.unmount()

    expect(practice.saveClosureDraft).toHaveBeenCalledWith({
      code: 'resolved-remote',
      note: 'Handed on with the queue check.',
    })
  })

  it('abandons an attempt after confirmation and returns to the queue', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    fireEvent.click(await screen.findByRole('button', { name: 'Abandon this ticket' }))
    expect(
      screen.getByText(/recorded as abandoned, not scored/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abandon attempt' }))

    await waitFor(() => {
      expect(practice.abandonAttempt).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Queue landing')).toBeInTheDocument()
  })

  it('shelves every tool the desk has, grouped, with the missing ones named', async () => {
    renderWorkspace()

    fireEvent.click(await screen.findByRole('tab', { name: 'Tools' }))
    const panel = await screen.findByRole('tabpanel', { name: 'Tools' })

    for (const group of ['Infrastructure', 'Email', 'Knowledge', 'Management', 'Service desk']) {
      expect(within(panel).getByRole('heading', { name: group })).toBeInTheDocument()
    }

    // Every tool the course names is on the shelf, and every one of them opens.
    const tools = [
      'Directory',
      'Server Room',
      'Remote Desktop',
      'Computer Deployment',
      'PC Shelf',
      'Mail Admin',
      'Mail Security',
      'Documentation',
      'Asset Management',
      'Ship Manager',
      'Printers',
      'File shares',
    ]
    for (const tool of tools) {
      expect(within(panel).getByRole('button', { name: new RegExp(`^${tool}`) })).toBeInTheDocument()
    }
    expect(within(panel).getAllByRole('button')).toHaveLength(tools.length)
  })

  it('opens a tool from the shelf and comes back to it', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    fireEvent.click(await screen.findByRole('tab', { name: 'Tools' }))
    const panel = await screen.findByRole('tabpanel', { name: 'Tools' })
    fireEvent.click(
      within(panel).getByRole('button', { name: /^Asset Management/ }),
    )

    await waitFor(() => {
      expect(practice.loadConsole).toHaveBeenCalledWith('assets')
    })

    fireEvent.click(await screen.findByRole('button', { name: '← All tools' }))

    expect(
      within(panel).getByRole('heading', { name: 'Management' }),
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole('button', { name: /^Asset Management/ }),
    ).toBeInTheDocument()
  })

  it('opens the mail console from the shelf', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')

    const panel = await openTool('Mail Admin')

    await waitFor(() => {
      expect(practice.loadConsole).toHaveBeenCalledWith('mail-admin')
    })
    expect(await within(panel).findByText('Dana Whitfield')).toBeInTheDocument()
    expect(within(panel).getByText(/dana.whitfield@larkspur.example/)).toBeInTheDocument()
  })

  it('opens a live session on its fake desktop and runs a settings fix', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadConsole).mockResolvedValue(remoteDesktopConsoleView())

    const panel = await openTool('Remote Desktop')
    const desktop = await within(panel).findByRole('region', {
      name: 'Remote desktop for LT-4472',
    })

    // The Start menu is the way into every app on the machine.
    fireEvent.click(within(desktop).getByRole('button', { name: 'Start' }))
    fireEvent.click(within(desktop).getByRole('menuitem', { name: /Settings/ }))

    const settings = await within(desktop).findByRole('dialog', { name: 'Settings' })
    expect(within(settings).getByText(/10.20.4.58/)).toBeInTheDocument()
    fireEvent.click(within(settings).getByRole('button', { name: 'Flush DNS cache' }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith(
        'remote-desktop',
        'LT-4472',
        'flush-dns',
      )
    })
  })

  it('switches between the open desktops from the session bar', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadConsole).mockResolvedValue(
      remoteDesktopConsoleView(
        makeDesktop({
          openDesktops: [
            {
              entryId: 'LT-8813',
              hostname: 'LT-8813',
              userName: 'Theo Brooks',
              focused: false,
              startedAt: Date.UTC(2026, 9, 16, 9, 20),
            },
            {
              entryId: 'LT-4472',
              hostname: 'LT-4472',
              userName: 'Marcus Chen',
              focused: true,
              startedAt: Date.UTC(2026, 9, 16, 9, 28),
            },
          ],
        }),
      ),
    )

    const panel = await openTool('Remote Desktop')
    const desktop = await within(panel).findByRole('region', {
      name: 'Remote desktop for LT-4472',
    })
    const sessions = within(desktop).getByRole('group', { name: 'Open remote sessions' })

    // The desktop in view is the pressed tab; the other is the way back to it.
    expect(within(sessions).getByRole('button', { name: 'LT-4472' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(within(sessions).getByRole('button', { name: 'LT-8813' }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith(
        'remote-desktop',
        'LT-8813',
        'open-desktop',
      )
    })
  })

  it('changes the default printer and the intranet fix-it through the desktop', async () => {
    renderWorkspace()
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadConsole).mockResolvedValue(remoteDesktopConsoleView())

    const panel = await openTool('Remote Desktop')
    const desktop = await within(panel).findByRole('region', {
      name: 'Remote desktop for LT-4472',
    })

    fireEvent.click(within(desktop).getByRole('button', { name: 'Start' }))
    fireEvent.click(within(desktop).getByRole('menuitem', { name: /Printers/ }))
    const printers = await within(desktop).findByRole('dialog', {
      name: 'Printers & scanners',
    })
    fireEvent.click(within(printers).getByRole('button', { name: 'Set as default' }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith(
        'remote-desktop',
        'LT-4472',
        'default-printer',
        ['PRN-FIN-01'],
      )
    })

    fireEvent.click(within(printers).getByRole('button', { name: 'Close Printers & scanners' }))
    fireEvent.click(within(desktop).getByRole('button', { name: 'Start' }))
    fireEvent.click(within(desktop).getByRole('menuitem', { name: /Microsoft Edge/ }))

    const browser = await within(desktop).findByRole('dialog', { name: 'Microsoft Edge' })
    fireEvent.click(within(browser).getByRole('button', { name: 'Fix-its' }))
    fireEvent.click(within(browser).getByRole('button', { name: 'Renew lease' }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith(
        'remote-desktop',
        'LT-4472',
        'renew-lease',
      )
    })
  })

  it('runs the same audited commands from the terminal on the desktop', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadConsole).mockResolvedValue(remoteDesktopConsoleView())
    vi.mocked(practice.submitDesktopTerminalCommand).mockResolvedValue(
      makeView({
        entries: [
          {
            seq: 1,
            kind: 'command',
            text: 'ipconfig /all',
            atMs: Date.UTC(2026, 9, 16, 9, 32),
            ok: true,
            lines: [{ text: 'Host Name:                 LT-4472', tone: 'default' }],
            source: 'remote-desktop-terminal',
            machine: 'LT-4472',
          },
        ],
      }),
    )

    renderWorkspace()
    const panel = await openTool('Remote Desktop')
    const desktop = await within(panel).findByRole('region', {
      name: 'Remote desktop for LT-4472',
    })

    fireEvent.click(within(desktop).getByRole('button', { name: 'Start' }))
    fireEvent.click(within(desktop).getByRole('menuitem', { name: /Terminal/ }))
    const terminal = await within(desktop).findByRole('dialog', { name: 'Terminal' })

    const loadsBefore = vi.mocked(practice.loadConsole).mock.calls.length
    const input = within(terminal).getByRole('textbox', { name: 'Command' })
    fireEvent.change(input, { target: { value: 'ipconfig /all' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    await waitFor(() => {
      expect(practice.submitDesktopTerminalCommand).toHaveBeenCalledWith('ipconfig /all')
    })
    expect(await within(terminal).findByText(/Host Name:\s+LT-4472/)).toBeInTheDocument()
    // The log files that output under the machine the session reached.
    expect(await screen.findByText('· via Desktop terminal on LT-4472')).toBeInTheDocument()

    // The machine the shell reads is reread after the command, so the desktop
    // cannot keep showing a state the command just changed.
    await waitFor(() => {
      expect(vi.mocked(practice.loadConsole).mock.calls.length).toBeGreaterThan(loadsBefore)
    })
  })

  it('names the machine each shell command ran on, and only a shell', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        entries: [
          {
            seq: 1,
            kind: 'command',
            text: 'hostname',
            atMs: Date.UTC(2026, 9, 16, 9, 31),
            ok: true,
            lines: [{ text: 'LT-4471', tone: 'default' }],
            source: 'terminal',
            machine: 'LT-4471',
          },
          {
            seq: 2,
            kind: 'command',
            text: 'hostname',
            atMs: Date.UTC(2026, 9, 16, 9, 32),
            ok: true,
            lines: [{ text: 'LT-8812', tone: 'default' }],
            source: 'remote-desktop-terminal',
            machine: 'LT-8812',
          },
          {
            seq: 3,
            kind: 'command',
            text: 'get-account dwhitfield',
            atMs: Date.UTC(2026, 9, 16, 9, 33),
            ok: true,
            lines: [{ text: 'status          : locked', tone: 'default' }],
            source: 'directory',
            machine: null,
          },
        ],
      }),
    )
    renderWorkspace()

    // The side terminal names the machine its shell spoke for…
    expect(await screen.findByText('· on LT-4471')).toBeInTheDocument()
    // …the desktop terminal names the surface and the machine it reached…
    expect(screen.getByText('· via Desktop terminal on LT-8812')).toBeInTheDocument()
    // …and a console action reads a record rather than running on a host.
    expect(screen.getByText('· via Directory')).toBeInTheDocument()
    expect(screen.queryByText(/via Directory on/)).not.toBeInTheDocument()
  })

  it('connects from a machine row in the Remote Desktop picker', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadConsole).mockResolvedValue(
      consoleView('remote-desktop', [
        consoleEntry({
          id: 'LT-4472',
          subtitle: 'Marcus Chen · No session',
          actions: [
            consoleAction('connect', 'Connect remotely', (id) => `connect-remote ${id}`),
          ],
        }),
        consoleEntry({
          id: 'LT-8813',
          subtitle: 'Theo Brooks · Session active',
          actions: [
            consoleAction('end-session', 'End the session', (id) => `end-remote-session ${id}`),
          ],
        }),
      ]),
    )
    renderWorkspace()
    const panel = await openTool('Remote Desktop')

    // The picker names itself and what the list is for, above the search.
    expect(
      await within(panel).findByRole('heading', { name: 'Remote Desktop' }),
    ).toBeInTheDocument()
    expect(within(panel).getByText('Select a computer to connect')).toBeInTheDocument()

    const rows = within(panel).getByRole('list', { name: 'Machines the desk can reach' })
    expect(within(rows).getByText('Marcus Chen · No session')).toBeInTheDocument()

    // The row connects without the record being opened first, and the command is
    // the same audited one the record's own button runs.
    fireEvent.click(within(rows).getByRole('button', { name: 'Connect' }))

    await waitFor(() => {
      expect(practice.runConsoleAction).toHaveBeenCalledWith('remote-desktop', 'LT-4472', 'connect')
    })

    // A machine already being worked on offers the way out instead.
    const busyRow = within(rows).getByText('Theo Brooks · Session active').closest('li')
    if (!busyRow) {
      throw new Error('The machine with a session is missing from the picker')
    }
    expect(within(busyRow).getByRole('button', { name: 'End session' })).toBeInTheDocument()
    expect(within(busyRow).queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument()
  })

  it('renders the documentation runbooks it loads', async () => {
    renderWorkspace()

    const panel = await openTool('Documentation')

    fireEvent.click(
      await within(panel).findByRole('button', {
        name: /^Verify a caller before anything changes/,
      }),
    )

    expect(
      await within(panel).findByText('Send a verification code to the person on the ticket.'),
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

  it('shows a zero process cost before any violation is recorded', async () => {
    renderWorkspace()

    expect(await screen.findByText('Process cost')).toBeInTheDocument()
    expect(screen.getByText('0 pts')).toBeInTheDocument()
    expect(screen.getByText(/No process deductions so far/)).toBeInTheDocument()
  })

  it('prices recorded procedure violations live in the stage bar', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        procedurePenalty: 15,
        procedureViolations: [
          {
            id: 'unverified-change',
            label: 'Changed the account before verifying the caller',
            detail:
              'An account change was made before anyone proved they were the person on the ticket.',
            points: 10,
            category: 'safety',
          },
          {
            id: 'fix-before-evidence',
            label: 'Changed something before reading any evidence',
            detail: 'No read-only check came before the fix, so the change was not justified by its state.',
            points: 5,
            category: 'diagnosis',
          },
        ],
      }),
    )
    renderWorkspace()

    expect(await screen.findByText('−15 pts')).toBeInTheDocument()
    expect(screen.getByText('Changed the account before verifying the caller')).toBeInTheDocument()
    expect(screen.getByText('Changed something before reading any evidence')).toBeInTheDocument()
    expect(screen.getByText('−10')).toBeInTheDocument()
    expect(screen.getByText('−5')).toBeInTheDocument()
  })

  it('offers to un-run a step, names what goes with it, and only then runs it', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        entries: [
          firstStep(),
          {
            seq: 2,
            kind: 'command',
            text: 'reset-password dwhitfield',
            atMs: Date.UTC(2026, 9, 16, 9, 32),
            ok: true,
            lines: [{ text: "The password for 'dwhitfield' was reset.", tone: 'success' }],
            source: 'terminal',
            machine: 'LT-4471',
          },
        ],
      }),
    )
    renderWorkspace()
    // A console stays open behind the terminal, so the reread after a rewind can
    // be checked without the console covering the log.
    await openTool('Directory')
    fireEvent.click(await screen.findByRole('tab', { name: 'Terminal' }))
    const loadsBefore = vi.mocked(practice.loadConsole).mock.calls.length

    fireEvent.click(
      await screen.findByRole('button', { name: 'Un-run step 2 and everything after it' }),
    )

    // Nothing has happened yet: the cut is named, and cancelling keeps the step.
    expect(screen.getByText('Un-run 1 step from step 2?')).toBeInTheDocument()
    expect(screen.getByText(/hints you paid for/)).toBeInTheDocument()
    expect(practice.rewindAttempt).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }))
    expect(screen.queryByText('Un-run 1 step from step 2?')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Un-run step 2 and everything after it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Un-run 1 step' }))

    await waitFor(() => {
      expect(practice.rewindAttempt).toHaveBeenCalledWith(2)
    })
    // The machine the open console reads is reread, so it cannot keep showing a
    // state the un-run step changed.
    await waitFor(() => {
      expect(vi.mocked(practice.loadConsole).mock.calls.length).toBeGreaterThan(loadsBefore)
    })
  })

  it('keeps the cut a rewind left as a record, with nothing left to un-run', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        entries: [
          firstStep(),
          {
            seq: 2,
            kind: 'rewind',
            dropped: 2,
            atMs: Date.UTC(2026, 9, 16, 9, 35),
            canReapply: false,
          },
        ],
      }),
    )
    renderWorkspace()

    expect(await screen.findByText(/Un-ran 2 steps from here/)).toBeInTheDocument()
    // The marker is not a step: it cannot be un-run to erase the fact of the cut.
    expect(
      screen.queryByRole('button', { name: 'Un-run step 2 and everything after it' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Un-run step 1 and everything after it' }),
    ).toBeInTheDocument()
  })

  it('offers to put back the steps of a cut that is still the end of the log', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        entries: [
          firstStep(),
          {
            seq: 2,
            kind: 'rewind',
            dropped: 2,
            atMs: Date.UTC(2026, 9, 16, 9, 35),
            canReapply: true,
          },
        ],
      }),
    )
    vi.mocked(practice.reapplyRewind).mockResolvedValue(makeView())
    renderWorkspace()

    expect(await screen.findByText(/Un-ran 2 steps from here/)).toBeInTheDocument()
    // The cut is still reversible, so the steps can come back without retyping.
    expect(screen.getByText(/No work has been logged since the cut/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Put back the 2 steps this rewind took' }))

    await waitFor(() => {
      expect(practice.reapplyRewind).toHaveBeenCalledWith(2)
    })
  })

  it('does not offer to put back a cut that later work has moved past', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(
      makeView({
        entries: [
          firstStep(),
          {
            seq: 2,
            kind: 'rewind',
            dropped: 1,
            atMs: Date.UTC(2026, 9, 16, 9, 35),
            canReapply: false,
          },
          {
            seq: 3,
            kind: 'command',
            text: 'nslookup fileserver',
            atMs: Date.UTC(2026, 9, 16, 9, 36),
            ok: true,
            lines: [{ text: 'fileserver.larkspur.example', tone: 'default' }],
            source: 'terminal',
            machine: 'LT-4471',
          },
        ],
      }),
    )
    renderWorkspace()

    expect(await screen.findByText(/Un-ran 1 step from here/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Put back the 1 step/ })).not.toBeInTheDocument()
  })

  it('takes un-running away on an exam, and says the log is fixed', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.openSession).mockResolvedValue(makeView({ canRewind: false, exam: true }))
    renderWorkspace()

    expect(await screen.findByText('DNS request timed out.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Un-run step/ })).not.toBeInTheDocument()
  })
})
