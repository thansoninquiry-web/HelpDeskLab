import { errorLine, line, mutedLine, successLine } from '../output'
import { focusedRemoteSession } from '../remoteDesktop'
import type { Device, Printer, RemoteSession, World } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

function namedDevice(world: World, args: readonly string[]): Device | undefined {
  const needle = (args[0] ?? '').trim().toLowerCase()
  if (!needle) {
    return undefined
  }
  return world.devices.find(
    (device) => device.hostname.toLowerCase() === needle || device.id.toLowerCase() === needle,
  )
}

function findDevice(context: CommandContext, value: string): Device | undefined {
  return namedDevice(context.world, [value])
}

function sessionFor(context: CommandContext, device: Device): RemoteSession | undefined {
  return context.world.remoteSessions.find((session) => session.machineId === device.id)
}

function userName(context: CommandContext, userId: string | null): string {
  if (!userId) {
    return 'Nobody'
  }
  return (
    context.world.users.find((user) => user.id === userId)?.displayName ??
    context.world.users.find((user) => user.id === userId)?.samAccountName ??
    userId
  )
}

function missingDevice(value: string): CommandOutcome {
  return failed([
    errorLine(`No machine '${value}' is inventoried.`),
    mutedLine('Use the hostname from the ticket or the asset register.'),
  ])
}

function isServer(device: Device): boolean {
  return device.kind === 'server'
}

/**
 * The machine a desktop action acts on. Every desktop action carries
 * `targetDevice` on the registry, so the reducer has already resolved the name it
 * was given and handed the machine here — this reads that answer instead of
 * looking the name up again, which is what keeps the session rule in `policy.ts`
 * and the change it guards acting on the same machine. The session itself is that
 * rule's to refuse; what is left here is the machine's own kind, because a server
 * is not a desktop and the way out is the server room, not `connect-remote`.
 */
function desktopTarget(
  context: CommandContext,
  usage: string,
): { ok: true; device: Device } | { ok: false; outcome: CommandOutcome } {
  const named = context.args[0]
  if (!named) {
    return { ok: false, outcome: usageFailure(usage) }
  }

  const device = context.target
  if (!device) {
    return { ok: false, outcome: missingDevice(named) }
  }
  if (isServer(device)) {
    return {
      ok: false,
      outcome: failed([
        errorLine(`${device.hostname} is a server; it is managed from the server room.`),
        mutedLine('A desktop session never opens to a server.'),
      ]),
    }
  }

  return { ok: true, device }
}

function sitePrinter(context: CommandContext, device: Device, reference: string): Printer | undefined {
  const needle = reference.trim().toLowerCase()
  return context.world.printers.find(
    (printer) =>
      printer.siteId === device.siteId &&
      (printer.name.toLowerCase() === needle ||
        printer.id.toLowerCase() === needle ||
        printer.shareName.toLowerCase() === needle),
  )
}

function getSessions(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('get-sessions')
  }

  if (context.world.remoteSessions.length === 0) {
    return succeeded([mutedLine('No remote session is open on any machine.')])
  }

  const output = [
    line(`Sessions : ${context.world.remoteSessions.length}`),
    line(),
  ]

  for (const session of context.world.remoteSessions) {
    const device = context.world.devices.find((candidate) => candidate.id === session.machineId)
    // Which of the open sessions the desktop is showing, so `get-sessions`
    // answers the same question the console's list does.
    const inView =
      session.state === 'active' &&
      focusedRemoteSession(context.world)?.machineId === session.machineId
    output.push(
      line(`${device?.hostname ?? session.machineId} · ${session.state}${inView ? ' · in view' : ''}`),
      line(`  User    : ${userName(context, session.userId)}`),
      line(`  Client  : ${session.client}`),
      line(`  Started : ${new Date(session.startedAt).toISOString().slice(0, 16).replace('T', ' ')}`),
    )
  }

  return succeeded(output)
}

function getRemoteMachine(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-remote-machine <hostname>')
  }

  const device = findDevice(context, target)
  if (!device) {
    return missingDevice(target)
  }

  const session = sessionFor(context, device)
  return succeeded([
    line(`Machine         : ${device.hostname}`),
    line(`Kind            : ${device.kind}`),
    line(`Operating system: ${device.os}`),
    line(`Holder          : ${userName(context, device.assignedUserId)}`),
    line(`Signed in       : ${device.loggedInUserId ? userName(context, device.loggedInUserId) : 'Nobody'}`),
    line(`Address         : ${device.linkUp ? (device.ipAddress ?? 'No address') : 'Link down'}`),
    line(`Disk free       : ${device.diskFreePercent}%`),
    line(`Updates         : last installed ${device.lastUpdateDays} day${device.lastUpdateDays === 1 ? '' : 's'} ago`),
    line(`Pending restart : ${device.pendingReboot ? 'True' : 'False'}`),
    line(`Print spooler   : ${device.spoolerStatus}`),
    line(`Session         : ${session ? `${session.state} · ${session.client}` : 'None'}`),
  ])
}

function connectRemote(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('connect-remote <hostname>')
  }

  const device = findDevice(context, target)
  if (!device) {
    return missingDevice(target)
  }
  if (device.id === context.device.id) {
    return failed([
      errorLine(`You are already working at ${device.hostname}.`),
      mutedLine('Remote Desktop is for another machine, not the one the console is running on.'),
    ])
  }
  if (isServer(device)) {
    return failed([
      errorLine(`${device.hostname} is a server.`),
      mutedLine('Servers are read and restarted from the server room, not through a user session.'),
    ])
  }

  const holder = device.assignedUserId ?? device.loggedInUserId
  if (!holder) {
    return failed([
      errorLine(`${device.hostname} has no user assigned, so there is no session to open.`),
      mutedLine('A shelf machine is imaged and issued before anyone can sign in to it.'),
    ])
  }

  const existing = sessionFor(context, device)
  if (existing?.state === 'active') {
    // Several machines can be connected at once, so connecting to one that is
    // already open brings that desktop to the front rather than refusing.
    context.world.remoteFocus = device.id
    return succeeded([
      mutedLine(`A session to ${device.hostname} is already active (${existing.client}).`),
      mutedLine('Its desktop is the one in front of you now.'),
    ])
  }

  const startedAt = context.now
  const client = 'Support console · Browser session'
  if (existing) {
    existing.state = 'active'
    existing.startedAt = startedAt
    existing.client = client
    existing.userId = holder
  } else {
    context.world.remoteSessions.push({
      machineId: device.id,
      userId: holder,
      state: 'active',
      startedAt,
      client,
    })
  }
  // The machine just connected to is the one the desk is looking at.
  context.world.remoteFocus = device.id

  return succeeded(
    [
      successLine(`Connected to ${device.hostname} as ${userName(context, holder)}.`),
      line(`Client          : ${client}`),
      mutedLine('The session is recorded: say in the ticket note what you changed while you were on it.'),
    ],
    [
      {
        type: 'remote_connected',
        target: device.hostname,
        details: { user: userName(context, holder) },
      },
    ],
  )
}

function endRemoteSession(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('end-remote-session <hostname>')
  }

  const device = findDevice(context, target)
  if (!device) {
    return missingDevice(target)
  }

  const session = sessionFor(context, device)
  if (!session || session.state !== 'active') {
    return succeeded([mutedLine(`No active session is open on ${device.hostname}.`)])
  }

  session.state = 'disconnected'
  // Ending the desktop in front of the desk leaves nothing in view, so another
  // open session takes its place — or none, which returns the console to its
  // list of machines.
  if (context.world.remoteFocus === device.id) {
    context.world.remoteFocus = null
  }

  return succeeded(
    [successLine(`Ended the session on ${device.hostname}.`)],
    [{ type: 'remote_ended', target: device.hostname }],
  )
}

/**
 * Brings one of the sessions already open to the front. This is a view change:
 * no machine is read or changed, and the desktop terminal's next command still
 * names the machine it ran on. It is recorded as a command because the desktop
 * the desk is looking at is world state, and the fold has to reproduce it.
 */
function useRemoteSession(context: CommandContext): CommandOutcome {
  if (context.args.length !== 1) {
    return usageFailure('use-remote-session <hostname>')
  }

  const resolved = desktopTarget(context, 'use-remote-session <hostname>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  // The session is the registry's rule, asked before this runs: choosing a
  // desktop is naming one, so what is left to answer is whether it is already
  // the one in front.
  if (focusedRemoteSession(context.world)?.machineId === device.id) {
    return succeeded([mutedLine(`${device.hostname} is already the desktop in front of you.`)])
  }

  context.world.remoteFocus = device.id
  return succeeded([
    successLine(`Switched to the desktop on ${device.hostname}.`),
    line(`Signed in       : ${device.loggedInUserId ? userName(context, device.loggedInUserId) : 'Nobody'}`),
    mutedLine('The other sessions stay open; the command log still names the machine each one ran on.'),
  ])
}

function rebootRemote(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('reboot-remote <hostname>')
  }

  const device = findDevice(context, target)
  if (!device) {
    return missingDevice(target)
  }
  if (isServer(device)) {
    return failed([
      errorLine(`${device.hostname} is a server; it is restarted from the server room.`),
      mutedLine('A server restart is an outage decision, not a user-session action.'),
    ])
  }
  if (!device.pendingReboot) {
    return succeeded([mutedLine(`No restart is pending on ${device.hostname}.`)])
  }

  device.pendingReboot = false
  device.lastUpdateDays = 0

  return succeeded(
    [
      successLine(`Restarted ${device.hostname}.`),
      mutedLine('The pending restart cleared. Ask the user to sign in again before you close the ticket.'),
    ],
    [{ type: 'machine_rebooted', target: device.hostname }],
  )
}

function checkUpdates(context: CommandContext): CommandOutcome {
  if (context.args.length !== 1) {
    return usageFailure('remote-check-updates <hostname>')
  }

  const resolved = desktopTarget(context, 'remote-check-updates <hostname>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  if (device.lastUpdateDays === 0 && !device.pendingReboot) {
    return succeeded([mutedLine(`${device.hostname} is already up to date.`)])
  }
  if (device.pendingReboot) {
    return succeeded([
      mutedLine(`The updates on ${device.hostname} are installed; a restart is still pending.`),
      mutedLine(`Restart it first: reboot-remote ${device.hostname}`),
    ])
  }

  const installed = Math.max(1, Math.min(8, Math.ceil(device.lastUpdateDays / 7)))
  device.lastUpdateDays = 0
  device.pendingReboot = true

  return succeeded(
    [
      successLine(`Installed ${installed} update${installed === 1 ? '' : 's'} on ${device.hostname}.`),
      line('Pending restart : True'),
      mutedLine('Tell the user a restart is needed, then restart it from here.'),
    ],
    [
      {
        type: 'updates_installed',
        target: device.hostname,
        details: { installed, pendingRestart: true },
      },
    ],
  )
}

function freeDiskSpace(context: CommandContext): CommandOutcome {
  if (context.args.length !== 1) {
    return usageFailure('remote-cleanup <hostname>')
  }

  const resolved = desktopTarget(context, 'remote-cleanup <hostname>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  if (device.diskFreePercent >= 85) {
    return succeeded([
      mutedLine(`${device.hostname} already has ${device.diskFreePercent}% free; there is nothing worth clearing.`),
    ])
  }

  const before = device.diskFreePercent
  device.diskFreePercent = Math.min(92, before + 15)

  return succeeded(
    [
      successLine(`Freed temporary files on ${device.hostname}.`),
      line(`Disk free       : ${device.diskFreePercent}% (was ${before}%)`),
      mutedLine('Temporary files only: the user’s documents were not touched.'),
    ],
    [
      {
        type: 'disk_cleaned',
        target: device.hostname,
        details: { before, after: device.diskFreePercent },
      },
    ],
  )
}

function flushRemoteDns(context: CommandContext): CommandOutcome {
  if (context.args.length !== 1) {
    return usageFailure('remote-flush-dns <hostname>')
  }

  const resolved = desktopTarget(context, 'remote-flush-dns <hostname>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  return succeeded(
    [
      successLine(`Flushed the DNS resolver cache on ${device.hostname}.`),
      mutedLine('Recheck the name that failed before closing the ticket.'),
    ],
    [{ type: 'dns_cache_flushed', target: device.hostname }],
  )
}

function renewRemoteLease(context: CommandContext): CommandOutcome {
  if (context.args.length !== 1) {
    return usageFailure('remote-renew-lease <hostname>')
  }

  const resolved = desktopTarget(context, 'remote-renew-lease <hostname>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  if (device.ipMode === 'static') {
    return failed([
      errorLine(`${device.hostname} has a static address; it does not take a DHCP lease.`),
      mutedLine('Change the adapter to DHCP first, or correct the static settings.'),
    ])
  }
  if (!device.linkUp) {
    return failed([
      errorLine(`${device.hostname} has no link, so it cannot reach the DHCP server.`),
      mutedLine('Fix the adapter or the cable before renewing the lease.'),
    ])
  }

  const obtainedAt = context.now
  const expiresAt = context.now + 8 * 60 * 60 * 1000
  device.dhcpLease = { server: context.site.dhcpServer, obtainedAt, expiresAt }

  return succeeded(
    [
      successLine(`Renewed the DHCP lease on ${device.hostname}.`),
      line(`Address         : ${device.ipAddress ?? 'No address'}`),
      line(`DHCP server     : ${context.site.dhcpServer}`),
      line(`Expires         : ${new Date(expiresAt).toISOString().slice(0, 16).replace('T', ' ')}`),
    ],
    [
      {
        type: 'lease_renewed',
        target: device.hostname,
        details: { address: device.ipAddress ?? '', server: context.site.dhcpServer },
      },
    ],
  )
}

function signOutRemoteUser(context: CommandContext): CommandOutcome {
  if (context.args.length !== 1) {
    return usageFailure('remote-sign-out <hostname>')
  }

  const resolved = desktopTarget(context, 'remote-sign-out <hostname>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  if (!device.loggedInUserId) {
    return succeeded([mutedLine(`Nobody is signed in on ${device.hostname}.`)])
  }

  const previous = userName(context, device.loggedInUserId)
  device.loggedInUserId = null

  return succeeded(
    [
      successLine(`Signed ${previous} out of ${device.hostname}.`),
      mutedLine('The Windows session ended. Your support session is still open.'),
    ],
    [
      {
        type: 'user_signed_out',
        target: device.hostname,
        details: { user: previous },
      },
    ],
  )
}

function setRemoteDefaultPrinter(context: CommandContext): CommandOutcome {
  if (context.args.length !== 2) {
    return usageFailure('remote-set-default-printer <hostname> <printerName>')
  }

  const resolved = desktopTarget(context, 'remote-set-default-printer <hostname> <printerName>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  const reference = context.args[1] ?? ''
  const printer = sitePrinter(context, device, reference)
  if (!printer) {
    return failed([
      errorLine(`Printer '${reference}' was not found at ${device.hostname}’s site.`),
      mutedLine('Use a printer name from the Printers app on this desktop.'),
    ])
  }
  if (device.defaultPrinterId === printer.id) {
    return succeeded([mutedLine(`${printer.name} is already the default printer.`)])
  }

  device.defaultPrinterId = printer.id

  return succeeded(
    [successLine(`Default printer on ${device.hostname} set to ${printer.name}.`)],
    [{ type: 'default_printer_changed', target: printer.name }],
  )
}

function clearRemotePrintQueue(context: CommandContext): CommandOutcome {
  if (context.args.length !== 2) {
    return usageFailure('remote-clear-printqueue <hostname> <printerName>')
  }

  const resolved = desktopTarget(context, 'remote-clear-printqueue <hostname> <printerName>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  // The stopped-spooler rule is the same one the local queue commands hit, read
  // from the registry flag and applied in the reducer before this runs.

  const reference = context.args[1] ?? ''
  const printer = sitePrinter(context, device, reference)
  if (!printer) {
    return failed([errorLine(`Printer '${reference}' was not found at ${device.hostname}’s site.`)])
  }

  const clearedJobs = printer.jobs.length
  if (clearedJobs === 0 && printer.status === 'online') {
    return succeeded([mutedLine(`The queue for ${printer.name} is already empty.`)])
  }

  const wasOffline = printer.status === 'offline'
  printer.jobs = []
  if (wasOffline) {
    printer.status = 'online'
  }

  return succeeded(
    [
      successLine(`Cleared ${clearedJobs} job(s) from ${printer.name} on ${device.hostname}.`),
      ...(wasOffline ? [line(`${printer.name} returned to an online state.`)] : []),
    ],
    [
      {
        type: 'print_queue_cleared',
        target: printer.name,
        details: { printer: printer.name, clearedJobs, broughtOnline: wasOffline },
      },
    ],
  )
}

function restartRemoteSpooler(context: CommandContext): CommandOutcome {
  if (context.args.length !== 1) {
    return usageFailure('remote-restart-spooler <hostname>')
  }

  const resolved = desktopTarget(context, 'remote-restart-spooler <hostname>')
  if (!resolved.ok) {
    return resolved.outcome
  }

  const { device } = resolved
  if (device.spoolerStatus === 'running') {
    return succeeded([mutedLine(`The Print Spooler on ${device.hostname} is already running.`)])
  }

  device.spoolerStatus = 'running'

  return succeeded(
    [
      successLine(`Restarted the Print Spooler on ${device.hostname}.`),
      mutedLine('Recheck the queue before saying the printer is fixed.'),
    ],
    [{ type: 'spooler_restarted', target: device.hostname }],
  )
}

export const remoteCommands: readonly CommandDefinition[] = [
  {
    name: 'get-sessions',
    aliases: [],
    group: 'remote',
    access: 'read',
    usage: 'get-sessions',
    summary: 'List the remote desktop sessions the desk has open',
    run: getSessions,
  },
  {
    name: 'get-remote-machine',
    aliases: [],
    group: 'remote',
    access: 'read',
    usage: 'get-remote-machine <hostname>',
    summary: 'Read a machine state without sitting at it',
    run: getRemoteMachine,
  },
  {
    name: 'connect-remote',
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'connect-remote <hostname>',
    summary: 'Open a remote desktop session to a user machine',
    run: connectRemote,
  },
  {
    name: 'end-remote-session',
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'end-remote-session <hostname>',
    summary: 'End the remote session on a machine',
    run: endRemoteSession,
  },
  {
    name: 'use-remote-session',
    // Switching the desktop names a desktop, so it is gated with the actions on
    // it: there is no session to bring forward unless one is open.
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'read',
    usage: 'use-remote-session <hostname>',
    summary: 'Bring one of the open remote desktop sessions to the front',
    run: useRemoteSession,
  },
  {
    name: 'reboot-remote',
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'reboot-remote <hostname>',
    summary: 'Restart a user machine that is waiting on a restart',
    run: rebootRemote,
  },
  {
    name: 'remote-check-updates',
    // Every desktop action names the machine it acts on once, here: the session
    // rule reads the resolved target, and so does the command.
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-check-updates <hostname>',
    summary: 'Install missing updates through the desktop',
    run: checkUpdates,
  },
  {
    name: 'remote-cleanup',
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-cleanup <hostname>',
    summary: 'Free temporary disk space on a connected machine',
    run: freeDiskSpace,
  },
  {
    name: 'remote-flush-dns',
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-flush-dns <hostname>',
    summary: 'Flush the DNS cache from a connected desktop',
    run: flushRemoteDns,
  },
  {
    name: 'remote-renew-lease',
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-renew-lease <hostname>',
    summary: 'Renew a connected machine’s DHCP lease',
    run: renewRemoteLease,
  },
  {
    name: 'remote-sign-out',
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-sign-out <hostname>',
    summary: 'Sign the user out of a connected desktop',
    run: signOutRemoteUser,
  },
  {
    name: 'remote-set-default-printer',
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-set-default-printer <hostname> <printerName>',
    summary: 'Set the default printer on a connected machine',
    run: setRemoteDefaultPrinter,
  },
  {
    name: 'remote-clear-printqueue',
    needsSpooler: true,
    needsRemoteSession: true,
    // The queue belongs to the named machine, so the rules read that machine's
    // spooler and that machine's session — not the desk's, which is where this
    // command was typed.
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-clear-printqueue <hostname> <printerName>',
    summary: 'Clear a stalled printer queue on a connected machine',
    run: clearRemotePrintQueue,
  },
  {
    name: 'remote-restart-spooler',
    needsRemoteSession: true,
    targetDevice: namedDevice,
    aliases: [],
    group: 'remote',
    access: 'change',
    usage: 'remote-restart-spooler <hostname>',
    summary: 'Restart the print spooler on a connected machine',
    run: restartRemoteSpooler,
  },
]
