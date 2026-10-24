import type { JsonValue } from './shared/json'
import type {
  RewindRecord,
  ScenarioStats,
  ScoreHistoryEntry,
  ScoredAttemptHints,
  ScoredStep,
  TakenHint,
  VerificationCheckRecord,
} from './progress/types'
import type { HintRepair } from './scoring/hints'
import type { Score } from './scoring/types'
import type { JobStatus, JobTarget } from './targets/types'
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
  /** Most recent first. Used by the curriculum, which scans lifetime history. */
  listRecent(limit: number): Promise<Session[]>
  saveWorld(id: SessionId, world: Session['world']): Promise<void>
  /**
   * Saves the close being written — the chosen code and the handoff note — so a
   * reload restores it. Null clears it; a closed session is not writable.
   */
  saveClosureDraft(id: SessionId, draft: Session['closureDraft']): Promise<void>
  /**
   * Saves where the learner was working — the pane, the console in front and the
   * tabs beside it — so reopening the ticket puts them back there. Null clears
   * it; a closed session is not writable.
   */
  saveWorkspaceLayout(
    id: SessionId,
    layout: Session['workspaceLayout'],
  ): Promise<void>
  /**
   * Saves where the learner was *inside* the consoles — the search typed in each
   * and the record left open — so a reopened ticket lands back on the machine
   * rather than on a bare list. Null clears it; a closed session is not writable.
   */
  saveConsoleFocus(
    id: SessionId,
    focus: Session['consoleFocus'],
  ): Promise<void>
  finish(
    id: SessionId,
    ending: { endedAt: number; resolution: string; outcome: SessionOutcome },
  ): Promise<void>
}

export interface ActionRepository {
  append(action: NewSessionAction): Promise<SessionAction>
  /**
   * Un-runs an attempt from `fromSeq`: the tail of the log goes, `marker` takes
   * its place, and the world that prefix folds to is written with them in one
   * transaction. The log and the world it describes have to move together —
   * half a rewind would leave an attempt whose history and machines disagree.
   */
  rewind(
    sessionId: SessionId,
    fromSeq: number,
    marker: NewSessionAction,
    world: Session['world'],
  ): Promise<void>
  /**
   * Puts back the steps a rewind dropped: the marker at `seq` goes, the steps it
   * held take its place, and the world their log folds to is written with them
   * in one transaction. `tail` is conversation the log recorded after the cut —
   * caller lines, never work — and it follows the restored steps.
   */
  reapply(
    sessionId: SessionId,
    seq: number,
    steps: readonly NewSessionAction[],
    tail: readonly NewSessionAction[],
    world: Session['world'],
  ): Promise<void>
  listBySession(sessionId: SessionId): Promise<SessionAction[]>
  /**
   * How many steps the log holds. The queue says how far into an open attempt
   * the learner had got, and counting rows is cheaper than reading them.
   */
  countBySession(sessionId: SessionId): Promise<number>
  /** Most recent first. Used by the curriculum, which scans lifetime history. */
  listRecent(limit: number): Promise<SessionAction[]>
  /**
   * Every hint the logs recorded, oldest first, reduced to the step and rung it
   * named. Used by the Progress page, which reads habits across all attempts.
   */
  listHints(): Promise<TakenHint[]>
  /**
   * Every cut the logs still hold, oldest first, joined to the family its
   * attempt was on and reduced to the step it started at. Used by the Progress
   * page, which shows where each family keeps getting un-run.
   */
  listRewinds(): Promise<RewindRecord[]>
  /**
   * Every caller check the logs hold, oldest first, reduced to the method it
   * used and whether it proved anybody. Used by the Progress page, which shows
   * which proof this desk reaches for.
   */
  listVerificationChecks(): Promise<VerificationCheckRecord[]>
}

export interface ScoreRepository {
  save(score: Score): Promise<void>
  findBySession(sessionId: SessionId): Promise<Score | null>
  listRecent(limit: number): Promise<Score[]>
  /** Every scored attempt with its scenario and category breakdown, oldest first. */
  listHistory(): Promise<ScoreHistoryEntry[]>
  /**
   * The rubric steps of every scored attempt, oldest first. A hint is logged
   * against one of these ids, so the label comes from the score it belongs to.
   */
  listScoredSteps(): Promise<ScoredStep[]>
  /**
   * How many rungs each scored attempt was charged, from the stored score. Read
   * beside the logged hints so the habit page can tell a log that lost rows from
   * a learner who took no hints. An attempt scored before hints were counted is
   * absent rather than zero.
   */
  listScoredHintCounts(): Promise<ScoredAttemptHints[]>
  /**
   * The rungs a learner rebuilt for an attempt whose log lost them, or null when
   * no repair was made. It is kept beside the score, never inside it: the
   * evaluation as written is a fact about the attempt, and the repair is a later
   * reading of what the log no longer holds.
   */
  findHintRepair(sessionId: SessionId): Promise<HintRepair | null>
  /** Stores the repair, or clears it with null. */
  saveHintRepair(sessionId: SessionId, repair: HintRepair | null): Promise<void>
}

export interface ProgressRepository {
  get(scenarioId: ScenarioId): Promise<ScenarioStats | null>
  list(): Promise<ScenarioStats[]>
  upsert(stats: ScenarioStats): Promise<void>
}

export interface JobTargetRepository {
  create(target: JobTarget): Promise<void>
  list(): Promise<JobTarget[]>
  findById(id: string): Promise<JobTarget | null>
  updateStatus(id: string, status: JobStatus, updatedAt: number): Promise<void>
  remove(id: string): Promise<void>
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
