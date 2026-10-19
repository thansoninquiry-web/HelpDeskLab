import type { ActionRepository } from '../../domain/ports'
import type { TakenHint } from '../../domain/progress/types'
import type {
  NewSessionAction,
  Session,
  SessionAction,
  SessionId,
} from '../../domain/tickets/types'
import { NotFoundError } from '../errors'
import type { RepositoryContext } from './context'
import { mapAction, mapTakenHint } from './mappers'
import { assertLimit, assertNonEmpty } from './validation'

/** The curriculum folds the action log, so it reads well past a single attempt. */
const MAX_HISTORY_LIMIT = 5_000

const COLUMNS = 'id, session_id, seq, at_ms, kind, input_json, output_json'

export class SqliteActionRepository implements ActionRepository {
  private readonly context: RepositoryContext

  constructor(context: RepositoryContext) {
    this.context = context
  }

  async append(action: NewSessionAction): Promise<SessionAction> {
    assertNonEmpty(action.sessionId, 'action.sessionId')
    return this.context.write((db) => {
      const session = db.exec('SELECT 1 AS found FROM sessions WHERE id = ?', [action.sessionId])[0]
      if (!session) {
        throw new NotFoundError(`Session not found: ${action.sessionId}`)
      }

      const next = db.exec(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM actions WHERE session_id = ?',
        [action.sessionId],
      )[0]?.next_seq
      if (typeof next !== 'number') {
        throw new Error('Could not compute the next action sequence number')
      }

      db.run(
        `INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          action.sessionId,
          next,
          action.atMs,
          action.kind,
          JSON.stringify(action.input),
          JSON.stringify(action.output),
        ],
      )

      const id = db.exec('SELECT last_insert_rowid() AS id')[0]?.id
      if (typeof id !== 'number') {
        throw new Error('Could not read the inserted action id')
      }

      return {
        id,
        sessionId: action.sessionId,
        seq: next,
        atMs: action.atMs,
        kind: action.kind,
        input: action.input,
        output: action.output,
      }
    })
  }

  async rewind(
    sessionId: SessionId,
    fromSeq: number,
    marker: NewSessionAction,
    world: Session['world'],
  ): Promise<void> {
    assertNonEmpty(sessionId, 'action.sessionId')
    if (!Number.isInteger(fromSeq) || fromSeq < 1) {
      throw new Error(`A rewind needs the step it starts at: ${fromSeq}`)
    }

    await this.context.write((db) => {
      const session = db.exec('SELECT ended_at FROM sessions WHERE id = ?', [sessionId])[0]
      if (!session) {
        throw new NotFoundError(`Session not found: ${sessionId}`)
      }
      if (session.ended_at !== null) {
        throw new NotFoundError(`Active session not found: ${sessionId}`)
      }

      const changed = db.run('DELETE FROM actions WHERE session_id = ? AND seq >= ?', [
        sessionId,
        fromSeq,
      ])
      if (changed === 0) {
        throw new NotFoundError(`No action at or after step ${fromSeq} to un-run`)
      }

      // The cut frees exactly `fromSeq`, so the marker keeps the log contiguous.
      db.run(
        `INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          fromSeq,
          marker.atMs,
          marker.kind,
          JSON.stringify(marker.input),
          JSON.stringify(marker.output),
        ],
      )
      const rewritten = db.run('UPDATE sessions SET world_json = ? WHERE id = ?', [
        JSON.stringify(world),
        sessionId,
      ])
      if (rewritten === 0) {
        throw new NotFoundError(`Active session not found: ${sessionId}`)
      }
    })
  }

  async reapply(
    sessionId: SessionId,
    seq: number,
    steps: readonly NewSessionAction[],
    tail: readonly NewSessionAction[],
    world: Session['world'],
  ): Promise<void> {
    assertNonEmpty(sessionId, 'action.sessionId')
    if (!Number.isInteger(seq) || seq < 1) {
      throw new Error(`A rewind needs the step it starts at: ${seq}`)
    }
    if (steps.length === 0) {
      throw new Error(`The rewind at step ${seq} holds no steps to put back`)
    }

    await this.context.write((db) => {
      const session = db.exec('SELECT ended_at FROM sessions WHERE id = ?', [sessionId])[0]
      if (!session) {
        throw new NotFoundError(`Session not found: ${sessionId}`)
      }
      if (session.ended_at !== null) {
        throw new NotFoundError(`Active session not found: ${sessionId}`)
      }

      const marker = db.exec('SELECT kind FROM actions WHERE session_id = ? AND seq = ?', [
        sessionId,
        seq,
      ])[0]
      if (!marker || marker.kind !== 'rewind') {
        throw new NotFoundError(`No rewind at step ${seq} to put back`)
      }
      // Only the conversation handed in may follow the marker. A caller line
      // recorded between the read and this write would otherwise be deleted
      // without being put back.
      const after = db.exec('SELECT id FROM actions WHERE session_id = ? AND seq > ?', [
        sessionId,
        seq,
      ])
      if (after.length !== tail.length) {
        throw new NotFoundError('The log changed while that cut was being put back')
      }

      // The cut and any conversation recorded after it are replaced by the
      // restored steps followed by that conversation, so the log stays
      // contiguous and the steps keep their old place.
      const removed = db.run('DELETE FROM actions WHERE session_id = ? AND seq >= ?', [
        sessionId,
        seq,
      ])
      if (removed === 0) {
        throw new NotFoundError(`No rewind at step ${seq} to put back`)
      }

      const restored = [...steps, ...tail]
      restored.forEach((step, index) => {
        db.run(
          `INSERT INTO actions (session_id, seq, at_ms, kind, input_json, output_json) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            seq + index,
            step.atMs,
            step.kind,
            JSON.stringify(step.input),
            JSON.stringify(step.output),
          ],
        )
      })

      const rewritten = db.run('UPDATE sessions SET world_json = ? WHERE id = ?', [
        JSON.stringify(world),
        sessionId,
      ])
      if (rewritten === 0) {
        throw new NotFoundError(`Active session not found: ${sessionId}`)
      }
    })
  }

  async listRecent(limit: number): Promise<SessionAction[]> {
    assertLimit(limit, MAX_HISTORY_LIMIT)
    return this.context.read((db) =>
      db
        .exec(`SELECT ${COLUMNS} FROM actions ORDER BY id DESC LIMIT ?`, [limit])
        .map(mapAction),
    )
  }

  /**
   * Every hint in every log, oldest first. Un-run steps are already gone: a
   * rewind deletes the tail, so this reads the habit the logs actually hold.
   */
  listHints(): Promise<TakenHint[]> {
    return this.context.read((db) =>
      db
        .exec(`SELECT session_id, input_json FROM actions WHERE kind = 'hint' ORDER BY at_ms ASC, id ASC`)
        .map(mapTakenHint)
        .filter((hint): hint is TakenHint => hint !== null),
    )
  }

  listBySession(sessionId: SessionId): Promise<SessionAction[]> {
    return this.context.read((db) =>
      db
        .exec(`SELECT ${COLUMNS} FROM actions WHERE session_id = ? ORDER BY seq ASC`, [sessionId])
        .map(mapAction),
    )
  }
}
