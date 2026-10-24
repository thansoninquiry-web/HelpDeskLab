import type { VerificationMethod } from '../environment/types'
import type { CategoryScore, RubricCategory } from '../scoring/types'
import type { ScenarioId, SessionId } from '../tickets/types'

export type LeitnerBox = 1 | 2 | 3 | 4 | 5

/** One scored attempt, joined to the scenario it belongs to. */
export interface ScoreHistoryEntry {
  /**
   * The attempt the score belongs to. The score can be read beside the log and
   * the world it was scored against, which is how a module asks anything of the
   * attempt that its family does not already say.
   */
  sessionId: SessionId
  scenarioId: ScenarioId
  variantId: string
  total: number
  passed: boolean
  computedAt: number
  /** XP awarded for this attempt, as stored by the evaluator. */
  xp: number
  categoryScores: Record<RubricCategory, CategoryScore> | null
}

/**
 * One rubric step of a scored attempt, kept for the per-step hint habit. Only
 * what the summary reads is here: the id the log names, its label, and the
 * attempt it was scored in.
 */
export interface ScoredStep {
  sessionId: SessionId
  itemId: string
  label: string
}

/**
 * How many rungs one scored attempt was charged, as the score itself stored it.
 *
 * Kept apart from the log because the two can disagree: a log that was pruned,
 * restored without its rows, or lost after scoring no longer says how many hints
 * were taken, while the score still knows what it charged. Reading only the log
 * would under-count that attempt without saying so.
 */
export interface ScoredAttemptHints {
  sessionId: SessionId
  hintsUsed: number
}

/**
 * One caller check from a log, reduced to the method it used and whether it
 * proved anybody. Kept as the log wrote it: the method is what the desk chose,
 * and a check that a colleague answered proved a different person.
 */
export interface VerificationCheckRecord {
  sessionId: SessionId
  method: VerificationMethod
  proved: boolean
}

/** One hint from a log, reduced to the step it unstuck and the rung it was. */
export interface TakenHint {
  sessionId: SessionId
  itemId: string
  /** 0-based rung; actions written before ladders existed were the first rung. */
  hintIndex: number
}

/**
 * The step a rewind started at, as the log kept it. A rewind un-runs the step
 * the learner was on and everything after it, so this is the step they decided
 * to take back — the one to look at when a family keeps getting rewound.
 */
export interface UnrunStep {
  /** The action kind the dropped step had. */
  kind: string
  /** The command line typed, for a command step. */
  command: string | null
  /** The panel a note was written in, for a note step. */
  noteKind: string | null
}

/**
 * One rewind in the log, joined to the family its attempt was on. A cut that was
 * put back is not here: putting one back deletes the marker and restores the
 * steps, so this is the rewinding the learner kept.
 */
export interface RewindRecord {
  sessionId: SessionId
  scenarioId: ScenarioId
  atMs: number
  /** Steps the cut dropped, including the one it started at. */
  dropped: number
  /** The step the cut started at, or null when the log did not keep it. */
  boundary: UnrunStep | null
}

export interface ScenarioStats {
  scenarioId: ScenarioId
  attempts: number
  passes: number
  bestScore: number
  lastPlayedAt: number | null
  leitnerBox: LeitnerBox
  dueAt: number | null
}
