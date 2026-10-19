import { describe, expect, it } from 'vitest'
import { hintHabitBand, hintHabits, summarizeHintHabits } from '../../../src/domain/progress/hints'
import type { ScoredStep, TakenHint } from '../../../src/domain/progress/types'

function step(sessionId: string, itemId: string, label = itemId): ScoredStep {
  return { sessionId, itemId, label }
}

function hint(sessionId: string, itemId: string, hintIndex = 0): TakenHint {
  return { sessionId, itemId, hintIndex }
}

describe('hintHabits', () => {
  it('counts a step once per attempt, however many rungs were taken', () => {
    const steps = [step('s1', 'verify-caller'), step('s1', 'unlock')]
    const hints = [hint('s1', 'verify-caller', 0), hint('s1', 'verify-caller', 1)]

    const habits = hintHabits(steps, hints)
    const verify = habits.find((habit) => habit.itemId === 'verify-caller')

    expect(verify).toMatchObject({ attempts: 1, bought: 1, rungs: 2, boughtPercent: 100 })
    expect(verify?.band).toBe('bought-every-time')
  })

  it('counts a rung once even when the log names it twice', () => {
    const habits = hintHabits(
      [step('s1', 'unlock')],
      [hint('s1', 'unlock', 0), hint('s1', 'unlock', 0)],
    )

    expect(habits[0]?.rungs).toBe(1)
  })

  it('ignores hints from attempts that were never scored on that step', () => {
    const steps = [step('scored', 'unlock')]
    const hints = [
      // An abandoned attempt: its hints are not evidence of a finished habit.
      hint('abandoned', 'unlock', 0),
      // A step this attempt's rubric did not contain.
      hint('scored', 'some-other-step', 0),
    ]

    const habits = hintHabits(steps, hints)

    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({ itemId: 'unlock', attempts: 1, bought: 0, rungs: 0 })
    expect(habits[0]?.band).toBe('worked-alone')
  })

  it('reads the step label from the most recent attempt that scored it', () => {
    const habits = hintHabits(
      [step('s1', 'unlock', 'Unlock the account'), step('s2', 'unlock', 'Unlocked the account')],
      [],
    )

    expect(habits[0]?.label).toBe('Unlocked the account')
  })

  it('treats the same behaviour under two item ids as one habit', () => {
    const label = 'Did not reset the password as a workaround'
    const steps = [
      step('s1', 'no-reset', label),
      step('s2', 'no-workaround', label),
      step('s3', 'no-workaround', label),
    ]
    const hints = [hint('s1', 'no-reset', 0), hint('s2', 'no-workaround', 0)]

    const habits = hintHabits(steps, hints)

    expect(habits).toHaveLength(1)
    expect(habits[0]).toMatchObject({
      itemId: 'no-reset',
      attempts: 3,
      bought: 2,
      rungs: 2,
      boughtPercent: 67,
      band: 'usually-bought',
    })
  })

  it('puts the most habitually bought step first', () => {
    const steps = [
      step('s1', 'always'),
      step('s1', 'usually'),
      step('s1', 'alone'),
      step('s2', 'always'),
      step('s2', 'usually'),
      step('s2', 'alone'),
      step('s3', 'usually'),
    ]
    const hints = [
      hint('s1', 'always'),
      hint('s1', 'usually'),
      hint('s2', 'always'),
      hint('s2', 'usually'),
      hint('s3', 'usually'),
    ]

    const habits = hintHabits(steps, hints)

    // Both habitual steps are bought every time; the tie goes to the one with
    // more rungs behind it, and a never-bought step comes last whatever its label.
    expect(habits.map((habit) => [habit.itemId, habit.boughtPercent, habit.band])).toEqual([
      ['usually', 100, 'bought-every-time'],
      ['always', 100, 'bought-every-time'],
      ['alone', 0, 'worked-alone'],
    ])
  })

  it('separates occasionally bought steps from habitual ones', () => {
    const steps = ['a', 'b', 'c'].flatMap((id) =>
      ['s1', 's2', 's3', 's4', 's5'].map((sessionId) => step(sessionId, id)),
    )
    const hints = [
      // 'a' is bought on four of five attempts, 'b' on one, 'c' on none.
      hint('s1', 'a'),
      hint('s2', 'a'),
      hint('s3', 'a'),
      hint('s4', 'a'),
      hint('s1', 'b'),
    ]

    const habits = hintHabits(steps, hints)
    const bands = Object.fromEntries(habits.map((habit) => [habit.itemId, habit.band]))

    expect(bands).toEqual({
      a: 'usually-bought',
      b: 'sometimes-bought',
      c: 'worked-alone',
    })
  })

  it('describes the habit from the same numbers the row shows', () => {
    expect(hintHabitBand({ attempts: 3, bought: 3, boughtPercent: 100 })).toBe('bought-every-time')
    expect(hintHabitBand({ attempts: 3, bought: 2, boughtPercent: 67 })).toBe('usually-bought')
    expect(hintHabitBand({ attempts: 3, bought: 1, boughtPercent: 33 })).toBe('sometimes-bought')
    expect(hintHabitBand({ attempts: 3, bought: 0, boughtPercent: 0 })).toBe('worked-alone')
  })

  it('summarises the attempts and steps behind the rows', () => {
    const steps = [
      step('s1', 'unlock'),
      step('s1', 'verify-caller'),
      step('s2', 'unlock'),
      step('s2', 'verify-caller'),
    ]
    const hints = [hint('s1', 'verify-caller', 0), hint('s1', 'verify-caller', 1)]
    const summary = summarizeHintHabits(steps, hints)

    expect(summary).toEqual({
      attempts: 2,
      attemptsWithHints: 1,
      steps: 2,
      everBought: 1,
      workedAlone: 1,
      rungs: 2,
    })
  })

  it('has nothing to say before an attempt is scored', () => {
    expect(hintHabits([], [hint('s1', 'unlock')])).toEqual([])
    expect(summarizeHintHabits([], [hint('s1', 'unlock')])).toEqual({
      attempts: 0,
      attemptsWithHints: 0,
      steps: 0,
      everBought: 0,
      workedAlone: 0,
      rungs: 0,
    })
  })
})
