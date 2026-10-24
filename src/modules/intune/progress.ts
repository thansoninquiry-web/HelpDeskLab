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
  /** The scored steps, as the score panel prints them. */
  items?: readonly { id?: unknown; passed?: unknown }[]
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

/** A category the attempt took every mark in, and one that offered marks at all. */
function isFull(score: CategoryScore | undefined): boolean {
  return score !== undefined && score.possible > 0 && score.earned >= score.possible
}

export interface IntuneEvidence {
  /** Attempts where the estate agreed the ticket was actually resolved. */
  resolved: number
  passed: number
  /** Attempts that read the record before the first fix. */
  readBeforeFix: number
  /**
   * Distinct lifecycle templates passed, not attempts: the course's capstone
   * asks for three different decisions, and re-passing one ticket is not three.
   */
  lifecycleDecisions: number
  /** Passes split by template, for a requirement that is one particular ticket. */
  passesByTemplate: Record<string, number>
  /** Attempts with every diagnostic mark, which means a read before the fix. */
  perfectDiagnosis: number
  /** Attempts that destroyed nothing the ticket did not ask for. */
  perfectSafety: number
}

/**
 * Everything the coursework can be judged on, folded from the stored scores.
 * The attempt row keeps the score panel's own JSON, so a requirement can read the
 * work the learner actually did — the read step, the category split, the safety
 * mark — rather than counting attempts at the module's door.
 */
export function intuneEvidence(attempts: readonly IntuneAttemptRecord[]): IntuneEvidence {
  const lifecycleTemplates = new Set<string>()
  const passesByTemplate: Record<string, number> = {}
  let resolved = 0
  let passed = 0
  let readBeforeFix = 0
  let perfectDiagnosis = 0
  let perfectSafety = 0

  for (const attempt of finished(attempts)) {
    const score = parseScore(attempt.scoreJson)
    if (score.resolved === true) {
      resolved += 1
    }
    if (score.items?.some((item) => item.id === 'read-first' && item.passed === true)) {
      readBeforeFix += 1
    }

    const categories = categoryScoresOf(score.categoryScores)
    if (isFull(categories?.diagnosis)) {
      perfectDiagnosis += 1
    }
    if (isFull(categories?.safety)) {
      perfectSafety += 1
    }

    if (score.passed === true) {
      passed += 1
      passesByTemplate[attempt.templateId] = (passesByTemplate[attempt.templateId] ?? 0) + 1
      if (findIntuneTemplate(attempt.templateId)?.category === 'lifecycle') {
        lifecycleTemplates.add(attempt.templateId)
      }
    }
  }

  return {
    resolved,
    passed,
    readBeforeFix,
    lifecycleDecisions: lifecycleTemplates.size,
    passesByTemplate,
    perfectDiagnosis,
    perfectSafety,
  }
}
