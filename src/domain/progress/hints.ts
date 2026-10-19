import type { ScoredStep, TakenHint } from './types'

/**
 * How a learner takes hints, step by step.
 *
 * A hint is logged against the rubric step it unstuck, and a closed attempt
 * keeps its rubric. Reading the two together answers a question a score cannot:
 * which steps this learner habitually buys, and which they reliably work out
 * alone. Only scored attempts count — an abandoned attempt never reached the
 * rubric that names its steps, and a habit is made of attempts seen through.
 *
 * Nothing here is stored: the summary is rebuilt from the action log and the
 * stored rubrics each time it is read, so it follows a rewind, a retry, or an
 * older attempt without a migration.
 */

/** A step as it appears in one scored attempt's rubric. */
export interface StepHintHabit {
  itemId: string
  label: string
  /** Scored attempts whose rubric contained this step. */
  attempts: number
  /** Of those, the attempts that took at least one rung on it. */
  bought: number
  /** Rungs taken on this step across the history. */
  rungs: number
  /** Share of attempts that bought a hint, 0–100, rounded. */
  boughtPercent: number
  /** The habit this row describes, so the interface does not re-derive it. */
  band: HintHabitBand
}

/**
 * The habit in one word, gentlest threshold last:
 * `bought-every-time` never tried it alone, `worked-alone` never bought it.
 */
export type HintHabitBand =
  | 'bought-every-time'
  | 'usually-bought'
  | 'sometimes-bought'
  | 'worked-alone'

const USUALLY_BOUGHT_PERCENT = 60

export function hintHabitBand(
  habit: Pick<StepHintHabit, 'attempts' | 'bought' | 'boughtPercent'>,
): HintHabitBand {
  if (habit.bought === 0) {
    return 'worked-alone'
  }
  if (habit.bought === habit.attempts) {
    return 'bought-every-time'
  }
  if (habit.boughtPercent >= USUALLY_BOUGHT_PERCENT) {
    return 'usually-bought'
  }
  return 'sometimes-bought'
}

export interface HintHabitSummary {
  /** Scored attempts the summary was read from. */
  attempts: number
  /** Of those, the attempts that took at least one hint. */
  attemptsWithHints: number
  /** Distinct rubric steps seen across those attempts. */
  steps: number
  /** Steps with at least one rung bought. */
  everBought: number
  /** Steps no attempt ever took a hint on. */
  workedAlone: number
  /** Rungs taken in total. */
  rungs: number
}

/**
 * One row per rubric step, most habitually bought first. Hints from attempts
 * without a score are ignored: they belong to a habit that was never finished.
 *
 * Two variants can name the same behaviour with different item ids, so rows are
 * keyed by their label: "did not reset the password as a workaround" is one
 * habit whether it appeared under this id or that one.
 */
export function hintHabits(
  steps: readonly ScoredStep[],
  hints: readonly TakenHint[],
): StepHintHabit[] {
  const byItem = new Map<string, { label: string; sessions: Set<string> }>()
  for (const step of steps) {
    const entry = byItem.get(step.itemId) ?? { label: step.label, sessions: new Set<string>() }
    // The newest scored attempt names the step, in case its wording changed.
    entry.label = step.label
    entry.sessions.add(step.sessionId)
    byItem.set(step.itemId, entry)
  }

  // Per step, per attempt, the rungs it took. A set, so a repeated line in one
  // log still counts as one rung.
  const taken = new Map<string, Map<string, Set<number>>>()
  for (const hint of hints) {
    const entry = byItem.get(hint.itemId)
    // A hint only counts for the attempt that was scored on that very step.
    if (!entry || !entry.sessions.has(hint.sessionId)) {
      continue
    }
    const sessions = taken.get(hint.itemId) ?? new Map<string, Set<number>>()
    const rungs = sessions.get(hint.sessionId) ?? new Set<number>()
    rungs.add(hint.hintIndex)
    sessions.set(hint.sessionId, rungs)
    taken.set(hint.itemId, sessions)
  }

  interface HabitGroup {
    itemId: string
    label: string
    sessions: Set<string>
    bought: Set<string>
    rungs: number
  }

  const groups = new Map<string, HabitGroup>()
  for (const [itemId, entry] of byItem) {
    const key = entry.label.trim().toLowerCase()
    const group = groups.get(key) ?? {
      itemId,
      label: entry.label,
      sessions: new Set<string>(),
      bought: new Set<string>(),
      rungs: 0,
    }
    for (const sessionId of entry.sessions) {
      group.sessions.add(sessionId)
    }
    for (const [sessionId, rungs] of taken.get(itemId) ?? []) {
      group.bought.add(sessionId)
      group.rungs += rungs.size
    }
    groups.set(key, group)
  }

  const habits: StepHintHabit[] = []
  for (const group of groups.values()) {
    const attempts = group.sessions.size
    const bought = group.bought.size
    const boughtPercent = Math.round((bought / attempts) * 100)
    habits.push({
      itemId: group.itemId,
      label: group.label,
      attempts,
      bought,
      rungs: group.rungs,
      boughtPercent,
      band: hintHabitBand({ attempts, bought, boughtPercent }),
    })
  }

  return habits.sort(
    (left, right) =>
      right.boughtPercent - left.boughtPercent ||
      right.rungs - left.rungs ||
      left.label.localeCompare(right.label),
  )
}

export function summarizeHintHabits(
  steps: readonly ScoredStep[],
  hints: readonly TakenHint[],
): HintHabitSummary {
  const habits = hintHabits(steps, hints)
  const attempts = new Set(steps.map((step) => step.sessionId))
  const scored = new Set(attempts)
  const attemptsWithHints = new Set(
    hints.filter((hint) => scored.has(hint.sessionId)).map((hint) => hint.sessionId),
  )

  return {
    attempts: attempts.size,
    attemptsWithHints: attemptsWithHints.size,
    steps: habits.length,
    everBought: habits.filter((habit) => habit.bought > 0).length,
    workedAlone: habits.filter((habit) => habit.bought === 0).length,
    rungs: habits.reduce((total, habit) => total + habit.rungs, 0),
  }
}
