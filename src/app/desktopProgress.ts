import {
  DESKTOP_SCENARIO_TITLES,
  desktopHistory,
  desktopStats,
} from '../modules/desktop/progress'
import type { ScoreHistoryEntry, ScenarioStats } from '../domain/progress/types'
import { getLocalDatabase } from './persistenceService'

export interface DesktopProgress {
  history: ScoreHistoryEntry[]
  stats: ScenarioStats[]
  /** Case id to title, for the Progress page's scenario rows. */
  titles: Record<string, string>
}

/**
 * The bench's contribution to progress, read from its own attempts.
 *
 * One reader for every surface that needs it, so a number on Progress and a
 * number on the bench cannot come from two different queries.
 */
export async function loadDesktopProgress(): Promise<DesktopProgress> {
  const db = await getLocalDatabase()
  const attempts = await db.desktop.attempts()
  return {
    history: desktopHistory(attempts),
    stats: desktopStats(attempts),
    titles: DESKTOP_SCENARIO_TITLES,
  }
}
