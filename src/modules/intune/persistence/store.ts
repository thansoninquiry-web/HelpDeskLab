import type { SqliteDriver } from '../../../persistence/sqlite'
import { SEED_APPS, SEED_POLICIES, SEED_USERS, seedDevices } from '../data/seed'
import { evaluateAll } from '../logic/actions'
import type {
  AppAssignment,
  CompliancePolicy,
  DeviceApp,
  DeviceLifecycle,
  ComplianceState,
  IntuneApp,
  IntuneDevice,
  IntuneEvent,
  IntuneState,
  IntuneUser,
  PolicyRule,
} from '../types'

/**
 * The store's only view of the database.
 *
 * Structural rather than imported from `persistence/repositories/context`: the
 * module then depends on no app code at run time, so lifting it out means moving
 * this folder and nothing else.
 */
export interface IntuneDatabase {
  read<T>(operation: (db: SqliteDriver) => T): Promise<T>
  write<T>(operation: (db: SqliteDriver) => T): Promise<T>
}

export interface IntuneAttemptRecord {
  id: string
  templateId: string
  deviceId: string
  startedAt: number
  finishedAt: number | null
  score: number | null
  scoreJson: string | null
}

const flag = (value: unknown): boolean => Number(value) === 1
const one = (value: unknown): 0 | 1 => (value ? 1 : 0)

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

export class IntuneStore {
  private readonly database: IntuneDatabase

  constructor(database: IntuneDatabase) {
    this.database = database
  }

  private readState(db: SqliteDriver): IntuneState {
    const users = db.exec(
      'SELECT id, display_name, upn, department, job_title, status, group_id FROM intune_users ORDER BY display_name',
    )
    const policies = db.exec(
      'SELECT id, name, description, platform, rules_json, grace_days FROM intune_policies ORDER BY name',
    )
    const apps = db.exec(
      'SELECT id, name, publisher, platform, assignment_json FROM intune_apps ORDER BY name',
    )
    const devices = db.exec(
      `SELECT id, name, owner_user_id, platform, os_version, enrolled_at, last_check_in,
              lifecycle, group_id, bitlocker, passcode_set, encrypted, lost, policy_stale,
              non_compliance_since, compliance, reasons_json
         FROM intune_devices ORDER BY name`,
    )
    const deviceApps = db.exec(
      'SELECT device_id, app_id, status, last_attempt FROM intune_device_apps',
    )
    const events = db.exec(
      'SELECT id, device_id, action, at_ms, outcome, summary, notes_json FROM intune_events ORDER BY id',
    )

    const appsByDevice = new Map<string, DeviceApp[]>()
    for (const row of deviceApps) {
      const deviceId = String(row.device_id)
      const entry: DeviceApp = {
        appId: String(row.app_id),
        status: String(row.status) as DeviceApp['status'],
        lastAttempt: row.last_attempt === null ? null : Number(row.last_attempt),
      }
      const list = appsByDevice.get(deviceId)
      if (list) {
        list.push(entry)
      } else {
        appsByDevice.set(deviceId, [entry])
      }
    }

    return {
      users: users.map(
        (row): IntuneUser => ({
          id: String(row.id),
          displayName: String(row.display_name),
          upn: String(row.upn),
          department: String(row.department),
          jobTitle: String(row.job_title),
          status: String(row.status) as IntuneUser['status'],
          groupId: String(row.group_id),
        }),
      ),
      policies: policies.map(
        (row): CompliancePolicy => ({
          id: String(row.id),
          name: String(row.name),
          description: String(row.description),
          platform: String(row.platform) as CompliancePolicy['platform'],
          rules: parseJson<PolicyRule[]>(row.rules_json, []),
          graceDays: Number(row.grace_days),
        }),
      ),
      apps: apps.map(
        (row): IntuneApp => ({
          id: String(row.id),
          name: String(row.name),
          publisher: String(row.publisher),
          platform: String(row.platform) as IntuneApp['platform'],
          assignment: parseJson<AppAssignment>(row.assignment_json, {
            groupIds: [],
            install: 'required',
          }),
        }),
      ),
      devices: devices.map(
        (row): IntuneDevice => ({
          id: String(row.id),
          name: String(row.name),
          ownerUserId: row.owner_user_id === null ? null : String(row.owner_user_id),
          platform: String(row.platform) as IntuneDevice['platform'],
          osVersion: String(row.os_version),
          enrolledAt: Number(row.enrolled_at),
          lastCheckIn: row.last_check_in === null ? null : Number(row.last_check_in),
          lifecycle: String(row.lifecycle) as DeviceLifecycle,
          groupId: row.group_id === null ? null : String(row.group_id),
          bitlocker: flag(row.bitlocker),
          passcodeSet: flag(row.passcode_set),
          encrypted: flag(row.encrypted),
          lost: flag(row.lost),
          policyStale: flag(row.policy_stale),
          nonComplianceSince:
            row.non_compliance_since === null ? null : Number(row.non_compliance_since),
          compliance: String(row.compliance) as ComplianceState,
          complianceReasons: parseJson<string[]>(row.reasons_json, []),
          apps: appsByDevice.get(String(row.id)) ?? [],
        }),
      ),
      events: events.map(
        (row): IntuneEvent => ({
          id: Number(row.id),
          deviceId: String(row.device_id),
          action: String(row.action) as IntuneEvent['action'],
          at: Number(row.at_ms),
          outcome: String(row.outcome) as IntuneEvent['outcome'],
          summary: String(row.summary),
          notes: parseJson<string[]>(row.notes_json, []),
        }),
      ),
    }
  }

  async state(): Promise<IntuneState> {
    return this.database.read((db) => this.readState(db))
  }

  /**
   * Seeds the estate the first time the tables are empty.
   *
   * The emptiness check and the inserts share one transaction on purpose: two
   * screens opening at once — or React StrictMode mounting an effect twice — both
   * call this, and a check outside the write let both decide to seed. The second
   * insert then broke on the unique sign-in name and the console showed a
   * constraint error instead of a device list.
   */
  async ensureSeeded(now: number): Promise<IntuneState> {
    const seeded = evaluateAll(seedDevices(now), SEED_POLICIES, now)
    await this.database.write((db) => {
      const existing = Number(
        db.exec('SELECT COUNT(*) AS count FROM intune_users')[0]?.count ?? 0,
      )
      if (existing > 0) {
        return
      }
      for (const user of SEED_USERS) {
        db.run(
          `INSERT INTO intune_users (id, display_name, upn, department, job_title, status, group_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            user.displayName,
            user.upn,
            user.department,
            user.jobTitle,
            user.status,
            user.groupId,
          ],
        )
      }
      for (const policy of SEED_POLICIES) {
        db.run(
          `INSERT INTO intune_policies (id, name, description, platform, rules_json, grace_days)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            policy.id,
            policy.name,
            policy.description,
            policy.platform,
            JSON.stringify(policy.rules),
            policy.graceDays,
          ],
        )
      }
      for (const app of SEED_APPS) {
        db.run(
          `INSERT INTO intune_apps (id, name, publisher, platform, assignment_json)
           VALUES (?, ?, ?, ?, ?)`,
          [app.id, app.name, app.publisher, app.platform, JSON.stringify(app.assignment)],
        )
      }
      for (const device of seeded) {
        this.insertDevice(db, device)
      }
    })

    return this.state()
  }

  private insertDevice(db: SqliteDriver, device: IntuneDevice): void {
    db.run(
      `INSERT INTO intune_devices (id, name, owner_user_id, platform, os_version, enrolled_at,
        last_check_in, lifecycle, group_id, bitlocker, passcode_set, encrypted, lost,
        policy_stale, non_compliance_since, compliance, reasons_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        device.id,
        device.name,
        device.ownerUserId,
        device.platform,
        device.osVersion,
        device.enrolledAt,
        device.lastCheckIn,
        device.lifecycle,
        device.groupId,
        one(device.bitlocker),
        one(device.passcodeSet),
        one(device.encrypted),
        one(device.lost),
        one(device.policyStale),
        device.nonComplianceSince,
        device.compliance,
        JSON.stringify(device.complianceReasons),
      ],
    )
    for (const entry of device.apps) {
      db.run(
        `INSERT INTO intune_device_apps (device_id, app_id, status, last_attempt)
         VALUES (?, ?, ?, ?)`,
        [device.id, entry.appId, entry.status, entry.lastAttempt],
      )
    }
  }

  /** Writes back one device and its install list, after an action changed it. */
  async saveDevice(device: IntuneDevice): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `UPDATE intune_devices SET owner_user_id = ?, lifecycle = ?, group_id = ?, bitlocker = ?,
           passcode_set = ?, encrypted = ?, lost = ?, policy_stale = ?, last_check_in = ?,
           non_compliance_since = ?, compliance = ?, reasons_json = ?
         WHERE id = ?`,
        [
          device.ownerUserId,
          device.lifecycle,
          device.groupId,
          one(device.bitlocker),
          one(device.passcodeSet),
          one(device.encrypted),
          one(device.lost),
          one(device.policyStale),
          device.lastCheckIn,
          device.nonComplianceSince,
          device.compliance,
          JSON.stringify(device.complianceReasons),
          device.id,
        ],
      )
      for (const entry of device.apps) {
        db.run(
          `INSERT INTO intune_device_apps (device_id, app_id, status, last_attempt)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(device_id, app_id) DO UPDATE SET
             status = excluded.status, last_attempt = excluded.last_attempt`,
          [device.id, entry.appId, entry.status, entry.lastAttempt],
        )
      }
    })
  }

  async appendEvent(event: IntuneEvent): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO intune_events (id, device_id, action, at_ms, outcome, summary, notes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.deviceId,
          event.action,
          event.at,
          event.outcome,
          event.summary,
          JSON.stringify(event.notes),
        ],
      )
    })
  }

  async attempts(): Promise<IntuneAttemptRecord[]> {
    return this.database.read((db) =>
      db
        .exec(
          `SELECT id, template_id, device_id, started_at, finished_at, score, score_json
             FROM intune_attempts ORDER BY started_at DESC`,
        )
        .map((row) => ({
          id: String(row.id),
          templateId: String(row.template_id),
          deviceId: String(row.device_id),
          startedAt: Number(row.started_at),
          finishedAt: row.finished_at === null ? null : Number(row.finished_at),
          score: row.score === null ? null : Number(row.score),
          scoreJson: row.score_json === null ? null : String(row.score_json),
        })),
    )
  }

  async saveAttempt(record: IntuneAttemptRecord): Promise<void> {
    await this.database.write((db) => {
      db.run(
        `INSERT INTO intune_attempts (id, template_id, device_id, started_at, finished_at, score, score_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           finished_at = excluded.finished_at,
           score = excluded.score,
           score_json = excluded.score_json`,
        [
          record.id,
          record.templateId,
          record.deviceId,
          record.startedAt,
          record.finishedAt,
          record.score,
          record.scoreJson,
        ],
      )
    })
  }

  /** Puts the estate back to the seed, keeping nothing the learner did. */
  async reset(now: number): Promise<IntuneState> {
    await this.database.write((db) => {
      for (const table of [
        'intune_events',
        'intune_attempts',
        'intune_device_apps',
        'intune_devices',
        'intune_apps',
        'intune_policies',
        'intune_users',
      ]) {
        db.run(`DELETE FROM ${table}`)
      }
    })
    return this.ensureSeeded(now)
  }
}
