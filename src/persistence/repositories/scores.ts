import { normalizeHintRepair, type HintRepair } from '../../domain/scoring/hints'
import type { ScoreRepository } from '../../domain/ports'
import type {
  ScoreHistoryEntry,
  ScoredAttemptHints,
  ScoredStep,
} from '../../domain/progress/types'
import type { Score } from '../../domain/scoring/types'
import type { SessionId } from '../../domain/tickets/types'
import { NotFoundError } from '../errors'
import type { RepositoryContext } from './context'
import { mapScore, mapScoreHistory, mapScoredHintCounts, mapScoredSteps } from './mappers'
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

  listHistory(): Promise<ScoreHistoryEntry[]> {
    return this.context.read((db) =>
      db
        .exec(
          `SELECT se.id AS session_id,
                  t.scenario_id AS scenario_id,
                  t.variant_id AS variant_id,
                  s.total AS total,
                  s.passed AS passed,
                  s.computed_at AS computed_at,
                  s.rubric_json AS rubric_json
           FROM scores s
           JOIN sessions se ON se.id = s.session_id
           JOIN tickets t ON t.id = se.ticket_id
           ORDER BY s.computed_at ASC, s.session_id ASC`,
        )
        .map(mapScoreHistory),
    )
  }

  /**
   * The rubric steps of every scored attempt, oldest first. Only the columns the
   * habit summary reads are touched: the rest of a stored evaluation is large
   * and stays where it is.
   */
  listScoredSteps(): Promise<ScoredStep[]> {
    return this.context.read((db) =>
      db
        .exec(
          `SELECT session_id, rubric_json FROM scores
           ORDER BY computed_at ASC, session_id ASC`,
        )
        .flatMap(mapScoredSteps),
    )
  }

  /**
   * The rung count each score charged, for the attempts that kept one. Read
   * beside the logged hints: the score is what the attempt paid, the log is
   * where the rungs landed, and the two do not have to agree.
   */
  listScoredHintCounts(): Promise<ScoredAttemptHints[]> {
    return this.context.read((db) =>
      db
        .exec(
          `SELECT session_id, rubric_json FROM scores
           ORDER BY computed_at ASC, session_id ASC`,
        )
        .flatMap(mapScoredHintCounts),
    )
  }

  /**
   * The repair kept beside a score, or null when the attempt has none. A row
   * written before the column existed, or one a later build cannot read back,
   * reads as no repair rather than as a half-repaired debrief.
   */
  findHintRepair(sessionId: SessionId): Promise<HintRepair | null> {
    return this.context.read((db) => {
      const row = db.exec('SELECT hint_repair_json FROM scores WHERE session_id = ?', [sessionId])[0]
      const stored = row?.hint_repair_json
      if (typeof stored !== 'string' || stored.length === 0) {
        return null
      }
      try {
        return normalizeHintRepair(JSON.parse(stored))
      } catch {
        return null
      }
    })
  }

  /**
   * Writes the repair, or clears it with null. An update that matched no row is
   * an error: a repair for an attempt with no score would be kept where nothing
   * reads it, and the debrief would keep asking for one that was already made.
   */
  async saveHintRepair(sessionId: SessionId, repair: HintRepair | null): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run('UPDATE scores SET hint_repair_json = ? WHERE session_id = ?', [
        repair === null ? null : JSON.stringify(repair),
        sessionId,
      ])
      if (changed === 0) {
        throw new NotFoundError(`Session ${sessionId} has no score to keep a hint repair on`)
      }
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
