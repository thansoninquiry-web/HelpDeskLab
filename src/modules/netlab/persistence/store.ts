import type { SqliteDriver } from '../../../persistence/sqlite'
import { LAB_FIXES, type AttemptState, type ChangeRecord, type FixId, type RecordedCheck } from '../types'

/**
 * The lab's only view of the database.
 *
 * Structural rather than imported from the app's repository context, so lifting
 * the module out means moving this folder and nothing else. The attempt's checks
 * and changes live in one JSON column because they are one ordered story; the
 * quiz and the read marks get their own rows because they are looked up
 * separately by the concepts page.
 */

export interface NetlabDatabase {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}

export interface NetlabAttemptRecord {
  id: string
  incidentId: string
  startedAt: number
  finishedAt: number | null
  score: number | null
  scoreJson: string | null
  state: AttemptState
}

export interface QuizAnswerRecord {
  conceptId: string
  questionId: string
  choice: string
  correct: boolean
  answeredAt: number
}

export interface ConceptReadRecord {
  conceptId: string
  readAt: number
}

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
  return { fixes: [], changes: [], checks: [] }
}

/** Reads the stored story back, rejecting anything that is not the shape it wrote. */
function stateOf(value: unknown): AttemptState {
  const raw = parseJson<Partial<AttemptState>>(value, {})
  const isFix = (value: unknown): value is FixId =>
    typeof value === 'string' && (LAB_FIXES as readonly string[]).includes(value)
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
          typeof (check as RecordedCheck).id === 'string' &&
          typeof (check as RecordedCheck).deviceId === 'string' &&
          typeof (check as RecordedCheck).at === 'number',
      )
    : []
  return { fixes, changes, checks }
}

const COLUMNS =
  'id, incident_id, started_at, finished_at, score, score_json, state_json'

function toRecord(row: Record<string, unknown>): NetlabAttemptRecord {
  return {
    id: String(row.id),
    incidentId: String(row.incident_id),
    startedAt: Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    score: row.score === null ? null : Number(row.score),
    scoreJson: row.score_json === null ? null : String(row.score_json),
    state: stateOf(row.state_json),
  }
}

export class NetlabStore {
  private readonly database: NetlabDatabase

  constructor(database: NetlabDatabase) {
    this.database = database
  }

  private readAttempts(
    db: SqliteDriver,
    where: string,
    params: (string | number)[],
  ): NetlabAttemptRecord[] {
    return db
      .exec(
        `SELECT ${COLUMNS} FROM netlab_attempts ${where} ORDER BY started_at DESC, id DESC`,
        params,
      )
      .map(toRecord)
  }

  async latestAttempt(incidentId: string): Promise<NetlabAttemptRecord | null> {
    return this.database.read((db) => {
      const rows = this.readAttempts(db, 'WHERE incident_id = ?', [incidentId])
      return rows[0] ?? null
    })
  }

  async attemptById(id: string): Promise<NetlabAttemptRecord | null> {
    return this.database.read((db) => {
      const rows = this.readAttempts(db, 'WHERE id = ?', [id])
      return rows[0] ?? null
    })
  }

  /**
   * Opens the incident: the unfinished attempt if there is one, a new one
   * otherwise. The check and the insert share a transaction so two mounts of
   * the page cannot start two attempts.
   */
  async ensureAttempt(incidentId: string, at: number): Promise<NetlabAttemptRecord> {
    return this.database.write((db) => {
      const existing = this.readAttempts(db, 'WHERE incident_id = ?', [incidentId])
      const open = existing.find((attempt) => attempt.finishedAt === null)
      if (open) {
        return open
      }
      const id = `${incidentId}:${at}`
      const state = emptyState()
      db.run(
        'INSERT INTO netlab_attempts (id, incident_id, started_at, state_json) VALUES (?, ?, ?, ?)',
        [id, incidentId, at, JSON.stringify(state)],
      )
      return {
        id,
        incidentId,
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
  ): Promise<NetlabAttemptRecord | null> {
    return this.database.write((db) => {
      const rows = this.readAttempts(db, 'WHERE id = ?', [id])
      const current = rows[0]
      if (!current) {
        return null
      }
      const next = mutate(current.state)
      db.run('UPDATE netlab_attempts SET state_json = ? WHERE id = ?', [
        JSON.stringify(next),
        id,
      ])
      return { ...current, state: next }
    })
  }

  async appendCheck(id: string, check: RecordedCheck): Promise<NetlabAttemptRecord | null> {
    return this.updateState(id, (state) => ({ ...state, checks: [...state.checks, check] }))
  }

  async appendChange(id: string, change: ChangeRecord): Promise<NetlabAttemptRecord | null> {
    return this.updateState(id, (state) => ({
      ...state,
      fixes: [...state.fixes, change.fix],
      changes: [...state.changes, change],
    }))
  }

  async saveScore(
    id: string,
    score: number,
    scoreJson: string,
    at: number,
  ): Promise<NetlabAttemptRecord | null> {
    return this.database.write((db) => {
      db.run(
        'UPDATE netlab_attempts SET finished_at = ?, score = ?, score_json = ? WHERE id = ?',
        [at, score, scoreJson, id],
      )
      const rows = this.readAttempts(db, 'WHERE id = ?', [id])
      return rows[0] ?? null
    })
  }

  /** Closes an attempt without a score, for a retry that started over. */
  async close(id: string, at: number): Promise<void> {
    await this.database.write((db) => {
      db.run('UPDATE netlab_attempts SET finished_at = ? WHERE id = ? AND finished_at IS NULL', [
        at,
        id,
      ])
    })
  }

  async attempts(): Promise<NetlabAttemptRecord[]> {
    return this.database.read((db) =>
      this.readAttempts(db, 'WHERE finished_at IS NOT NULL AND score IS NOT NULL', []),
    )
  }

  async quizAnswers(): Promise<QuizAnswerRecord[]> {
    return this.database.read((db) =>
      db
        .exec(
          'SELECT concept_id, question_id, choice, correct, answered_at FROM netlab_quiz ORDER BY answered_at',
        )
        .map((row) => ({
          conceptId: String(row.concept_id),
          questionId: String(row.question_id),
          choice: String(row.choice),
          correct: Number(row.correct) === 1,
          answeredAt: Number(row.answered_at),
        })),
    )
  }

  async saveAnswer(
    conceptId: string,
    questionId: string,
    choice: string,
    correct: boolean,
    at: number,
  ): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO netlab_quiz (concept_id, question_id, choice, correct, answered_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(concept_id, question_id) DO UPDATE SET
           choice = excluded.choice,
           correct = excluded.correct,
           answered_at = excluded.answered_at`,
        [conceptId, questionId, choice, correct ? 1 : 0, at],
      )
    })
  }

  async conceptReads(): Promise<ConceptReadRecord[]> {
    return this.database.read((db) =>
      db
        .exec('SELECT concept_id, read_at FROM netlab_concept_reads ORDER BY read_at')
        .map((row) => ({ conceptId: String(row.concept_id), readAt: Number(row.read_at) })),
    )
  }

  async markConceptRead(conceptId: string, at: number): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO netlab_concept_reads (concept_id, read_at) VALUES (?, ?)
         ON CONFLICT(concept_id) DO UPDATE SET read_at = excluded.read_at`,
        [conceptId, at],
      )
    })
  }

  /** Forgets every attempt and every quiz answer, keeping the topology's code. */
  async reset(): Promise<void> {
    await this.database.write((db) => {
      db.run('DELETE FROM netlab_attempts')
      db.run('DELETE FROM netlab_quiz')
      db.run('DELETE FROM netlab_concept_reads')
    })
  }
}
