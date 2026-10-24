import type { ScoreBand } from '../scoring/types'

export interface XpInput {
  difficulty: 1 | 2 | 3
  passed: boolean
  band: ScoreBand
}

/**
 * XP for one scored attempt.
 *
 * Moved out of the evaluator so a surface that scores outside a ticket session —
 * the Intune console — earns on exactly the same terms: harder tickets pay more,
 * closing pays more than trying, and a strong attempt pays a bonus.
 */
export function attemptXp({ difficulty, passed, band }: XpInput): number {
  return difficulty * 30 + (passed ? 40 : 10) + (band === 'strong' ? 30 : 0)
}
