import type { RepositoryContext } from './context'
import { SqliteActionRepository } from './actions'
import { SqliteProgressRepository } from './progress'
import { SqliteScoreRepository } from './scores'
import { SqliteSessionRepository } from './sessions'
import { SqliteSettingsRepository } from './settings'
import { SqliteJobTargetRepository } from './targets'
import { SqliteTicketRepository } from './tickets'

export interface Repositories {
  tickets: SqliteTicketRepository
  sessions: SqliteSessionRepository
  actions: SqliteActionRepository
  scores: SqliteScoreRepository
  progress: SqliteProgressRepository
  settings: SqliteSettingsRepository
  targets: SqliteJobTargetRepository
}

export function createRepositories(context: RepositoryContext): Repositories {
  return {
    tickets: new SqliteTicketRepository(context),
    sessions: new SqliteSessionRepository(context),
    actions: new SqliteActionRepository(context),
    scores: new SqliteScoreRepository(context),
    progress: new SqliteProgressRepository(context),
    settings: new SqliteSettingsRepository(context),
    targets: new SqliteJobTargetRepository(context),
  }
}

export type { RepositoryContext } from './context'
