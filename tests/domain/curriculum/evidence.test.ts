import { describe, expect, it } from 'vitest'
import { evidenceFrom } from '../../../src/domain/curriculum/evidence'
import type { ModuleEvidence } from '../../../src/domain/curriculum/modules'
import type { ScoreHistoryEntry } from '../../../src/domain/progress/types'
import type { NewSessionAction, Session, SessionAction } from '../../../src/domain/tickets/types'
import { makeJobTarget, makeSession } from '../../helpers/factories'

type Kind = SessionAction['kind']
type Step = { kind: Kind; input?: NewSessionAction['input']; output?: NewSessionAction['output'] }

function entry(
  scenarioId: string,
  overrides: Partial<ScoreHistoryEntry> = {},
): ScoreHistoryEntry {
  return {
    sessionId: 'session-1',
    scenarioId,
    variantId: 'variant',
    total: 90,
    passed: true,
    computedAt: 1_760_000_400_000,
    xp: 40,
    categoryScores: {
      diagnosis: { earned: 10, possible: 10 },
      documentation: { earned: 10, possible: 10 },
      resolution: { earned: 10, possible: 10 },
      safety: { earned: 10, possible: 10 },
    },
    ...overrides,
  }
}

function actionsFor(sessionId: string, steps: Step[]): SessionAction[] {
  return steps.map((step, index) => ({
    id: index + 1,
    sessionId,
    seq: index + 1,
    atMs: 1_760_000_100_000 + index,
    wallMs: 1_760_000_100_000 + index,
    kind: step.kind,
    input: step.input ?? {},
    output: step.output ?? {},
  }))
}

/** The machine the console is running on, and one the desk can connect to. */
const LOCAL_HOST = 'LT-4471'
const REMOTE_HOST = 'LT-8813'

/** A session whose saved world names the machine the console was running on. */
function sessionWithWorld(id: string): Session {
  return makeSession('ticket-1', {
    id,
    world: {
      clock: 1_760_000_100_000,
      currentDeviceId: 'lt-4471',
      devices: [
        { id: 'lt-4471', hostname: LOCAL_HOST, kind: 'laptop' },
        { id: 'lt-8813', hostname: REMOTE_HOST, kind: 'laptop' },
      ],
    },
  })
}

function sessionsFor(ids: readonly string[]): Session[] {
  return ids.map(sessionWithWorld)
}

function derive(
  input: Partial<Parameters<typeof evidenceFrom>[0]> = {},
): ModuleEvidence {
  return evidenceFrom({
    history: [],
    sessions: [],
    actions: [],
    listings: [],
    ...input,
  })
}

describe('curriculum evidence', () => {
  it('reads an empty history as zero everywhere', () => {
    const evidence = derive()
    expect(Object.values(evidence).every((value) => value === 0)).toBe(true)
  })

  it('counts attempts, passes, and the families behind them', () => {
    const evidence = derive({
      history: [
        entry('NET-01'),
        entry('NET-01', { passed: false, total: 40 }),
        entry('PWD-01'),
        entry('FS-01', { passed: false }),
      ],
    })

    expect(evidence.scoredAttempts).toBe(4)
    expect(evidence.passedAttempts).toBe(2)
    expect(evidence.familiesPlayed).toBe(3)
    expect(evidence.familiesPassed).toBe(2)
  })

  it('tracks per-family passes and perfect categories', () => {
    const evidence = derive({
      history: [
        entry('PWD-01'),
        entry('M365-01', {
          passed: false,
          categoryScores: {
            diagnosis: { earned: 4, possible: 10 },
            documentation: { earned: 10, possible: 10 },
            resolution: { earned: 6, possible: 10 },
            safety: { earned: 0, possible: 1 },
          },
        }),
        entry('NET-01'),
      ],
    })

    expect(evidence.passwordPasses).toBe(1)
    expect(evidence.accountPerfectDiagnosis).toBe(1)
    expect(evidence.accountPerfectSafety).toBe(1)
    expect(evidence.networkAddressPasses).toBe(1)
    expect(evidence.networkPerfectDiagnosis).toBe(1)
    expect(evidence.perfectDocumentation).toBe(3)
    expect(evidence.perfectSafety).toBe(2)
  })

  it('ignores categories a score never measured', () => {
    const evidence = derive({
      history: [
        entry('NET-01', {
          categoryScores: {
            diagnosis: { earned: 0, possible: 0 },
            documentation: { earned: 0, possible: 0 },
            resolution: { earned: 0, possible: 0 },
            safety: { earned: 0, possible: 0 },
          },
        }),
        entry('NET-01', { categoryScores: null }),
      ],
    })

    expect(evidence.perfectDiagnosis).toBe(0)
    expect(evidence.perfectSafety).toBe(0)
  })

  it('counts notes by kind above the practical minimum length', () => {
    const evidence = derive({
      actions: actionsFor('session-1', [
        { kind: 'note', input: { noteKind: 'troubleshooting', text: 'Checked DNS and it failed.' } },
        { kind: 'note', input: { noteKind: 'troubleshooting', text: 'ok' } },
        { kind: 'note', input: { noteKind: 'customer', text: 'We are on it and will call at noon.' } },
        { kind: 'note', input: { noteKind: 'resolution', text: 'Reset the scope and renewed the lease.' } },
        { kind: 'note', input: { noteKind: 'unknown', text: 'A note of unclear kind, still long.' } },
      ]),
    })

    expect(evidence.troubleshootingNotes).toBe(1)
    expect(evidence.customerNotes).toBe(1)
    expect(evidence.resolutionNotes).toBe(1)
  })

  it('counts questions and the distinct intents behind them', () => {
    const evidence = derive({
      actions: actionsFor('session-1', [
        { kind: 'ask-user', input: { intent: 'what-changed' } },
        { kind: 'ask-user', input: { intent: 'what-changed' } },
        { kind: 'ask-user', input: { intent: 'when-started' } },
        { kind: 'command', input: { command: 'ipconfig' } },
      ]),
    })

    expect(evidence.callerQuestions).toBe(3)
    expect(evidence.callerIntents).toBe(2)
  })

  it('only credits a question that comes before the first command', () => {
    const evidence = derive({
      actions: [
        ...actionsFor('session-asked', [
          { kind: 'ask-user', input: { intent: 'scope' } },
          { kind: 'command', input: { command: 'ipconfig' } },
        ]),
        ...actionsFor('session-touched', [
          { kind: 'command', input: { command: 'ipconfig' } },
          { kind: 'ask-user', input: { intent: 'scope' } },
        ]),
      ],
    })

    expect(evidence.askedBeforeTouching).toBe(1)
  })

  it('counts only successful verifications, and only before the first command', () => {
    const evidence = derive({
      actions: [
        ...actionsFor('session-good', [
          { kind: 'verify-caller', output: { verified: true } },
          { kind: 'command', input: { command: 'get-account' } },
        ]),
        ...actionsFor('session-bad-code', [
          { kind: 'verify-caller', output: { verified: false } },
          { kind: 'command', input: { command: 'get-account' } },
        ]),
        ...actionsFor('session-late', [
          { kind: 'command', input: { command: 'get-account' } },
          { kind: 'verify-caller', output: { verified: true } },
        ]),
      ],
    })

    expect(evidence.callerVerifications).toBe(2)
    expect(evidence.verifiedBeforeTouching).toBe(1)
  })

  it('counts the sessions opened from any surface, and only the ones that opened one', () => {
    const evidence = derive({
      actions: actionsFor('session-1', [
        {
          kind: 'command',
          input: { command: 'connect-remote LT-8813', source: 'terminal' },
          output: { ok: true, effects: [{ type: 'remote_connected', target: 'LT-8813' }] },
        },
        {
          kind: 'command',
          input: { command: 'connect-remote LT-0000', source: 'remote-desktop' },
          output: { ok: false, lines: [] },
        },
        // The machine already had a session on it, so nothing was opened.
        {
          kind: 'command',
          input: { command: 'connect-remote LT-8813', source: 'remote-desktop' },
          output: { ok: true, lines: [] },
        },
        { kind: 'command', input: { command: 'hostname', source: 'terminal' }, output: { ok: true } },
      ]),
    })

    expect(evidence.remoteSessionsOpened).toBe(1)
  })

  it('credits reading the machine before changing it, and not the other way round', () => {
    const remoteStep = (command: string, source: string, machine = REMOTE_HOST): Step => ({
      kind: 'command',
      input: { command, source, machine },
      output: { ok: true, lines: [] },
    })

    const evidence = derive({
      sessions: sessionsFor([
        'session-read-first',
        'session-change-first',
        'session-connected-first',
        'session-side-terminal',
        'session-read-locally',
      ]),
      actions: [
        ...actionsFor('session-read-first', [
          remoteStep('ipconfig /all', 'remote-desktop-terminal'),
          {
            kind: 'command',
            input: { command: 'remote-cleanup LT-8813', source: 'remote-desktop', machine: REMOTE_HOST },
            output: { ok: true, effects: [{ type: 'disk_cleaned', target: 'LT-8813' }] },
          },
        ]),
        // Opening the session first still does not make the later read an early
        // read: plumbing is neither a read nor a change.
        ...actionsFor('session-change-first', [
          {
            kind: 'command',
            input: { command: 'connect-remote LT-8813', source: 'remote-desktop', machine: REMOTE_HOST },
            output: { ok: true, effects: [{ type: 'remote_connected', target: 'LT-8813' }] },
          },
          {
            kind: 'command',
            input: { command: 'remote-cleanup LT-8813', source: 'remote-desktop', machine: REMOTE_HOST },
            output: { ok: true, effects: [{ type: 'disk_cleaned', target: 'LT-8813' }] },
          },
          remoteStep('systeminfo', 'remote-desktop-terminal'),
        ]),
        // Opening the session is plumbing, not a change to the machine.
        ...actionsFor('session-connected-first', [
          {
            kind: 'command',
            input: { command: 'connect-remote LT-8813', source: 'remote-desktop', machine: REMOTE_HOST },
            output: { ok: true, effects: [{ type: 'remote_connected', target: 'LT-8813' }] },
          },
          remoteStep('hostname', 'remote-desktop-terminal'),
        ]),
        // The side terminal speaks for the ticket's machine, not the desktop.
        ...actionsFor('session-side-terminal', [
          remoteStep('ipconfig /all', 'terminal', LOCAL_HOST),
        ]),
        // A read piped to the desk's own machine is local work: tagging it with
        // the ticket host keeps it out of the remote count whatever surface it
        // came from.
        ...actionsFor('session-read-locally', [
          remoteStep('ipconfig /all', 'remote-desktop-terminal', LOCAL_HOST),
          {
            kind: 'command',
            input: { command: 'remote-cleanup LT-8813', source: 'remote-desktop', machine: REMOTE_HOST },
            output: { ok: true, effects: [{ type: 'disk_cleaned', target: 'LT-8813' }] },
          },
        ]),
      ],
    })

    expect(evidence.remoteReadBeforeChange).toBe(2)
  })

  it('counts remote work from the machine, not from the surface it was typed in', () => {
    const evidence = derive({
      sessions: sessionsFor(['session-aimed-remote', 'session-local-desktop']),
      actions: [
        // The pairing is artificial — a side-terminal source tagged with the
        // other machine — and that is the point: the tag decides, not the
        // source.
        ...actionsFor('session-aimed-remote', [
          { kind: 'command', input: { command: 'ipconfig /all', source: 'terminal', machine: REMOTE_HOST }, output: { ok: true } },
          {
            kind: 'command',
            input: { command: 'remote-flush-dns LT-8813', source: 'terminal', machine: REMOTE_HOST },
            output: { ok: true, effects: [{ type: 'dns_cache_flushed', target: 'LT-8813' }] },
          },
        ]),
        // …and a remote surface that only touched the desk's own machine does
        // not.
        ...actionsFor('session-local-desktop', [
          { kind: 'command', input: { command: 'ipconfig /all', source: 'remote-desktop-terminal', machine: LOCAL_HOST }, output: { ok: true } },
        ]),
      ],
    })

    expect(evidence.remoteReadBeforeChange).toBe(1)
  })

  it('tells a read from a change by what the command does, not what it reported', () => {
    const remoteRead = (command: string, ok = true): Step => ({
      kind: 'command',
      input: { command, source: 'remote-desktop-terminal', machine: REMOTE_HOST },
      // A read that prints facts is still a look. The effect here is deliberate:
      // an echoed effect must not turn the look into a change.
      output: { ok, lines: [], effects: [{ type: 'facts_printed' }] },
    })
    const remoteChange = (command: string, ok = true): Step => ({
      kind: 'command',
      input: { command, source: 'remote-desktop', machine: REMOTE_HOST },
      // A change that had nothing left to do reports no effect at all.
      output: ok ? { ok: true, lines: [] } : { ok: false, lines: [] },
    })

    const evidence = derive({
      sessions: sessionsFor([
        'session-read-then-quiet-change',
        'session-quiet-change-first',
        'session-renew-then-look',
        'session-look-then-renew',
        'session-failed-read',
        'session-failed-change',
      ]),
      actions: [
        ...actionsFor('session-read-then-quiet-change', [
          remoteRead('get-remote-machine LT-8813'),
          remoteChange('remote-cleanup LT-8813'),
        ]),
        ...actionsFor('session-quiet-change-first', [
          remoteChange('remote-cleanup LT-8813'),
          remoteRead('systeminfo'),
        ]),
        ...actionsFor('session-renew-then-look', [
          remoteRead('ipconfig /renew'),
          remoteRead('ipconfig /all'),
        ]),
        ...actionsFor('session-look-then-renew', [
          remoteRead('ipconfig /all'),
          remoteRead('ipconfig /renew'),
        ]),
        ...actionsFor('session-failed-read', [
          remoteRead('get-remote-machine LT-8813', false),
          remoteChange('remote-restart-spooler LT-8813'),
        ]),
        ...actionsFor('session-failed-change', [
          remoteChange('remote-restart-spooler LT-8813', false),
          remoteRead('systeminfo'),
          remoteChange('remote-restart-spooler LT-8813'),
        ]),
      ],
    })

    // Read first, then a silent change: credited. A silent change first is not.
    // `ipconfig /renew` is a change, so looking after it is too late. A rejected
    // change never ran, so it leaves the order where it was.
    expect(evidence.remoteReadBeforeChange).toBe(3)
  })

  it('only counts the write-up when it follows the work on the machine', () => {
    const work: Step = {
      kind: 'command',
      input: { command: 'remote-flush-dns LT-8813', source: 'remote-desktop', machine: REMOTE_HOST },
      output: { ok: true, effects: [{ type: 'dns_cache_flushed', target: 'LT-8813' }] },
    }
    const sessions = sessionsFor([
      'session-after',
      'session-before',
      'session-customer-only',
      'session-no-remote-work',
    ])

    const evidence = derive({
      sessions,
      actions: [
        ...actionsFor('session-after', [
          work,
          {
            kind: 'note',
            input: { noteKind: 'troubleshooting', text: 'Flushed the resolver cache on the machine.' },
            output: { saved: true },
          },
        ]),
        ...actionsFor('session-before', [
          {
            kind: 'note',
            input: { noteKind: 'troubleshooting', text: 'Starting with the machine the user is on.' },
            output: { saved: true },
          },
          work,
        ]),
        ...actionsFor('session-customer-only', [
          work,
          {
            kind: 'note',
            input: { noteKind: 'customer', text: 'All sorted, please try signing in again.' },
            output: { saved: true },
          },
        ]),
        ...actionsFor('session-no-remote-work', [
          {
            kind: 'note',
            input: { noteKind: 'troubleshooting', text: 'Account was locked; unlocked it.' },
            output: { saved: true },
          },
        ]),
      ],
    })

    expect(evidence.remoteWorkDocumented).toBe(1)
  })

  it('counts mailbox reads, traces, releases, and sender blocks from the mail work', () => {
    const evidence = derive({
      history: [entry('MAIL-01'), entry('MAILSEC-01', { passed: false })],
      actions: actionsFor('session-1', [
        {
          kind: 'command',
          input: { command: 'get-mailbox asingh' },
          output: { ok: true, lines: [] },
        },
        {
          kind: 'command',
          input: { command: 'trace-message msg-3101' },
          output: { ok: true, lines: [] },
        },
        // Listing mail by delivery state names ids and states; the path a
        // message took is still only in the trace, so this is not a trace.
        {
          kind: 'command',
          input: { command: 'get-messages deferred' },
          output: { ok: true, lines: [] },
        },
        {
          kind: 'command',
          input: { command: 'trace-message msg-9999' },
          output: { ok: false, lines: [] },
        },
        {
          kind: 'command',
          input: { command: 'release-quarantine msg-4101' },
          output: { ok: true, effects: [{ type: 'mail_released', target: 'msg-4101' }] },
        },
        {
          kind: 'command',
          input: { command: 'block-sender accounts@example.net' },
          output: { ok: true, effects: [{ type: 'sender_blocked', target: 'accounts@example.net' }] },
        },
        // A sender that was already blocked reports no effect, so it is not a block.
        {
          kind: 'command',
          input: { command: 'block-sender supplier@example.net' },
          output: { ok: true, lines: [] },
        },
      ]),
    })

    expect(evidence.mailboxReads).toBe(1)
    expect(evidence.mailMessageTraces).toBe(1)
    expect(evidence.quarantineReleases).toBe(1)
    expect(evidence.sendersBlocked).toBe(1)
    expect(evidence.mailboxPasses).toBe(1)
    expect(evidence.mailSecurityPasses).toBe(0)
  })

  it('counts shelf reads, finished runs, and a pass that respected a hold', () => {
    const evidence = derive({
      history: [
        entry('DEP-01', { variantId: 'damage-hold-blocks-handover' }),
        entry('DEP-01', { variantId: 'imaging-run-failed' }),
        entry('DEP-01', { variantId: 'damage-hold-blocks-handover', passed: false }),
        entry('NET-01', { variantId: 'bad-static-dns' }),
      ],
      actions: actionsFor('session-1', [
        {
          kind: 'command',
          input: { command: 'get-deployment-queue' },
          output: { ok: true, lines: [] },
        },
        {
          kind: 'command',
          input: { command: 'get-deployment SHELF-DT-0302' },
          output: { ok: true, lines: [] },
        },
        {
          kind: 'command',
          input: { command: 'get-deployment SHELF-0000' },
          output: { ok: false, lines: [] },
        },
        {
          kind: 'command',
          input: { command: 'start-deployment SHELF-DT-0302' },
          output: {
            ok: true,
            lines: [],
            effects: [
              { type: 'deployment_started', target: 'SHELF-DT-0302' },
              { type: 'deployment_completed', target: 'SHELF-DT-0302' },
            ],
          },
        },
        // A held machine refuses the run, so nothing was finished.
        {
          kind: 'command',
          input: { command: 'start-deployment SHELF-LT-0204' },
          output: { ok: false, lines: [] },
        },
        // A machine already complete answers without an effect.
        {
          kind: 'command',
          input: { command: 'start-deployment SHELF-DT-0101' },
          output: { ok: true, lines: [] },
        },
      ]),
    })

    expect(evidence.deploymentQueueReads).toBe(1)
    expect(evidence.deploymentReads).toBe(1)
    expect(evidence.deploymentRuns).toBe(1)
    expect(evidence.deploymentPasses).toBe(2)
    expect(evidence.deploymentHoldPasses).toBe(1)
  })

  it('counts the shelf handovers and the shipping moves', () => {
    const evidence = derive({
      actions: actionsFor('session-1', [
        { kind: 'command', input: { command: 'get-shelf hq' }, output: { ok: true, lines: [] } },
        // A shelf read that failed is not a read of the bay.
        { kind: 'command', input: { command: 'get-shelf nowhere' }, output: { ok: false, lines: [] } },
        {
          kind: 'command',
          input: { command: 'book-shelf-machine SHELF-LT-0117 dwhitfield' },
          output: {
            ok: true,
            lines: [],
            effects: [{ type: 'machine_issued', target: 'SHELF-LT-0117' }],
          },
        },
        {
          kind: 'command',
          input: { command: 'hold-shelf-machine SHELF-LT-0118 damage' },
          output: { ok: true, lines: [], effects: [{ type: 'shelf_held', target: 'SHELF-LT-0118' }] },
        },
        { kind: 'command', input: { command: 'get-shipments' }, output: { ok: true, lines: [] } },
        {
          kind: 'command',
          input: { command: 'get-shipment LSP-8830' },
          output: { ok: true, lines: [] },
        },
        {
          kind: 'command',
          input: { command: 'dispatch-shipment LSP-8845' },
          output: {
            ok: true,
            lines: [],
            effects: [{ type: 'shipment_dispatched', target: 'LSP-8845' }],
          },
        },
        {
          kind: 'command',
          input: { command: 'deliver-shipment LSP-8842' },
          output: {
            ok: true,
            lines: [],
            effects: [{ type: 'shipment_delivered', target: 'LSP-8842' }],
          },
        },
        {
          kind: 'command',
          input: { command: 'rebook-shipment LSP-8830 2' },
          output: {
            ok: true,
            lines: [],
            effects: [{ type: 'shipment_rebooked', target: 'LSP-8830' }],
          },
        },
      ]),
    })

    expect(evidence.shelfReads).toBe(1)
    expect(evidence.machinesIssued).toBe(1)
    expect(evidence.shelfHolds).toBe(1)
    expect(evidence.shipmentReads).toBe(2)
    expect(evidence.shipmentsDispatched).toBe(1)
    expect(evidence.shipmentsDelivered).toBe(1)
    expect(evidence.shipmentsRebooked).toBe(1)
  })

  it('counts refusals and closed handoffs', () => {
    const sessions: Session[] = [
      makeSession('ticket-1', { id: 's-1', endedAt: 1, resolution: 'escalated-tier2' }),
      makeSession('ticket-2', { id: 's-2', endedAt: 1, resolution: 'denied-social-engineering' }),
      makeSession('ticket-3', { id: 's-3', endedAt: 1, resolution: 'resolved' }),
      makeSession('ticket-4', { id: 's-4', endedAt: null, resolution: null }),
    ]

    const evidence = derive({
      sessions,
      actions: actionsFor('s-2', [{ kind: 'deny-caller', output: { denied: true } }]),
    })

    expect(evidence.handedOff).toBe(2)
    expect(evidence.refusedRequests).toBe(1)
  })

  it('matches saved listings to skills and to families already passed', () => {
    const evidence = derive({
      history: [entry('NET-01'), entry('PRN-01', { passed: false })],
      listings: [
        makeJobTarget({
          rawDescription: 'Troubleshoot DNS and DHCP issues and reset passwords in Active Directory.',
        }),
        makeJobTarget({ id: 'target-2', rawDescription: 'Friendly team player, no tools listed.' }),
      ],
    })

    expect(evidence.listingsSaved).toBe(2)
    expect(evidence.listingsWithSkills).toBe(1)
    expect(evidence.demandedFamiliesPassed).toBe(1)
  })
})

/**
 * Module 5 is about how a ticket arrived, which no family and no score says on
 * its own: the arrival is kept on the attempt's world, and everything the
 * module counts is read from the attempt that carries it.
 */
describe('voicemail evidence', () => {
  const ARRIVAL = {
    leftAt: 1_760_000_000_000,
    durationSeconds: 34,
    callbackLine: 'desk' as const,
  }

  function messageSession(id: string): Session {
    return makeSession('ticket-1', {
      id,
      world: { clock: 1_760_000_100_000, voicemail: ARRIVAL },
    })
  }

  function liveSession(id: string): Session {
    return makeSession('ticket-2', { id, world: { clock: 1_760_000_100_000 } })
  }

  it('counts a pass only on the attempt that arrived as a message', () => {
    const evidence = derive({
      history: [
        entry('PWD-01', { sessionId: 's-message' }),
        entry('PWD-01', { sessionId: 's-live' }),
        entry('NET-01', { sessionId: 's-message', passed: false }),
      ],
      sessions: [messageSession('s-message'), liveSession('s-live')],
    })

    expect(evidence.voicemailPasses).toBe(1)
    // The pass on the live ticket still counts for the course, just not here.
    expect(evidence.passedAttempts).toBe(2)
  })

  it('counts a callback on a message attempt, whatever the line answered', () => {
    const evidence = derive({
      sessions: [messageSession('s-message'), liveSession('s-live')],
      actions: [
        ...actionsFor('s-message', [
          { kind: 'verify-caller', input: { method: 'callback' }, output: { verified: false } },
          { kind: 'verify-caller', input: { method: 'verification-code' }, output: { verified: true } },
        ]),
        ...actionsFor('s-live', [
          { kind: 'verify-caller', input: { method: 'callback' }, output: { verified: true } },
        ]),
      ],
    })

    expect(evidence.voicemailCallbacks).toBe(1)
    // A callback that reached the wrong person still proves the desk rang.
    expect(evidence.callerVerifications).toBe(2)
  })

  it('counts the notes written on a message attempt, not the resolution', () => {
    const note = (noteKind: string, text: string) => ({
      kind: 'note' as const,
      input: { noteKind, text },
      output: { saved: true },
    })

    const evidence = derive({
      sessions: [messageSession('s-message'), liveSession('s-live')],
      actions: [
        ...actionsFor('s-message', [
          note('troubleshooting', 'Called the desk line back; directory showed the account locked.'),
          note('customer', 'Your account is unlocked, and the desk line is still the way to reach you.'),
          note('resolution', 'Unlocked after a callback, and confirmed the sign-in works.'),
        ]),
        ...actionsFor('s-live', [
          note('troubleshooting', 'Live caller, walked through the sign-in and reset the password.'),
        ]),
      ],
    })

    expect(evidence.voicemailNotes).toBe(2)
    expect(evidence.troubleshootingNotes).toBe(2)
    expect(evidence.customerNotes).toBe(1)
  })

  it('reads a damaged arrival as a live ticket rather than guessing', () => {
    const evidence = derive({
      history: [entry('PWD-01', { sessionId: 's-broken' })],
      sessions: [
        makeSession('ticket-3', {
          id: 's-broken',
          world: { clock: 1, voicemail: { leftAt: 'soon', callbackLine: 'desk' } },
        }),
      ],
    })

    expect(evidence.voicemailPasses).toBe(0)
  })
})
