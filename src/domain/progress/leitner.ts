import type { LeitnerBox, ScenarioStats } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000

/** How long a box waits before it is due again, by box number. */
export const LEITNER_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const

/** The two facts about an attempt the schedule reads. */
export interface AttemptReading {
  total: number
  passed: boolean
}

/**
 * Folds one scored attempt into a scenario's stats.
 *
 * This lived inside the practice service, which was fine while every attempt
 * came through a ticket session. The Intune console scores its own attempts and
 * never opens a session, so the rule moved here: one implementation means its
 * due dates and boxes cannot drift from the rest of the app's.
 */
export function foldScenarioStats(
  existing: ScenarioStats | null,
  scenarioId: string,
  attempt: AttemptReading,
  now: number,
): ScenarioStats {
  const attempts = (existing?.attempts ?? 0) + 1
  const passes = (existing?.passes ?? 0) + (attempt.passed ? 1 : 0)
  const bestScore = Math.max(existing?.bestScore ?? 0, attempt.total)
  const box: LeitnerBox = attempt.passed
    ? (Math.min(5, (existing?.leitnerBox ?? 1) + 1) as LeitnerBox)
    : 1
  const interval = LEITNER_INTERVAL_DAYS[box - 1] ?? 1

  return {
    scenarioId,
    attempts,
    passes,
    bestScore,
    lastPlayedAt: now,
    leitnerBox: box,
    dueAt: now + interval * DAY_MS,
  }
}
