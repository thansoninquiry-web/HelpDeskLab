import type { RepositoryContext } from './context'
import { SqliteActionRepository } from './actions'
import { SqliteProgressRepository } from './progress'
import { SqliteScoreRepository } from './scores'
import { SqliteSessionRepository } from './sessions'
import { SqliteSettingsRepository } from './settings'
import { SqliteTicketRepository } from './tickets'

export interface Repositories {
  tickets: SqliteTicketRepository
  sessions: SqliteSessionRepository
  actions: SqliteActionRepository
  scores: SqliteScoreRepository
  progress: SqliteProgressRepository
  settings: SqliteSettingsRepository
}

export function createRepositories(context: RepositoryContext): Repositories {
  return {
    tickets: new SqliteTicketRepository(context),
    sessions: new SqliteSessionRepository(context),
    actions: new SqliteActionRepository(context),
    scores: new SqliteScoreRepository(context),
    progress: new SqliteProgressRepository(context),
    settings: new SqliteSettingsRepository(context),
  }
}

export type { RepositoryContext } from './context'
