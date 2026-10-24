import { STALE_AFTER_DAYS, evaluateCompliance, requiredAppsFor } from './compliance'
import type {
  CompliancePolicy,
  DeviceAction,
  IntuneApp,
  IntuneDevice,
  IntuneEvent,
  IntuneState,
} from '../types'

const DAY = 24 * 60 * 60 * 1000

export interface DeviceActionRequest {
  deviceId: string
  action: DeviceAction
  /** Milliseconds; passed in so an attempt is reproducible in tests. */
  now: number
  /** The new primary user, for `reassign-user`. */
  userId?: string
  /** Restricts `assign-apps`; the whole required set by default. */
  appIds?: readonly string[]
}

export interface DeviceActionOutcome {
  state: IntuneState
  event: IntuneEvent
  status: 'applied' | 'refused' | 'failed'
  summary: string
  notes: readonly string[]
}

function copyDevice(device: IntuneDevice): IntuneDevice {
  return { ...device, apps: device.apps.map((entry) => ({ ...entry })) }
}

function silentDays(device: IntuneDevice, now: number): number {
  return device.lastCheckIn === null ? Number.POSITIVE_INFINITY : (now - device.lastCheckIn) / DAY
}

/**
 * Re-judges a device and keeps the clock that grace is measured from.
 *
 * The first evaluation that fails starts that clock; a device that passes again
 * clears it, so a device that breaks next month gets its grace back.
 */
export function settle(
  device: IntuneDevice,
  policies: readonly CompliancePolicy[],
  now: number,
): IntuneDevice {
  const verdict = evaluateCompliance(device, policies, now)
  const failingNow = verdict.state === 'non-compliant' || verdict.state === 'in-grace'
  return {
    ...device,
    compliance: verdict.state,
    complianceReasons: verdict.reasons,
    nonComplianceSince: failingNow ? (device.nonComplianceSince ?? now) : null,
  }
}

/** Judges a whole estate, which is what seeding and a policy read both need. */
export function evaluateAll(
  devices: readonly IntuneDevice[],
  policies: readonly CompliancePolicy[],
  now: number,
): IntuneDevice[] {
  return devices.map((device) => settle(device, policies, now))
}

/**
 * Applies the settings a policy can set without the user doing anything. The OS
 * version is the exception, and stays that way: a console cannot install a
 * feature update onto a machine that is switched off, and a ticket that pretends
 * otherwise teaches the wrong reflex.
 */
function applyPolicySettings(
  device: IntuneDevice,
  policies: readonly CompliancePolicy[],
  notes: string[],
): void {
  for (const policy of policies) {
    const applies =
      policy.platform === 'mobile'
        ? device.platform === 'iOS' || device.platform === 'Android'
        : device.platform === 'Windows'
    if (!applies) {
      continue
    }
    for (const rule of policy.rules) {
      if (rule.kind === 'bitlocker' && !device.bitlocker) {
        device.bitlocker = true
        device.encrypted = true
        notes.push('BitLocker was switched on by policy')
      }
      if (rule.kind === 'passcode' && !device.passcodeSet) {
        device.passcodeSet = true
        notes.push('Device passcode set by policy')
      }
      if (rule.kind === 'encryption' && !device.encrypted) {
        device.encrypted = true
        notes.push('Storage encryption switched on by policy')
      }
    }
  }
}

function appsAssignedTo(apps: readonly IntuneApp[], groupId: string): readonly IntuneApp[] {
  return apps.filter((app) => app.assignment.groupIds.includes(groupId))
}

export function applyDeviceAction(
  state: IntuneState,
  request: DeviceActionRequest,
): DeviceActionOutcome {
  const current = state.devices.find((device) => device.id === request.deviceId)
  if (!current) {
    throw new Error(`Unknown device: ${request.deviceId}`)
  }

  const now = request.now
  const device = copyDevice(current)
  const notes: string[] = []
  let status: DeviceActionOutcome['status'] = 'applied'
  let summary = ''

  const refuse = (why: string): DeviceActionOutcome => {
    const event: IntuneEvent = {
      id: Math.max(0, ...state.events.map((entry) => entry.id)) + 1,
      deviceId: device.id,
      action: request.action,
      at: now,
      outcome: 'refused',
      summary: why,
      notes: [],
    }
    return { state: { ...state, events: [...state.events, event] }, event, status: 'refused', summary: why, notes: [] }
  }

  switch (request.action) {
    case 'sync': {
      if (device.lifecycle !== 'managed') {
        return refuse('The device is no longer managed, so it cannot check in')
      }
      if (silentDays(device, now) > STALE_AFTER_DAYS) {
        status = 'failed'
        summary = `No response from ${device.name}`
        notes.push(
          device.lastCheckIn === null
            ? 'The device has never reported, so the command had nowhere to go.'
            : `Last check-in was ${Math.floor(silentDays(device, now))} days ago; the command was not delivered.`,
        )
        break
      }
      if (device.policyStale) {
        device.policyStale = false
        notes.push('Compliance re-evaluated against the current policy')
      }
      device.lastCheckIn = now
      notes.push('Device checked in')
      applyPolicySettings(device, state.policies, notes)
      for (const entry of device.apps) {
        if (entry.status === 'pending') {
          entry.status = 'installed'
          entry.lastAttempt = now
          const name = state.apps.find((app) => app.id === entry.appId)?.name ?? entry.appId
          notes.push(`${name} installed`)
        }
      }
      summary = `${device.name} checked in`
      break
    }

    case 'restart': {
      if (device.lifecycle !== 'managed') {
        return refuse('The device is no longer managed, so it cannot be restarted')
      }
      if (silentDays(device, now) > STALE_AFTER_DAYS) {
        status = 'failed'
        summary = `No response from ${device.name}`
        notes.push('The restart command was not delivered; the device has not reported recently.')
        break
      }
      device.lastCheckIn = now
      notes.push('Device restarted')
      let queued = 0
      for (const entry of device.apps) {
        if (entry.status === 'failed') {
          entry.status = 'pending'
          entry.lastAttempt = now
          queued += 1
        }
      }
      if (queued > 0) {
        notes.push(`${queued} app install${queued === 1 ? '' : 's'} queued for another attempt`)
      }
      summary = `${device.name} restarted`
      break
    }

    case 'remove-group': {
      if (device.lifecycle !== 'managed') {
        return refuse('The device is no longer managed')
      }
      if (device.groupId === null) {
        return refuse(`${device.name} is not in a group`)
      }
      const group = device.groupId
      device.groupId = null
      for (const entry of device.apps) {
        if (appsAssignedTo(state.apps, group).some((app) => app.id === entry.appId)) {
          entry.status = 'not-installed'
          entry.lastAttempt = null
        }
      }
      notes.push(`Removed from ${group}; its app assignments went with it`)
      summary = `${device.name} removed from its group`
      break
    }

    case 'assign-apps': {
      if (device.lifecycle !== 'managed') {
        return refuse('The device is no longer managed, so nothing can be deployed to it')
      }
      const targets: readonly IntuneApp[] = request.appIds
        ? state.apps.filter((app) => request.appIds?.includes(app.id))
        : requiredAppsFor(device, state.apps)
      const deployable = targets.filter((app) => {
        const existing = device.apps.find((entry) => entry.appId === app.id)
        return existing === undefined || existing.status !== 'installed'
      })
      if (deployable.length === 0) {
        return refuse('Every app in the standard set is already installed')
      }
      for (const app of deployable) {
        const existing = device.apps.find((entry) => entry.appId === app.id)
        if (existing) {
          existing.status = 'pending'
          existing.lastAttempt = now
        } else {
          device.apps.push({ appId: app.id, status: 'pending', lastAttempt: now })
        }
        notes.push(`${app.name} assigned, waiting for the device to collect it`)
      }
      summary = `${deployable.length} app${deployable.length === 1 ? '' : 's'} assigned to ${device.name}`
      break
    }

    case 'reassign-user': {
      if (device.lifecycle !== 'managed') {
        return refuse('The device is no longer managed')
      }
      const target = state.users.find((user) => user.id === request.userId)
      if (!target) {
        return refuse('Choose an account to make the primary user')
      }
      if (target.status === 'disabled') {
        return refuse(`${target.displayName}'s account is disabled and cannot take a device`)
      }
      if (device.ownerUserId === target.id) {
        return refuse(`${target.displayName} is already the primary user`)
      }
      const previous = state.users.find((user) => user.id === device.ownerUserId)
      device.ownerUserId = target.id
      notes.push(
        previous
          ? `Primary user changed from ${previous.displayName} to ${target.displayName}`
          : `Primary user set to ${target.displayName}`,
      )
      summary = `${device.name} now belongs to ${target.displayName}`
      break
    }

    case 'retire': {
      if (device.lifecycle !== 'managed') {
        return refuse(`${device.name} is already ${device.lifecycle}`)
      }
      const owner = state.users.find((user) => user.id === device.ownerUserId)
      device.lifecycle = 'retired'
      device.ownerUserId = null
      device.groupId = null
      device.lost = false
      for (const entry of device.apps) {
        entry.status = 'not-installed'
        entry.lastAttempt = null
      }
      notes.push('Company data and app assignments removed')
      if (owner) {
        notes.push(`${owner.displayName} released as primary user`)
      }
      summary = `${device.name} retired`
      break
    }

    case 'wipe': {
      if (device.lifecycle !== 'managed') {
        return refuse(`${device.name} is already ${device.lifecycle}`)
      }
      device.lifecycle = 'wiped'
      device.ownerUserId = null
      device.groupId = null
      device.lost = false
      device.lastCheckIn = null
      for (const entry of device.apps) {
        entry.status = 'not-installed'
        entry.lastAttempt = null
      }
      notes.push('Factory reset issued; the device left the service')
      notes.push('No data can be recovered from this device now')
      summary = `${device.name} wiped`
      break
    }
  }

  const settled = settle(device, state.policies, now)
  const event: IntuneEvent = {
    id: Math.max(0, ...state.events.map((entry) => entry.id)) + 1,
    deviceId: device.id,
    action: request.action,
    at: now,
    outcome: status,
    summary,
    notes,
  }

  return {
    state: {
      ...state,
      devices: state.devices.map((entry) => (entry.id === settled.id ? settled : entry)),
      events: [...state.events, event],
    },
    event,
    status,
    summary,
    notes,
  }
}
