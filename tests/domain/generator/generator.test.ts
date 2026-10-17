import { describe, expect, it } from 'vitest'
import { applyCommand } from '../../../src/domain/environment/reducer'
import type { World } from '../../../src/domain/environment/types'
import { generateTicket, listVariants, SCENARIO_FAMILIES } from '../../../src/domain/generator'
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

function runReference(ticket: GeneratedTicket): {
  actions: EvaluatorAction[]
  world: World
} {
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
    } else {
      actions.push({
        kind: 'note',
        input: { noteKind: step.noteKind, text: step.text },
        output: { saved: true },
      })
    }
  }

  return { actions, world }
}

function evaluateReference(ticket: GeneratedTicket) {
  const { actions, world } = runReference(ticket)
  return evaluateSession({
    rubric: ticket.rubric,
    actions,
    world,
    difficulty: ticket.difficulty,
    decision: {
      outcome: ticket.expectedOutcome,
      code: ticket.expectedCodes[0] ?? 'resolved-remote',
      note: '',
    },
  })
}

describe('ticket generator', () => {
  it('reproduces the exact same ticket for the same seed and family', () => {
    const first = generateTicket(20261016, { familyId: 'NET-01' })
    const second = generateTicket(20261016, { familyId: 'NET-01' })

    expect(second.signature).toBe(first.signature)
    expect(second.public).toEqual(first.public)
    expect(second.world).toEqual(first.world)
    expect(second.rubric).toEqual(first.rubric)
  })

  it('replays an existing ticket from its stored scenario and seed', () => {
    const original = generateTicket(777, {})
    const replay = generateTicket(original.seed, { familyId: original.scenarioId })

    expect(replay.signature).toBe(original.signature)
    expect(replay.variantId).toBe(original.variantId)
    expect(replay.public.subject).toBe(original.public.subject)
  })

  it('produces unique signatures when asked to avoid earlier ones', () => {
    const signatures: string[] = []
    let seed = 9000

    for (let index = 0; index < 25; index += 1) {
      const ticket = generateTicket(seed, { avoidSignatures: signatures })
      signatures.push(ticket.signature)
      seed += 101
    }

    expect(new Set(signatures).size).toBe(signatures.length)
  })

  it('binds each ticket to a device, a requester, and public metadata', () => {
    const ticket = generateTicket(4242, { familyId: 'PRN-01' })
    const world = ticket.world
    const device = world.devices.find((entry) => entry.id === world.currentDeviceId)

    expect(device).toBeDefined()
    expect(ticket.public.requester.name.length).toBeGreaterThan(0)
    expect(ticket.public.device.hostname).toBe(device?.hostname)
    expect(ticket.public.scenarioTitle).toBe('Printing and the spooler')
    expect(['critical', 'high', 'medium', 'low']).toContain(ticket.public.severity)
    expect(ticket.public.subject).not.toMatch(/\{\w+\}/)
    expect(ticket.public.body).not.toMatch(/\{\w+\}/)
  })

  it('scores 100 on the reference path for every variant', () => {
    for (const family of SCENARIO_FAMILIES) {
      for (const variant of listVariants(family.id)) {
        const ticket = ticketFor(family.id, variant.id)
        const result = evaluateReference(ticket)

        expect(result.total, `${family.id}/${variant.id}`).toBe(100)
        expect(result.passed, `${family.id}/${variant.id}`).toBe(true)
        expect(result.band).toBe('strong')
        expect(result.criticalFailures).toEqual([])
      }
    }
  })

  it('makes the injected fault discoverable with the simulated tools', () => {
    for (const family of SCENARIO_FAMILIES) {
      for (let seed = 1; seed <= 18; seed += 1) {
        const ticket = generateTicket(seed, { familyId: family.id })
        const world = structuredClone(ticket.world)
        const toolPrefixes: Record<string, string> = {
          'DHCP-01': 'get-dhcp-scope',
          'M365-01': 'get-signin-log',
          'FS-01': 'get-share-access',
        }
        const prefix = toolPrefixes[family.id]
        const toolStep = prefix
          ? ticket.reference.find(
              (step) => step.type === 'command' && step.input.startsWith(prefix),
            )
          : undefined
        const familyCommand = toolStep?.type === 'command' ? toolStep.input : null
        const command =
          familyCommand ??
          (family.category === 'identity'
            ? `get-account ${ticket.public.requester.samAccountName}`
            : family.category === 'network'
              ? 'ipconfig /all'
              : 'get-printers')
        const result = applyCommand(world, command)
        const output = result.lines.map((line) => line.text).join('\n')

        expect(result.ok, `${ticket.variantId}: ${command}`).toBe(true)
        if (ticket.variantId === 'bad-static-dns') {
          expect(output).toContain('10.20.4.53')
        } else if (ticket.variantId === 'stale-dhcp-lease') {
          expect(output).toContain('169.254')
        } else if (ticket.variantId === 'spooler-stopped') {
          expect(output.toLowerCase()).toContain('stopped')
        } else if (ticket.variantId === 'job-stuck-offline') {
          expect(output.toLowerCase()).toContain('offline')
        } else if (ticket.variantId === 'account-lockout') {
          expect(output).toContain('locked')
        } else if (ticket.variantId === 'expired-password') {
          expect(output).toContain('passwordExpired : True')
        } else if (ticket.variantId === 'disabled-account') {
          expect(output).toContain('disabled')
        } else if (ticket.variantId === 'scope-wrong-dns') {
          expect(output).toContain('10.20.4.99')
        } else if (ticket.variantId === 'scope-exhausted') {
          expect(output).toContain('no free addresses')
        } else if (ticket.variantId === 'mfa-method-lost') {
          expect(output).toContain('AADSTS50076')
        } else if (ticket.variantId === 'smart-lockout') {
          expect(output).toContain('AADSTS50053')
        } else if (ticket.variantId === 'missing-group-membership') {
          expect(output).toContain('Effective   : Read')
        } else if (ticket.variantId === 'explicit-deny') {
          expect(output).toContain('Effective   : Denied')
        }
      }
    }
  })
})
