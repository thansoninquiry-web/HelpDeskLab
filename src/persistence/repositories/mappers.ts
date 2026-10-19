import { isJsonObject, type JsonObject, type JsonValue } from '../../domain/shared/json'
import type {
  LeitnerBox,
  ScenarioStats,
  ScoreHistoryEntry,
  ScoredStep,
  TakenHint,
} from '../../domain/progress/types'
import { hintPricingJson, normalizeHintPricing } from '../../domain/scoring/policy'
import type { Score, ScoreBand } from '../../domain/scoring/types'
import { JOB_STATUSES, type JobStatus, type JobTarget } from '../../domain/targets/types'
import type {
  ActionKind,
  Session,
  SessionAction,
  SessionOutcome,
  Ticket,
  TicketStatus,
} from '../../domain/tickets/types'
import { DataCorruptionError } from '../errors'
import type { Row, SqlValue } from '../sqlite'

function expectText(row: Row, column: string, table: string): string {
  const value = row[column]
  if (typeof value !== 'string') {
    throw new DataCorruptionError(`${table}.${column} is not text`)
  }
  return value
}

function expectNullableText(row: Row, column: string, table: string): string | null {
  const value = row[column]
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    throw new DataCorruptionError(`${table}.${column} is not text`)
  }
  return value
}

function expectInteger(row: Row, column: string, table: string): number {
  const value = row[column]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DataCorruptionError(`${table}.${column} is not an integer`)
  }
  return value
}

function expectNullableInteger(row: Row, column: string, table: string): number | null {
  const value = row[column]
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DataCorruptionError(`${table}.${column} is not an integer`)
  }
  return value
}

function expectBoolean(row: Row, column: string, table: string): boolean {
  const value = expectInteger(row, column, table)
  if (value !== 0 && value !== 1) {
    throw new DataCorruptionError(`${table}.${column} is not a boolean`)
  }
  return value === 1
}

function parseJson(text: SqlValue, where: string): JsonValue {
  if (typeof text !== 'string') {
    throw new DataCorruptionError(`${where} is not stored as JSON text`)
  }
  try {
    return JSON.parse(text) as JsonValue
  } catch (error) {
    throw new DataCorruptionError(`${where} contains invalid JSON`, { cause: error })
  }
}

export function parseJsonObject(text: SqlValue, where: string): JsonObject {
  const parsed = parseJson(text, where)
  if (!isJsonObject(parsed)) {
    throw new DataCorruptionError(`${where} does not contain a JSON object`)
  }
  return parsed
}

export function parseJsonValue(text: SqlValue, where: string): JsonValue {
  return parseJson(text, where)
}

function oneOf<T extends string>(value: string, allowed: readonly T[], where: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new DataCorruptionError(`${where} has an unexpected value: ${value}`)
  }
  return value as T
}

export function mapTicket(row: Row): Ticket {
  const difficulty = expectInteger(row, 'difficulty', 'tickets')
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) {
    throw new DataCorruptionError(`tickets.difficulty has an unexpected value: ${difficulty}`)
  }
  return {
    id: expectText(row, 'id', 'tickets'),
    scenarioId: expectText(row, 'scenario_id', 'tickets'),
    variantId: expectText(row, 'variant_id', 'tickets'),
    difficulty,
    seed: expectInteger(row, 'seed', 'tickets'),
    signature: expectText(row, 'signature', 'tickets'),
    publicContent: parseJsonObject(row.public_json ?? null, 'tickets.public_json'),
    createdAt: expectInteger(row, 'created_at', 'tickets'),
    status: oneOf(
      expectText(row, 'status', 'tickets'),
      ['available', 'in_progress', 'completed'] as const,
      'tickets.status',
    ) satisfies TicketStatus,
  }
}

export function mapSession(row: Row): Session {
  const rawOutcome = expectNullableText(row, 'outcome', 'sessions')
  const rawPolicy = expectNullableText(row, 'hint_policy_json', 'sessions')
  const rawDraft = expectNullableText(row, 'closure_draft_json', 'sessions')
  return {
    id: expectText(row, 'id', 'sessions'),
    ticketId: expectText(row, 'ticket_id', 'sessions'),
    startedAt: expectInteger(row, 'started_at', 'sessions'),
    endedAt: expectNullableInteger(row, 'ended_at', 'sessions'),
    world: parseJsonObject(row.world_json ?? null, 'sessions.world_json'),
    // The column holds the pricing, not only the numbers: the price this
    // attempt paid and where it came from, so a debrief months later can say a
    // family price applied rather than the default. A row written before that
    // was recorded holds the bare policy and reads as the default price.
    hintPolicy:
      rawPolicy === null
        ? null
        : hintPricingJson(
            normalizeHintPricing(parseJsonValue(rawPolicy, 'sessions.hint_policy_json')),
          ),
    closureDraft:
      rawDraft === null
        ? null
        : parseJsonObject(rawDraft, 'sessions.closure_draft_json'),
    examMode: expectBoolean(row, 'exam_mode', 'sessions'),
    resolution: expectNullableText(row, 'resolution', 'sessions'),
    outcome: rawOutcome === null
      ? null
      : oneOf(rawOutcome, ['resolved', 'abandoned'] as const, 'sessions.outcome') satisfies SessionOutcome,
  }
}

export function mapAction(row: Row): SessionAction {
  return {
    id: expectInteger(row, 'id', 'actions'),
    sessionId: expectText(row, 'session_id', 'actions'),
    seq: expectInteger(row, 'seq', 'actions'),
    atMs: expectInteger(row, 'at_ms', 'actions'),
    kind: oneOf(
      expectText(row, 'kind', 'actions'),
      [
        'command',
        'ask-user',
        'verify-caller',
        'deny-caller',
        'note',
        'hint',
        'code-sent',
        'rewind',
      ] as const,
      'actions.kind',
    ) satisfies ActionKind,
    input: parseJsonObject(row.input_json ?? null, 'actions.input_json'),
    output: parseJsonObject(row.output_json ?? null, 'actions.output_json'),
  }
}

export function mapScore(row: Row): Score {
  return {
    sessionId: expectText(row, 'session_id', 'scores'),
    total: expectInteger(row, 'total', 'scores'),
    passed: expectBoolean(row, 'passed', 'scores'),
    band: oneOf(expectText(row, 'band', 'scores'), ['fail', 'pass', 'strong'] as const, 'scores.band') satisfies ScoreBand,
    rubric: parseJsonObject(row.rubric_json ?? null, 'scores.rubric_json'),
    computedAt: expectInteger(row, 'computed_at', 'scores'),
  }
}

const RUBRIC_CATEGORIES = ['diagnosis', 'documentation', 'resolution', 'safety'] as const

function parseCategoryScores(
  value: JsonValue | undefined,
): ScoreHistoryEntry['categoryScores'] {
  if (!isJsonObject(value)) {
    return null
  }

  const scores: Partial<Record<(typeof RUBRIC_CATEGORIES)[number], { earned: number; possible: number }>> = {}
  for (const category of RUBRIC_CATEGORIES) {
    const entry = value[category]
    if (!isJsonObject(entry)) {
      return null
    }
    const earned = entry.earned
    const possible = entry.possible
    if (typeof earned !== 'number' || typeof possible !== 'number') {
      return null
    }
    scores[category] = { earned, possible }
  }

  return {
    diagnosis: scores.diagnosis ?? { earned: 0, possible: 0 },
    documentation: scores.documentation ?? { earned: 0, possible: 0 },
    resolution: scores.resolution ?? { earned: 0, possible: 0 },
    safety: scores.safety ?? { earned: 0, possible: 0 },
  }
}

export function mapScoreHistory(row: Row): ScoreHistoryEntry {
  const rubric = parseJsonObject(row.rubric_json ?? null, 'scores.rubric_json')
  const storedXp = rubric.xp
  return {
    scenarioId: expectText(row, 'scenario_id', 'tickets'),
    variantId: expectText(row, 'variant_id', 'tickets'),
    total: expectInteger(row, 'total', 'scores'),
    passed: expectBoolean(row, 'passed', 'scores'),
    computedAt: expectInteger(row, 'computed_at', 'scores'),
    xp:
      typeof storedXp === 'number' && Number.isFinite(storedXp)
        ? Math.max(0, Math.round(storedXp))
        : 0,
    categoryScores: parseCategoryScores(rubric.categoryScores),
  }
}

/**
 * The rubric steps a score kept, in the order its rubric listed them. A score
 * written before the rubric was stored has none, and simply contributes no
 * steps rather than failing the whole Progress page.
 */
export function mapScoredSteps(row: Row): ScoredStep[] {
  const sessionId = expectText(row, 'session_id', 'scores')
  const rubric = parseJsonObject(row.rubric_json ?? null, 'scores.rubric_json')
  const items = rubric.items
  if (!Array.isArray(items)) {
    return []
  }

  return items.flatMap((item) => {
    if (!isJsonObject(item)) {
      return []
    }
    const id = item.id
    const label = item.label
    return typeof id === 'string' && id.length > 0 && typeof label === 'string' && label.length > 0
      ? [{ sessionId, itemId: id, label }]
      : []
  })
}

/**
 * One logged hint, reduced to the step and rung it named. Null when the row
 * names no step: that hint cannot be attributed to a rubric item, so it is left
 * out of the habit rather than guessed at.
 */
export function mapTakenHint(row: Row): TakenHint | null {
  const sessionId = expectText(row, 'session_id', 'actions')
  const input = parseJsonObject(row.input_json ?? null, 'actions.input_json')
  const itemId = input.itemId
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return null
  }

  const rawIndex = input.hintIndex
  const hintIndex =
    typeof rawIndex === 'number' && Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0
  return { sessionId, itemId, hintIndex }
}

export function mapJobTarget(row: Row): JobTarget {
  return {
    id: expectText(row, 'id', 'job_targets'),
    company: expectText(row, 'company', 'job_targets'),
    title: expectText(row, 'title', 'job_targets'),
    url: expectText(row, 'url', 'job_targets'),
    appliedOn: expectNullableText(row, 'applied_on', 'job_targets'),
    status: oneOf(
      expectText(row, 'status', 'job_targets'),
      JOB_STATUSES,
      'job_targets.status',
    ) satisfies JobStatus,
    rawDescription: expectText(row, 'raw_description', 'job_targets'),
    createdAt: expectInteger(row, 'created_at', 'job_targets'),
    updatedAt: expectInteger(row, 'updated_at', 'job_targets'),
  }
}

export function mapScenarioStats(row: Row): ScenarioStats {
  const leitnerBox = expectInteger(row, 'leitner_box', 'scenario_stats')
  if (leitnerBox < 1 || leitnerBox > 5) {
    throw new DataCorruptionError(`scenario_stats.leitner_box has an unexpected value: ${leitnerBox}`)
  }
  return {
    scenarioId: expectText(row, 'scenario_id', 'scenario_stats'),
    attempts: expectInteger(row, 'attempts', 'scenario_stats'),
    passes: expectInteger(row, 'passes', 'scenario_stats'),
    bestScore: expectInteger(row, 'best_score', 'scenario_stats'),
    lastPlayedAt: expectNullableInteger(row, 'last_played_at', 'scenario_stats'),
    leitnerBox: leitnerBox as LeitnerBox,
    dueAt: expectNullableInteger(row, 'due_at', 'scenario_stats'),
  }
}
