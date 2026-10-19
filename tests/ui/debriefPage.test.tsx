import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DebriefView } from '../../src/app/practiceService'
import { DebriefPage } from '../../src/ui/routes/DebriefPage'

function makeDebrief(overrides: Partial<DebriefView> = {}): DebriefView {
  const hintPolicy = overrides.hintPolicy ?? { perHint: 5, cap: 15, budget: 0 }
  return {
    sessionId: 'session-1',
    ticket: {
      id: 'ticket-1',
      scenarioId: 'PWD-01',
      variantId: 'account-lockout',
      scenarioTitle: 'Password and account access',
      variantLabel: 'Account lockout',
      difficulty: 1,
      severity: 'high',
      category: 'identity',
      status: 'completed',
      subject: 'Marcus is locked out of LT-4471',
      body: 'I cannot sign in; the account is locked.',
      requester: {
        name: 'Marcus Chen',
        samAccountName: 'mchen',
        employeeId: 'E-4421',
        department: 'Operations',
        email: 'marcus.chen@larkspur.example',
        siteName: 'Larkspur HQ',
      },
      device: {
        hostname: 'LT-4471',
        kind: 'laptop',
        os: 'Windows 11 Enterprise 23H2',
        siteName: 'Larkspur HQ',
      },
      symptoms: ['Sign-in is rejected'],
      reportedAt: Date.UTC(2026, 9, 16, 9, 30),
    },
    decision: { outcome: 'resolved', code: 'resolved-remote', note: '' },
    total: 75,
    passed: false,
    band: 'fail',
    xp: 40,
    hintPolicy,
    hintPricing: {
      policy: hintPolicy,
      source: 'default',
      familyId: null,
      defaultPolicy: { perHint: 5, cap: 15, budget: 0 },
    },
    exam: false,
    rewinds: 0,
    rewoundSteps: 0,
    criticalFailures: ['Verified the caller before touching the account'],
    feedback: ['Procedure cost: −10 from safety — changed the account before verifying.'],
    items: [
      {
        id: 'verify-caller',
        label: 'Verified the caller before touching the account',
        category: 'safety',
        weight: 15,
        critical: true,
        passed: false,
        why: 'Account changes are a social-engineering target.',
        hints: ['Verify before changing anything.', 'Send the code and have the caller read it back.'],
        evidence: ['No record that you verified the caller before changing anything.'],
        gaps: ['No record that you verified the caller before changing anything.'],
        hintsTaken: [],
      },
    ],
    categoryScores: {
      diagnosis: { earned: 30, possible: 30 },
      documentation: { earned: 15, possible: 15 },
      resolution: { earned: 40, possible: 40 },
      safety: { earned: 0, possible: 15 },
    },
    reference: [{ label: 'Verify the caller', detail: 'Confirm identity first.' }],
    endedAt: Date.UTC(2026, 9, 16, 9, 40),
    hintsUsed: 2,
    hintPenalty: 10,
    unaccountedHints: 0,
    unaccountedHintCost: 0,
    violations: [
      {
        id: 'unverified-change',
        label: 'Changed the account before verifying the caller',
        detail: 'An account change was made before anyone proved they were on the ticket.',
        points: 10,
        category: 'safety',
      },
    ],
    procedurePenalty: 10,
    topology: null,
    topologyMap: null,
    identityFindings: [],
    pressure: { interruptions: 0, beats: [] },
    trail: [
      {
        kind: 'command',
        command: 'get-account mchen',
        source: 'directory',
        machine: null,
        ok: true,
        credit: ['Read the account state before changing it'],
        atMs: Date.UTC(2026, 9, 16, 9, 32),
      },
      {
        kind: 'command',
        command: 'unlock-account mchen',
        source: 'terminal',
        machine: 'LT-4471',
        ok: true,
        credit: ['Unlocked mchen'],
        atMs: Date.UTC(2026, 9, 16, 9, 33),
      },
      {
        kind: 'command',
        command: 'remove-dhcp-lease hq 10.20.4.57',
        source: 'server-room',
        machine: null,
        ok: false,
        credit: [],
        atMs: Date.UTC(2026, 9, 16, 9, 34),
      },
    ],
    ...overrides,
  }
}

// The real module comes through for everything the page reads but the two
// database calls, so a label or map the page leans on cannot be missing here.
vi.mock('../../src/app/practiceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/practiceService')>()),
  loadDebrief: vi.fn(),
  startAttempt: vi.fn(),
}))

function renderDebrief() {
  return render(
    <MemoryRouter initialEntries={['/debrief/session-1']}>
      <Routes>
        <Route path="debrief/:sessionId" element={<DebriefPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  const practice = await import('../../src/app/practiceService')
  vi.mocked(practice.loadDebrief).mockResolvedValue(makeDebrief())
})

describe('DebriefPage', () => {
  it('lists the procedure cost and prices the hints', async () => {
    const { container } = renderDebrief()

    expect(await screen.findByText('Procedure cost')).toBeInTheDocument()
    const procedure = screen.getByLabelText('Procedure penalties')
    expect(within(procedure).getByText(/−10 from Safety/)).toBeInTheDocument()
    expect(within(procedure).getByText(/before verifying the caller/)).toBeInTheDocument()
    expect(screen.getByLabelText('Score').textContent).toContain(
      'Hints: 2 (−10 pts of diagnostic reasoning)',
    )
    expect(container.textContent).not.toMatch(/hints are free/i)
    // Nothing says the price came from anywhere but the default.
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    // An attempt with no contradicted claim has no identity section to show.
    expect(screen.queryByLabelText('Identity check')).not.toBeInTheDocument()
    // And a caller who never broke in has no pressure to report.
    expect(screen.queryByLabelText('Caller pressure')).not.toBeInTheDocument()
  })

  it('reports how many times the caller broke in and what each interruption followed', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        ticket: {
          ...makeDebrief().ticket,
          variantId: 'pressured-lockout',
          variantLabel: 'Urgent caller pushing for a fix',
        },
        pressure: {
          interruptions: 2,
          beats: [
            {
              message: 'No code, no questions — just unlock it.',
              after: 'after you ran `unlock-account mchen`',
              atMs: Date.UTC(2026, 9, 16, 9, 33),
            },
            {
              message: 'Are you still there? I am on a clock.',
              after: 'after you saved your troubleshooting note',
              atMs: Date.UTC(2026, 9, 16, 9, 35),
            },
          ],
        },
      }),
    )

    renderDebrief()

    const section = await screen.findByLabelText('Caller pressure')
    expect(within(section).getByText('2 interruptions')).toBeInTheDocument()
    expect(within(section).getByText(/No code, no questions/)).toBeInTheDocument()
    expect(within(section).getByText('after you ran `unlock-account mchen`')).toBeInTheDocument()
    expect(within(section).getByText(/Are you still there/)).toBeInTheDocument()
    expect(
      within(section).getByText('after you saved your troubleshooting note'),
    ).toBeInTheDocument()
  })

  it('shows which caller claims the evidence contradicted', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        ticket: {
          ...makeDebrief().ticket,
          variantId: 'impersonated-caller',
          variantLabel: 'Caller claiming to be someone else',
        },
        identityFindings: [
          {
            id: 'claimed-lockout',
            claim: 'My account is locked out and I need it unlocked.',
            evidence: 'The directory shows status: active.',
          },
          {
            id: 'claimed-owner',
            claim: 'I am Marcus Chen, the account owner.',
            evidence:
              'The live code went to Marcus Chen’s own contact on the ticket, and the caller could not read it back.',
          },
        ],
      }),
    )

    renderDebrief()

    const section = await screen.findByLabelText('Identity check')
    expect(within(section).getByText('2 claims contradicted')).toBeInTheDocument()
    expect(
      within(section).getByText(/My account is locked out and I need it unlocked/),
    ).toBeInTheDocument()
    expect(within(section).getByText(/status: active/)).toBeInTheDocument()
    expect(within(section).getByText(/could not read it back/)).toBeInTheDocument()
  })

  it('files each shell command under the machine it ran on', async () => {
    renderDebrief()

    const trail = await screen.findByLabelText('Attempt trail')
    // One command was typed in a shell; the console read and the server-room
    // attempt were taken from a panel, so they name no machine.
    expect(within(trail).getAllByText('on LT-4471')).toHaveLength(1)
    expect(within(trail).getByText('get-account mchen')).toBeInTheDocument()

    // The credit table keeps the same label, because a tool can reach more than
    // one machine across an attempt.
    const byTool = screen.getByLabelText('Commands by tool')
    expect(within(byTool).getByText('on LT-4471')).toBeInTheDocument()
  })

  it('says when the attempt was priced for one scenario family', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        hintPolicy: { perHint: 3, cap: 9, budget: 0 },
        hintPricing: {
          policy: { perHint: 3, cap: 9, budget: 0 },
          source: 'family',
          familyId: 'PWD-01',
          defaultPolicy: { perHint: 5, cap: 15, budget: 0 },
        },
      }),
    )
    renderDebrief()

    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent(
      'Hints were priced for Accounts, not at the default: 3 points a rung, capped at 9.',
    )
    expect(note).toHaveTextContent('The default then was 5 points a rung, capped at 15.')
  })

  it('hands over the ladders an exam withheld, priced at the exam rate', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({ exam: true, hintsUsed: 0, hintPenalty: 0 }),
    )

    renderDebrief()

    const exam = await screen.findByLabelText('Exam attempt')
    expect(
      within(exam).getByText(/no hint was available while it was open/),
    ).toBeInTheDocument()
    expect(
      within(exam).getByText(/was priced at the exam rate of 5 points a rung, capped at 15/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Score').textContent).toContain('Exam: no hints taken')

    // The step the attempt missed still owes the learner the ladder it withheld.
    const ladder = screen.getByLabelText(
      'Hints available on Verified the caller before touching the account',
    )
    expect(within(ladder).getByText('Verify before changing anything.')).toBeInTheDocument()
    expect(within(ladder).getByText('Send the code and have the caller read it back.')).toBeInTheDocument()
  })

  it('hides the procedure section when the attempt followed the process', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({ violations: [], procedurePenalty: 0, hintsUsed: 0, total: 100 }),
    )

    renderDebrief()

    expect(await screen.findByText('By category')).toBeInTheDocument()
    expect(screen.queryByText('Procedure cost')).not.toBeInTheDocument()
  })

  it('shows where each logged command came from', async () => {
    renderDebrief()

    const trail = await screen.findByLabelText('Attempt trail')
    expect(within(trail).getByText('get-account mchen')).toBeInTheDocument()
    expect(within(trail).getByText('unlock-account mchen')).toBeInTheDocument()
    expect(within(trail).getByText('remove-dhcp-lease hq 10.20.4.57')).toBeInTheDocument()

    expect(within(trail).getByText('Directory')).toBeInTheDocument()
    expect(within(trail).getByText('Terminal')).toBeInTheDocument()
    expect(within(trail).getByText('Server room')).toBeInTheDocument()
    expect(within(trail).getByText(/^Logged from:/).textContent).toContain(
      '1 Terminal · 1 Directory · 1 Server room',
    )

    // A command the simulator refused is marked, so the trail is not a list of
    // things that supposedly worked.
    expect(within(trail).getByText(/rejected — no result recorded/)).toBeInTheDocument()
  })

  it('labels the hints, notes and identity checks with the panel they came from', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        trail: [
          {
            kind: 'identity',
            source: 'verify-caller',
            label: 'Code sent',
            summary: 'to Dana Whitfield · mobile •••-•••-6361',
            ok: true,
            atMs: Date.UTC(2026, 9, 16, 9, 31),
          },
          {
            kind: 'hint',
            source: 'hints',
            label: 'Verified the caller before touching the account',
            cost: 5,
            atMs: Date.UTC(2026, 9, 16, 9, 32),
          },
          {
            kind: 'note',
            source: 'troubleshooting-notes',
            noteKind: 'troubleshooting',
            text: 'Directory showed the account locked.',
            atMs: Date.UTC(2026, 9, 16, 9, 33),
          },
          {
            kind: 'identity',
            source: 'verify-caller',
            label: 'Code check',
            summary: 'The code did not come back from the caller.',
            ok: false,
            atMs: Date.UTC(2026, 9, 16, 9, 34),
          },
          {
            kind: 'note',
            source: 'handoff-note',
            noteKind: 'resolution',
            text: 'Unlocked after checking who was on the call.',
            atMs: Date.UTC(2026, 9, 16, 9, 35),
          },
        ],
      }),
    )

    renderDebrief()

    const trail = await screen.findByLabelText('Attempt trail')
    expect(within(trail).getAllByText('Verify the caller')).toHaveLength(2)
    expect(within(trail).getByText('Hints')).toBeInTheDocument()
    expect(within(trail).getByText('Troubleshooting notes')).toBeInTheDocument()
    expect(within(trail).getByText('Handoff note')).toBeInTheDocument()

    // Each step reads in its own shape: a hint names the step it unstuck and
    // what the rung cost, and a check says which way it went.
    expect(
      within(trail).getByText(
        'Revealed a hint on “Verified the caller before touching the account”',
      ),
    ).toBeInTheDocument()
    expect(within(trail).getByText('−5 pts')).toBeInTheDocument()
    expect(within(trail).getByText('Directory showed the account locked.')).toBeInTheDocument()
    expect(within(trail).getByText(/✗ The code did not come back from the caller/)).toBeInTheDocument()
    expect(within(trail).getByText(/^Logged from:/).textContent).toContain(
      '1 Hints · 1 Troubleshooting notes · 1 Handoff note · 2 Verify the caller',
    )
  })

  it('says so when an attempt logged no command at all', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(makeDebrief({ trail: [] }))

    renderDebrief()

    const trail = await screen.findByLabelText('Attempt trail')
    expect(within(trail).getByText('No step was logged on this attempt.')).toBeInTheDocument()
    // Nothing to sort by tool when nothing was run.
    expect(screen.queryByLabelText('Commands by tool')).not.toBeInTheDocument()
  })

  it('sorts the commands by the tool that ran them, credit apart from dead ends', async () => {
    renderDebrief()

    const section = await screen.findByLabelText('Commands by tool')
    expect(within(section).getByText('2 of 3 earned credit')).toBeInTheDocument()

    const directory = within(section).getByLabelText('Directory commands')
    expect(within(directory).getByText('get-account mchen')).toBeInTheDocument()
    expect(
      within(directory).getByText(/^Earned credit — Read the account state before changing it$/),
    ).toBeInTheDocument()
    expect(
      within(directory).getByText('1 command · 1 earned credit · 0 dead ends'),
    ).toBeInTheDocument()

    const terminal = within(section).getByLabelText('Terminal commands')
    expect(within(terminal).getByText(/^Earned credit — Unlocked mchen$/)).toBeInTheDocument()

    // A refused command says why it was a dead end rather than looking refused
    // and useful at the same time.
    const serverRoom = within(section).getByLabelText('Server room commands')
    expect(within(serverRoom).getByText('Dead end — the simulator refused it')).toBeInTheDocument()
    expect(
      within(serverRoom).getByText('1 command · 0 earned credit · 1 dead end'),
    ).toBeInTheDocument()
  })

  it('calls a command the score did not rest on a dead end, not credit', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        trail: [
          {
            kind: 'command',
            command: 'dir c:\\users',
            source: 'terminal',
            machine: 'LT-4471',
            ok: true,
            credit: [],
            atMs: Date.UTC(2026, 9, 16, 9, 32),
          },
        ],
      }),
    )

    renderDebrief()

    const section = await screen.findByLabelText('Commands by tool')
    expect(within(section).getByText('0 of 1 earned credit')).toBeInTheDocument()
    expect(
      within(section).getByText('Dead end — no step of the rubric rested on it'),
    ).toBeInTheDocument()
    expect(within(section).getByText('1 command · 0 earned credit · 1 dead end')).toBeInTheDocument()
  })

  it('shows each revealed hint rung beside the step it unstuck, with what it cost', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        items: [
          {
            id: 'verify-caller',
            label: 'Verified the caller before touching the account',
            category: 'safety',
            weight: 15,
            critical: true,
            passed: true,
            why: 'Account changes are a social-engineering target.',
            hints: [
              'Verify before changing anything.',
              'Send the code and have the caller read it back.',
            ],
            evidence: ['You verified the caller by reading back the live code.'],
            gaps: [],
            hintsTaken: [
              { rung: 1, text: 'Verify before changing anything.', cost: 5 },
              { rung: 2, text: 'Send the code and have the caller read it back.', cost: 5 },
            ],
          },
          {
            id: 'ask-the-user',
            label: 'Asked what changed',
            category: 'diagnosis',
            weight: 10,
            critical: false,
            passed: false,
            why: 'A change in the environment is the cheapest clue.',
            hints: ['Ask about recent changes.', 'Ask when it last worked and what changed.'],
            evidence: ['No record that you asked the caller what had changed.'],
            gaps: ['No record that you asked the caller what had changed.'],
            hintsTaken: [{ rung: 1, text: 'Ask about recent changes.', cost: 0 }],
          },
          {
            id: 'close-out',
            label: 'Closed the ticket out',
            category: 'documentation',
            weight: 5,
            critical: false,
            passed: false,
            why: 'A close with no note leaves the next team guessing.',
            hints: ['Write the handoff note.', 'Name the report and the next action.'],
            evidence: ['No handoff note was left.'],
            gaps: ['No handoff note was left.'],
            hintsTaken: [
              { rung: 1, text: 'Write the handoff note.', cost: 0 },
              { rung: 2, text: 'Name the report and the next action.', cost: 0 },
            ],
          },
        ],
      }),
    )

    renderDebrief()

    await screen.findByLabelText('Attempt findings')
    const hinted = within(
      screen.getByLabelText('Hints taken on Verified the caller before touching the account'),
    )

    expect(
      hinted.getByText(
        /2 hints taken on this step · −10 pts of diagnostic reasoning · 5 each, capped at 15/,
      ),
    ).toBeInTheDocument()
    expect(hinted.getByText('Rung 1 of 2')).toBeInTheDocument()
    expect(hinted.getByText('Verify before changing anything.')).toBeInTheDocument()
    expect(hinted.getByText('Rung 2 of 2')).toBeInTheDocument()
    expect(hinted.getByText('Send the code and have the caller read it back.')).toBeInTheDocument()
    expect(hinted.getAllByText('−5 pts')).toHaveLength(2)
    // What the step would have handed over unaided: here, the finding itself.
    expect(
      hinted.getByText(/Unaided · worth 15 pts — you found it — you verified the caller by reading back the live code/),
    ).toBeInTheDocument()

    // A step the learner never reached owes them the rung they did not take, and
    // the block does not simply repeat a rung it already printed above.
    const missed = within(screen.getByLabelText('Hints taken on Asked what changed'))
    expect(missed.getByText('Rung 1 of 2')).toBeInTheDocument()
    // That rung came after the cap, so it is labelled by what it cost: nothing.
    expect(missed.getByText('free')).toBeInTheDocument()
    expect(missed.getByText(/free — the 15-point cap was already reached/)).toBeInTheDocument()
    expect(
      missed.getByText(/Unaided · worth 10 pts — still owed to you: Ask when it last worked and what changed\./),
    ).toBeInTheDocument()
    expect(missed.queryByText(/Hints: /)).not.toBeInTheDocument()

    // With the whole ladder spent and nothing found, the step's own lesson is the
    // only thing left to say — and it is not a rung already on screen.
    const spent = within(screen.getByLabelText('Hints taken on Closed the ticket out'))
    expect(spent.getByText('Rung 1 of 2')).toBeInTheDocument()
    expect(spent.getByText('Rung 2 of 2')).toBeInTheDocument()
    expect(
      spent.getByText(/Unaided · worth 5 pts — the lesson: A close with no note leaves the next team guessing\./),
    ).toBeInTheDocument()
  })

  it('states the hints its missing log cannot place, so the count and the steps agree', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({ unaccountedHints: 2, unaccountedHintCost: 10 }),
    )

    renderDebrief()

    // The number beside the score is the one that was charged…
    expect(await screen.findByLabelText('Score')).toHaveTextContent(
      'Hints: 2 (−10 pts of diagnostic reasoning)',
    )
    // …and the steps say the same, with the reason they cannot show them.
    const notice = await screen.findByRole('note')
    expect(notice).toHaveTextContent(
      '2 hints were revealed and cost 10 points of diagnostic reasoning',
    )
    expect(notice).toHaveTextContent(/no longer records which step each rung unstuck/)
    expect(notice).toHaveTextContent(/The count beside the score is the one that was charged/)
    // A step with no rung on it cannot claim it was worked out unaided when a
    // rung is unaccounted for.
    expect(
      screen.queryByLabelText('Hints available on Verified the caller before touching the account'),
    ).not.toBeInTheDocument()
  })

  it('shows hints as free on a score recorded when they carried no cost', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({ hintsUsed: 3, hintPenalty: 0, hintPolicy: { perHint: 0, cap: 0, budget: 0 } }),
    )

    renderDebrief()

    expect(await screen.findByLabelText('Score')).toHaveTextContent('Hints: 3 (free)')
  })

  it('shows how much of the attempt budget the hints used', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({ hintsUsed: 2, hintPenalty: 10, hintPolicy: { perHint: 5, cap: 15, budget: 2 } }),
    )

    renderDebrief()

    expect(await screen.findByLabelText('Score')).toHaveTextContent(
      'Hints: 2 of 2 (−10 pts of diagnostic reasoning)',
    )
  })

  it('names the network links that were never proved', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        topology: {
          totalLinks: 3,
          provedLinks: 1,
          bonusXp: 0,
          untested: [
            { label: 'Larkspur Depot · Gateway', command: 'ping 10.20.4.9' },
          ],
          failed: [{ label: 'Servers · SRV-FS01', command: 'ping SRV-FS01' }],
        },
      }),
    )

    renderDebrief()

    const proof = await screen.findByLabelText('Network proof')
    expect(within(proof).getByText('1 of 3 links proved')).toBeInTheDocument()
    expect(within(proof).getByText(/no network bonus|not awarded/)).toBeInTheDocument()
    expect(within(proof).getByText(/Not tested:/)).toBeInTheDocument()
    expect(within(proof).getByText('Larkspur Depot · Gateway')).toBeInTheDocument()
    expect(within(proof).getByText('ping 10.20.4.9')).toBeInTheDocument()
    expect(within(proof).getByText(/Tested and failed:/)).toBeInTheDocument()
    expect(within(proof).getByText('Servers · SRV-FS01')).toBeInTheDocument()
  })

  it('shows the proof bonus when every network link was proved', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        topology: {
          totalLinks: 2,
          provedLinks: 2,
          bonusXp: 25,
          untested: [],
          failed: [],
        },
      }),
    )

    renderDebrief()

    const proof = await screen.findByLabelText('Network proof')
    expect(within(proof).getByText('2 of 2 links proved')).toBeInTheDocument()
    expect(within(proof).getByText(/\+25 XP/)).toBeInTheDocument()
  })

  it('draws the map the ticket closed on, with nothing to run from it', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        topology: {
          totalLinks: 3,
          provedLinks: 1,
          bonusXp: 0,
          untested: [{ label: 'Larkspur Depot · Gateway', command: 'ping 10.20.4.9' }],
          failed: [],
        },
        topologyMap: {
          originHostname: 'LT-4471',
          originSiteName: 'Larkspur HQ',
          proved: 1,
          failed: 0,
          total: 3,
          groups: [
            {
              id: 'origin',
              kind: 'origin',
              title: 'This machine',
              subtitle: 'LT-4471 · Larkspur HQ',
              checks: [
                {
                  id: 'origin:adapter',
                  label: 'Adapter and lease',
                  command: 'ipconfig /all',
                  state: 'proved',
                  evidence: 'IPv4 Address. . . : 10.20.4.57',
                  atMs: Date.UTC(2026, 9, 16, 9, 35),
                  entryId: 'lt-4471',
                  actionId: 'machine-adapter',
                },
                {
                  id: 'origin:name',
                  label: 'Name resolution',
                  command: 'nslookup fileserver',
                  state: 'unknown',
                  evidence: null,
                  atMs: null,
                  entryId: 'lt-4471',
                  actionId: 'machine-resolve',
                },
              ],
            },
            {
              id: 'site:hq',
              kind: 'site',
              title: 'Larkspur HQ',
              subtitle: '10.20.4.0/24 · gateway 10.20.4.1',
              checks: [
                {
                  id: 'site:hq:gateway',
                  label: 'Gateway',
                  command: 'ping 10.20.4.1',
                  state: 'unknown',
                  evidence: null,
                  atMs: null,
                  entryId: 'hq',
                  actionId: 'site-gateway',
                },
              ],
            },
          ],
        },
      }),
    )

    renderDebrief()

    const proof = await screen.findByLabelText('Network proof')
    expect(
      within(proof).getByText(/the map as it stood when you closed the ticket/i),
    ).toBeInTheDocument()

    const map = within(proof).getByLabelText('Network topology')
    expect(within(map).getByText(/1 of 3 links proved · 2 unchecked/)).toBeInTheDocument()
    expect(within(map).getByText('This machine')).toBeInTheDocument()
    // The link the log proved, with the line that settled it.
    expect(
      within(map).getByText('Proved — IPv4 Address. . . : 10.20.4.57'),
    ).toBeInTheDocument()
    // And the ones it never tested stay dark, each naming its own check.
    expect(within(map).getByText('Not checked yet — run ping 10.20.4.1')).toBeInTheDocument()
    expect(
      within(map).getByText('Not checked yet — run nslookup fileserver'),
    ).toBeInTheDocument()

    // The close-time map is read alone: no row can run a check after the fact.
    expect(within(map).queryByRole('button')).not.toBeInTheDocument()
  })

  it('says a rung cost nothing when the attempt ran with free hints', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({
        hintsUsed: 1,
        hintPenalty: 0,
        hintPolicy: { perHint: 0, cap: 0, budget: 0 },
        items: [
          {
            id: 'verify-caller',
            label: 'Verified the caller before touching the account',
            category: 'safety',
            weight: 15,
            critical: true,
            passed: true,
            why: 'Account changes are a social-engineering target.',
            hints: ['Verify before changing anything.', 'Send the code and have the caller read it back.'],
            evidence: ['You verified the caller by reading back the live code.'],
            gaps: [],
            hintsTaken: [{ rung: 1, text: 'Verify before changing anything.', cost: 0 }],
          },
        ],
        criticalFailures: [],
      }),
    )

    renderDebrief()

    const hinted = within(
      await screen.findByLabelText('Hints taken on Verified the caller before touching the account'),
    )
    expect(
      hinted.getByText(/Hint taken on this step · free on this attempt/),
    ).toBeInTheDocument()
    expect(hinted.getByText('free')).toBeInTheDocument()
  })

  it('names the steps a rewind took, and reads the score from what is left', async () => {
    const practice = await import('../../src/app/practiceService')
    vi.mocked(practice.loadDebrief).mockResolvedValue(
      makeDebrief({ rewinds: 1, rewoundSteps: 3 }),
    )

    renderDebrief()

    const showed = await screen.findByLabelText('What your attempt showed')
    expect(
      within(showed).getByText(/3 steps went in 1 rewind while this attempt was open/),
    ).toBeInTheDocument()
    expect(within(showed).getByText(/read from the log as it stands/)).toBeInTheDocument()
  })

  it('says nothing about un-running when every step was left in place', async () => {
    renderDebrief()

    const showed = await screen.findByLabelText('What your attempt showed')
    expect(within(showed).queryByText(/rewind/i)).not.toBeInTheDocument()
  })
})
