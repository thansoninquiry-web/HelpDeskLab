import type { CategoryScore, RubricCategory } from '../scoring/types'
import type { ScenarioId, SessionId } from '../tickets/types'

export type LeitnerBox = 1 | 2 | 3 | 4 | 5

/** One scored attempt, joined to the scenario it belongs to. */
export interface ScoreHistoryEntry {
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

/** One hint from a log, reduced to the step it unstuck and the rung it was. */
export interface TakenHint {
  sessionId: SessionId
  itemId: string
  /** 0-based rung; actions written before ladders existed were the first rung. */
  hintIndex: number
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
