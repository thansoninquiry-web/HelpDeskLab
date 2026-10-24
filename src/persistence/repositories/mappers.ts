import { isJsonObject, type JsonObject, type JsonValue } from '../../domain/shared/json'
import type {
  LeitnerBox,
  RewindRecord,
  ScenarioStats,
  ScoreHistoryEntry,
  ScoredAttemptHints,
  ScoredStep,
  TakenHint,
  UnrunStep,
  VerificationCheckRecord,
} from '../../domain/progress/types'
import { VERIFICATION_METHODS } from '../../domain/progress/verification'
import type { VerificationMethod } from '../../domain/environment/types'
import { hintPricingJson, normalizeHintPricing } from '../../domain/scoring/policy'
import type { Score, ScoreBand } from '../../domain/scoring/types'
import { JOB_STATUSES, type JobStatus, type JobTarget } from '../../domain/targets/types'
import {
  ACTION_KINDS,
  type ActionKind,
  type Session,
  type SessionAction,
  type SessionOutcome,
  type Ticket,
  type TicketStatus,
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
  const rawLayout = expectNullableText(row, 'workspace_layout_json', 'sessions')
  const rawFocus = expectNullableText(row, 'console_focus_json', 'sessions')
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
    // Stored as written and read back through `normalizeWorkspaceLayout`, which
    // is where a console this build no longer offers is dropped.
    workspaceLayout:
      rawLayout === null
        ? null
        : parseJsonObject(rawLayout, 'sessions.workspace_layout_json'),
    // Stored as written and read back through `normalizeConsoleFocus`, which is
    // where a console this build no longer offers is dropped.
    consoleFocus:
      rawFocus === null ? null : parseJsonObject(rawFocus, 'sessions.console_focus_json'),
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
    // Rows written before the column existed read as null, which the caller's
    // stall clock treats as "no wall time recorded" rather than as a time.
    wallMs: expectNullableInteger(row, 'wall_ms', 'actions'),
    // Read from the domain's list rather than repeated here: a kind added to the
    // log without being added to the mapper would be written and then unreadable.
    kind: oneOf(expectText(row, 'kind', 'actions'), ACTION_KINDS, 'actions.kind') satisfies ActionKind,
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
    sessionId: expectText(row, 'session_id', 'scores'),
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
 * The rung count a score charged, when it kept one. A score written before hints
 * were counted has no number, and contributes nothing rather than a zero: an
 * absent count must not read as "took no hints".
 */
export function mapScoredHintCounts(row: Row): ScoredAttemptHints[] {
  const sessionId = expectText(row, 'session_id', 'scores')
  const rubric = parseJsonObject(row.rubric_json ?? null, 'scores.rubric_json')
  const hintsUsed = rubric.hintsUsed
  if (typeof hintsUsed !== 'number' || !Number.isInteger(hintsUsed) || hintsUsed < 0) {
    return []
  }
  return [{ sessionId, hintsUsed }]
}

/**
 * One logged caller check, reduced to its method and outcome. Null when the row
 * names no method this build offers: a check whose proof cannot be named is not
 * put on a row rather than guessed at.
 *
 * `proved` follows the scorer's own rule: a check proves the person on the
 * ticket when it did not fail and did not prove somebody else — a colleague
 * answering a shared line is recorded as a check that proved nobody on it.
 */
export function mapVerificationCheck(row: Row): VerificationCheckRecord | null {
  const sessionId = expectText(row, 'session_id', 'actions')
  const input = parseJsonObject(row.input_json ?? null, 'actions.input_json')
  const method = input.method
  if (
    typeof method !== 'string' ||
    !VERIFICATION_METHODS.includes(method as VerificationMethod)
  ) {
    return null
  }

  const output = parseJsonObject(row.output_json ?? null, 'actions.output_json')
  return {
    sessionId,
    method: method as VerificationMethod,
    proved: output.verified !== false && output.provesCaller !== false,
  }
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

/**
 * The step a rewind marker started at: the first step it dropped. A marker
 * written before the steps were kept names none, and contributes its count
 * alone rather than failing the whole Progress page.
 */
function readUnrunStep(value: unknown): UnrunStep | null {
  if (!isJsonObject(value)) {
    return null
  }
  const kind = value.kind
  if (typeof kind !== 'string' || kind.length === 0) {
    return null
  }
  const command = value.input
  const noteKind = isJsonObject(command) ? command.noteKind : null
  return {
    kind,
    command: isJsonObject(command) && typeof command.command === 'string' ? command.command : null,
    noteKind: typeof noteKind === 'string' && noteKind.length > 0 ? noteKind : null,
  }
}

/**
 * One rewind from the log, joined to the family its attempt was on. The steps
 * the cut took are kept inside the marker's input, so the log itself says what
 * was un-run without reading the attempt again.
 */
export function mapRewind(row: Row): RewindRecord {
  const input = parseJsonObject(row.input_json ?? null, 'actions.input_json')
  const removed = Array.isArray(input.removed) ? input.removed : []
  const rawDropped = input.dropped

  return {
    sessionId: expectText(row, 'session_id', 'actions'),
    scenarioId: expectText(row, 'scenario_id', 'tickets'),
    atMs: expectInteger(row, 'at_ms', 'actions'),
    dropped:
      typeof rawDropped === 'number' && Number.isFinite(rawDropped)
        ? Math.max(0, Math.round(rawDropped))
        : removed.length,
    boundary: readUnrunStep(removed[0]),
  }
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
