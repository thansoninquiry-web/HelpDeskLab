import { describe, expect, it } from 'vitest'
import { SCENARIO_FAMILIES, generateTicket, listVariants } from '../../../src/domain/generator'
import type { GeneratedTicket } from '../../../src/domain/generator'
import {
  describeHintProblem,
  hintVocabulary,
  lintHintText,
  lintTicketHints,
  simulationVocabulary,
} from '../../../src/domain/generator/hintLint'
import { DEFAULT_HINT_POLICY, MAX_HINT_PENALTY, totalHintCost } from '../../../src/domain/scoring/policy'

function ticketFor(scenarioId: string, variantId: string): GeneratedTicket {
  for (let seed = 1; seed < 600; seed += 1) {
    const ticket = generateTicket(seed, { familyId: scenarioId })
    if (ticket.variantId === variantId) {
      return ticket
    }
  }
  throw new Error(`No seed produced ${scenarioId}/${variantId}`)
}

describe('hint ladder coverage', () => {
  it('offers at least two usable hints on every rubric item of every ticket', () => {
    const thin: string[] = []
    const blank: string[] = []
    const repeated: string[] = []

    for (const family of SCENARIO_FAMILIES) {
      for (const variant of listVariants(family.id)) {
        const ticket = ticketFor(family.id, variant.id)
        for (const item of ticket.rubric.items) {
          const where = `${family.id}/${variant.id} ${item.id}`
          if (item.hints.length < 2) {
            thin.push(`${where} has ${item.hints.length}`)
          }
          if (item.hints.some((hint) => hint.trim().length === 0)) {
            blank.push(where)
          }
          // A ladder that repeats a rung charges twice for saying the same thing.
          const unique = new Set(item.hints.map((hint) => hint.trim().toLowerCase()))
          if (unique.size !== item.hints.length) {
            repeated.push(where)
          }
        }
      }
    }

    expect({ thin, blank, repeated }).toEqual({ thin: [], blank: [], repeated: [] })
  })

  it('gives every ticket enough rungs for the hint cap to apply', () => {
    const short: string[] = []

    for (const family of SCENARIO_FAMILIES) {
      for (const variant of listVariants(family.id)) {
        const ticket = ticketFor(family.id, variant.id)
        const rungs = ticket.rubric.items.reduce((sum, item) => sum + item.hints.length, 0)
        // Three rungs reach the 15-point cap at the standard 5-per-hint price;
        // fewer total rungs would leave a ticket unable to pay it.
        if (totalHintCost(DEFAULT_HINT_POLICY, rungs) !== MAX_HINT_PENALTY) {
          short.push(`${family.id}/${variant.id}: ${rungs} rungs`)
        }
      }
    }

    expect(short).toEqual([])
  })
})

describe('hint quality guard', () => {
  it('finds no hint naming a command or setting the simulation does not have', () => {
    const problems: string[] = []
    const tickets = SCENARIO_FAMILIES.flatMap((family) =>
      listVariants(family.id).map((variant) => ticketFor(family.id, variant.id)),
    )
    const vocabulary = simulationVocabulary(tickets)

    for (const ticket of tickets) {
      problems.push(
        ...lintTicketHints(ticket, vocabulary).map(
          (problem) =>
            `${ticket.scenarioId}/${ticket.variantId} ${describeHintProblem(problem)}`,
        ),
      )
    }

    expect(problems).toEqual([])
  })

  it('reads the vocabulary out of the code rather than restating it', () => {
    const ticket = ticketFor('PWD-01', 'account-lockout')
    const vocabulary = hintVocabulary(ticket)

    // Commands and their switches come from the registry.
    expect(vocabulary.commands.has('unlock-account')).toBe(true)
    expect(vocabulary.switches.get('ipconfig')?.has('/renew')).toBe(true)
    // Settings come from what this ticket's own tools print.
    expect(vocabulary.settings.get('status')?.has('locked')).toBe(true)
    // Field names come from a real world.
    expect(vocabulary.worldKeys.has('samAccountName')).toBe(true)
  })

  const ticket = ticketFor('PWD-01', 'account-lockout')
  const vocabulary = hintVocabulary(ticket)
  const lint = (text: string) => lintHintText(text, vocabulary, { itemId: 'test-item', rung: 1 })

  it('passes a hint that names a real command and a real setting', () => {
    expect(lint('Run get-account for the caller, then check status: locked.')).toEqual([])
    // The reference path unlocks the account, so this state is one it prints.
    expect(lint('Recheck the account; status: active means the unlock took.')).toEqual([])
    expect(lint('Use ipconfig /renew when the lease is the problem.')).toEqual([])
    expect(lint('The read-back is an action, not a note; the sign-in log will not show it.')).toEqual(
      [],
    )
  })

  it('catches a hint that invents a command', () => {
    const [problem] = lint('Run reset-account on the user once they are verified.')

    expect(problem?.reason).toBe('unknown-command')
    expect(problem?.token).toBe('reset-account')
    expect(problem?.detail).toMatch(/no command named "reset-account" exists/i)
  })

  it('catches a switch the command does not have', () => {
    const [problem] = lint('Refresh the address with ipconfig /releasenow.')

    expect(problem?.reason).toBe('unknown-switch')
    expect(problem?.token).toBe('/releasenow')
  })

  it('catches a setting the tools never print, and says it once', () => {
    const problems = lint('The record shows lockoutCount: 5 on this account.')

    expect(problems.map((problem) => problem.reason)).toEqual(['unknown-setting'])
    expect(problems[0]?.token).toBe('lockoutCount')
  })

  it('catches a value the tools would never print for a real setting', () => {
    const [problem] = lint('The account shows status: expired, so reset it.')

    expect(problem?.reason).toBe('unobservable-value')
    expect(problem?.detail).toMatch(/status.*locked.*never "expired"/i)
  })

  it('reads prose that ends in a colon as prose, not as a setting', () => {
    expect(lint('status: disabled is the line that changes the whole path: do not unlock.')).toEqual(
      [],
    )
  })

  it('catches a field that does not exist on the estate', () => {
    const [problem] = lint('Check passwordExpiryDate before you change anything.')

    expect(problem?.reason).toBe('unknown-setting')
    expect(problem?.token).toBe('passwordExpiryDate')
  })

  it('leaves ordinary prose about real tools alone', () => {
    // Hyphenated words that are not commands, and a colon that introduces prose.
    expect(
      lint('Sign-in fails off-network; ask for the read-back and note the follow-up.'),
    ).toEqual([])
    expect(lint('Example: “Disabled by offboarding; escalate it.”')).toEqual([])
  })
})
