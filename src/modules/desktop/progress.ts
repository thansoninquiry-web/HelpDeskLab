import { foldScenarioStats } from '../../domain/progress/leitner'
import { attemptXp } from '../../domain/progress/xp'
import type { ScoreHistoryEntry, ScenarioStats } from '../../domain/progress/types'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../domain/scoring/types'
import type { SessionId } from '../../domain/tickets/types'
import { CASES } from './data/cases'
import type { DesktopAttemptRecord } from './persistence/store'

/**
 * What the Desktop Support bench contributes to progress.
 *
 * A bench visit is not a ticket session, so it is never written into `sessions`
 * or `scores`. It is published in the shapes those tables produce and the app
 * merges the feeds, which is how one case's score joins XP, weak topics and the
 * simulator filter.
 */

export const DESKTOP_SCENARIO_TITLES: Record<string, string> = Object.fromEntries(
  CASES.map((entry) => [entry.id, entry.title]),
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

function difficultyOf(caseId: string): 1 | 2 | 3 {
  return CASES.find((entry) => entry.id === caseId)?.difficulty ?? 1
}

function finished(attempts: readonly DesktopAttemptRecord[]): DesktopAttemptRecord[] {
  return attempts
    .filter((attempt) => attempt.finishedAt !== null && attempt.score !== null)
    .sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0))
}

export function desktopHistory(attempts: readonly DesktopAttemptRecord[]): ScoreHistoryEntry[] {
  return finished(attempts).map((attempt) => {
    const score = parseScore(attempt.scoreJson)
    const passed = score.passed === true
    return {
      sessionId: `desktop:${attempt.id}` as SessionId,
      scenarioId: attempt.caseId,
      variantId: attempt.caseId,
      total: attempt.score ?? 0,
      passed,
      computedAt: attempt.finishedAt ?? attempt.startedAt,
      xp: attemptXp({
        difficulty: difficultyOf(attempt.caseId),
        passed,
        band: score.band ?? (passed ? 'pass' : 'fail'),
      }),
      categoryScores: categoryScoresOf(score.categoryScores),
    }
  })
}

export function desktopStats(attempts: readonly DesktopAttemptRecord[]): ScenarioStats[] {
  const byScenario = new Map<string, ScenarioStats>()
  for (const attempt of finished(attempts)) {
    const score = parseScore(attempt.scoreJson)
    byScenario.set(
      attempt.caseId,
      foldScenarioStats(
        byScenario.get(attempt.caseId) ?? null,
        attempt.caseId,
        { total: attempt.score ?? 0, passed: score.passed === true },
        attempt.finishedAt ?? attempt.startedAt,
      ),
    )
  }
  return [...byScenario.values()]
}
