import { offeredValues, type ConsoleAction, type ConsoleActionArgument, type ConsoleEntry } from './console'
import type {
  Device,
  Printer,
  PrintJob,
  RemoteSession,
  SpoolerStatus,
  World,
} from './types'

/**
 * Remote Desktop: the user machines the desk can reach, and the session state of
 * each. Servers are deliberately absent — the server room owns them — and the
 * machine the console is running on is left out because you are already there.
 *
 * When a session is active the console also has a desktop projection: the same
 * machine, read for a fake Windows shell. Every app on that desktop acts through
 * an audited command below, so a settings toggle is evidence in the ticket log,
 * not a local preference in the interface.
 */

const NOTE =
  'Opening a session is recorded against this attempt. What you change on the machine still has to be run as a command and written into the ticket note.'

/** Action ids the desktop components and the console entry agree on. */
export const DESKTOP_ACTIONS = {
  /** Brings another open session to the front; not an app on this desktop. */
  switchDesktop: 'open-desktop',
  checkUpdates: 'check-updates',
  cleanup: 'cleanup',
  flushDns: 'flush-dns',
  renewLease: 'renew-lease',
  signOut: 'sign-out',
  defaultPrinter: 'default-printer',
  clearQueue: 'clear-queue',
  restartSpooler: 'restart-spooler',
} as const

const PRINTER_ARGUMENT: ConsoleActionArgument = {
  id: 'printer',
  label: 'Printer',
  placeholder: 'PRN-FIN-01',
  hint: 'a printer name from the machine’s printer list',
  validate: (value) => /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/.test(value.trim()),
}

export interface DesktopPrintJobView {
  id: string
  document: string
  owner: string
  status: PrintJob['status']
}

export interface DesktopPrinterView {
  id: string
  name: string
  model: string
  status: Printer['status']
  isDefault: boolean
  jobs: DesktopPrintJobView[]
}

/**
 * One support session the desk can look at, for the switcher on the fake
 * desktop. Only active sessions appear: a disconnected one has no desktop.
 */
export interface DesktopSessionView {
  /** The machine entry this desktop belongs to, which is its hostname. */
  entryId: string
  hostname: string
  userName: string
  focused: boolean
  startedAt: number
}

/** Everything the fake Windows shell reads, all from the simulated machine. */
export interface DesktopView {
  entryId: string
  hostname: string
  userName: string
  userAccount: string
  signedIn: boolean
  siteName: string
  domain: string
  os: string
  ipMode: Device['ipMode']
  ipAddress: string | null
  dnsServers: string[]
  diskFreePercent: number
  lastUpdateDays: number
  pendingReboot: boolean
  spoolerStatus: SpoolerStatus
  printers: DesktopPrinterView[]
  clock: number
  sessionStartedAt: number
  /**
   * Every desktop that is open, this one included, in the order the sessions
   * were opened. The shell offers the switcher only when there is a choice.
   */
  openDesktops: DesktopSessionView[]
}

function sessionFor(world: World, device: Device): RemoteSession | undefined {
  return world.remoteSessions.find((session) => session.machineId === device.id)
}

/**
 * Every desktop that is open, newest first. A disconnected session is not one,
 * and neither is one recorded against the machine the console is running on: you
 * are already sitting at that machine, so there is no desktop to look at.
 */
function openSessions(world: World): RemoteSession[] {
  return world.remoteSessions
    .filter((session) => session.state === 'active' && session.machineId !== world.currentDeviceId)
    .sort((left, right) => right.startedAt - left.startedAt)
}

/**
 * The session the fake desktop belongs to: the one the desk put in front of
 * itself, or the most recently opened active one when it has chosen nothing — a
 * world from before the desk could choose, or one whose chosen session has since
 * ended. A disconnected session leaves no desktop. Shared with the desktop
 * terminal so the shell and the machine its commands run on cannot disagree.
 */
export function focusedRemoteSession(world: World): RemoteSession | undefined {
  const open = openSessions(world)
  const focused = world.remoteFocus
    ? open.find((session) => session.machineId === world.remoteFocus)
    : undefined
  return focused ?? open[0]
}

function holderName(world: World, userId: string | null): string {
  if (!userId) {
    return 'Nobody'
  }
  return world.users.find((user) => user.id === userId)?.displayName ?? userId
}

function sessionLabel(session: RemoteSession | undefined, focused: boolean): string {
  if (!session) {
    return 'No session'
  }
  if (session.state !== 'active') {
    return 'Session disconnected'
  }
  // Which of the open sessions the desktop would show, since more than one can
  // be open at a time.
  return focused ? 'Session active · in view' : 'Session active'
}

function jobsFor(printer: Printer): DesktopPrintJobView[] {
  return printer.jobs.map((job) => ({
    id: job.id,
    document: job.document,
    owner: job.owner,
    status: job.status,
  }))
}

function printerViews(world: World, device: Device): DesktopPrinterView[] {
  return world.printers
    .filter((printer) => printer.siteId === device.siteId)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((printer) => ({
      id: printer.id,
      name: printer.name,
      model: printer.model,
      status: printer.status,
      isDefault: printer.id === device.defaultPrinterId,
      jobs: jobsFor(printer),
    }))
}

/** The desktop actions are only offered while a support session is open. */
function desktopActions(
  world: World,
  device: Device,
  session: RemoteSession | undefined,
): ConsoleAction[] {
  if (session?.state !== 'active') {
    return []
  }

  // The printers this machine can actually reach, which is what the desktop
  // lists. Which one is the default, and which queue is stuck, is not said here:
  // the printer check is what reports the state of the queue.
  const printers = offeredValues(
    world.printers.filter((printer) => printer.siteId === device.siteId).map((printer) => printer.name),
  )

  return [
    {
      id: DESKTOP_ACTIONS.checkUpdates,
      label: 'Check for updates',
      detail: `Ask Windows Update to install anything missing on ${device.hostname}.`,
      command: (target) => `remote-check-updates ${target}`,
    },
    {
      id: DESKTOP_ACTIONS.cleanup,
      label: 'Free up disk space',
      detail: 'Clear temporary files on the machine without touching the user’s documents.',
      command: (target) => `remote-cleanup ${target}`,
    },
    {
      id: DESKTOP_ACTIONS.flushDns,
      label: 'Flush the DNS cache',
      detail: 'Clear the resolver cache so a corrected DNS setting takes effect now.',
      command: (target) => `remote-flush-dns ${target}`,
    },
    {
      id: DESKTOP_ACTIONS.renewLease,
      label: 'Renew the DHCP lease',
      detail: 'Ask the site DHCP server for a fresh address, gateway, and DNS set.',
      command: (target) => `remote-renew-lease ${target}`,
    },
    {
      id: DESKTOP_ACTIONS.signOut,
      label: 'Sign the user out',
      detail: 'End the interactive Windows session without closing your support session.',
      command: (target) => `remote-sign-out ${target}`,
    },
    {
      id: DESKTOP_ACTIONS.defaultPrinter,
      label: 'Set the default printer',
      detail: 'Make one of the published printers the default on this machine.',
      command: (target, args) => `remote-set-default-printer ${target} ${args?.[0] ?? ''}`,
      args: [{ ...PRINTER_ARGUMENT, choices: printers }],
    },
    {
      id: DESKTOP_ACTIONS.clearQueue,
      label: 'Clear a printer queue',
      detail: 'Drop every job waiting on one printer and bring it back online.',
      command: (target, args) => `remote-clear-printqueue ${target} ${args?.[0] ?? ''}`,
      args: [{ ...PRINTER_ARGUMENT, choices: printers }],
    },
    {
      id: DESKTOP_ACTIONS.restartSpooler,
      label: 'Restart the print spooler',
      detail: 'Restart the local print service when queues will not move.',
      command: (target) => `remote-restart-spooler ${target}`,
    },
  ]
}

function machineEntry(world: World, device: Device): ConsoleEntry {
  const session = sessionFor(world, device)
  const site = world.sites.find((candidate) => candidate.id === device.siteId)
  const focused = focusedRemoteSession(world)?.machineId === device.id

  return {
    id: device.hostname,
    title: device.hostname,
    subtitle: `${holderName(world, device.assignedUserId)} · ${sessionLabel(session, focused)}`,
    facts: [
      { label: 'Machine', value: device.hostname },
      { label: 'Kind', value: device.kind },
      { label: 'Operating system', value: device.os },
      { label: 'Holder', value: holderName(world, device.assignedUserId) },
      { label: 'Signed in', value: device.loggedInUserId ? holderName(world, device.loggedInUserId) : 'Nobody' },
      { label: 'Site', value: site?.name ?? device.siteId },
      { label: 'Address', value: device.linkUp ? (device.ipAddress ?? 'No address') : 'Link down' },
      { label: 'Disk free', value: `${device.diskFreePercent}%` },
      {
        label: 'Updates',
        value: `last installed ${device.lastUpdateDays} day${device.lastUpdateDays === 1 ? '' : 's'} ago`,
      },
      { label: 'Pending restart', value: device.pendingReboot ? 'Yes' : 'No' },
      { label: 'Print spooler', value: device.spoolerStatus },
      {
        label: 'Session',
        value: session
          ? `${session.state}${session.state === 'active' && focused ? ' · in view' : ''} · ${session.client}`
          : 'None',
      },
    ],
    groups: [],
    actions: [
      {
        id: 'read-machine',
        label: 'Read the machine record',
        detail: 'Log this machine’s state in the ticket evidence without opening a session.',
        command: (target) => `get-remote-machine ${target}`,
      },
      // Another session is already open: this brings it to the front instead of
      // opening a second one to the same machine.
      ...(session?.state === 'active' && !focused
        ? [
            {
              id: DESKTOP_ACTIONS.switchDesktop,
              label: 'Switch to this desktop',
              detail: `Put the open session on ${device.hostname} in front of you.`,
              command: (target: string) => `use-remote-session ${target}`,
            },
          ]
        : []),
      ...(session?.state === 'active'
        ? [
            {
              id: 'end-session',
              label: 'End the session',
              detail: `Close the session on ${device.hostname}.`,
              command: (target: string) => `end-remote-session ${target}`,
            },
          ]
        : [
            {
              id: 'connect',
              label: 'Connect remotely',
              detail: `Open a support session to ${device.hostname}.`,
              command: (target: string) => `connect-remote ${target}`,
            },
          ]),
      {
        id: 'reboot',
        label: 'Restart the machine',
        detail: 'Clear a pending restart so the user can sign in cleanly.',
        command: (target) => `reboot-remote ${target}`,
      },
      ...desktopActions(world, device, session),
    ],
    note: NOTE,
  }
}

export function remoteDesktopConsoleEntries(world: World): ConsoleEntry[] {
  return world.devices
    .filter((device) => device.kind !== 'server' && device.id !== world.currentDeviceId)
    .map((device) => machineEntry(world, device))
}

/**
 * The fake desktop belongs to the session in view. A disconnected session leaves
 * no desktop; the console returns to its list so the learner can connect again.
 * With more than one session open, the view carries the others so the shell can
 * offer them without a second read of the world.
 */
export function remoteDesktopView(world: World): DesktopView | null {
  const session = focusedRemoteSession(world)
  if (!session) {
    return null
  }

  const device = world.devices.find((candidate) => candidate.id === session.machineId)
  if (!device) {
    return null
  }

  const site = world.sites.find((candidate) => candidate.id === device.siteId)
  const user = world.users.find((candidate) => candidate.id === session.userId)

  return {
    entryId: device.hostname,
    hostname: device.hostname,
    userName: user?.displayName ?? holderName(world, session.userId),
    userAccount: user?.samAccountName ?? 'unknown',
    signedIn: device.loggedInUserId !== null,
    siteName: site?.name ?? device.siteId,
    domain: world.domain,
    os: device.os,
    ipMode: device.ipMode,
    ipAddress: device.ipAddress,
    dnsServers: [...device.dnsServers],
    diskFreePercent: device.diskFreePercent,
    lastUpdateDays: device.lastUpdateDays,
    pendingReboot: device.pendingReboot,
    spoolerStatus: device.spoolerStatus,
    printers: printerViews(world, device),
    clock: world.clock,
    sessionStartedAt: session.startedAt,
    openDesktops: openSessions(world).flatMap((open) => {
      const machine = world.devices.find((candidate) => candidate.id === open.machineId)
      if (!machine) {
        return []
      }
      return [
        {
          entryId: machine.hostname,
          hostname: machine.hostname,
          userName: holderName(world, open.userId),
          focused: open.machineId === session.machineId,
          startedAt: open.startedAt,
        },
      ]
    }),
  }
}
