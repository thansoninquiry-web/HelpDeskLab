import { describe, expect, it } from 'vitest'
import { applyCommand } from '../../../src/domain/environment/reducer'
import type { World } from '../../../src/domain/environment/types'
import { generateTicket } from '../../../src/domain/generator'
import type { GeneratedTicket } from '../../../src/domain/generator'
import { evaluateSession } from '../../../src/domain/scoring/evaluator'
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
      input: { method: 'employee-id' },
      output: { summary: 'Verified.' },
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
    expect(result.criticalFailures).toContain('Verified the caller before touching the account')
    expect(result.feedback.join(' ')).toMatch(/verify the caller/i)
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
    expect(result.criticalFailures).toContain('Resolved the ticket instead of escalating')
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
    expect(result.criticalFailures).toContain('Did not unlock the account yourself')
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
    expect(result.feedback.some((line) => line.startsWith('Breakdown:'))).toBe(true)
  })
})

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

    expect(complete.items.find((item) => item.id === 'escalation-note')?.passed).toBe(true)
    expect(complete.total).toBe(100)
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
    expect(item?.evidence).toContain('missing: what the next team should do')
    expect(item?.evidence).toContain('met: what the user reported')
    expect(partial.passed).toBe(false)
    expect(partial.criticalFailures).toContain('Wrote a handoff that the next team can act on')
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
})
