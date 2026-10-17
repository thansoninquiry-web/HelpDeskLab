import type { CategoryScore, RubricCategory } from '../scoring/types'
import type { ScenarioId } from '../tickets/types'

export type LeitnerBox = 1 | 2 | 3 | 4 | 5

/** One scored attempt, joined to the scenario it belongs to. */
export interface ScoreHistoryEntry {
  scenarioId: ScenarioId
  variantId: string
  total: number
  passed: boolean
  computedAt: number
  categoryScores: Record<RubricCategory, CategoryScore> | null
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
