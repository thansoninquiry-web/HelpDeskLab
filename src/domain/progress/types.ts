import type { ScenarioId } from '../tickets/types'

export type LeitnerBox = 1 | 2 | 3 | 4 | 5

export interface ScenarioStats {
  scenarioId: ScenarioId
  attempts: number
  passes: number
  bestScore: number
  lastPlayedAt: number | null
  leitnerBox: LeitnerBox
  dueAt: number | null
}
