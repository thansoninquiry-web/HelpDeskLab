import type { ScoreRepository } from '../../domain/ports'
import type { Score } from '../../domain/scoring/types'
import type { SessionId } from '../../domain/tickets/types'
import type { RepositoryContext } from './context'
import { mapScore } from './mappers'
import { assertLimit, rethrowUniqueViolation } from './validation'

const COLUMNS = 'session_id, total, passed, band, rubric_json, computed_at'

export class SqliteScoreRepository implements ScoreRepository {
  private readonly context: RepositoryContext

  constructor(context: RepositoryContext) {
    this.context = context
  }

  async save(score: Score): Promise<void> {
    try {
      await this.context.write((db) => {
        db.run(`INSERT INTO scores (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`, [
          score.sessionId,
          score.total,
          score.passed ? 1 : 0,
          score.band,
          JSON.stringify(score.rubric),
          score.computedAt,
        ])
      })
    } catch (error) {
      rethrowUniqueViolation(error, `Session ${score.sessionId} already has a score`)
    }
  }

  findBySession(sessionId: SessionId): Promise<Score | null> {
    return this.context.read((db) => {
      const row = db.exec(`SELECT ${COLUMNS} FROM scores WHERE session_id = ?`, [sessionId])[0]
      return row ? mapScore(row) : null
    })
  }

  async listRecent(limit: number): Promise<Score[]> {
    assertLimit(limit)
    return this.context.read((db) =>
      db
        .exec(`SELECT ${COLUMNS} FROM scores ORDER BY computed_at DESC, session_id DESC LIMIT ?`, [
          limit,
        ])
        .map(mapScore),
    )
  }
}
