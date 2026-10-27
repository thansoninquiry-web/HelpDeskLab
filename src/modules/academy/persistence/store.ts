import type { SqliteDriver } from '../../../persistence/sqlite'
import {
  CHANGES,
  READS,
} from '../data/catalog'
import {
  VISIT_CHECKLIST,
  type AcademyMode,
  type AttemptState,
  type ChangeId,
  type ChangeRecord,
  type ChecklistId,
  type ChecklistRecord,
  type DialogRecord,
  type ReadId,
  type ReadRecord,
  type TriageRecord,
} from '../types'

/**
 * The desk's only view of the database.
 *
 * One row per visit: the reads, the changes, the conversation, the walk-up and
 * the visit checklist are one ordered story, and the score reads that story.
 * The school and its scenarios are code, so nothing here describes a room.
 */

export interface AcademyDatabase {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}

export interface AcademyAttemptRecord {
  id: string
  scenarioId: string
  startedAt: number
  finishedAt: number | null
  score: number | null
  scoreJson: string | null
  state: AttemptState
}

const READ_IDS = Object.keys(READS) as readonly string[]
const CHANGE_IDS = Object.keys(CHANGES) as readonly string[]
const CHECKLIST_IDS = VISIT_CHECKLIST.map((entry) => entry.id) as readonly string[]
const MODES: readonly string[] = ['standard', 'rush']

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function emptyState(mode: AcademyMode = 'standard'): AttemptState {
  return { mode, reads: [], changes: [], dialog: [], triage: null, checklist: [] }
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Reads the stored story back, rejecting anything that is not the shape it wrote. */
function stateOf(value: unknown): AttemptState {
  const raw = parseJson<Partial<AttemptState>>(value, {})
  const isRead = (id: unknown): id is ReadId =>
    typeof id === 'string' && READ_IDS.includes(id)
  const isChange = (id: unknown): id is ChangeId =>
    typeof id === 'string' && CHANGE_IDS.includes(id)
  const isChecklist = (id: unknown): id is ChecklistId =>
    typeof id === 'string' && CHECKLIST_IDS.includes(id)

  const reads = Array.isArray(raw.reads)
    ? raw.reads.filter(
        (record): record is ReadRecord =>
          typeof record === 'object' &&
          record !== null &&
          isRead((record as ReadRecord).id) &&
          isTime((record as ReadRecord).at) &&
          isTime((record as ReadRecord).minute),
      )
    : []
  const changes = Array.isArray(raw.changes)
    ? raw.changes.filter(
        (record): record is ChangeRecord =>
          typeof record === 'object' &&
          record !== null &&
          isChange((record as ChangeRecord).id) &&
          isTime((record as ChangeRecord).at) &&
          isTime((record as ChangeRecord).minute),
      )
    : []
  const dialog = Array.isArray(raw.dialog)
    ? raw.dialog.filter(
        (record): record is DialogRecord =>
          typeof record === 'object' &&
          record !== null &&
          typeof (record as DialogRecord).nodeId === 'string' &&
          typeof (record as DialogRecord).optionId === 'string' &&
          isTime((record as DialogRecord).at) &&
          isTime((record as DialogRecord).minute),
      )
    : []
  const triage =
    typeof raw.triage === 'object' &&
    raw.triage !== null &&
    typeof (raw.triage as TriageRecord).walkUpId === 'string' &&
    typeof (raw.triage as TriageRecord).optionId === 'string' &&
    isTime((raw.triage as TriageRecord).at) &&
    isTime((raw.triage as TriageRecord).minute)
      ? (raw.triage as TriageRecord)
      : null
  const checklist = Array.isArray(raw.checklist)
    ? raw.checklist.filter(
        (record): record is ChecklistRecord =>
          typeof record === 'object' &&
          record !== null &&
          isChecklist((record as ChecklistRecord).id) &&
          isTime((record as ChecklistRecord).at) &&
          isTime((record as ChecklistRecord).minute) &&
          ((record as ChecklistRecord).note === undefined ||
            typeof (record as ChecklistRecord).note === 'string'),
      )
    : []
  const mode =
    typeof raw.mode === 'string' && MODES.includes(raw.mode) ? (raw.mode as AcademyMode) : 'standard'

  return { mode, reads, changes, dialog, triage, checklist }
}

const COLUMNS = 'id, scenario_id, started_at, finished_at, score, score_json, state_json'

function toRecord(row: Record<string, unknown>): AcademyAttemptRecord {
  return {
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    score: row.score === null ? null : Number(row.score),
    scoreJson: row.score_json === null ? null : String(row.score_json),
    state: stateOf(row.state_json),
  }
}

export class AcademyStore {
  private readonly database: AcademyDatabase

  constructor(database: AcademyDatabase) {
    this.database = database
  }

  private readAttempts(
    db: SqliteDriver,
    where: string,
    params: (string | number)[],
  ): AcademyAttemptRecord[] {
    return db
      .exec(
        `SELECT ${COLUMNS} FROM academy_attempts ${where} ORDER BY started_at DESC, id DESC`,
        params,
      )
      .map(toRecord)
  }

  async latestAttempt(scenarioId: string): Promise<AcademyAttemptRecord | null> {
    return this.database.read((db) => this.readAttempts(db, 'WHERE scenario_id = ?', [scenarioId])[0] ?? null)
  }

  async attemptById(id: string): Promise<AcademyAttemptRecord | null> {
    return this.database.read((db) => this.readAttempts(db, 'WHERE id = ?', [id])[0] ?? null)
  }

  /** Opens the scenario: the unfinished visit if there is one, a new row otherwise. */
  async ensureAttempt(
    scenarioId: string,
    at: number,
    mode: AcademyMode,
  ): Promise<AcademyAttemptRecord> {
    return this.database.write((db) => {
      const existing = this.readAttempts(db, 'WHERE scenario_id = ?', [scenarioId])
      const open = existing.find((attempt) => attempt.finishedAt === null)
      if (open) {
        return open
      }
      const id = `${scenarioId}:${at}`
      const state = emptyState(mode)
      db.run(
        'INSERT INTO academy_attempts (id, scenario_id, started_at, state_json) VALUES (?, ?, ?, ?)',
        [id, scenarioId, at, JSON.stringify(state)],
      )
      return {
        id,
        scenarioId,
        startedAt: at,
        finishedAt: null,
        score: null,
        scoreJson: null,
        state,
      }
    })
  }

  private async updateState(
    id: string,
    mutate: (state: AttemptState) => AttemptState,
  ): Promise<AcademyAttemptRecord | null> {
    return this.database.write((db) => {
      const current = this.readAttempts(db, 'WHERE id = ?', [id])[0]
      if (!current) {
        return null
      }
      const next = mutate(current.state)
      db.run('UPDATE academy_attempts SET state_json = ? WHERE id = ?', [
        JSON.stringify(next),
        id,
      ])
      return { ...current, state: next }
    })
  }

  async setMode(id: string, mode: AcademyMode): Promise<AcademyAttemptRecord | null> {
    return this.updateState(id, (state) => ({ ...state, mode }))
  }

  async appendRead(id: string, record: ReadRecord): Promise<AcademyAttemptRecord | null> {
    return this.updateState(id, (state) =>
      state.reads.some((entry) => entry.id === record.id)
        ? state
        : { ...state, reads: [...state.reads, record] },
    )
  }

  async appendChange(id: string, record: ChangeRecord): Promise<AcademyAttemptRecord | null> {
    return this.updateState(id, (state) =>
      state.changes.some((entry) => entry.id === record.id)
        ? state
        : { ...state, changes: [...state.changes, record] },
    )
  }

  /** One answer per node: answering again replaces the earlier reply. */
  async answerDialog(id: string, record: DialogRecord): Promise<AcademyAttemptRecord | null> {
    return this.updateState(id, (state) => ({
      ...state,
      dialog: [...state.dialog.filter((entry) => entry.nodeId !== record.nodeId), record],
    }))
  }

  async setTriage(id: string, record: TriageRecord): Promise<AcademyAttemptRecord | null> {
    return this.updateState(id, (state) =>
      state.triage !== null ? state : { ...state, triage: record },
    )
  }

  /**
   * Ticks a checklist step. Ticking twice keeps the earlier time and lets the
   * note be edited afterwards.
   */
  async tickChecklist(
    id: string,
    item: ChecklistId,
    at: number,
    minute: number,
    note?: string,
  ): Promise<AcademyAttemptRecord | null> {
    return this.updateState(id, (state) => {
      const existing = state.checklist.find((record) => record.id === item)
      const checklist = existing
        ? state.checklist.map((record) =>
            record.id === item ? { ...record, note: note ?? record.note } : record,
          )
        : [
            ...state.checklist,
            note === undefined ? { id: item, at, minute } : { id: item, at, minute, note },
          ]
      return { ...state, checklist }
    })
  }

  async saveScore(
    id: string,
    score: number,
    scoreJson: string,
    at: number,
  ): Promise<AcademyAttemptRecord | null> {
    return this.database.write((db) => {
      db.run('UPDATE academy_attempts SET finished_at = ?, score = ?, score_json = ? WHERE id = ?', [
        at,
        score,
        scoreJson,
        id,
      ])
      return this.readAttempts(db, 'WHERE id = ?', [id])[0] ?? null
    })
  }

  /** Closes a visit without a score, for a retry that started over. */
  async close(id: string, at: number): Promise<void> {
    await this.database.write((db) => {
      db.run('UPDATE academy_attempts SET finished_at = ? WHERE id = ? AND finished_at IS NULL', [
        at,
        id,
      ])
    })
  }

  async attempts(): Promise<AcademyAttemptRecord[]> {
    return this.database.read((db) =>
      this.readAttempts(db, 'WHERE finished_at IS NOT NULL AND score IS NOT NULL', []),
    )
  }

  /** Forgets every visit, keeping the school and its scenarios in code. */
  async reset(): Promise<void> {
    await this.database.write((db) => {
      db.run('DELETE FROM academy_attempts')
    })
  }
}
