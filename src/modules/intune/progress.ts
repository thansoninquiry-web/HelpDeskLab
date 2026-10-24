import { foldScenarioStats } from '../../domain/progress/leitner'
import { attemptXp } from '../../domain/progress/xp'
import type { ScoreHistoryEntry, ScenarioStats } from '../../domain/progress/types'
import type { CategoryScore, RubricCategory, ScoreBand } from '../../domain/scoring/types'
import type { SessionId } from '../../domain/tickets/types'
import type { IntuneAttemptRecord } from './persistence/store'
import { findIntuneTemplate } from './tickets/registry'
import { INTUNE_TICKET_TEMPLATES } from './tickets/templates'

/**
 * What the Intune console contributes to progress.
 *
 * An Intune attempt is not a ticket session, so it is not written into the
 * sessions and scores tables: doing that would put a world-less attempt in the
 * practice queue and a debrief with nothing to show. It is published here as the
 * same shapes those tables produce instead, and the app merges the two feeds.
 */

/** A scenario id is the template id: unique, stable, and already in the row. */
export const INTUNE_SCENARIO_TITLES: Record<string, string> = Object.fromEntries(
  INTUNE_TICKET_TEMPLATES.map((template) => [template.id, template.title]),
)

interface StoredScore {
  band?: ScoreBand
  passed?: boolean
  resolved?: boolean
  categoryScores?: Record<RubricCategory, CategoryScore>
}

const CATEGORIES: readonly RubricCategory[] = [
  'diagnosis',
  'documentation',
  'resolution',
  'safety',
]

/**
 * The rubric split as stored, checked key by key. A row written before the
 * categories existed has none, and one written by a future version could have a
 * category this build does not know; both read as no split rather than as a
 * number Progress would then add to the wrong place.
 */
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

function finished(attempts: readonly IntuneAttemptRecord[]): IntuneAttemptRecord[] {
  return attempts
    .filter((attempt) => attempt.finishedAt !== null && attempt.score !== null)
    .sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0))
}

/** The finished attempts as scored-attempt history, for XP, rank and streaks. */
export function intuneHistory(attempts: readonly IntuneAttemptRecord[]): ScoreHistoryEntry[] {
  return finished(attempts).map((attempt) => {
    const template = findIntuneTemplate(attempt.templateId)
    const score = parseScore(attempt.scoreJson)
    const passed = score.passed === true
    return {
      sessionId: `intune:${attempt.id}` as SessionId,
      scenarioId: attempt.templateId,
      variantId: attempt.templateId,
      total: attempt.score ?? 0,
      passed,
      computedAt: attempt.finishedAt ?? attempt.startedAt,
      xp: attemptXp({
        difficulty: template?.difficulty ?? 1,
        passed,
        band: score.band ?? (passed ? 'pass' : 'fail'),
      }),
      categoryScores: categoryScoresOf(score.categoryScores),
    }
  })
}

/**
 * The attempts folded into scenario stats, oldest first, so the box the learner
 * is in and the date they are next due follow the same rule as every family.
 */
export function intuneStats(attempts: readonly IntuneAttemptRecord[]): ScenarioStats[] {
  const byScenario = new Map<string, ScenarioStats>()
  for (const attempt of finished(attempts)) {
    const score = parseScore(attempt.scoreJson)
    const current = byScenario.get(attempt.templateId) ?? null
    byScenario.set(
      attempt.templateId,
      foldScenarioStats(
        current,
        attempt.templateId,
        { total: attempt.score ?? 0, passed: score.passed === true },
        attempt.finishedAt ?? attempt.startedAt,
      ),
    )
  }
  return [...byScenario.values()]
}

export interface IntuneEvidence {
  /** Attempts where the estate agreed the ticket was actually resolved. */
  resolved: number
  passed: number
}

export function intuneEvidence(attempts: readonly IntuneAttemptRecord[]): IntuneEvidence {
  let resolved = 0
  let passed = 0
  for (const attempt of finished(attempts)) {
    const score = parseScore(attempt.scoreJson)
    if (score.resolved === true) {
      resolved += 1
    }
    if (score.passed === true) {
      passed += 1
    }
  }
  return { resolved, passed }
}
