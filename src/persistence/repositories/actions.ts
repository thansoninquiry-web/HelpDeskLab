import type { ActionRepository } from '../../domain/ports'
import type { NewSessionAction, SessionAction, SessionId } from '../../domain/tickets/types'
import { NotFoundError } from '../errors'
import type { RepositoryContext } from './context'
import { mapAction } from './mappers'
import { assertNonEmpty } from './validation'

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

  listBySession(sessionId: SessionId): Promise<SessionAction[]> {
    return this.context.read((db) =>
      db
        .exec(`SELECT ${COLUMNS} FROM actions WHERE session_id = ? ORDER BY seq ASC`, [sessionId])
        .map(mapAction),
    )
  }
}
