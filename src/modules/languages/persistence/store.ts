import type { SqliteDriver } from '../../../persistence/sqlite'
import type { LanguageAttempt, TrackId } from '../types'

/**
 * The store's only view of the database.
 *
 * Structural rather than imported from `persistence/repositories/context`, so
 * the module depends on no app code at run time and can be lifted out of the lab
 * by moving this folder.
 */
export interface LanguageDatabase {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}

export interface LessonReadRecord {
  trackId: TrackId
  lessonId: string
  readAt: number
}

function toAttempt(row: Record<string, unknown>): LanguageAttempt {
  return {
    id: String(row.id),
    trackId: String(row.track_id) as TrackId,
    itemId: String(row.item_id),
    choice: String(row.choice),
    correct: Number(row.correct) === 1,
    createdAt: Number(row.created_at),
  }
}

export class LanguageStore {
  private readonly database: LanguageDatabase

  constructor(database: LanguageDatabase) {
    this.database = database
  }

  /** Every attempt, newest first, so one read fills all three tracks. */
  async attempts(): Promise<LanguageAttempt[]> {
    return this.database.read((db) =>
      db
        .exec(
          `SELECT id, track_id, item_id, choice, correct, created_at
             FROM lang_attempts ORDER BY created_at DESC`,
        )
        .map(toAttempt),
    )
  }

  async attemptsFor(trackId: TrackId, itemId: string): Promise<LanguageAttempt[]> {
    return this.database.read((db) =>
      db
        .exec(
          `SELECT id, track_id, item_id, choice, correct, created_at
             FROM lang_attempts WHERE track_id = ? AND item_id = ?
             ORDER BY created_at DESC`,
          [trackId, itemId],
        )
        .map(toAttempt),
    )
  }

  async appendAttempt(attempt: LanguageAttempt): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO lang_attempts (id, track_id, item_id, choice, correct, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          attempt.id,
          attempt.trackId,
          attempt.itemId,
          attempt.choice,
          attempt.correct ? 1 : 0,
          attempt.createdAt,
        ],
      )
    })
  }

  /** One row per lesson that has been read, keyed by track and lesson. */
  async reads(): Promise<LessonReadRecord[]> {
    return this.database.read((db) =>
      db
        .exec('SELECT track_id, lesson_id, read_at FROM lang_lesson_reads ORDER BY read_at DESC')
        .map((row) => ({
          trackId: String(row.track_id) as TrackId,
          lessonId: String(row.lesson_id),
          readAt: Number(row.read_at),
        })),
    )
  }

  async markRead(record: LessonReadRecord): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO lang_lesson_reads (track_id, lesson_id, read_at) VALUES (?, ?, ?)
         ON CONFLICT(track_id, lesson_id) DO UPDATE SET read_at = excluded.read_at`,
        [record.trackId, record.lessonId, record.readAt],
      )
    })
  }

  async unmarkRead(trackId: TrackId, lessonId: string): Promise<void> {
    await this.database.write((db) => {
      db.run('DELETE FROM lang_lesson_reads WHERE track_id = ? AND lesson_id = ?', [
        trackId,
        lessonId,
      ])
    })
  }

  /** Clears one track, or every track when no id is given. */
  async reset(trackId?: TrackId): Promise<void> {
    await this.database.write((db) => {
      if (trackId) {
        db.run('DELETE FROM lang_attempts WHERE track_id = ?', [trackId])
        db.run('DELETE FROM lang_lesson_reads WHERE track_id = ?', [trackId])
        return
      }
      db.run('DELETE FROM lang_attempts')
      db.run('DELETE FROM lang_lesson_reads')
    })
  }
}
