import type { ConsoleAction, ConsoleEntry, ConsoleHistoryItem } from './console'
import type { DeviceKind, DirectoryUser, World } from './types'

/**
 * A browsable directory record.
 *
 * This is deliberately *not* the world's DirectoryUser. Account state (lock,
 * expiry, disablement), group membership, share grants, and MFA registration are
 * the evidence a learner has to go and collect with the audited commands, so
 * none of them appear here. Everything below is the kind of fact an HR-style
 * directory listing shows to anyone on the desk.
 */
/**
 * A directory listing is searched through the shared console search, which
 * covers name, account, email, department, site, and device hostname because
 * every one of those fields lands on the console entry below.
 */
export interface DirectoryRecord {
  samAccountName: string
  displayName: string
  email: string
  department: string
  siteName: string
  employeeId: string
  managerName: string
  devices: DirectoryRecordDevice[]
}

export interface DirectoryRecordDevice {
  hostname: string
  kind: DeviceKind
  os: string
  siteName: string
}

/**
 * One fixed action list for every account, in the shared console shape. Availability never depends on hidden
 * state: running the wrong action on the wrong account has to be possible, and
 * the command's own output is what tells the learner it was wrong.
 */
export const ACCOUNT_CONSOLE_ACTIONS: readonly ConsoleAction[] = [
  {
    id: 'open-record',
    label: 'Open the account record',
    detail: 'Directory: status, lockout, and password expiry.',
    command: (sam) => `get-account ${sam}`,
  },
  {
    id: 'signin-log',
    label: 'Open the sign-in log',
    detail: 'Microsoft 365: MFA methods, block state, last error code.',
    command: (sam) => `get-signin-log ${sam}`,
  },
  {
    id: 'unlock',
    label: 'Unlock the account',
    detail: 'Clear a directory lockout.',
    command: (sam) => `unlock-account ${sam}`,
  },
  {
    id: 'reset-password',
    label: 'Reset the password',
    detail: 'Issue a new password and clear the expiry flag.',
    command: (sam) => `reset-password ${sam}`,
  },
  {
    id: 'reset-mfa',
    label: 'Clear MFA methods',
    detail: 'Let the user register a method again.',
    command: (sam) => `reset-mfa ${sam}`,
  },
  {
    id: 'unblock-signin',
    label: 'Clear a sign-in block',
    detail: 'Lift a Microsoft 365 sign-in block.',
    command: (sam) => `unblock-signin ${sam}`,
  },
]

export function findConsoleAction(id: string): ConsoleAction | undefined {
  return ACCOUNT_CONSOLE_ACTIONS.find((action) => action.id === id)
}

const DIRECTORY_NOTE =
  'The state filter reads the live directory. The record itself still withholds account state, group membership, and MFA: collect them with these actions so the evidence lands in the ticket log.'

/**
 * The state filters an account matches right now. Computed from the world on
 * every read, so unlocking an account or clearing an expiry moves it out of the
 * filter with no listing to refresh.
 */
function accountStateFilters(user: DirectoryUser | undefined): string[] {
  if (!user) {
    return []
  }
  const filters: string[] = []
  if (user.status === 'locked') {
    filters.push('locked')
  }
  if (user.passwordExpired) {
    filters.push('password-expired')
  }
  if (user.status === 'disabled') {
    filters.push('disabled')
  }
  return filters
}

/**
 * The directory projection in the shared console shape: one entry per account,
 * the same action list on each, and a note naming the state it withholds.
 * `history` is the desk's closed-ticket past, keyed by account name, so a
 * record can show what happened to it without reading the whole log.
 */
export function directoryConsoleEntries(
  world: World,
  history: Record<string, readonly ConsoleHistoryItem[]> = {},
): ConsoleEntry[] {
  const users = new Map(world.users.map((user) => [user.samAccountName, user]))
  return listDirectoryRecords(world).map((record) => ({
    id: record.samAccountName,
    icon: 'account' as const,
    title: record.displayName,
    subtitle: `${record.samAccountName} · ${record.department}`,
    facts: [
      { label: 'Employee ID', value: record.employeeId },
      { label: 'Department', value: record.department },
      { label: 'Site', value: record.siteName },
      { label: 'Manager', value: record.managerName },
    ],
    groups: [
      {
        label: 'Devices',
        items: record.devices.map(
          (device) => `${device.hostname} · ${device.kind} · ${device.siteName}`,
        ),
        empty: 'No device is assigned to this account.',
      },
    ],
    actions: ACCOUNT_CONSOLE_ACTIONS,
    note: DIRECTORY_NOTE,
    filterIds: accountStateFilters(users.get(record.samAccountName)),
    history: history[record.samAccountName] ?? [],
  }))
}

function siteNameFor(world: World, siteId: string): string {
  return world.sites.find((site) => site.id === siteId)?.name ?? siteId
}

function devicesFor(world: World, userId: string): DirectoryRecordDevice[] {
  return world.devices
    .filter((device) => device.assignedUserId === userId || device.loggedInUserId === userId)
    .map((device) => ({
      hostname: device.hostname,
      kind: device.kind,
      os: device.os,
      siteName: siteNameFor(world, device.siteId),
    }))
}

/** Every account, sorted by name, with the devices we can attribute to it. */
export function listDirectoryRecords(world: World): DirectoryRecord[] {
  return world.users
    .map((user) => ({
      samAccountName: user.samAccountName,
      displayName: user.displayName,
      email: user.email,
      department: user.department,
      siteName: siteNameFor(world, user.siteId),
      employeeId: user.employeeId,
      managerName: user.managerName,
      devices: devicesFor(world, user.id),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}
