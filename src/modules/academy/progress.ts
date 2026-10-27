import { foldScenarioStats } from '../../domain/progress/leitner'
import { attemptXp } from '../../domain/progress/xp'
import type { ScoreHistoryEntry, ScenarioStats } from '../../domain/progress/types'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../domain/scoring/types'
import type { SessionId } from '../../domain/tickets/types'
import { SCENARIOS } from './data/scenarios'
import type { AcademyAttemptRecord } from './persistence/store'

/**
 * What the school desk contributes to progress.
 *
 * A visit is not a ticket session, so it is never written into `sessions` or
 * `scores`. It is published in the shapes those tables produce and the app
 * merges the feeds, which is how one scenario's score joins XP, weak topics and
 * the simulator filter.
 */

export const ACADEMY_SCENARIO_TITLES: Record<string, string> = Object.fromEntries(
  SCENARIOS.map((scenario) => [scenario.id, scenario.title]),
)

interface StoredScore {
  band?: ScoreBand
  passed?: boolean
  resolved?: boolean
  categoryScores?: Record<RubricCategory, CategoryScore>
}

const CATEGORIES: readonly RubricCategory[] = ['diagnosis', 'documentation', 'resolution', 'safety']

function categoryScoresOf(raw: unknown): Record<RubricCategory, CategoryScore> | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const scored = {} as Record<RubricCategory, CategoryScore>
  for (const category of CATEGORIES) {
    const entry = (raw as Record<string, unknown>)[category]
    if (typeof entry !== 'object' || entry === null) {
      return null
    }
    const earned = Number((entry as Record<string, unknown>).earned)
    const possible = Number((entry as Record<string, unknown>).possible)
    if (!Number.isFinite(earned) || !Number.isFinite(possible)) {
      return null
    }
    scored[category] = { earned, possible }
  }
  return scored
}

function parseScore(json: string | null): StoredScore {
  if (!json) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredScore) : {}
  } catch {
    return {}
  }
}

function difficultyOf(scenarioId: string): 1 | 2 | 3 {
  return SCENARIOS.find((scenario) => scenario.id === scenarioId)?.difficulty ?? 1
}

function finished(attempts: readonly AcademyAttemptRecord[]): AcademyAttemptRecord[] {
  return attempts
    .filter((attempt) => attempt.finishedAt !== null && attempt.score !== null)
    .sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0))
}

export function academyHistory(attempts: readonly AcademyAttemptRecord[]): ScoreHistoryEntry[] {
  return finished(attempts).map((attempt) => {
    const score = parseScore(attempt.scoreJson)
    const passed = score.passed === true
    return {
      sessionId: `academy:${attempt.id}` as SessionId,
      scenarioId: attempt.scenarioId,
      variantId: attempt.scenarioId,
      total: attempt.score ?? 0,
      passed,
      computedAt: attempt.finishedAt ?? attempt.startedAt,
      xp: attemptXp({
        difficulty: difficultyOf(attempt.scenarioId),
        passed,
        band: score.band ?? (passed ? 'pass' : 'fail'),
      }),
      categoryScores: categoryScoresOf(score.categoryScores),
    }
  })
}

export function academyStats(attempts: readonly AcademyAttemptRecord[]): ScenarioStats[] {
  const byScenario = new Map<string, ScenarioStats>()
  for (const attempt of finished(attempts)) {
    const score = parseScore(attempt.scoreJson)
    byScenario.set(
      attempt.scenarioId,
      foldScenarioStats(
        byScenario.get(attempt.scenarioId) ?? null,
        attempt.scenarioId,
        { total: attempt.score ?? 0, passed: score.passed === true },
        attempt.finishedAt ?? attempt.startedAt,
      ),
    )
  }
  return [...byScenario.values()]
}
