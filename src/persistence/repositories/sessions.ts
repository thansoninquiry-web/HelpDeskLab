import type { SessionRepository } from '../../domain/ports'
import type { Session, SessionId, SessionOutcome, TicketId } from '../../domain/tickets/types'
import { NotFoundError } from '../errors'
import type { RepositoryContext } from './context'
import { mapSession } from './mappers'
import { assertLimit, assertNonEmpty } from './validation'

/** Reflection scans the whole history, so the ceiling is far above the queue's. */
const MAX_HISTORY_LIMIT = 5_000

const COLUMNS =
  'id, ticket_id, started_at, ended_at, world_json, hint_policy_json, closure_draft_json, workspace_layout_json, console_focus_json, exam_mode, resolution, outcome'

export class SqliteSessionRepository implements SessionRepository {
  private readonly context: RepositoryContext

  constructor(context: RepositoryContext) {
    this.context = context
  }

  async create(session: Session): Promise<void> {
    assertNonEmpty(session.id, 'session.id')
    await this.context.write((db) => {
      db.run(`INSERT INTO sessions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        session.id,
        session.ticketId,
        session.startedAt,
        session.endedAt,
        JSON.stringify(session.world),
        session.hintPolicy === null ? null : JSON.stringify(session.hintPolicy),
        session.closureDraft === null ? null : JSON.stringify(session.closureDraft),
        session.workspaceLayout === null ? null : JSON.stringify(session.workspaceLayout),
        session.consoleFocus === null ? null : JSON.stringify(session.consoleFocus),
        session.examMode ? 1 : 0,
        session.resolution,
        session.outcome,
      ])
    })
  }

  findById(id: SessionId): Promise<Session | null> {
    return this.context.read((db) => {
      const row = db.exec(`SELECT ${COLUMNS} FROM sessions WHERE id = ?`, [id])[0]
      return row ? mapSession(row) : null
    })
  }

  findActive(): Promise<Session | null> {
    return this.context.read((db) => {
      const row = db.exec(
        `SELECT ${COLUMNS} FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1`,
      )[0]
      return row ? mapSession(row) : null
    })
  }

  async listRecent(limit: number): Promise<Session[]> {
    assertLimit(limit, MAX_HISTORY_LIMIT)
    return this.context.read((db) =>
      db
        .exec(
          `SELECT ${COLUMNS} FROM sessions ORDER BY started_at DESC, id DESC LIMIT ?`,
          [limit],
        )
        .map(mapSession),
    )
  }

  listByTicket(ticketId: TicketId): Promise<Session[]> {
    return this.context.read((db) =>
      db
        .exec(`SELECT ${COLUMNS} FROM sessions WHERE ticket_id = ? ORDER BY started_at ASC, id ASC`, [
          ticketId,
        ])
        .map(mapSession),
    )
  }

  async saveWorld(id: SessionId, world: Session['world']): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run('UPDATE sessions SET world_json = ? WHERE id = ? AND ended_at IS NULL', [
        JSON.stringify(world),
        id,
      ])
      if (changed === 0) {
        throw new NotFoundError(`Active session not found: ${id}`)
      }
    })
  }

  async saveClosureDraft(id: SessionId, draft: Session['closureDraft']): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run(
        'UPDATE sessions SET closure_draft_json = ? WHERE id = ? AND ended_at IS NULL',
        [draft === null ? null : JSON.stringify(draft), id],
      )
      if (changed === 0) {
        throw new NotFoundError(`Active session not found: ${id}`)
      }
    })
  }

  async saveWorkspaceLayout(
    id: SessionId,
    layout: Session['workspaceLayout'],
  ): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run(
        'UPDATE sessions SET workspace_layout_json = ? WHERE id = ? AND ended_at IS NULL',
        [layout === null ? null : JSON.stringify(layout), id],
      )
      if (changed === 0) {
        throw new NotFoundError(`Active session not found: ${id}`)
      }
    })
  }

  async saveConsoleFocus(
    id: SessionId,
    focus: Session['consoleFocus'],
  ): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run(
        'UPDATE sessions SET console_focus_json = ? WHERE id = ? AND ended_at IS NULL',
        [focus === null ? null : JSON.stringify(focus), id],
      )
      if (changed === 0) {
        throw new NotFoundError(`Active session not found: ${id}`)
      }
    })
  }

  async finish(
    id: SessionId,
    ending: { endedAt: number; resolution: string; outcome: SessionOutcome },
  ): Promise<void> {
    assertNonEmpty(ending.resolution, 'ending.resolution')
    await this.context.write((db) => {
      const changed = db.run(
        'UPDATE sessions SET ended_at = ?, resolution = ?, outcome = ?, closure_draft_json = NULL, workspace_layout_json = NULL, console_focus_json = NULL WHERE id = ? AND ended_at IS NULL',
        [ending.endedAt, ending.resolution, ending.outcome, id],
      )
      if (changed === 0) {
        throw new NotFoundError(`Active session not found: ${id}`)
      }
    })
  }
}
