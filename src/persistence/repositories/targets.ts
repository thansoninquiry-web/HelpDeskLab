import type { JobTargetRepository } from '../../domain/ports'
import type { JobStatus, JobTarget } from '../../domain/targets/types'
import { NotFoundError } from '../errors'
import type { RepositoryContext } from './context'
import { mapJobTarget } from './mappers'
import { assertNonEmpty, rethrowUniqueViolation } from './validation'

const COLUMNS =
  'id, company, title, url, applied_on, status, raw_description, created_at, updated_at'

export class SqliteJobTargetRepository implements JobTargetRepository {
  private readonly context: RepositoryContext

  constructor(context: RepositoryContext) {
    this.context = context
  }

  async create(target: JobTarget): Promise<void> {
    assertNonEmpty(target.id, 'jobTarget.id')
    assertNonEmpty(target.company, 'jobTarget.company')
    assertNonEmpty(target.title, 'jobTarget.title')
    assertNonEmpty(target.rawDescription, 'jobTarget.rawDescription')

    try {
      await this.context.write((db) => {
        db.run(`INSERT INTO job_targets (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          target.id,
          target.company,
          target.title,
          target.url,
          target.appliedOn,
          target.status,
          target.rawDescription,
          target.createdAt,
          target.updatedAt,
        ])
      })
    } catch (error) {
      rethrowUniqueViolation(error, `Job target ${target.id} already exists`)
    }
  }

  list(): Promise<JobTarget[]> {
    return this.context.read((db) =>
      db
        .exec(`SELECT ${COLUMNS} FROM job_targets ORDER BY created_at DESC, id DESC`)
        .map(mapJobTarget),
    )
  }

  findById(id: string): Promise<JobTarget | null> {
    return this.context.read((db) => {
      const row = db.exec(`SELECT ${COLUMNS} FROM job_targets WHERE id = ?`, [id])[0]
      return row ? mapJobTarget(row) : null
    })
  }

  async updateStatus(id: string, status: JobStatus, updatedAt: number): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run('UPDATE job_targets SET status = ?, updated_at = ? WHERE id = ?', [
        status,
        updatedAt,
        id,
      ])
      if (changed === 0) {
        throw new NotFoundError(`Job target not found: ${id}`)
      }
    })
  }

  async remove(id: string): Promise<void> {
    await this.context.write((db) => {
      const changed = db.run('DELETE FROM job_targets WHERE id = ?', [id])
      if (changed === 0) {
        throw new NotFoundError(`Job target not found: ${id}`)
      }
    })
  }
}
