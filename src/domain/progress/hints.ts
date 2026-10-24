import type { ScoredAttemptHints, ScoredStep, TakenHint } from './types'

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
  /** Rungs the log places on a step, which is what the rows add up to. */
  rungs: number
  /**
   * Charged rungs no step above can show, because the action log no longer
   * holds the hint that bought them. Adding this to `rungs` is the full count,
   * and a score that never stored a count contributes nothing here: absent is
   * not the same as zero.
   */
  unaccountedRungs: number
  /** Scored attempts with at least one such rung. */
  attemptsWithUnaccountedHints: number
}

/** The rows, and the per-attempt rung counts they were built from. */
interface HabitReading {
  habits: StepHintHabit[]
  /** Rungs the log places, per attempt: the same numbers the rows are built from. */
  placedBySession: Map<string, number>
}

function readHabits(steps: readonly ScoredStep[], hints: readonly TakenHint[]): HabitReading {
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

  // The rungs the log can place, per attempt, from the same sets the rows read.
  const placedBySession = new Map<string, number>()
  for (const sessions of taken.values()) {
    for (const [sessionId, rungs] of sessions) {
      placedBySession.set(sessionId, (placedBySession.get(sessionId) ?? 0) + rungs.size)
    }
  }

  return {
    habits: habits.sort(
      (left, right) =>
        right.boughtPercent - left.boughtPercent ||
        right.rungs - left.rungs ||
        left.label.localeCompare(right.label),
    ),
    placedBySession,
  }
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
  return readHabits(steps, hints).habits
}

/**
 * What the scores say the learner paid that the log cannot place on a step.
 *
 * The debrief does the same thing for one attempt: it keeps the charged count
 * and reports the part the log lost, rather than showing two numbers that
 * disagree. Here the comparison is per attempt and then summed, because one
 * attempt that logged more rungs than it was charged for must not quietly cancel
 * out another attempt that lost one.
 *
 * An attempt with no stored count (a score written before hints were counted)
 * contributes nothing: the log is then the only account, and nothing is
 * invented.
 */
function reconcileHints(
  placedBySession: ReadonlyMap<string, number>,
  recorded: readonly ScoredAttemptHints[],
  scored: ReadonlySet<string>,
): Pick<HintHabitSummary, 'unaccountedRungs' | 'attemptsWithUnaccountedHints'> {
  const charged = new Map<string, number>()
  for (const entry of recorded) {
    // A score per attempt is the rule; the map makes a repeated row harmless.
    charged.set(entry.sessionId, entry.hintsUsed)
  }

  let unaccountedRungs = 0
  let attemptsWithUnaccountedHints = 0
  for (const [sessionId, hintsUsed] of charged) {
    // Only attempts whose rubric named their steps are part of this habit.
    if (!scored.has(sessionId)) {
      continue
    }
    const missing = hintsUsed - (placedBySession.get(sessionId) ?? 0)
    if (missing > 0) {
      unaccountedRungs += missing
      attemptsWithUnaccountedHints += 1
    }
  }

  return { unaccountedRungs, attemptsWithUnaccountedHints }
}

export function summarizeHintHabits(
  steps: readonly ScoredStep[],
  hints: readonly TakenHint[],
  recorded: readonly ScoredAttemptHints[] = [],
): HintHabitSummary {
  const { habits, placedBySession } = readHabits(steps, hints)
  const attempts = new Set(steps.map((step) => step.sessionId))
  const attemptsWithHints = new Set(
    hints.filter((hint) => attempts.has(hint.sessionId)).map((hint) => hint.sessionId),
  )

  return {
    attempts: attempts.size,
    attemptsWithHints: attemptsWithHints.size,
    steps: habits.length,
    everBought: habits.filter((habit) => habit.bought > 0).length,
    workedAlone: habits.filter((habit) => habit.bought === 0).length,
    rungs: habits.reduce((total, habit) => total + habit.rungs, 0),
    ...reconcileHints(placedBySession, recorded, attempts),
  }
}
