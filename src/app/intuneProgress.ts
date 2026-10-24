import {
  INTUNE_SCENARIO_TITLES,
  intuneEvidence,
  intuneHistory,
  intuneStats,
  type IntuneEvidence,
} from '../modules/intune/progress'
import type { ScoreHistoryEntry, ScenarioStats } from '../domain/progress/types'
import { getLocalDatabase } from './persistenceService'

export interface IntuneProgress {
  history: ScoreHistoryEntry[]
  stats: ScenarioStats[]
  /** Template id to title, for the Progress page's scenario rows. */
  titles: Record<string, string>
  evidence: IntuneEvidence
}

/**
 * The Intune console's contribution to progress, read from its own tables.
 *
 * One reader for both surfaces: the Progress page and the curriculum are looking
 * at the same attempts, so a number that appears on a module card and a number in
 * the scenario table come from this call rather than two queries that could drift.
 */
export async function loadIntuneProgress(): Promise<IntuneProgress> {
  const db = await getLocalDatabase()
  const attempts = await db.intune.attempts()
  return {
    history: intuneHistory(attempts),
    stats: intuneStats(attempts),
    titles: INTUNE_SCENARIO_TITLES,
    evidence: intuneEvidence(attempts),
  }
}
