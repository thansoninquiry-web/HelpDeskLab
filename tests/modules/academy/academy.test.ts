import { describe, expect, it } from 'vitest'
import { CHANGES, READS, VISIT_KITS, isHarmful } from '../../../src/modules/academy/data/catalog'
import { PHRASES } from '../../../src/modules/academy/data/phrases'
import {
  AREA_ORDER,
  SCENARIOS,
  scenarioById,
  scenariosIn,
  spanishFirstScenarios,
} from '../../../src/modules/academy/data/scenarios'
import { scoreAcademyAttempt } from '../../../src/modules/academy/logic/scoring'
import { clockLabel, startMinute, urgencyPoints } from '../../../src/modules/academy/logic/clock'
import {
  ACTION_MINUTES,
  type AcademyMode,
  type AttemptState,
  type ChangeId,
  type ChecklistId,
  type SchoolScenario,
} from '../../../src/modules/academy/types'

/**
 * The school desk's own checks: every scenario resolves on its reference path,
 * the Spanish callers are there, and the two rules the pack exists to teach —
 * isolate before you touch, and triage the person at the door — are what the
 * scorer actually enforces.
 */

const NOTE =
  'Room 3, HDMI lead loose and the projector on the wrong input; reseated and switched. Ask Mrs Vargas to call if it drops again.'

function stateFor(
  scenario: SchoolScenario,
  options: {
    mode?: AcademyMode
    reads?: boolean
    dialog?: 'plain' | 'jargon'
    changes?: readonly ChangeId[]
    checklist?: readonly ChecklistId[]
    triage?: boolean
    note?: string
    lateMinutes?: number
  } = {},
): AttemptState {
  const mode = options.mode ?? 'standard'
  const start = startMinute(scenario)
  let minute = start
  const at0 = 1
  let at = at0
  const reads = options.reads === false ? [] : scenario.reads.map((entry) => {
    minute += ACTION_MINUTES[mode].read
    return { id: entry.id, at: at++, minute }
  })
  const dialog = scenario.dialog.map((node) => {
    minute += ACTION_MINUTES[mode].dialog
    return {
      nodeId: node.id,
      optionId: options.dialog === 'jargon' ? 'jargon' : 'plain',
      at: at++,
      minute,
    }
  })
  const changes = (options.changes ?? scenario.expected).map((id) => {
    minute += ACTION_MINUTES[mode].change
    return { id, at: at++, minute }
  })
  const triage =
    scenario.walkUp && options.triage !== false
      ? (() => {
          const best = scenario.walkUp.options.find((option) => option.best) ?? scenario.walkUp.options[0]
          minute += best?.minutes ?? 0
          return {
            walkUpId: scenario.walkUp.id,
            optionId: best?.id ?? '',
            at: at++,
            minute,
          }
        })()
      : null
  const checklist = (options.checklist ?? ['kit', 'safety', 'document', 'follow-up']).map((id) => ({
    id,
    at: at++,
    minute,
    ...(id === 'document' ? { note: options.note ?? NOTE } : {}),
  }))
  if (options.lateMinutes) {
    minute += options.lateMinutes
    if (checklist[0]) {
      checklist[checklist.length - 1] = {
        ...checklist[checklist.length - 1]!,
        minute,
      }
    }
  }
  return { mode, reads, changes, dialog, triage, checklist }
}

describe('the Education IT pack', () => {
  it('covers the five areas with twenty-five scenarios', () => {
    expect(SCENARIOS).toHaveLength(25)
    expect(AREA_ORDER.map((area) => scenariosIn(area).length)).toEqual([6, 5, 5, 4, 5])
    const categories = new Set(SCENARIOS.map((scenario) => scenario.area))
    expect([...categories].sort()).toEqual([...AREA_ORDER].sort())
  })

  it('has unique ids and a caller in every scenario', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const scenario of SCENARIOS) {
      expect(scenario.caller.name.length, scenario.id).toBeGreaterThan(0)
      expect(scenario.caller.role.length, scenario.id).toBeGreaterThan(0)
      expect(scenario.window, scenario.id).toBeGreaterThan(0)
      expect(startMinute(scenario), scenario.id).toBeGreaterThanOrEqual(0)
    }
  })

  it('offers every expected change and every read it names', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.expected.length, scenario.id).toBeGreaterThan(0)
      for (const id of scenario.expected) {
        expect(scenario.changes, `${scenario.id} expects ${id}`).toContain(id)
      }
      expect(new Set(scenario.changes).size, scenario.id).toBe(scenario.changes.length)
      expect(new Set(scenario.reads.map((read) => read.id)).size, scenario.id).toBe(
        scenario.reads.length,
      )
      expect(
        scenario.reads.filter((read) => read.decisive === true).length,
        `${scenario.id} has no decisive read`,
      ).toBeGreaterThan(0)
      // Nothing in the data may name a read or a change the catalogue lacks.
      for (const read of scenario.reads) {
        expect(READS[read.id], `${scenario.id} names ${read.id}`).toBeDefined()
      }
      for (const id of scenario.changes) {
        expect(CHANGES[id], `${scenario.id} offers ${id}`).toBeDefined()
      }
    }
  })

  it('asks every caller one question and offers exactly one plain answer per step', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.dialog.length, scenario.id).toBe(2)
      for (const node of scenario.dialog) {
        expect(node.options).toHaveLength(3)
        expect(node.options.filter((option) => option.best === true)).toHaveLength(1)
        expect(node.options.every((option) => option.say.trim().length > 0)).toBe(true)
      }
      // A Spanish-first caller gets Spanish prompts and Spanish best answers.
      if (scenario.caller.language === 'es') {
        expect(scenario.dialog[0]?.prompt, scenario.id).toMatch(/[¿¡áéíóúñ]/i)
        const best = scenario.dialog[0]?.options.find((option) => option.best)
        expect(best?.gloss, `${scenario.id} best reply needs a gloss`).toBeTruthy()
      }
    }
  })

  it('includes five Spanish-first callers and the phrase set to support them', () => {
    expect(spanishFirstScenarios().length).toBeGreaterThanOrEqual(5)
    expect(PHRASES.length).toBeGreaterThanOrEqual(12)
    expect(PHRASES.some((card) => /reiniciado/.test(card.es))).toBe(true)
    expect(PHRASES.some((card) => /mensaje de error/.test(card.es))).toBe(true)
    for (const area of AREA_ORDER) {
      expect(VISIT_KITS[area].tools.length).toBeGreaterThan(0)
      expect(VISIT_KITS[area].parts.length).toBeGreaterThan(0)
    }
  })

  it('has five mid-ticket walk-ups, each with one right answer', () => {
    const withWalkUp = SCENARIOS.filter((scenario) => scenario.walkUp !== undefined)
    expect(withWalkUp.length).toBe(5)
    for (const scenario of withWalkUp) {
      expect(scenario.walkUp?.options.filter((option) => option.best === true)).toHaveLength(1)
      expect(scenario.walkUp?.note.length, scenario.id).toBeGreaterThan(20)
    }
  })

  it('scores a careful visit at 100 and a pass on every scenario', () => {
    for (const scenario of SCENARIOS) {
      const score = scoreAcademyAttempt({ scenario, state: stateFor(scenario) })
      expect(score.total, `${scenario.id} should score 100`).toBe(100)
      expect(score.passed, `${scenario.id} should pass`).toBe(true)
      expect(score.resolved, `${scenario.id} should be resolved`).toBe(true)
      expect(score.items.filter((item) => item.earned > item.possible)).toHaveLength(0)
    }
  })

  it('will not pass a correct fix made with no reads at all', () => {
    const scenario = scenarioById('projector-no-signal') as SchoolScenario
    const score = scoreAcademyAttempt({
      scenario,
      state: stateFor(scenario, { reads: false, checklist: [] }),
    })
    expect(score.resolved).toBe(true)
    expect(score.total).toBeLessThan(75)
    expect(score.passed).toBe(false)
    expect(score.items.find((item) => item.id === 'sequence')?.passed).toBe(false)
  })

  it('charges for technician language with the caller', () => {
    const scenario = scenarioById('office-shared-drive') as SchoolScenario
    const plain = scoreAcademyAttempt({ scenario, state: stateFor(scenario) })
    const jargon = scoreAcademyAttempt({ scenario, state: stateFor(scenario, { dialog: 'jargon' }) })
    expect(jargon.total).toBeLessThan(plain.total)
    expect(jargon.items.find((item) => item.id === 'communication')?.passed).toBe(false)
  })

  it('fails a visit that disabled the filter to save time', () => {
    const scenario = scenarioById('gradebook-blocked') as SchoolScenario
    const score = scoreAcademyAttempt({
      scenario,
      state: stateFor(scenario, {
        changes: [...scenario.expected, 'disable-filter'],
      }),
    })
    expect(isHarmful('disable-filter')).toBe(true)
    expect(score.criticalSafety).toBe(true)
    expect(score.passed).toBe(false)
    expect(score.deductions.some((line) => /web filter/.test(line))).toBe(true)
  })

  it('prices a random change but keeps a correct one clean', () => {
    const scenario = scenarioById('ap-down-year-3') as SchoolScenario
    const careful = scoreAcademyAttempt({ scenario, state: stateFor(scenario) })
    const guess = scoreAcademyAttempt({
      scenario,
      state: stateFor(scenario, { changes: [...scenario.expected, 'replace-projector'] }),
    })
    expect(guess.total).toBeLessThan(careful.total)
    expect(guess.penalty).toBeGreaterThan(0)
    expect(guess.passed).toBe(false)
  })

  it('is stricter on urgency in time pressure than in a standard visit', () => {
    const scenario = scenarioById('teacher-locked-out') as SchoolScenario
    const standard = stateFor(scenario, { lateMinutes: 22 })
    const rush = stateFor(scenario, { mode: 'rush', lateMinutes: 22 })
    expect(urgencyPoints(standard, scenario)).toBeGreaterThan(urgencyPoints(rush, scenario))
    const standardScore = scoreAcademyAttempt({ scenario, state: standard })
    const rushScore = scoreAcademyAttempt({ scenario, state: rush })
    expect(rushScore.items.find((item) => item.id === 'urgency')?.earned).toBeLessThan(
      standardScore.items.find((item) => item.id === 'urgency')?.earned ?? 0,
    )
  })

  it('gives no urgency credit when the bell has long gone', () => {
    const scenario = scenarioById('loaner-checkout') as SchoolScenario
    const state = stateFor(scenario, { lateMinutes: 60 })
    expect(urgencyPoints(state, scenario)).toBe(0)
  })

  it('scores the walk-up only when it is triaged the right way', () => {
    const scenario = scenarioById('cart-charge') as SchoolScenario
    const right = scoreAcademyAttempt({ scenario, state: stateFor(scenario) })
    expect(right.items.find((item) => item.id === 'triage')?.passed).toBe(true)

    const missed = scoreAcademyAttempt({ scenario, state: stateFor(scenario, { triage: false }) })
    expect(missed.items.find((item) => item.id === 'triage')?.earned).toBe(0)

    const wrongState = stateFor(scenario)
    const walkUp = scenario.walkUp
    const wrong = walkUp?.options.find((option) => option.best !== true)
    expect(walkUp).toBeDefined()
    const wrongScore = scoreAcademyAttempt({
      scenario,
      state: {
        ...wrongState,
        triage: {
          walkUpId: walkUp?.id ?? '',
          optionId: wrong?.id ?? '',
          at: 50,
          minute: 48,
        },
      },
    })
    expect(wrongScore.items.find((item) => item.id === 'triage')?.passed).toBe(false)
  })

  it('reads the school clock in the desk’s own words', () => {
    expect(clockLabel(0)).toBe('08:00')
    expect(clockLabel(75)).toBe('09:15')
    expect(clockLabel(150)).toBe('10:30')
    expect(clockLabel(480)).toBe('16:00')
  })
})
