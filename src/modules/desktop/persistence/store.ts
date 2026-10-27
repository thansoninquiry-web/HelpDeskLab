import type { SqliteDriver } from '../../../persistence/sqlite'
import {
  DESKTOP_FIXES,
  type AttemptState,
  type ChangeRecord,
  type CheckId,
  type ChecklistId,
  type ChecklistRecord,
  type FixId,
  type RecordedCheck,
} from '../types'

/**
 * The bench's only view of the database.
 *
 * Structural rather than imported from the app's repository context, so lifting
 * the module out means moving this folder and nothing else. One row per attempt:
 * its reads, its changes and its checklist are one ordered story, and the score
 * reads that story. There is no table of parts, because the machine is code.
 */

export interface DesktopDatabase {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}

export interface DesktopAttemptRecord {
  id: string
  caseId: string
  startedAt: number
  finishedAt: number | null
  score: number | null
  scoreJson: string | null
  state: AttemptState
}

const CHECK_IDS: readonly string[] = [
  'post',
  'beep',
  'psu',
  'memtest',
  'smart',
  'temp',
  'cmos',
  'battery',
  'charger',
  'display',
  'keyboard',
  'taskmgr',
  'devicemgr',
  'eventlog',
  'diskmgmt',
  'msconfig',
  'safemode',
  'winver',
  'sfc',
  'chkdsk',
  'restore',
  'outlook-profiles',
  'office-addins',
  'print-queue',
  'print-drivers',
  'qb-file',
  'qb-multiuser',
  'qb-license',
  'qb-backup',
  'compat',
]

const CHECKLIST_IDS: readonly string[] = ['verify-user', 'backup', 'document', 'follow-up']

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

function emptyState(): AttemptState {
  return { fixes: [], changes: [], checks: [], checklist: [] }
}

/** Reads the stored story back, rejecting anything that is not the shape it wrote. */
function stateOf(value: unknown): AttemptState {
  const raw = parseJson<Partial<AttemptState>>(value, {})
  const isFix = (fix: unknown): fix is FixId =>
    typeof fix === 'string' && (DESKTOP_FIXES as readonly string[]).includes(fix)
  const isCheck = (id: unknown): id is CheckId =>
    typeof id === 'string' && CHECK_IDS.includes(id)
  const isChecklist = (id: unknown): id is ChecklistId =>
    typeof id === 'string' && CHECKLIST_IDS.includes(id)

  const fixes = Array.isArray(raw.fixes) ? raw.fixes.filter(isFix) : []
  const changes = Array.isArray(raw.changes)
    ? raw.changes.filter(
        (change): change is ChangeRecord =>
          typeof change === 'object' &&
          change !== null &&
          isFix((change as ChangeRecord).fix) &&
          typeof (change as ChangeRecord).at === 'number',
      )
    : []
  const checks = Array.isArray(raw.checks)
    ? raw.checks.filter(
        (check): check is RecordedCheck =>
          typeof check === 'object' &&
          check !== null &&
          isCheck((check as RecordedCheck).id) &&
          typeof (check as RecordedCheck).on === 'string' &&
          typeof (check as RecordedCheck).at === 'number',
      )
    : []
  const checklist = Array.isArray(raw.checklist)
    ? raw.checklist.filter(
        (record): record is ChecklistRecord =>
          typeof record === 'object' &&
          record !== null &&
          isChecklist((record as ChecklistRecord).id) &&
          typeof (record as ChecklistRecord).at === 'number' &&
          ((record as ChecklistRecord).note === undefined ||
            typeof (record as ChecklistRecord).note === 'string'),
      )
    : []

  return { fixes, changes, checks, checklist }
}

const COLUMNS = 'id, case_id, started_at, finished_at, score, score_json, state_json'

function toRecord(row: Record<string, unknown>): DesktopAttemptRecord {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    score: row.score === null ? null : Number(row.score),
    scoreJson: row.score_json === null ? null : String(row.score_json),
    state: stateOf(row.state_json),
  }
}

export class DesktopStore {
  private readonly database: DesktopDatabase

  constructor(database: DesktopDatabase) {
    this.database = database
  }

  private readAttempts(
    db: SqliteDriver,
    where: string,
    params: (string | number)[],
  ): DesktopAttemptRecord[] {
    return db
      .exec(
        `SELECT ${COLUMNS} FROM desktop_attempts ${where} ORDER BY started_at DESC, id DESC`,
        params,
      )
      .map(toRecord)
  }

  async latestAttempt(caseId: string): Promise<DesktopAttemptRecord | null> {
    return this.database.read((db) => this.readAttempts(db, 'WHERE case_id = ?', [caseId])[0] ?? null)
  }

  async attemptById(id: string): Promise<DesktopAttemptRecord | null> {
    return this.database.read((db) => this.readAttempts(db, 'WHERE id = ?', [id])[0] ?? null)
  }

  /**
   * Opens the case: the unfinished attempt if there is one, a new row otherwise.
   * The check and the insert share a write, so two mounts cannot open two rows.
   */
  async ensureAttempt(caseId: string, at: number): Promise<DesktopAttemptRecord> {
    return this.database.write((db) => {
      const existing = this.readAttempts(db, 'WHERE case_id = ?', [caseId])
      const open = existing.find((attempt) => attempt.finishedAt === null)
      if (open) {
        return open
      }
      const id = `${caseId}:${at}`
      const state = emptyState()
      db.run(
        'INSERT INTO desktop_attempts (id, case_id, started_at, state_json) VALUES (?, ?, ?, ?)',
        [id, caseId, at, JSON.stringify(state)],
      )
      return {
        id,
        caseId,
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
  ): Promise<DesktopAttemptRecord | null> {
    return this.database.write((db) => {
      const current = this.readAttempts(db, 'WHERE id = ?', [id])[0]
      if (!current) {
        return null
      }
      const next = mutate(current.state)
      db.run('UPDATE desktop_attempts SET state_json = ? WHERE id = ?', [
        JSON.stringify(next),
        id,
      ])
      return { ...current, state: next }
    })
  }

  async appendCheck(id: string, check: RecordedCheck): Promise<DesktopAttemptRecord | null> {
    return this.updateState(id, (state) => ({ ...state, checks: [...state.checks, check] }))
  }

  async appendChange(id: string, change: ChangeRecord): Promise<DesktopAttemptRecord | null> {
    return this.updateState(id, (state) => ({
      ...state,
      fixes: [...state.fixes, change.fix],
      changes: [...state.changes, change],
    }))
  }

  /**
   * Ticks a checklist step. Ticking twice keeps the earlier time, because the
   * order against the first risky change is what the backup step is scored on;
   * the note can be edited afterwards.
   */
  async tickChecklist(
    id: string,
    item: ChecklistId,
    at: number,
    note?: string,
  ): Promise<DesktopAttemptRecord | null> {
    return this.updateState(id, (state) => {
      const existing = state.checklist.find((record) => record.id === item)
      const checklist = existing
        ? state.checklist.map((record) =>
            record.id === item ? { ...record, note: note ?? record.note } : record,
          )
        : [...state.checklist, note === undefined ? { id: item, at } : { id: item, at, note }]
      return { ...state, checklist }
    })
  }

  async saveScore(
    id: string,
    score: number,
    scoreJson: string,
    at: number,
  ): Promise<DesktopAttemptRecord | null> {
    return this.database.write((db) => {
      db.run('UPDATE desktop_attempts SET finished_at = ?, score = ?, score_json = ? WHERE id = ?', [
        at,
        score,
        scoreJson,
        id,
      ])
      return this.readAttempts(db, 'WHERE id = ?', [id])[0] ?? null
    })
  }

  /** Closes an attempt without a score, for a retry that started over. */
  async close(id: string, at: number): Promise<void> {
    await this.database.write((db) => {
      db.run('UPDATE desktop_attempts SET finished_at = ? WHERE id = ? AND finished_at IS NULL', [
        at,
        id,
      ])
    })
  }

  async attempts(): Promise<DesktopAttemptRecord[]> {
    return this.database.read((db) =>
      this.readAttempts(db, 'WHERE finished_at IS NOT NULL AND score IS NOT NULL', []),
    )
  }

  /** Forgets every attempt, keeping the machine's definition in code. */
  async reset(): Promise<void> {
    await this.database.write((db) => {
      db.run('DELETE FROM desktop_attempts')
    })
  }
}
