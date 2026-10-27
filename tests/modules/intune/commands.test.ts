// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  SEED_APPS,
  SEED_POLICIES,
  SEED_USERS,
  seedDevices,
} from '../../../src/modules/intune/data/seed'
import { evaluateAll } from '../../../src/modules/intune/logic/actions'
import { runIntuneCommand, type IntunePlan } from '../../../src/modules/intune/logic/commands'
import type { IntuneState } from '../../../src/modules/intune/types'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

/** The estate as the console first opens it: seeded, then judged. */
function estate(): IntuneState {
  return {
    users: SEED_USERS,
    devices: evaluateAll(seedDevices(NOW), SEED_POLICIES, NOW),
    policies: SEED_POLICIES,
    apps: SEED_APPS,
    events: [],
  }
}

function printed(plan: IntunePlan): string {
  if (plan.kind !== 'print') {
    throw new Error(`expected the shell to print, but it asked for a ${plan.kind}`)
  }
  return plan.response.lines.map((entry) => entry.text).join('\n')
}

describe('the Intune shell', () => {
  it('lists its commands and says where the destructive ones live', () => {
    const output = printed(runIntuneCommand(estate(), 'help', NOW))

    expect(output).toContain('Get-Devices')
    expect(output).toContain('Set-DeviceOwner')
    expect(output).toContain('Clear-Host')
    // The shell is not a second, quieter way to wipe a phone.
    expect(output).toContain('Retire and Wipe are not here')
  })

  it('lists the estate with a compliance column and a count', () => {
    const output = printed(runIntuneCommand(estate(), 'Get-Devices', NOW))

    expect(output).toContain('Compliance')
    expect(output).toContain('LT-2207')
    expect(output).toContain('15 devices.')
  })

  it('reads one device as a record the attempt keeps', () => {
    const plan = runIntuneCommand(estate(), 'Get-Device LT-2207', NOW)

    expect(plan.kind).toBe('read')
    if (plan.kind !== 'read') {
      return
    }

    const record = plan.record.map((entry) => entry.text).join('\n')
    expect(plan.deviceId).toBe('dev-lt-2207')
    expect(record).toContain('LT-2207')
    expect(record).toContain('Bram Okonkwo')
    expect(record).toContain('non-compliant')
    expect(record).toContain('Windows baseline')
  })

  it('matches a device however the name is typed', () => {
    expect(runIntuneCommand(estate(), 'get-device lt-2207', NOW).kind).toBe('read')
  })

  it('names the devices when a name misses', () => {
    const output = printed(runIntuneCommand(estate(), 'Get-Device ZX-0000', NOW))

    expect(output).toContain('No device named')
    expect(output).toContain('Get-Devices lists every device')
  })

  it('asks for the action the page would run, rather than running it itself', () => {
    const plan = runIntuneCommand(estate(), 'Sync-Device LT-2207', NOW)

    expect(plan).toEqual({ kind: 'act', deviceId: 'dev-lt-2207', action: 'sync' })
  })

  it('resolves a primary user from the account name', () => {
    const plan = runIntuneCommand(estate(), 'Set-DeviceOwner LT-2207 ada.whitfield', NOW)

    expect(plan).toEqual({
      kind: 'act',
      deviceId: 'dev-lt-2207',
      action: 'reassign-user',
      userId: 'usr-ada',
    })
  })

  it('refuses to destroy a device from the shell', () => {
    const output = printed(runIntuneCommand(estate(), 'Wipe-Device LT-2207', NOW))

    expect(output).toContain('not available in the shell')
    expect(output).toContain('/intune/devices/dev-lt-2207')
  })

  it('prints the policies and the rules they set', () => {
    const output = printed(runIntuneCommand(estate(), 'Get-Policies', NOW))

    expect(output).toContain('Windows baseline')
    expect(output).toContain('BitLocker encryption')
  })

  it('says so when it does not know the command', () => {
    const output = printed(runIntuneCommand(estate(), 'Get-Imaginary', NOW))

    expect(output).toContain('Unrecognised command')
    expect(output).toContain('Type help')
  })
})
