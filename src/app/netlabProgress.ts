import {
  NETLAB_SCENARIO_TITLES,
  netlabHistory,
  netlabStats,
} from '../modules/netlab/progress'
import type { ScoreHistoryEntry, ScenarioStats } from '../domain/progress/types'
import { getLocalDatabase } from './persistenceService'

export interface NetlabProgress {
  history: ScoreHistoryEntry[]
  stats: ScenarioStats[]
  /** Incident id to title, for the Progress page's scenario rows. */
  titles: Record<string, string>
}

/**
 * The lab's contribution to progress, read from its own attempts.
 *
 * One reader for every surface that needs it, so a number on Progress and a
 * number in the lab cannot be two different queries.
 */
export async function loadNetlabProgress(): Promise<NetlabProgress> {
  const db = await getLocalDatabase()
  const attempts = await db.netlab.attempts()
  return {
    history: netlabHistory(attempts),
    stats: netlabStats(attempts),
    titles: NETLAB_SCENARIO_TITLES,
  }
}
