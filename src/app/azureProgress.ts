import {
  AZURE_SCENARIO_TITLES,
  azureEvidence,
  azureHistory,
  azureStats,
  type AzureEvidence,
} from '../modules/azure/progress'
import type { ScoreHistoryEntry, ScenarioStats } from '../domain/progress/types'
import { getLocalDatabase } from './persistenceService'

export interface AzureProgress {
  history: ScoreHistoryEntry[]
  stats: ScenarioStats[]
  /** Template id to title, for the Progress page's scenario rows. */
  titles: Record<string, string>
  evidence: AzureEvidence
}

/**
 * The Azure console's contribution to progress, read from its own tables.
 *
 * One reader for both surfaces: the Progress page and the curriculum are looking
 * at the same attempts, so a number that appears on a module card and a number in
 * the scenario table come from this call rather than two queries that could drift.
 */
export async function loadAzureProgress(): Promise<AzureProgress> {
  const db = await getLocalDatabase()
  const attempts = await db.azure.attempts()
  return {
    history: azureHistory(attempts),
    stats: azureStats(attempts),
    titles: AZURE_SCENARIO_TITLES,
    evidence: azureEvidence(attempts),
  }
}
