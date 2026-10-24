// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { applyDeviceAction } from '../../../src/modules/intune/logic/actions'
import { evaluateCompliance } from '../../../src/modules/intune/logic/compliance'
import { IntuneStore } from '../../../src/modules/intune/persistence/store'
import { IntuneService } from '../../../src/modules/intune/service'
import {
  INTUNE_TICKET_TEMPLATES,
} from '../../../src/modules/intune/tickets/templates'
import {
  isIntuneTicketComplete,
  registerIntuneTicketTemplates,
} from '../../../src/modules/intune/tickets/registry'
import type { IntuneState } from '../../../src/modules/intune/types'
import { runMigrations } from '../../../src/persistence/migrations'
import { createSqliteDriver, type SqliteDriver } from '../../../src/persistence/sqlite'
import { loadWasmBinary } from '../../helpers/sqlite'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

function device(state: IntuneState, id: string) {
  const found = state.devices.find((entry) => entry.id === id)
  if (!found) {
    throw new Error(`missing device ${id}`)
  }
  return found
}

describe('seeded estate', () => {
  let db: SqliteDriver
  let state: IntuneState

  beforeEach(async () => {
    db = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(db)
    const store = new IntuneStore({
      read: async (operation) => operation(db),
      write: async (operation) => operation(db),
    })
    state = await store.ensureSeeded(NOW)
  })

  it('seeds twelve people, fifteen devices, two policies and four apps', () => {
    expect(state.users).toHaveLength(12)
    expect(state.devices).toHaveLength(15)
    expect(state.policies).toHaveLength(2)
    expect(state.apps).toHaveLength(4)
    expect(state.devices.filter((entry) => entry.platform === 'Windows')).toHaveLength(8)
    expect(state.devices.filter((entry) => entry.platform === 'iOS')).toHaveLength(4)
    expect(state.devices.filter((entry) => entry.platform === 'Android')).toHaveLength(3)
  })

  it('judges each device against the policy that applies to it', () => {
    // BitLocker is off, and the Windows baseline requires it.
    expect(device(state, 'dev-lt-2207').compliance).toBe('non-compliant')
    // Failed the build rule yesterday: inside the three-day grace.
    expect(device(state, 'dev-lt-2318').compliance).toBe('in-grace')
    // Silent for six weeks: the console will not pretend to know.
    expect(device(state, 'dev-ws-1120').compliance).toBe('not-evaluated')
    expect(device(state, 'dev-ws-1120').lastCheckIn).toBeLessThan(NOW - 14 * DAY)
    // Checked in, but not re-judged since the policy changed.
    expect(device(state, 'dev-ws-1264').compliance).toBe('not-evaluated')
    expect(device(state, 'dev-ws-1264').policyStale).toBe(true)
    expect(device(state, 'dev-ws-1042').compliance).toBe('compliant')
    expect(device(state, 'dev-iph-3355').compliance).toBe('non-compliant')
  })
})

describe('device actions', () => {
  let state: IntuneState

  beforeEach(async () => {
    const db = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(db)
    const store = new IntuneStore({
      read: async (operation) => operation(db),
      write: async (operation) => operation(db),
    })
    state = await store.ensureSeeded(NOW)
  })

  it('syncs a healthy device, applies the policy and clears the failure', () => {
    const result = applyDeviceAction(state, {
      deviceId: 'dev-lt-2207',
      action: 'sync',
      now: NOW,
    })

    const updated = device(result.state, 'dev-lt-2207')
    expect(result.status).toBe('applied')
    expect(updated.bitlocker).toBe(true)
    expect(updated.compliance).toBe('compliant')
    expect(updated.lastCheckIn).toBe(NOW)
    expect(updated.nonComplianceSince).toBeNull()
    expect(result.state.events).toHaveLength(1)
  })

  it('fails to sync a device that has been silent for a fortnight', () => {
    const result = applyDeviceAction(state, {
      deviceId: 'dev-ws-1120',
      action: 'sync',
      now: NOW,
    })

    expect(result.status).toBe('failed')
    expect(device(result.state, 'dev-ws-1120').lastCheckIn).toBe(device(state, 'dev-ws-1120').lastCheckIn)
    expect(result.notes.join(' ')).toContain('not delivered')
  })

  it('requeues a failed install on restart, and installs it on sync', () => {
    const restarted = applyDeviceAction(state, {
      deviceId: 'dev-lt-2402',
      action: 'restart',
      now: NOW,
    })
    const afterRestart = device(restarted.state, 'dev-lt-2402')
    expect(afterRestart.apps.find((entry) => entry.appId === 'app-portal')?.status).toBe('pending')

    const synced = applyDeviceAction(restarted.state, {
      deviceId: 'dev-lt-2402',
      action: 'sync',
      now: NOW + 1000,
    })
    expect(device(synced.state, 'dev-lt-2402').apps.find((entry) => entry.appId === 'app-portal')?.status).toBe(
      'installed',
    )
  })

  it('wipes a lost phone: data gone, owner cleared, device out of the service', () => {
    const result = applyDeviceAction(state, {
      deviceId: 'dev-iph-3390',
      action: 'wipe',
      now: NOW,
    })

    const updated = device(result.state, 'dev-iph-3390')
    expect(updated.lifecycle).toBe('wiped')
    expect(updated.ownerUserId).toBeNull()
    expect(updated.groupId).toBeNull()
    expect(updated.lastCheckIn).toBeNull()
    expect(updated.apps.every((entry) => entry.status === 'not-installed')).toBe(true)
    // A wiped device takes no further orders.
    const again = applyDeviceAction(result.state, {
      deviceId: 'dev-iph-3390',
      action: 'sync',
      now: NOW,
    })
    expect(again.status).toBe('refused')
  })

  it('retires a leaver device and drops its app assignments', () => {
    const result = applyDeviceAction(state, {
      deviceId: 'dev-and-4455',
      action: 'retire',
      now: NOW,
    })
    const updated = device(result.state, 'dev-and-4455')
    expect(updated.lifecycle).toBe('retired')
    expect(updated.groupId).toBeNull()
    expect(evaluateCompliance(updated, state.policies, NOW).state).toBe('not-evaluated')
  })

  it('moves the primary user, and refuses a disabled account', () => {
    const result = applyDeviceAction(state, {
      deviceId: 'dev-ws-1301',
      action: 'reassign-user',
      now: NOW,
      userId: 'usr-kai',
    })
    expect(device(result.state, 'dev-ws-1301').ownerUserId).toBe('usr-kai')

    const refused = applyDeviceAction(result.state, {
      deviceId: 'dev-ws-1301',
      action: 'reassign-user',
      now: NOW,
      userId: 'usr-lena',
    })
    expect(refused.status).toBe('refused')
    expect(refused.summary).toContain('disabled')
  })

  it('assigns the group standard set and syncs it in', () => {
    const assigned = applyDeviceAction(state, {
      deviceId: 'dev-iph-3366',
      action: 'assign-apps',
      now: NOW,
    })
    const afterAssign = device(assigned.state, 'dev-iph-3366')
    expect(afterAssign.apps.length).toBeGreaterThan(0)
    expect(afterAssign.apps.every((entry) => entry.status === 'pending')).toBe(true)

    const synced = applyDeviceAction(assigned.state, {
      deviceId: 'dev-iph-3366',
      action: 'sync',
      now: NOW + 1000,
    })
    expect(device(synced.state, 'dev-iph-3366').apps.every((entry) => entry.status === 'installed')).toBe(
      true,
    )
  })
})

describe('tickets and scoring', () => {
  let state: IntuneState
  let service: IntuneService

  beforeEach(async () => {
    const db = await createSqliteDriver(undefined, { wasmBinary: loadWasmBinary() })
    runMigrations(db)
    const store = new IntuneStore({
      read: async (operation) => operation(db),
      write: async (operation) => operation(db),
    })
    state = await store.ensureSeeded(NOW)
    service = new IntuneService(store, () => NOW)
  })

  it('offers eight tickets through the registration seam', () => {
    const offered: string[] = []
    const returned = registerIntuneTicketTemplates({ offer: (template) => offered.push(template.id) })
    expect(returned).toHaveLength(8)
    expect(offered).toEqual(INTUNE_TICKET_TEMPLATES.map((template) => template.id))
  })

  it('resolves a ticket only when the estate agrees', () => {
    expect(isIntuneTicketComplete('tpl-bitlocker-off', state)).toBe(false)

    const result = applyDeviceAction(state, {
      deviceId: 'dev-lt-2207',
      action: 'sync',
      now: NOW,
    })
    expect(isIntuneTicketComplete('tpl-bitlocker-off', result.state)).toBe(true)
  })

  it('records the read step without changing the device', async () => {
    const result = await service.review('dev-lt-2207')

    expect(result.summary).toContain('Windows baseline: BitLocker is off')
    const event = result.state.events.at(-1)
    expect(event?.action).toBe('review')
    expect(event?.summary).toBe(result.summary)
    // A read is not a fix: the device is exactly as it was.
    expect(device(result.state, 'dev-lt-2207')).toEqual(device(state, 'dev-lt-2207'))
  })

  it('awards full marks for the reference path', async () => {
    const startedAt = NOW - 60_000
    // The reference path starts by reading the record, then fixes it.
    await service.review('dev-lt-2207')
    await service.act({ deviceId: 'dev-lt-2207', action: 'sync' })
    const { score } = await service.score('tpl-bitlocker-off', startedAt)

    expect(score.resolved).toBe(true)
    expect(score.total).toBe(100)
    expect(score.band).toBe('strong')
    expect(score.deductions).toHaveLength(0)
    // The rubric split the rest of the app keeps: reading first is diagnosis,
    // the actions and the end state are resolution, and safety pays its own 15.
    expect(score.categoryScores.diagnosis).toEqual({ earned: 10, possible: 10 })
    expect(score.categoryScores.resolution).toEqual({ earned: 75, possible: 75 })
    expect(score.categoryScores.safety).toEqual({ earned: 15, possible: 15 })
    expect(score.categoryScores.documentation.possible).toBe(0)
  })

  it('withholds the diagnosis points when the fix comes before the record', async () => {
    const startedAt = NOW - 60_000
    await service.act({ deviceId: 'dev-lt-2207', action: 'sync' })
    await service.review('dev-lt-2207')
    const { score } = await service.score('tpl-bitlocker-off', startedAt)

    // The ticket is still resolved by the right action, but the reasoning was
    // never shown: 90, with diagnosis reading zero.
    expect(score.resolved).toBe(true)
    expect(score.total).toBe(90)
    expect(score.categoryScores.diagnosis).toEqual({ earned: 0, possible: 10 })
    expect(score.items.find((item) => item.id === 'read-first')?.passed).toBe(false)
  })

  it('charges for a wipe the ticket never asked for', async () => {
    const startedAt = NOW - 60_000
    await service.act({ deviceId: 'dev-lt-2207', action: 'wipe' })
    const { score } = await service.score('tpl-bitlocker-off', startedAt)

    expect(score.resolved).toBe(false)
    expect(score.penalty).toBe(40)
    expect(score.total).toBeLessThan(75)
    expect(score.deductions[0]).toContain('not needed for this ticket')
    // The charge lands in the category it damaged, as the app's evaluator does.
    expect(score.categoryScores.safety).toEqual({ earned: 0, possible: 15 })
    expect(score.categoryScores.resolution).toEqual({ earned: 0, possible: 75 })
    expect(score.categoryScores.diagnosis).toEqual({ earned: 0, possible: 10 })
  })

  it('records an attempt once per start, so re-checking does not duplicate it', async () => {
    const startedAt = NOW - 30_000
    await service.act({ deviceId: 'dev-lt-2207', action: 'sync' })
    await service.score('tpl-bitlocker-off', startedAt)
    await service.score('tpl-bitlocker-off', startedAt)

    const attempts = await service.attempts()
    expect(attempts.filter((attempt) => attempt.startedAt === startedAt)).toHaveLength(1)
  })

  it('resets the estate to the seed', async () => {
    await service.act({ deviceId: 'dev-iph-3390', action: 'wipe' })
    const fresh = await service.reset()

    expect(device(fresh, 'dev-iph-3390').lifecycle).toBe('managed')
    expect(fresh.events).toHaveLength(0)
    expect(fresh.devices).toHaveLength(15)
  })
})
