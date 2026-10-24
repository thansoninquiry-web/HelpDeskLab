import { describe, expect, it } from 'vitest'
import { applyCommand } from '../../../src/domain/environment/reducer'
import type { TopologyCheck, TopologyView } from '../../../src/domain/environment/topology'
import type { World } from '../../../src/domain/environment/types'
import { generateTicket } from '../../../src/domain/generator'
import type { GeneratedTicket } from '../../../src/domain/generator'
import {
  CALLBACK_OVER_CODE_PENALTY,
  commandCreditLedger,
  evaluateSession,
  itemCredit,
  TOPOLOGY_BONUS_XP,
} from '../../../src/domain/scoring/evaluator'
import type { EvaluatorAction } from '../../../src/domain/scoring/evaluator'
import type { JsonObject } from '../../../src/domain/shared/json'

function ticketFor(scenarioId: string, variantId: string): GeneratedTicket {
  for (let seed = 1; seed < 600; seed += 1) {
    const ticket = generateTicket(seed, { familyId: scenarioId })
    if (ticket.variantId === variantId) {
      return ticket
    }
  }
  throw new Error(`No seed produced ${scenarioId}/${variantId}`)
}

interface StepOptions {
  verifyCaller?: boolean
  /** How the caller was checked; defaults to a method the log does not name. */
  verifyMethod?: 'verification-code' | 'callback'
  /** A record that a check was attempted and did not prove the caller. */
  failedVerify?: boolean
  deny?: boolean
  notes?: boolean
  decision?: 'resolved' | 'escalated'
  decisionCode?: string
}

function partialAttempt(
  ticket: GeneratedTicket,
  commands: string[],
  options: StepOptions = {},
): { actions: EvaluatorAction[]; world: World; decision: { outcome: 'resolved' | 'escalated'; code: string; note: string } } {
  let world = structuredClone(ticket.world)
  const actions: EvaluatorAction[] = []

  if (options.verifyCaller) {
    actions.push({
      kind: 'verify-caller',
      input: { method: options.verifyMethod ?? 'employee-id' },
      output: { verified: true, summary: 'Verified.' },
    })
  }

  if (options.failedVerify) {
    actions.push({
      kind: 'verify-caller',
      input: { method: options.verifyMethod ?? 'verification-code' },
      output: { verified: false, summary: 'The check did not prove the caller.' },
    })
  }

  if (options.deny) {
    actions.push({
      kind: 'deny-caller',
      input: { reason: 'third-party-request' },
      output: { denied: true, summary: 'Refused the request.' },
    })
  }

  for (const command of commands) {
    const result = applyCommand(world, command)
    world = result.world
    actions.push({
      kind: 'command',
      input: { command },
      output: JSON.parse(
        JSON.stringify({ lines: result.lines, effects: result.effects, ok: result.ok }),
      ) as JsonObject,
    })
  }

  if (options.notes) {
    actions.push({
      kind: 'note',
      input: {
        noteKind: 'troubleshooting',
        text: 'Account lookup showed a lockout. Verified the caller, unlocked the account, and confirmed the status returned to active.',
      },
      output: { saved: true },
    })
    actions.push({
      kind: 'note',
      input: {
        noteKind: 'customer',
        text: 'Your account is unlocked. Sign in with your current password and tell us if it happens again.',
      },
      output: { saved: true },
    })
  }

  return {
    actions,
    world,
    decision: {
      outcome: options.decision ?? 'resolved',
      code: options.decisionCode ?? 'resolved-remote',
      note: '',
    },
  }
}

describe('scoring engine', () => {
  it('fails an attempt that skips caller verification even when the account is fixed', () => {
    const ticket = ticketFor('PWD-01', 'account-lockout')
    const attempt = partialAttempt(
      ticket,
      [
        `get-account ${ticket.public.requester.samAccountName}`,
        `unlock-account ${ticket.public.requester.samAccountName}`,
        `get-account ${ticket.public.requester.samAccountName}`,
      ],
      { notes: true },
    )
    const result = evaluateSession({ rubric: ticket.rubric, ...attempt, difficulty: ticket.difficulty })

    expect(result.passed).toBe(false)
    expect(result.total).toBeLessThan(100)
    expect(result.criticalFailures.join(' ')).toMatch(
      /No record that you verified the caller before changing anything/,
    )
    expect(result.feedback.join(' ')).toMatch(/verif(y|ied) the caller/i)
  })

  it('does not count a colleague who answered a shared line as the caller verified', () => {
    const ticket = ticketFor('PWD-01', 'shared-line-callback')
    const sam = ticket.public.requester.samAccountName
    const attempt = partialAttempt(
      ticket,
      [`get-account ${sam}`, `unlock-account ${sam}`, `get-account ${sam}`],
      { notes: true },
    )
    // The call the shared line answers: a colleague confirms, so the gate opened
    // for nobody and the safety item has no proof behind it.
    attempt.actions.unshift({
      kind: 'verify-caller',
      input: {
        method: 'callback',
        contactId: 'team-line',
        contactName: 'Finance team line',
        destination: 'team line •••-•••-4102',
      },
      output: {
        verified: false,
        provesCaller: false,
        result: 'colleague-answered',
        answeredBy: 'Priya Raman',
        summary:
          'Priya Raman answered the Finance team line and confirmed the request. That line is shared, so the call proves a colleague took it — not that whoever is on this call is the person on the ticket.',
      },
    })

    const result = evaluateSession({ rubric: ticket.rubric, ...attempt, difficulty: ticket.difficulty })

    expect(result.items.find((item) => item.id === 'verify-by-code')?.passed).toBe(false)
    expect(result.passed).toBe(false)
    expect(result.criticalFailures.join(' ')).toMatch(
      /No record that you verified the caller with a verification code/,
    )
    expect(result.violations.map((violation) => violation.id)).toEqual(
      expect.arrayContaining(['callback-to-shared-line']),
    )
    const shared = result.violations.find((violation) => violation.id === 'callback-to-shared-line')
    expect(shared?.points).toBe(5)
    expect(shared?.detail).toMatch(/verified somebody else/)

    // The change made on the strength of it is still priced as unverified.
    expect(result.violations.map((violation) => violation.id)).toContain('unverified-change')
  })

  it('prices a shared-line callback without pretending it was the weaker check', () => {
    const ticket = ticketFor('PWD-01', 'shared-line-callback')
    const sam = ticket.public.requester.samAccountName
    const attempt = partialAttempt(ticket, [`get-account ${sam}`], { notes: true })
    attempt.actions.push({
      kind: 'verify-caller',
      input: { method: 'callback', contactId: 'team-line', contactName: 'Finance team line' },
      output: { verified: false, provesCaller: false, result: 'colleague-answered' },
    })

    const result = evaluateSession({ rubric: ticket.rubric, ...attempt, difficulty: ticket.difficulty })

    expect(result.violations.map((violation) => violation.id)).toEqual([
      'callback-to-shared-line',
    ])
    expect(result.procedurePenalty).toBe(5)
  })

  it('scores below the pass mark for a lucky end state with no evidence', () => {
    const ticket = ticketFor('PWD-01', 'account-lockout')
    const attempt = partialAttempt(ticket, [
      `unlock-account ${ticket.public.requester.samAccountName}`,
    ])
    const result = evaluateSession({ rubric: ticket.rubric, ...attempt, difficulty: ticket.difficulty })

    expect(result.total).toBeLessThan(ticket.rubric.passThreshold)
    expect(result.passed).toBe(false)
    expect(result.band).toBe('fail')
    expect(result.items.find((item) => item.id === 'diagnose-account')?.passed).toBe(false)
    expect(result.items.find((item) => item.id === 'note-troubleshooting')?.passed).toBe(false)
  })

  it('penalises the wrong resolve-versus-escalate decision on a Tier 1 lockout', () => {
    const ticket = ticketFor('PWD-01', 'account-lockout')
    const attempt = partialAttempt(
      ticket,
      [
        `get-account ${ticket.public.requester.samAccountName}`,
        `unlock-account ${ticket.public.requester.samAccountName}`,
        `get-account ${ticket.public.requester.samAccountName}`,
      ],
      { notes: true, verifyCaller: true, decision: 'escalated', decisionCode: 'escalated-tier2' },
    )
    const result = evaluateSession({ rubric: ticket.rubric, ...attempt, difficulty: ticket.difficulty })

    expect(result.passed).toBe(false)
    expect(result.criticalFailures.join(' ')).toMatch(
      /escalated the ticket, but this one was yours to resolve/,
    )
    expect(result.total).toBeLessThan(100)
  })

  it('fails the safety gate when a disabled account is unlocked', () => {
    const ticket = ticketFor('PWD-01', 'disabled-account')
    const sam = ticket.public.requester.samAccountName
    const result = evaluateSession({
      rubric: ticket.rubric,
      world: ticket.world,
      difficulty: ticket.difficulty,
      decision: { outcome: 'escalated', code: 'escalated-identity', note: '' },
      actions: [
        { kind: 'verify-caller', input: {}, output: { summary: 'Verified.' } },
        {
          kind: 'command',
          input: { command: `get-account ${sam}` },
          output: { lines: [], effects: [], ok: true },
        },
        {
          kind: 'command',
          input: { command: `unlock-account ${sam}` },
          output: {
            lines: [],
            ok: true,
            effects: [{ type: 'account_unlocked', target: sam }],
          },
        },
      ],
    })

    expect(result.passed).toBe(false)
    expect(result.criticalFailures.join(' ')).toMatch(
      /unlocked .*, which this ticket did not call for/,
    )
    expect(result.items.find((item) => item.id === 'no-reset')?.passed).toBe(true)
  })

  it('requires an explained, documented escalation for the disabled account path', () => {
    const ticket = ticketFor('PWD-01', 'disabled-account')
    const sam = ticket.public.requester.samAccountName
    const result = evaluateSession({
      rubric: ticket.rubric,
      world: ticket.world,
      difficulty: ticket.difficulty,
      decision: { outcome: 'escalated', code: 'escalated-identity', note: '' },
      actions: [
        { kind: 'verify-caller', input: {}, output: { summary: 'Verified.' } },
        {
          kind: 'command',
          input: { command: `get-account ${sam}` },
          output: { lines: [], effects: [], ok: true },
        },
        {
          kind: 'note',
          input: {
            noteKind: 'troubleshooting',
            text: 'Account is disabled rather than locked. User says their contract was renewed; re-enabling is outside Tier 1 scope and needs the Identity team.',
          },
          output: { saved: true },
        },
        {
          kind: 'note',
          input: {
            noteKind: 'customer',
            text: 'I have escalated this to the Identity team with your manager attached. They own re-enabling the account.',
          },
          output: { saved: true },
        },
      ],
    })

    expect(result.passed).toBe(true)
    expect(result.total).toBe(100)
  })

  it('passes a third-party reset only when the refusal is recorded', () => {
    const ticket = ticketFor('PWD-01', 'third-party-reset')
    const target = thirdPartyTarget(ticket)
    const attempt = partialAttempt(ticket, [`get-account ${target.samAccountName}`], {
      deny: true,
      notes: true,
      decision: 'escalated',
      decisionCode: 'denied-social-engineering',
    })
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.passed).toBe(true)
    expect(result.total).toBe(100)
    expect(result.items.find((item) => item.id === 'deny-request')?.passed).toBe(true)
  })

  it('fails the safety gate when the third-party request is worked instead of refused', () => {
    const ticket = ticketFor('PWD-01', 'third-party-reset')
    const result = evaluateSession({
      rubric: ticket.rubric,
      world: ticket.world,
      difficulty: ticket.difficulty,
      decision: { outcome: 'escalated', code: 'denied-social-engineering', note: '' },
      actions: [
        {
          kind: 'note',
          input: {
            noteKind: 'troubleshooting',
            text: 'The caller asked for a reset for someone else. I refused the request and told them the owner has to call us directly.',
          },
          output: { saved: true },
        },
      ],
    })

    expect(result.passed).toBe(false)
    expect(result.criticalFailures.join(' ')).toMatch(/No record that you refused the request/)
  })

  it('scores the reason a refusal was filed under, not only that one happened', () => {
    const ticket = ticketFor('PWD-01', 'credential-readout')
    const sam = ticket.public.requester.samAccountName
    const attempt = partialAttempt(ticket, [`get-account ${sam}`], {
      notes: true,
      decision: 'escalated',
      decisionCode: 'denied-social-engineering',
    })

    const wrongReason = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
      actions: [
        ...attempt.actions,
        {
          kind: 'deny-caller',
          input: { reason: 'unverified-identity' },
          output: { denied: true },
        },
      ],
    })
    const refused = wrongReason.items.find(
      (item) => item.id === 'refuse-credential-request',
    )
    // The act happened, so the step is not zeroed; the reason is wrong, so the
    // step is not met either. Half of it is still owed.
    expect(refused?.passed).toBe(false)
    expect(refused?.credit).toBe(0.5)
    expect(wrongReason.total).toBe(85)
    // A wrong sentence in the report is not the same failure as reading the
    // password out, so it must not stop the attempt from passing.
    expect(wrongReason.criticalFailures).toEqual([])
    expect(wrongReason.categoryScores.safety.earned).toBe(
      wrongReason.categoryScores.safety.possible - 15,
    )
    // ...and the debrief has to say why, naming both reasons.
    expect(wrongReason.feedback.join(' ')).toMatch(
      /filed it as “Could not verify who is calling” rather than “Asked for a password or a code”/,
    )
    expect(wrongReason.feedback.join(' ')).toMatch(
      /never reads out or accepts passwords or verification codes/,
    )

    const rightReason = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
      actions: [
        ...attempt.actions,
        {
          kind: 'deny-caller',
          input: { reason: 'credential-request' },
          output: { denied: true },
        },
      ],
    })
    expect(
      rightReason.items.find((item) => item.id === 'refuse-credential-request')?.passed,
    ).toBe(true)
    expect(rightReason.total).toBe(100)
  })

  it('gives no credit for a refusal the attempt never recorded', () => {
    const ticket = ticketFor('PWD-01', 'credential-readout')
    const sam = ticket.public.requester.samAccountName
    const attempt = partialAttempt(ticket, [`get-account ${sam}`], {
      notes: true,
      decision: 'escalated',
      decisionCode: 'denied-social-engineering',
    })
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(
      result.items.find((item) => item.id === 'refuse-credential-request')?.credit,
    ).toBe(0)
    expect(result.criticalFailures.join(' ')).toMatch(
      /No record that you refused the request — “Asked for a password or a code”/,
    )
  })

  it('reads a score written before partial credit as all or nothing', () => {
    expect(itemCredit({ passed: true })).toBe(1)
    expect(itemCredit({ passed: false })).toBe(0)
    expect(itemCredit({ passed: false, credit: 0.5 })).toBe(0.5)
    // A stored share outside the scale cannot earn more than the step is worth.
    expect(itemCredit({ passed: false, credit: 4 })).toBe(1)
  })

  it('still fails when a reset lands before the caller is refused', () => {
    const ticket = ticketFor('PWD-01', 'third-party-reset')
    const target = thirdPartyTarget(ticket)
    const attempt = partialAttempt(
      ticket,
      [`get-account ${target.samAccountName}`, `reset-password ${target.samAccountName}`],
      {
        deny: true,
        notes: true,
        decision: 'escalated',
        decisionCode: 'denied-social-engineering',
      },
    )
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.passed).toBe(false)
    expect(result.criticalFailures.join(' ')).toMatch(
      /reset .*password, which this ticket did not call for/,
    )
  })

  it('reports a per-category breakdown and explains each missing item', () => {
    const ticket = ticketFor('NET-01', 'bad-static-dns')
    const result = evaluateSession({
      rubric: ticket.rubric,
      world: ticket.world,
      difficulty: ticket.difficulty,
      decision: { outcome: 'resolved', code: 'resolved-remote', note: '' },
      actions: [],
    })

    expect(result.categoryScores.diagnosis.possible).toBeGreaterThan(0)
    expect(result.categoryScores.documentation.possible).toBeGreaterThan(0)
    expect(result.categoryScores.resolution.possible).toBeGreaterThan(0)
    expect(result.categoryScores.safety.possible).toBe(0)
    expect(result.items.every((item) => item.evidence.length > 0)).toBe(true)
    expect(result.feedback.some((line) => line.startsWith('Where the points went:'))).toBe(true)
  })
})

/** The account the caller in a third-party request is asking about. */
function thirdPartyTarget(ticket: GeneratedTicket) {
  const requester = ticket.world.users.find(
    (user) => user.samAccountName === ticket.public.requester.samAccountName,
  )
  const target = ticket.world.users.find((user) => user.displayName === requester?.managerName)
  if (!target) {
    throw new Error('The third-party scenario has no target account')
  }
  return target
}

function attemptWithHandoff(ticket: GeneratedTicket, handoff: string) {
  let world = structuredClone(ticket.world)
  const actions: EvaluatorAction[] = []

  for (const step of ticket.reference) {
    if (step.type === 'command') {
      const result = applyCommand(world, step.input)
      world = result.world
      actions.push({
        kind: 'command',
        input: { command: step.input },
        output: JSON.parse(
          JSON.stringify({ lines: result.lines, effects: result.effects, ok: result.ok }),
        ) as JsonObject,
      })
    } else if (step.type === 'verify-caller') {
      actions.push({
        kind: 'verify-caller',
        input: { method: 'employee-id' },
        output: { summary: 'Verified against the directory.' },
      })
    } else if (step.type === 'deny-caller') {
      actions.push({
        kind: 'deny-caller',
        input: { reason: step.reason ?? 'third-party-request' },
        output: { denied: true, summary: 'Refused the request.' },
      })
    } else if (step.type === 'ask-user') {
      actions.push({
        kind: 'ask-user',
        input: { intent: step.intent },
        output: { question: 'Question', answer: 'Answer' },
      })
    } else if (step.noteKind !== 'resolution') {
      actions.push({
        kind: 'note',
        input: { noteKind: step.noteKind, text: step.text },
        output: { saved: true },
      })
    }
  }

  if (handoff.length > 0) {
    actions.push({
      kind: 'note',
      input: { noteKind: 'resolution', text: handoff },
      output: { saved: true },
    })
  }

  return {
    actions,
    world,
    decision: {
      outcome: ticket.expectedOutcome,
      code: ticket.expectedCodes[0] ?? 'resolved-remote',
      note: handoff,
    },
  }
}

describe('escalation handoff notes', () => {
  it('passes only when the note covers the report, the checks, and the next action', () => {
    const ticket = ticketFor('DHCP-01', 'scope-wrong-dns')
    const complete = evaluateSession({
      rubric: ticket.rubric,
      difficulty: ticket.difficulty,
      ...attemptWithHandoff(
        ticket,
        'Reported: users at the site cannot resolve names. Checked: ipconfig and get-dhcp-scope both show 10.20.4.99 as option 006. Next: the network team should correct the scope option.',
      ),
    })

    const item = complete.items.find((entry) => entry.id === 'escalation-note')

    expect(item?.passed).toBe(true)
    expect(complete.total).toBe(100)
    expect(item?.evidence).toEqual([
      'Your handoff note covered what the user reported.',
      'Your handoff note covered what you checked.',
      'Your handoff note covered what the next team should do.',
    ])
    expect(item?.gaps).toEqual([])
    expect(item?.evidence.join(' ')).not.toMatch(/\b(met|missing):/)
  })

  it('names the missing part instead of failing the whole note', () => {
    const ticket = ticketFor('DHCP-01', 'scope-wrong-dns')
    const partial = evaluateSession({
      rubric: ticket.rubric,
      difficulty: ticket.difficulty,
      ...attemptWithHandoff(
        ticket,
        'Reported: users at the site cannot resolve names. Checked: ipconfig and get-dhcp-scope both show 10.20.4.99 as option 006.',
      ),
    })
    const item = partial.items.find((entry) => entry.id === 'escalation-note')

    expect(item?.passed).toBe(false)
    expect(item?.evidence).toContain(
      'Your handoff note did not cover what the next team should do.',
    )
    expect(item?.evidence).toContain('Your handoff note covered what the user reported.')
    expect(item?.gaps).toEqual(['Your handoff note did not cover what the next team should do.'])
    expect(partial.passed).toBe(false)
    expect(partial.criticalFailures.join(' ')).toMatch(
      /handoff note did not cover what the next team should do/,
    )
  })

  it('rejects a handoff that is too short to be useful', () => {
    const ticket = ticketFor('FS-01', 'explicit-deny')
    const result = evaluateSession({
      rubric: ticket.rubric,
      difficulty: ticket.difficulty,
      ...attemptWithHandoff(ticket, 'Passing this on.'),
    })

    expect(result.items.find((item) => item.id === 'escalation-note')?.passed).toBe(false)
  })

  it('names a handoff that touched every point but was too short to use', () => {
    const ticket = ticketFor('FS-01', 'explicit-deny')
    const result = evaluateSession({
      rubric: ticket.rubric,
      difficulty: ticket.difficulty,
      ...attemptWithHandoff(ticket, 'Report checked next.'),
    })
    const item = result.items.find((entry) => entry.id === 'escalation-note')

    expect(item?.passed).toBe(false)
    expect(item?.evidence).toContain('Your handoff note was too short to hand over.')
    expect(item?.gaps).toEqual(['Your handoff note was too short to hand over.'])
  })
})

function topologyCheck(
  label: string,
  command: string,
  state: TopologyCheck['state'],
): TopologyCheck {
  return {
    id: label,
    label,
    command,
    state,
    evidence: null,
    atMs: null,
    entryId: 'entry',
    actionId: 'action',
  }
}

function topologyWith(
  groups: Array<{ title: string; kind: 'origin' | 'site'; checks: TopologyCheck[] }>,
): TopologyView {
  const checks = groups.flatMap((group) => group.checks)
  return {
    originHostname: 'LT-4472',
    originSiteName: 'Larkspur HQ',
    groups: groups.map((group, index) => ({
      id: `group-${index}`,
      kind: group.kind,
      title: group.title,
      subtitle: '',
      checks: group.checks,
    })),
    proved: checks.filter((check) => check.state === 'proved').length,
    failed: checks.filter((check) => check.state === 'failed').length,
    total: checks.length,
  }
}

describe('network proof bonus', () => {
  const ticket = ticketFor('NET-01', 'bad-static-dns')
  const attempt = partialAttempt(ticket, [])

  function score(
    topology?: TopologyView,
    options: { networkTicket?: boolean; closing?: boolean } = {},
  ) {
    return evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
      networkTicket: options.networkTicket ?? true,
      closing: options.closing ?? true,
      topology,
    })
  }

  it('pays the bonus when every link was proved before the close', () => {
    const base = score()
    const allProved = topologyWith([
      {
        title: 'This machine',
        kind: 'origin',
        checks: [
          topologyCheck('Adapter and lease', 'ipconfig /all', 'proved'),
          topologyCheck('Name resolution', 'nslookup fileserver', 'proved'),
        ],
      },
    ])

    const result = score(allProved)

    expect(result.xp).toBe(base.xp + TOPOLOGY_BONUS_XP)
    expect(result.topology).toEqual({
      totalLinks: 2,
      provedLinks: 2,
      bonusXp: TOPOLOGY_BONUS_XP,
      untested: [],
      failed: [],
    })
  })

  it('withholds the bonus and names every unproved link', () => {
    const topology = topologyWith([
      {
        title: 'This machine',
        kind: 'origin',
        checks: [
          topologyCheck('Adapter and lease', 'ipconfig /all', 'proved'),
          topologyCheck('Name resolution', 'nslookup fileserver', 'unknown'),
        ],
      },
      {
        title: 'Larkspur Depot',
        kind: 'site',
        checks: [topologyCheck('Gateway', 'ping 10.20.4.9', 'failed')],
      },
    ])

    const result = score(topology)

    expect(result.xp).toBe(score().xp)
    expect(result.topology?.bonusXp).toBe(0)
    expect(result.topology?.provedLinks).toBe(1)
    expect(result.topology?.totalLinks).toBe(3)
    expect(result.topology?.untested).toEqual([
      { label: 'This machine · Name resolution', command: 'nslookup fileserver' },
    ])
    expect(result.topology?.failed).toEqual([
      { label: 'Larkspur Depot · Gateway', command: 'ping 10.20.4.9' },
    ])
  })

  it('keeps the map itself, not just its counts', () => {
    const topology = topologyWith([
      {
        title: 'This machine',
        kind: 'origin',
        checks: [
          topologyCheck('Adapter and lease', 'ipconfig /all', 'proved'),
          topologyCheck('Name resolution', 'nslookup fileserver', 'unknown'),
        ],
      },
    ])

    const result = score(topology)

    // The snapshot is the map as the log left it: the same links, each with the
    // state and the evidence line the debrief redraws. It has to survive the
    // score row it is stored in, so it is compared through JSON.
    expect(JSON.parse(JSON.stringify(result.topologyMap))).toEqual(
      JSON.parse(JSON.stringify(topology)),
    )
    expect(result.topologyMap?.groups[0]?.checks.map((check) => check.state)).toEqual([
      'proved',
      'unknown',
    ])
    expect(result.topologyMap?.proved).toBe(1)
    expect(result.topologyMap?.total).toBe(2)
  })

  it('does not pay for a map that was still open, or for another ticket type', () => {
    const allProved = topologyWith([
      {
        title: 'This machine',
        kind: 'origin',
        checks: [topologyCheck('Adapter and lease', 'ipconfig /all', 'proved')],
      },
    ])

    expect(score(allProved, { closing: false }).topology).toBeNull()
    expect(score(allProved, { networkTicket: false }).topology).toBeNull()
    expect(score(allProved, { closing: false }).xp).toBe(score().xp)
    expect(score(allProved, { networkTicket: false }).xp).toBe(score().xp)
    // No map to redraw either, so the debrief shows no picture.
    expect(score(allProved, { closing: false }).topologyMap).toBeNull()
    expect(score(allProved, { networkTicket: false }).topologyMap).toBeNull()
    expect(score(undefined).topologyMap).toBeNull()
  })
})

/** The gate as the log records it: which method was used, and whether it held. */
function verifyAction(method: string, verified = true): EvaluatorAction {
  return {
    kind: 'verify-caller',
    input: { method },
    output: { summary: verified ? 'Checked.' : 'Not verified.', verified },
  }
}

function withHints(actions: EvaluatorAction[], count: number): EvaluatorAction[] {
  return [
    ...actions,
    ...Array.from({ length: count }, (_, index) => ({
      kind: 'hint' as const,
      input: { itemId: `item-${index}`, hint: 'Check the adapter settings first.' },
      output: { revealed: true },
    })),
  ]
}

describe('hint cost', () => {
  const ticket = ticketFor('PWD-01', 'account-lockout')
  const sam = ticket.public.requester.samAccountName
  const complete = partialAttempt(
    ticket,
    [`get-account ${sam}`, `unlock-account ${sam}`, `get-account ${sam}`],
    { notes: true, verifyCaller: true },
  )

  function score(count: number, hints?: { perHint: number; cap: number; budget: number }) {
    return evaluateSession({
      rubric: ticket.rubric,
      difficulty: ticket.difficulty,
      ...complete,
      actions: withHints(complete.actions, count),
      hints,
    })
  }

  it('costs nothing when no hint was revealed', () => {
    const result = score(0)

    expect(result.hintsUsed).toBe(0)
    expect(result.hintPenalty).toBe(0)
    expect(result.total).toBe(100)
    expect(result.feedback.join(' ')).not.toMatch(/hint/i)
  })

  it('charges five points per hint and stops at the cap', () => {
    expect(score(1).total).toBe(95)
    expect(score(3).total).toBe(85)
    expect(score(5).total).toBe(85)
    expect(score(9).total).toBe(85)

    const once = score(1)
    expect(once.hintsUsed).toBe(1)
    expect(once.hintPenalty).toBe(5)
    expect(once.feedback.join(' ')).toMatch(/1 hint revealed, costing 5 points/i)
  })

  it('rebands the attempt and deducts from diagnostic reasoning', () => {
    const base = score(0)
    const hinted = score(4)

    expect(base.band).toBe('strong')
    expect(hinted.band).toBe('pass')
    expect(hinted.passed).toBe(true)
    expect(hinted.categoryScores.diagnosis.earned).toBe(
      Math.max(0, base.categoryScores.diagnosis.earned - hinted.hintPenalty),
    )
    expect(hinted.categoryScores.diagnosis.possible).toBe(base.categoryScores.diagnosis.possible)
  })

  it('prices hints by the policy the attempt was started under', () => {
    const strict = score(2, { perHint: 20, cap: 40, budget: 0 })
    expect(strict.hintPenalty).toBe(40)
    expect(strict.total).toBe(60)
    expect(strict.feedback.join(' ')).toMatch(/20 per hint, capped at 40/i)
    // The policy travels with the result, so the debrief can re-price the rungs.
    expect(strict.hintPolicy).toEqual({ perHint: 20, cap: 40, budget: 0 })

    const cheap = score(2, { perHint: 1, cap: 2, budget: 0 })
    expect(cheap.hintPenalty).toBe(2)
    expect(cheap.total).toBe(98)
  })

  it('charges nothing when the policy makes hints free', () => {
    const free = score(5, { perHint: 0, cap: 0, budget: 0 })

    expect(free.hintsUsed).toBe(5)
    expect(free.hintPenalty).toBe(0)
    expect(free.total).toBe(100)
    expect(free.hintPolicy).toEqual({ perHint: 0, cap: 0, budget: 0 })
    expect(free.feedback.join(' ')).toMatch(/they were free on this device/i)
  })

  it('ignores a policy it cannot read instead of refusing to score', () => {
    const nonsense = evaluateSession({
      rubric: ticket.rubric,
      difficulty: ticket.difficulty,
      ...complete,
      actions: withHints(complete.actions, 3),
      hints: { perHint: Number.NaN, cap: -1, budget: 0 } as unknown as {
        perHint: number
        cap: number
        budget: number
      },
    })

    expect(nonsense.hintPolicy).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(nonsense.hintPenalty).toBe(15)
  })

  it('prices hints and procedure mistakes together without going below zero', () => {
    const lucky = partialAttempt(ticket, [`unlock-account ${sam}`])
    const result = evaluateSession({
      rubric: ticket.rubric,
      difficulty: ticket.difficulty,
      ...lucky,
      actions: withHints(lucky.actions, 12),
    })

    expect(result.hintPenalty).toBe(15)
    expect(result.procedurePenalty).toBe(15)
    expect(result.total).toBeGreaterThanOrEqual(0)
  })
})

describe('procedure penalties', () => {
  const ticket = ticketFor('PWD-01', 'account-lockout')
  const sam = ticket.public.requester.samAccountName

  it('prices a change made without verifying the caller', () => {
    const attempt = partialAttempt(
      ticket,
      [`get-account ${sam}`, `unlock-account ${sam}`, `get-account ${sam}`],
      { notes: true },
    )
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.violations.map((violation) => violation.id)).toEqual(['unverified-change'])
    expect(result.procedurePenalty).toBe(10)
    expect(result.items.find((item) => item.id === 'verify-caller')?.passed).toBe(false)
    // 85 from the rubric, less 10 for the unverified change.
    expect(result.total).toBe(75)
    expect(result.categoryScores.safety.earned).toBe(0)
    expect(result.feedback.join(' ')).toMatch(/before verifying the caller/i)
  })

  it('prices a fix that lands before any evidence', () => {
    const attempt = partialAttempt(ticket, [`unlock-account ${sam}`, `get-account ${sam}`], {
      notes: true,
      verifyCaller: true,
    })
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.violations.map((violation) => violation.id)).toEqual(['fix-before-evidence'])
    expect(result.procedurePenalty).toBe(5)
    expect(result.total).toBe(95)
    expect(result.categoryScores.diagnosis.earned).toBe(25)
  })

  it('charges each mistake once however often it is repeated', () => {
    const attempt = partialAttempt(
      ticket,
      [
        `unlock-account ${sam}`,
        `unlock-account ${sam}`,
        `get-account ${sam}`,
        `reset-password ${sam}`,
      ],
      { notes: true },
    )
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.violations.map((violation) => violation.id)).toEqual([
      'unverified-change',
      'fix-before-evidence',
    ])
    expect(result.procedurePenalty).toBe(15)
    expect(result.total).toBe(70)
  })

  it('charges nothing for a clean, evidence-first attempt', () => {
    const attempt = partialAttempt(
      ticket,
      [`get-account ${sam}`, `unlock-account ${sam}`, `get-account ${sam}`],
      { notes: true, verifyCaller: true },
    )
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.violations).toEqual([])
    expect(result.procedurePenalty).toBe(0)
    expect(result.total).toBe(100)
  })

  const clean = (options: StepOptions) =>
    partialAttempt(
      ticket,
      [`get-account ${sam}`, `unlock-account ${sam}`, `get-account ${sam}`],
      { notes: true, ...options },
    )

  it('prices a callback when the caller could have read a code back', () => {
    const attempt = clean({ verifyCaller: true, verifyMethod: 'callback' })
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    // The callback clears the safety gate and still costs, because the stronger
    // check was on the table and was passed over.
    expect(result.violations.map((violation) => violation.id)).toEqual([
      'callback-instead-of-code',
    ])
    expect(result.procedurePenalty).toBe(CALLBACK_OVER_CODE_PENALTY)
    expect(result.total).toBe(100 - CALLBACK_OVER_CODE_PENALTY)
    expect(result.items.find((item) => item.id === 'verify-caller')?.passed).toBe(true)
    expect(result.categoryScores.safety.earned).toBe(
      result.categoryScores.safety.possible - CALLBACK_OVER_CODE_PENALTY,
    )
    expect(result.feedback.join(' ')).toMatch(/Rang back instead of having a code read back/)
  })

  it('charges nothing for a callback when no code could reach the caller', () => {
    const attempt = clean({ verifyCaller: true, verifyMethod: 'callback' })
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      // The handset is out of action and the caller is not at the desk, so the
      // callback is the strongest check left and costs nothing.
      world: { ...attempt.world, mobileOutOfAction: true, callerOnSite: false },
      difficulty: ticket.difficulty,
    })

    expect(result.violations).toEqual([])
    expect(result.procedurePenalty).toBe(0)
    expect(result.total).toBe(100)
  })

  it('prices a callback that followed a code read-back only as what cleared the gate', () => {
    // The stronger check happened first and the gate was already open, so the
    // extra call changes nothing and costs nothing.
    const attempt = clean({ verifyCaller: true, verifyMethod: 'verification-code' })
    // The code came first; the call afterwards finds the gate already open.
    attempt.actions.splice(1, 0, verifyAction('callback'))

    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.violations).toEqual([])
    expect(result.total).toBe(100)
  })

  it('does not price a check that failed to prove anyone', () => {
    // A refused code is already a failed safety item; it cannot also be a
    // callback that skipped the code.
    const attempt = clean({ failedVerify: true, verifyMethod: 'callback' })
    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })

    expect(result.violations.map((violation) => violation.id)).toEqual([
      'unverified-change',
    ])
    expect(result.violations.some((violation) => violation.id === 'callback-instead-of-code')).toBe(
      false,
    )
  })

  it('counts a delivery-state listing as the look a mail change needs first', () => {
    const mail = ticketFor('MAILSEC-01', 'supplier-note-held')
    const attempt = partialAttempt(
      mail,
      ['get-messages quarantined', 'release-quarantine msg-4101'],
      { notes: true, verifyCaller: true },
    )
    const result = evaluateSession({
      rubric: mail.rubric,
      ...attempt,
      difficulty: mail.difficulty,
    })

    expect(result.violations).toEqual([])
    expect(result.procedurePenalty).toBe(0)
  })

  it('still prices a release that nobody looked up first', () => {
    const mail = ticketFor('MAILSEC-01', 'supplier-note-held')
    const attempt = partialAttempt(mail, ['release-quarantine msg-4101'], {
      notes: true,
      verifyCaller: true,
    })
    const result = evaluateSession({
      rubric: mail.rubric,
      ...attempt,
      difficulty: mail.difficulty,
    })

    expect(result.violations.map((violation) => violation.id)).toEqual(['fix-before-evidence'])
    expect(result.procedurePenalty).toBe(5)
  })
})

describe('commandCreditLedger', () => {
  const ticket = ticketFor('PWD-01', 'account-lockout')
  const sam = ticket.public.requester.samAccountName

  it('credits the command that proves a step and calls a repeat a dead end', () => {
    const attempt = partialAttempt(
      ticket,
      [`get-account ${sam}`, `unlock-account ${sam}`, `get-account ${sam}`, `get-account ${sam}`],
      { notes: true, verifyCaller: true },
    )
    const ledger = commandCreditLedger(
      attempt.actions,
      ticket.rubric,
      attempt.world,
      attempt.decision,
    )

    // 0 is the verification, then the four commands, then the two notes.
    expect(ledger.get(1)).toEqual(['Checked the directory account state'])
    // The unlock is the fix, the gate in "verify, then change", and half of the
    // ordered recheck, so every one of those steps rests on it.
    expect(ledger.get(2)).toEqual([
      `Unlocked ${sam}`,
      'Rechecked the account after unlocking',
      'Verified the caller before touching the account',
    ])
    expect(ledger.get(3)).toEqual(['Rechecked the account after unlocking'])
    // A second identical lookup adds to the log but proves nothing new.
    expect(ledger.get(4)).toBeUndefined()

    // A note or a closure code earns no command any credit.
    for (const labels of ledger.values()) {
      expect(labels).not.toContain('Logged troubleshooting notes')
      expect(labels).not.toContain('Resolved the ticket instead of escalating')
    }
  })

  it('credits nothing to a step the attempt fell short of', () => {
    // No recheck after the unlock, so that step earned no points and no command
    // is credited with having proved it.
    const attempt = partialAttempt(ticket, [`get-account ${sam}`, `unlock-account ${sam}`], {
      verifyCaller: true,
    })
    const ledger = commandCreditLedger(
      attempt.actions,
      ticket.rubric,
      attempt.world,
      attempt.decision,
    )

    expect(ledger.get(2)).toEqual([
      `Unlocked ${sam}`,
      'Verified the caller before touching the account',
    ])

    const result = evaluateSession({
      rubric: ticket.rubric,
      ...attempt,
      difficulty: ticket.difficulty,
    })
    expect(result.items.find((item) => item.id === 'verify-fix')?.passed).toBe(false)
    expect([...ledger.values()].flat()).not.toContain('Rechecked the account after unlocking')
  })

  it('credits nothing when no command proved anything', () => {
    const attempt = partialAttempt(ticket, [], { notes: true })
    const ledger = commandCreditLedger(
      attempt.actions,
      ticket.rubric,
      attempt.world,
      attempt.decision,
    )

    expect([...ledger.values()]).toEqual([])
  })
})
