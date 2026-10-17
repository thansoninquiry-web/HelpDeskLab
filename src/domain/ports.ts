import type { JsonValue } from './shared/json'
import type { ScenarioStats } from './progress/types'
import type { Score } from './scoring/types'
import type {
  NewSessionAction,
  ScenarioId,
  Session,
  SessionAction,
  SessionId,
  SessionOutcome,
  Ticket,
  TicketId,
  TicketStatus,
} from './tickets/types'

export interface TicketRepository {
  create(ticket: Ticket): Promise<void>
  findById(id: TicketId): Promise<Ticket | null>
  listRecent(limit: number): Promise<Ticket[]>
  updateStatus(id: TicketId, status: TicketStatus): Promise<void>
}

export interface SessionRepository {
  create(session: Session): Promise<void>
  findById(id: SessionId): Promise<Session | null>
  findActive(): Promise<Session | null>
  listByTicket(ticketId: TicketId): Promise<Session[]>
  saveWorld(id: SessionId, world: Session['world']): Promise<void>
  finish(
    id: SessionId,
    ending: { endedAt: number; resolution: string; outcome: SessionOutcome },
  ): Promise<void>
}

export interface ActionRepository {
  append(action: NewSessionAction): Promise<SessionAction>
  listBySession(sessionId: SessionId): Promise<SessionAction[]>
}

export interface ScoreRepository {
  save(score: Score): Promise<void>
  findBySession(sessionId: SessionId): Promise<Score | null>
  listRecent(limit: number): Promise<Score[]>
}

export interface ProgressRepository {
  get(scenarioId: ScenarioId): Promise<ScenarioStats | null>
  list(): Promise<ScenarioStats[]>
  upsert(stats: ScenarioStats): Promise<void>
}

export interface SettingsRepository {
  get(key: string): Promise<JsonValue | null>
  set(key: string, value: JsonValue): Promise<void>
  list(): Promise<Array<{ key: string; value: JsonValue }>>
}

/** Durable bytes behind the SQLite database (IndexedDB in the browser). */
export interface SnapshotStore {
  load(): Promise<Uint8Array | null>
  save(bytes: Uint8Array): Promise<void>
  saveBackup(bytes: Uint8Array): Promise<void>
  loadBackup(): Promise<Uint8Array | null>
  clear(): Promise<void>
}

/** Backup operations exposed to the app layer. */
export interface BackupStore {
  exportDatabase(): Promise<Uint8Array>
  importDatabase(bytes: Uint8Array): Promise<void>
  resetDatabase(): Promise<void>
}
