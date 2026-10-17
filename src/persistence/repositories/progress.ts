import type { ProgressRepository } from '../../domain/ports'
import type { ScenarioStats } from '../../domain/progress/types'
import type { ScenarioId } from '../../domain/tickets/types'
import type { RepositoryContext } from './context'
import { mapScenarioStats } from './mappers'
import { assertNonEmpty } from './validation'

const COLUMNS = 'scenario_id, attempts, passes, best_score, last_played_at, leitner_box, due_at'

export class SqliteProgressRepository implements ProgressRepository {
  private readonly context: RepositoryContext

  constructor(context: RepositoryContext) {
    this.context = context
  }

  get(scenarioId: ScenarioId): Promise<ScenarioStats | null> {
    return this.context.read((db) => {
      const row = db.exec(`SELECT ${COLUMNS} FROM scenario_stats WHERE scenario_id = ?`, [scenarioId])[0]
      return row ? mapScenarioStats(row) : null
    })
  }

  list(): Promise<ScenarioStats[]> {
    return this.context.read((db) =>
      db.exec(`SELECT ${COLUMNS} FROM scenario_stats ORDER BY scenario_id ASC`).map(mapScenarioStats),
    )
  }

  async upsert(stats: ScenarioStats): Promise<void> {
    assertNonEmpty(stats.scenarioId, 'stats.scenarioId')
    await this.context.write((db) => {
      db.run(
        `INSERT INTO scenario_stats (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(scenario_id) DO UPDATE SET
           attempts = excluded.attempts,
           passes = excluded.passes,
           best_score = excluded.best_score,
           last_played_at = excluded.last_played_at,
           leitner_box = excluded.leitner_box,
           due_at = excluded.due_at`,
        [
          stats.scenarioId,
          stats.attempts,
          stats.passes,
          stats.bestScore,
          stats.lastPlayedAt,
          stats.leitnerBox,
          stats.dueAt,
        ],
      )
    })
  }
}
