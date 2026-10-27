import {
  blank,
  column,
  failure,
  line,
  muted,
  since,
  type ConsoleLine,
  type ConsoleResponse,
} from '../../shared/console'
import { appName, policyAppliesTo, requiredAppsFor } from './compliance'
import type { DeviceAction, IntuneDevice, IntuneState } from '../types'

/**
 * The Intune shell.
 *
 * A learner who knows the admin centre knows the cmdlets, and typing them is a
 * better rehearsal of the job than pressing a button that is labelled for them.
 * So the resolver reads like the shell it stands in for: `Get-` reads, `Set-`
 * changes an ownership field, and the verbs that run a device action are named
 * after what they do to the device.
 *
 * Two rules hold it to the rest of the console:
 *
 * - A command never writes. It says what it found, or it asks the page to run
 *   one action through the same service the action bar uses, so the attempt's
 *   activity log is written exactly once and the score is unchanged.
 * - Nothing destructive is reachable from here. Retiring or wiping a device is
 *   still done from the action bar, which states the consequence before it runs;
 *   a terminal that wipes a phone on one line is a console nobody should use.
 */

export interface IntuneActionPlan {
  kind: 'act'
  deviceId: string
  action: DeviceAction
  userId?: string
}

/**
 * The record was read in the shell. It prints what the device says and records
 * the read, because `Get-Device` is the same step as the page's read button and
 * a learner who works from the terminal must not lose the diagnosis credit for
 * it.
 */
export interface IntuneReadPlan {
  kind: 'read'
  deviceId: string
  record: readonly ConsoleLine[]
}

export interface IntunePrintPlan {
  kind: 'print'
  response: ConsoleResponse
}

export type IntunePlan = IntuneActionPlan | IntuneReadPlan | IntunePrintPlan

/** The commands the shell knows, in the order `help` prints them. */
const HELP: readonly (readonly [string, string])[] = [
  ['Get-Devices', 'list every device with its compliance state'],
  ['Get-Device <name>', 'one device: platform, owner, group, enrolment, check-in'],
  ['Get-Compliance <name>', 'the policy verdict and the rules it fails'],
  ['Get-Apps <name>', 'the apps on the device and how each install ended'],
  ['Get-Events <name>', 'the last actions taken on a device'],
  ['Get-Policies', 'the compliance policies and the rules they set'],
  ['Sync-Device <name>', 'apply missing settings, collect installs, re-judge'],
  ['Restart-Device <name>', 'restart the device and retry failed installs'],
  ['Assign-Apps <name>', 'assign the apps the device’s group requires'],
  ['Set-DeviceOwner <name> <account>', 'make an account the primary user'],
  ['Remove-DeviceFromGroup <name>', 'take the device out of its group'],
  ['Clear-Host', 'empty the scrollback'],
]

/** The commands that take a device name, so a typo is not read as a missing argument. */
const DEVICE_COMMANDS = new Set([
  'get-device',
  'get-compliance',
  'get-apps',
  'get-events',
  'sync-device',
  'restart-device',
  'assign-apps',
  'remove-devicefromgroup',
  'set-deviceowner',
  'retire-device',
  'wipe-device',
])

const LABEL = 15

function field(label: string, value: string): ConsoleLine[] {
  return [muted(column(label, LABEL) + value)]
}

function print(lines: readonly ConsoleLine[]): IntunePrintPlan {
  return { kind: 'print', response: { lines } }
}

function findDevice(state: IntuneState, name: string): IntuneDevice | null {
  const wanted = name.toLowerCase()
  return state.devices.find((device) => device.name.toLowerCase() === wanted) ?? null
}

function ruleText(rule: IntuneState['policies'][number]['rules'][number]): string {
  switch (rule.kind) {
    case 'bitlocker':
      return 'BitLocker encryption'
    case 'passcode':
      return 'passcode set'
    case 'encryption':
      return 'storage encrypted'
    case 'min-os':
      return `OS ${rule.version} or newer`
  }
}

function deviceRecord(state: IntuneState, device: IntuneDevice, now: number): ConsoleLine[] {
  const owner = state.users.find((user) => user.id === device.ownerUserId)
  const policies = state.policies.filter((policy) => policyAppliesTo(policy, device))
  return [
    ...field('Name', device.name),
    ...field('Platform', `${device.platform} ${device.osVersion}`),
    ...field('Primary user', owner ? `${owner.displayName} <${owner.upn}>` : 'none'),
    ...field('Group', device.groupId ?? 'none'),
    ...field('Enrolled', since(device.enrolledAt, now)),
    ...field('Last check-in', since(device.lastCheckIn, now)),
    ...field('Lifecycle', device.lifecycle),
    ...field('Lost mode', device.lost ? 'reported lost' : 'no'),
    ...field('Compliance', device.compliance),
    ...field(
      'Policies',
      policies.map((policy) => policy.name).join(', ') || 'none apply',
    ),
  ]
}

/**
 * Resolves one typed line against the estate.
 *
 * `now` is passed in rather than read, because the console prints ages and a
 * command's output has to be reproducible in a test.
 */
export function runIntuneCommand(
  state: IntuneState,
  input: string,
  now = Date.now(),
): IntunePlan {
  const tokens = input.trim().split(/\s+/).filter((token) => token.length > 0)
  const command = (tokens[0] ?? '').toLowerCase()
  const argument = tokens[1]
  const second = tokens[2]

  if (command === '' || command === 'help') {
    return print([
      line('The Intune shell reads the estate and runs the safe device actions.'),
      ...HELP.map(([usage, detail]) => muted(`  ${column(usage, 34)}${detail}`)),
      muted('  Retire and Wipe are not here: they run from the device page, which states the'),
      muted('  consequence first. Type Clear-Host to empty the scrollback.'),
    ])
  }

  if (command === 'clear-host' || command === 'clear') {
    return { kind: 'print', response: { lines: [], cleared: true } }
  }

  if (command === 'get-devices') {
    if (state.devices.length === 0) {
      return print([muted('No device is enrolled.')])
    }
    return print([
      muted(
        column('Name', 12) +
          column('Platform', 9) +
          column('Compliance', 15) +
          column('Lifecycle', 10) +
          'Check-in',
      ),
      ...state.devices
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((device) =>
          line(
            column(device.name, 12) +
              column(device.platform, 9) +
              column(device.compliance, 15) +
              column(device.lifecycle, 10) +
              since(device.lastCheckIn, now),
          ),
        ),
      muted(`${state.devices.length} devices.`),
    ])
  }

  if (command === 'get-policies') {
    if (state.policies.length === 0) {
      return print([muted('No compliance policy exists.')])
    }
    return print(
      state.policies.flatMap((policy) => [
        line(`${policy.name} — ${policy.platform}, grace ${policy.graceDays} days`),
        ...policy.rules.map((rule) => muted(`  · ${ruleText(rule)}`)),
        muted(`  ${policy.description}`),
        blank(),
      ]),
    )
  }

  if (!DEVICE_COMMANDS.has(command)) {
    return print([
      failure(`Unrecognised command: ${tokens[0] ?? input}`),
      muted('Type help for the list.'),
    ])
  }

  // Every command past here acts on one named device.
  if (!argument) {
    return print([failure(`${tokens[0] ?? 'That command'} needs a device name. Get-Devices lists them.`)])
  }

  const device = findDevice(state, argument)
  if (!device) {
    return print([
      failure(`No device named “${argument}”.`),
      muted('Get-Devices lists every device by name.'),
    ])
  }

  if (command === 'get-device') {
    return { kind: 'read', deviceId: device.id, record: deviceRecord(state, device, now) }
  }

  if (command === 'get-compliance') {
    return print([
      line(`${device.name}: ${device.compliance}`),
      ...(device.complianceReasons.length === 0
        ? [muted('  Every applicable rule passes.')]
        : device.complianceReasons.map((reason) => muted(`  · ${reason}`))),
      ...(device.policyStale
        ? [muted('  The device has not been re-judged since its policy changed.')]
        : []),
    ])
  }

  if (command === 'get-apps') {
    const rows = [
      ...device.apps,
      ...requiredAppsFor(device, state.apps)
        .filter((app) => !device.apps.some((entry) => entry.appId === app.id))
        .map((app) => ({ appId: app.id, status: 'not-installed' as const, lastAttempt: null })),
    ].sort((left, right) =>
      appName(state.apps, left.appId).localeCompare(appName(state.apps, right.appId)),
    )

    return print([
      muted(column('App', 28) + column('Status', 15) + 'Last attempt'),
      ...rows.map((entry) =>
        line(
          column(appName(state.apps, entry.appId), 28) +
            column(entry.status, 15) +
            since(entry.lastAttempt, now),
        ),
      ),
    ])
  }

  if (command === 'get-events') {
    const events = state.events
      .filter((event) => event.deviceId === device.id)
      .slice()
      .reverse()
      .slice(0, 10)

    if (events.length === 0) {
      return print([muted(`Nothing has been done to ${device.name} yet.`)])
    }

    return print(
      events.map((event) =>
        line(
          `${column(since(event.at, now), 10)}${column(event.action, 15)}${column(
            event.outcome,
            9,
          )}${event.summary}`,
        ),
      ),
    )
  }

  if (command === 'sync-device') {
    return { kind: 'act', deviceId: device.id, action: 'sync' }
  }

  if (command === 'restart-device') {
    return { kind: 'act', deviceId: device.id, action: 'restart' }
  }

  if (command === 'assign-apps') {
    return { kind: 'act', deviceId: device.id, action: 'assign-apps' }
  }

  if (command === 'remove-devicefromgroup') {
    return { kind: 'act', deviceId: device.id, action: 'remove-group' }
  }

  if (command === 'set-deviceowner') {
    if (!second) {
      return print([failure('Set-DeviceOwner needs an account: Set-DeviceOwner LT-2207 priya.raman@northgate.example')])
    }

    const wanted = second.toLowerCase()
    const user = state.users.find(
      (entry) =>
        entry.upn.toLowerCase() === wanted ||
        entry.upn.toLowerCase().split('@')[0] === wanted ||
        entry.displayName.toLowerCase() === wanted,
    )
    if (!user) {
      return print([
        failure(`No account matches “${second}”.`),
        ...state.users
          .filter((entry) => entry.status === 'active')
          .slice(0, 8)
          .map((entry) => muted(`  ${entry.upn}`)),
      ])
    }

    return { kind: 'act', deviceId: device.id, action: 'reassign-user', userId: user.id }
  }

  if (command === 'retire-device' || command === 'wipe-device') {
    return print([
      failure(
        `${tokens[0]} is not available in the shell: it destroys company data${
          command === 'wipe-device' ? ' and everything on the device' : ''
        }.`,
      ),
      muted(`Open /intune/devices/${device.id} and use the action bar, which states the consequence first.`),
    ])
  }

  // Unreachable: the set above is the same list as the branches, and a test holds
  // the two together. Kept so the return type is total rather than nearly so.
  return print([failure(`Unrecognised command: ${tokens[0] ?? input}`)])
}
