import type { SqliteDriver } from '../../../persistence/sqlite'
import { SEED_GROUPS, SEED_RESOURCES, SEED_ROLES, SEED_RULES } from '../data/seed'
import type {
  AzureEvent,
  AzureProperties,
  AzureResource,
  AzureRoleAssignment,
  AzureState,
  NsgRule,
  RoleName,
} from '../types'

/**
 * The store's only view of the database.
 *
 * Structural rather than imported from `persistence/repositories/context`: the
 * module then depends on no app code at run time, so lifting it out means moving
 * this folder and nothing else.
 */
export interface AzureDatabase {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}

export interface AzureAttemptRecord {
  id: string
  templateId: string
  resourceId: string
  startedAt: number
  finishedAt: number | null
  score: number | null
  scoreJson: string | null
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export class AzureStore {
  private readonly database: AzureDatabase

  constructor(database: AzureDatabase) {
    this.database = database
  }

  private readState(db: SqliteDriver): AzureState {
    const groups = db.exec('SELECT id, name, region, owner_team FROM azure_resource_groups ORDER BY name')
    const resources = db.exec(
      'SELECT id, name, resource_group_id, region, properties_json, deleted FROM azure_resources ORDER BY name',
    )
    const rules = db.exec(
      `SELECT id, nsg_id, name, priority, direction, access, protocol, port, source
         FROM azure_nsg_rules ORDER BY nsg_id, priority`,
    )
    const roles = db.exec(
      'SELECT id, principal, principal_label, scope, role FROM azure_role_assignments ORDER BY id',
    )
    const events = db.exec(
      'SELECT id, resource_id, action, at_ms, outcome, summary, notes_json FROM azure_events ORDER BY id',
    )

    return {
      resourceGroups: groups.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        region: String(row.region) as AzureState['resourceGroups'][number]['region'],
        ownerTeam: String(row.owner_team),
      })),
      resources: resources.map(
        (row): AzureResource => ({
          id: String(row.id),
          name: String(row.name),
          resourceGroupId: String(row.resource_group_id),
          region: String(row.region) as AzureResource['region'],
          properties: parseJson<AzureProperties>(row.properties_json, {
            kind: 'storage',
            publicBlobAccess: false,
            softDeleteDays: 0,
            tlsMin: '1.2',
            replication: 'LRS',
          }),
          deleted: Number(row.deleted) === 1,
        }),
      ),
      nsgRules: rules.map(
        (row): NsgRule => ({
          id: String(row.id),
          nsgId: String(row.nsg_id),
          name: String(row.name),
          priority: Number(row.priority),
          direction: String(row.direction) as NsgRule['direction'],
          access: String(row.access) as NsgRule['access'],
          protocol: String(row.protocol) as NsgRule['protocol'],
          port: row.port === null ? null : Number(row.port),
          source: String(row.source) as NsgRule['source'],
        }),
      ),
      roles: roles.map(
        (row): AzureRoleAssignment => ({
          id: String(row.id),
          principal: String(row.principal),
          principalLabel: String(row.principal_label),
          scope: String(row.scope),
          role: String(row.role) as RoleName,
        }),
      ),
      events: events.map(
        (row): AzureEvent => ({
          id: Number(row.id),
          resourceId: String(row.resource_id),
          action: String(row.action) as AzureEvent['action'],
          at: Number(row.at_ms),
          outcome: String(row.outcome) as AzureEvent['outcome'],
          summary: String(row.summary),
          notes: parseJson<string[]>(row.notes_json, []),
        }),
      ),
    }
  }

  async state(): Promise<AzureState> {
    return this.database.read((db) => this.readState(db))
  }

  /**
   * Seeds the estate the first time the tables are empty.
   *
   * The emptiness check and the inserts share one transaction on purpose: two
   * screens opening at once — or React StrictMode mounting an effect twice —
   * both call this, and a check outside the write let both decide to seed.
   */
  async ensureSeeded(): Promise<AzureState> {
    await this.database.write((db) => {
      const existing = Number(
        db.exec('SELECT COUNT(*) AS count FROM azure_resource_groups')[0]?.count ?? 0,
      )
      if (existing > 0) {
        return
      }
      for (const group of SEED_GROUPS) {
        db.run(
          `INSERT INTO azure_resource_groups (id, name, region, owner_team)
           VALUES (?, ?, ?, ?)`,
          [group.id, group.name, group.region, group.ownerTeam],
        )
      }
      for (const resource of SEED_RESOURCES) {
        this.insertResource(db, resource)
      }
      for (const rule of SEED_RULES) {
        this.insertRule(db, rule)
      }
      for (const role of SEED_ROLES) {
        db.run(
          `INSERT INTO azure_role_assignments (id, principal, principal_label, scope, role)
           VALUES (?, ?, ?, ?, ?)`,
          [role.id, role.principal, role.principalLabel, role.scope, role.role],
        )
      }
    })

    return this.state()
  }

  private insertResource(db: SqliteDriver, resource: AzureResource): void {
    db.run(
      `INSERT INTO azure_resources (id, name, resource_group_id, region, kind, properties_json, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        resource.id,
        resource.name,
        resource.resourceGroupId,
        resource.region,
        resource.properties.kind,
        JSON.stringify(resource.properties),
        resource.deleted ? 1 : 0,
      ],
    )
  }

  private insertRule(db: SqliteDriver, rule: NsgRule): void {
    db.run(
      `INSERT INTO azure_nsg_rules (id, nsg_id, name, priority, direction, access, protocol, port, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.id,
        rule.nsgId,
        rule.name,
        rule.priority,
        rule.direction,
        rule.access,
        rule.protocol,
        rule.port,
        rule.source,
      ],
    )
  }

  /**
   * Writes back everything an action can change — resources, rules, role
   * assignments — inside one transaction, so a delete that takes a group with it
   * cannot leave a rule pointing at a resource that is no longer there.
   */
  async saveState(state: AzureState): Promise<void> {
    await this.database.write((db) => {
      db.run('DELETE FROM azure_nsg_rules')
      db.run('DELETE FROM azure_role_assignments')
      db.run('DELETE FROM azure_resources')
      for (const resource of state.resources) {
        this.insertResource(db, resource)
      }
      for (const rule of state.nsgRules) {
        this.insertRule(db, rule)
      }
      for (const role of state.roles) {
        db.run(
          `INSERT INTO azure_role_assignments (id, principal, principal_label, scope, role)
           VALUES (?, ?, ?, ?, ?)`,
          [role.id, role.principal, role.principalLabel, role.scope, role.role],
        )
      }
    })
  }

  async appendEvent(event: AzureEvent): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO azure_events (id, resource_id, action, at_ms, outcome, summary, notes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.resourceId,
          event.action,
          event.at,
          event.outcome,
          event.summary,
          JSON.stringify(event.notes),
        ],
      )
    })
  }

  async attempts(): Promise<AzureAttemptRecord[]> {
    return this.database.read((db) =>
      db
        .exec(
          `SELECT id, template_id, resource_id, started_at, finished_at, score, score_json
             FROM azure_attempts ORDER BY started_at DESC`,
        )
        .map((row) => ({
          id: String(row.id),
          templateId: String(row.template_id),
          resourceId: String(row.resource_id),
          startedAt: Number(row.started_at),
          finishedAt: row.finished_at === null ? null : Number(row.finished_at),
          score: row.score === null ? null : Number(row.score),
          scoreJson: row.score_json === null ? null : String(row.score_json),
        })),
    )
  }

  async saveAttempt(record: AzureAttemptRecord): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO azure_attempts (id, template_id, resource_id, started_at, finished_at, score, score_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           finished_at = excluded.finished_at,
           score = excluded.score,
           score_json = excluded.score_json`,
        [
          record.id,
          record.templateId,
          record.resourceId,
          record.startedAt,
          record.finishedAt,
          record.score,
          record.scoreJson,
        ],
      )
    })
  }

  /** Puts the estate back to the seed, keeping nothing the learner did. */
  async reset(): Promise<AzureState> {
    await this.database.write((db) => {
      for (const table of [
        'azure_events',
        'azure_attempts',
        'azure_nsg_rules',
        'azure_role_assignments',
        'azure_resources',
        'azure_resource_groups',
      ]) {
        db.run(`DELETE FROM ${table}`)
      }
    })
    return this.ensureSeeded()
  }
}
