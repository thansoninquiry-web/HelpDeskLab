import type { TicketRepository } from '../../domain/ports'
import type { Ticket, TicketId, TicketStatus } from '../../domain/tickets/types'
import { NotFoundError } from '../errors'
import type { RepositoryContext } from './context'
import { mapTicket } from './mappers'
import { assertLimit, assertNonEmpty } from './validation'

const COLUMNS =
  'id, scenario_id, variant_id, difficulty, seed, signature, public_json, created_at, status'

export class SqliteTicketRepository implements TicketRepository {
  private readonly context: RepositoryContext

  constructor(context: RepositoryContext) {
    this.context = context
  }

  async create(ticket: Ticket): Promise<void> {
    assertNonEmpty(ticket.id, 'ticket.id')
    assertNonEmpty(ticket.scenarioId, 'ticket.scenarioId')
    assertNonEmpty(ticket.signature, 'ticket.signature')
    await this.context.write((db) => {
      db.run(`INSERT INTO tickets (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        ticket.id,
        ticket.scenarioId,
        ticket.variantId,
        ticket.difficulty,
        ticket.seed,
        ticket.signature,
        JSON.stringify(ticket.publicContent),
        ticket.createdAt,
        ticket.status,
      ])
    })
  }

  findById(id: TicketId): Promise<Ticket | null> {
    return this.context.read((db) => {
      const row = db.exec(`SELECT ${COLUMNS} FROM tickets WHERE id = ?`, [id])[0]
      return row ? mapTicket(row) : null
    })
  }

  async listRecent(limit: number): Promise<Ticket[]> {
    assertLimit(limit)
    return this.context.read((db) =>
      db
        .exec(`SELECT ${COLUMNS} FROM tickets ORDER BY created_at DESC, id DESC LIMIT ?`, [limit])
        .map(mapTicket),
    )
  }

  async updateStatus(id: TicketId, status: TicketStatus): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run('UPDATE tickets SET status = ? WHERE id = ?', [status, id])
      if (changed === 0) {
        throw new NotFoundError(`Ticket not found: ${id}`)
      }
    })
  }
}
