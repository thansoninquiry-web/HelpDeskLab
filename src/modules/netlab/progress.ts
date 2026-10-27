import { foldScenarioStats } from '../../domain/progress/leitner'
import { attemptXp } from '../../domain/progress/xp'
import type { ScoreHistoryEntry, ScenarioStats } from '../../domain/progress/types'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../domain/scoring/types'
import type { SessionId } from '../../domain/tickets/types'
import { INCIDENTS } from './data/incidents'
import type { NetlabAttemptRecord } from './persistence/store'

/**
 * What the Networking Lab contributes to progress.
 *
 * A lab attempt is not a ticket session, so it is never written into `sessions`
 * or `scores`: a session with no world would appear in the practice queue and
 * open a debrief with nothing to show. It is published in the same shapes those
 * tables produce instead, and the app merges the feeds — which is how one
 * incident's score joins rank, streaks, weak topics and the simulator filter.
 */

export const NETLAB_SCENARIO_TITLES: Record<string, string> = Object.fromEntries(
  INCIDENTS.map((incident) => [incident.id, incident.title]),
)

interface StoredScore {
  band?: ScoreBand
  passed?: boolean
  resolved?: boolean
  categoryScores?: Record<RubricCategory, CategoryScore>
  items?: readonly { id?: unknown; passed?: unknown }[]
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

function difficultyOf(incidentId: string): 1 | 2 | 3 {
  return INCIDENTS.find((incident) => incident.id === incidentId)?.difficulty ?? 1
}

function finished(attempts: readonly NetlabAttemptRecord[]): NetlabAttemptRecord[] {
  return attempts
    .filter((attempt) => attempt.finishedAt !== null && attempt.score !== null)
    .sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0))
}

export function netlabHistory(attempts: readonly NetlabAttemptRecord[]): ScoreHistoryEntry[] {
  return finished(attempts).map((attempt) => {
    const score = parseScore(attempt.scoreJson)
    const passed = score.passed === true
    return {
      sessionId: `netlab:${attempt.id}` as SessionId,
      scenarioId: attempt.incidentId,
      variantId: attempt.incidentId,
      total: attempt.score ?? 0,
      passed,
      computedAt: attempt.finishedAt ?? attempt.startedAt,
      xp: attemptXp({
        difficulty: difficultyOf(attempt.incidentId),
        passed,
        band: score.band ?? (passed ? 'pass' : 'fail'),
      }),
      categoryScores: categoryScoresOf(score.categoryScores),
    }
  })
}

export function netlabStats(attempts: readonly NetlabAttemptRecord[]): ScenarioStats[] {
  const byScenario = new Map<string, ScenarioStats>()
  for (const attempt of finished(attempts)) {
    const score = parseScore(attempt.scoreJson)
    byScenario.set(
      attempt.incidentId,
      foldScenarioStats(
        byScenario.get(attempt.incidentId) ?? null,
        attempt.incidentId,
        { total: attempt.score ?? 0, passed: score.passed === true },
        attempt.finishedAt ?? attempt.startedAt,
      ),
    )
  }
  return [...byScenario.values()]
}
