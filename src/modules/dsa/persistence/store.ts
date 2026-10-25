import type { SqliteDriver } from '../../../persistence/sqlite'
import type { DsaAttempt } from '../types'

/**
 * The store's only view of the database.
 *
 * Structural rather than imported from `persistence/repositories/context`, so
 * the module depends on no app code at run time and can be lifted out of the lab
 * by moving this folder.
 */
export interface DsaDatabase {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}

export interface DsaDraftRecord {
  problemId: string
  code: string
  updatedAt: number
}

function toAttempt(row: Record<string, unknown>): DsaAttempt {
  return {
    id: String(row.id),
    problemId: String(row.problem_id),
    patternChoice: String(row.pattern_choice),
    edgeChoice: String(row.edge_choice),
    solved: Number(row.solved) === 1,
    hintsUsed: Number(row.hints_used),
    code: row.code === null ? null : String(row.code),
    createdAt: Number(row.created_at),
  }
}

export class DsaStore {
  private readonly database: DsaDatabase

  constructor(database: DsaDatabase) {
    this.database = database
  }

  /** Every attempt, newest first, so one read fills the whole library. */
  async attempts(): Promise<DsaAttempt[]> {
    return this.database.read((db) =>
      db
        .exec(
          `SELECT id, problem_id, pattern_choice, edge_choice, solved, hints_used, code, created_at
             FROM dsa_attempts ORDER BY created_at DESC`,
        )
        .map(toAttempt),
    )
  }

  async attemptsFor(problemId: string): Promise<DsaAttempt[]> {
    return this.database.read((db) =>
      db
        .exec(
          `SELECT id, problem_id, pattern_choice, edge_choice, solved, hints_used, code, created_at
             FROM dsa_attempts WHERE problem_id = ? ORDER BY created_at DESC`,
          [problemId],
        )
        .map(toAttempt),
    )
  }

  /** The hand-written answer, one row per problem, replaced as it is typed. */
  async draft(problemId: string): Promise<string | null> {
    return this.database.read((db) => {
      const row = db.exec('SELECT code FROM dsa_drafts WHERE problem_id = ?', [problemId])[0]
      return row ? String(row.code) : null
    })
  }

  async saveDraft(record: DsaDraftRecord): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO dsa_drafts (problem_id, code, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(problem_id) DO UPDATE SET
           code = excluded.code,
           updated_at = excluded.updated_at`,
        [record.problemId, record.code, record.updatedAt],
      )
    })
  }

  async appendAttempt(attempt: DsaAttempt): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO dsa_attempts
           (id, problem_id, pattern_choice, edge_choice, solved, hints_used, code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attempt.id,
          attempt.problemId,
          attempt.patternChoice,
          attempt.edgeChoice,
          attempt.solved ? 1 : 0,
          attempt.hintsUsed,
          attempt.code,
          attempt.createdAt,
        ],
      )
    })
  }

  /** Clears every attempt and draft, for a learner starting the bank again. */
  async reset(): Promise<void> {
    await this.database.write((db) => {
      db.run('DELETE FROM dsa_attempts')
      db.run('DELETE FROM dsa_drafts')
    })
  }
}
