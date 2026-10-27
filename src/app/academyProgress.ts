import {
  ACADEMY_SCENARIO_TITLES,
  academyHistory,
  academyStats,
} from '../modules/academy/progress'
import type { ScoreHistoryEntry, ScenarioStats } from '../domain/progress/types'
import { getLocalDatabase } from './persistenceService'

export interface AcademyProgress {
  history: ScoreHistoryEntry[]
  stats: ScenarioStats[]
  /** Scenario id to title, for the Progress page's scenario rows. */
  titles: Record<string, string>
}

/**
 * The school desk's contribution to progress, read from its own attempts.
 *
 * One reader for every surface that needs it, so a number on Progress and a
 * number on the desk cannot come from two different queries.
 */
export async function loadAcademyProgress(): Promise<AcademyProgress> {
  const db = await getLocalDatabase()
  const attempts = await db.academy.attempts()
  return {
    history: academyHistory(attempts),
    stats: academyStats(attempts),
    titles: ACADEMY_SCENARIO_TITLES,
  }
}
