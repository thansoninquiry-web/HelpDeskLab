import { canReachAddress, dnsFailureMessage, resolveName } from '../network'
import { errorLine, line, mutedLine } from '../output'
import type { Device, World } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

/*
 * The parts of a workstation shell that a first-line tech actually types.
 *
 * Nothing here executes: each command reads the same simulated device, site and
 * directory the consoles read, so `ipconfig`, a Remote Desktop session and the
 * Server Room cannot disagree about an address. Output is deterministic, which
 * keeps a replay of the ticket identical to the shift that produced it.
 */

function netbiosName(world: World): string {
  return world.domain.split('.')[0] ?? world.domain
}

function currentAccount(context: CommandContext): string {
  return context.user?.samAccountName ?? 'helpdesk'
}

function profilePath(context: CommandContext): string {
  return `C:\\Users\\${currentAccount(context)}`
}

/** The workstation's tiny read-only filesystem: only files a desk would read. */
function hostsFile(world: World): string {
  const records = world.network.dnsRecords.slice(0, 8)
  return [
    '# Copyright (c) 1993-2026 Larkspur Logistics',
    '# Local name resolution for the simulated environment.',
    '#',
    '127.0.0.1       localhost',
    ...records.map((record) => `${record.address.padEnd(15)} ${record.name}`),
  ].join('\n')
}

function hostname(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('hostname')
  }
  return succeeded([line(context.device.hostname)])
}

function whoami(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return usageFailure('whoami')
  }
  if (!context.user) {
    return failed([errorLine('ERROR: Unable to determine the signed-in user for this machine.')])
  }
  return succeeded([line(`${netbiosName(context.world)}\\${context.user.samAccountName}`)])
}

function version(): CommandOutcome {
  return succeeded([line('Microsoft Windows [Version 10.0.22631.4317]')])
}

function echo(context: CommandContext): CommandOutcome {
  return succeeded([line(context.args.join(' '))])
}

function directory(context: CommandContext): CommandOutcome {
  const path = profilePath(context)
  const rows = [
    '<DIR>          Desktop',
    '<DIR>          Documents',
    '<DIR>          Downloads',
    '<DIR>          AppData',
    '             1,024  notes.txt',
    '             2,048  hosts.txt',
  ]
  return succeeded([
    line(' Volume in drive C has no label.'),
    line(' Volume Serial Number is 7C4A-19E2'),
    line(),
    line(` Directory of ${path}`),
    line(),
    ...rows.map((row) => line(`07/14/2026  09:12 AM    ${row}`)),
    line('               2 File(s)          3,072 bytes'),
    line('               4 Dir(s)   87,234,560,000 bytes free'),
  ])
}

function typeFile(context: CommandContext): CommandOutcome {
  const requested = context.args[0]
  if (!requested || context.args.length > 1) {
    return usageFailure('type <file>')
  }

  const name = requested.toLowerCase()
  if (name === 'hosts' || name === 'hosts.txt' || name.endsWith('\\hosts')) {
    return succeeded(hostsFile(context.world).split('\n').map((row) => line(row)))
  }
  if (name === 'notes.txt' || name === 'notes') {
    return succeeded([
      line('Desk notes'),
      line(),
      line('Reset a password only after the caller is verified.'),
      line('Every change is logged against this ticket.'),
    ])
  }

  return failed([errorLine(`The system cannot find the file specified: "${requested}"`)])
}

function tree(context: CommandContext): CommandOutcome {
  return succeeded(
    [
      `C:\\USERS\\${currentAccount(context).toUpperCase()}`,
      '├───Desktop',
      '├───Documents',
      '│   ├───Onboarding',
      '│   └───Reports',
      '├───Downloads',
      '└───AppData',
      '    ├───Local',
      '    └───Roaming',
    ].map((row) => line(row)),
  )
}

function totalMemoryMb(device: Device): number {
  return device.kind === 'server' ? 32_768 : device.kind === 'desktop' ? 16_384 : 8_192
}

function systemInfo(context: CommandContext): CommandOutcome {
  const { device, site, world } = context
  // Memory headroom is presentation only: no fault in the world models RAM pressure.
  const freeMb = Math.round(totalMemoryMb(device) * 0.42)
  return succeeded([
    line(`Host Name:                 ${device.hostname}`),
    line(`OS Name:                   ${device.os}`),
    line('OS Version:                10.0.22631 N/A Build 22631'),
    line('System Type:               x64-based PC'),
    line(`Domain:                    ${world.domain}`),
    line(`Site:                      ${site.name}`),
    line('Logon Server:              \\\\DC01'),
    line(`Total Physical Memory:     ${totalMemoryMb(device).toLocaleString('en-US')} MB`),
    line(`Available Physical Memory: ${freeMb.toLocaleString('en-US')} MB`),
    line(`Network Card(s):           ${device.adapterDescription}`),
    line(`                           IP Address: ${device.ipAddress ?? '(none)'}`),
  ])
}

function taskList(context: CommandContext): CommandOutcome {
  const spooler = context.device.spoolerStatus === 'running'
  const rows: Array<[string, number, string]> = [
    ['System Idle Process', 0, '8 K'],
    ['System', 4, '144 K'],
    ['svchost.exe', 912, '18,240 K'],
    ['dwm.exe', 1284, '42,816 K'],
    ['explorer.exe', 2416, '96,512 K'],
    ['Teams.exe', 4108, '218,304 K'],
    ['OUTLOOK.EXE', 5840, '186,752 K'],
    ...(spooler ? ([['spoolsv.exe', 3312, '24,608 K']] as Array<[string, number, string]>) : []),
  ]

  return succeeded([
    line('Image Name                     PID Session Name        Session#    Mem Usage'),
    line('========================= ======== ================ =========== ============'),
    ...rows.map(([image, pid, memory]) =>
      line(
        `${image.padEnd(25)} ${String(pid).padStart(8)} Console                    1 ${memory.padStart(12)}`,
      ),
    ),
  ])
}

function netStat(context: CommandContext): CommandOutcome {
  const { device, world } = context
  if (!device.linkUp) {
    return succeeded([
      line('Active Connections'),
      line(),
      mutedLine('No active connections: the adapter has no link.'),
    ])
  }

  const records = world.network.dnsRecords.slice(0, 2)
  const local = device.ipAddress ?? '0.0.0.0'
  return succeeded([
    line('Active Connections'),
    line(),
    line('  Proto  Local Address          Foreign Address        State'),
    ...records.map((record, index) =>
      line(
        `  TCP    ${local}:${49712 + index * 4}        ${record.address}:443       ESTABLISHED`,
      ),
    ),
    line(`  TCP    ${local}:${49760}        ${context.site.dnsServers[0] ?? '10.20.4.10'}:53          ESTABLISHED`),
  ])
}

function traceRoute(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('tracert <hostname or IP address>')
  }

  const { world, device, site } = context
  const answer = resolveName(world, device, target)
  if (!answer.ok) {
    return failed([
      errorLine(`Unable to resolve target system name ${target}.`),
      mutedLine(dnsFailureMessage(answer.reason)),
    ])
  }

  const address = answer.address
  const header = [
    line(`Tracing route to ${target} [${address}]`),
    line('over a maximum of 30 hops:'),
    line(),
  ]

  if (!device.linkUp) {
    return succeeded([
      ...header,
      line('  1     *        *        *     Request timed out.'),
      line('  2     *        *        *     Request timed out.'),
      line(),
      line('Trace complete.'),
    ])
  }

  const gateway = site.gateway
  const reached = canReachAddress(world, device, address)
  const hops = [
    line(`  1     1 ms     1 ms     1 ms  ${gateway}`),
    reached
      ? line('  2     8 ms     7 ms     9 ms  10.20.0.1')
      : line('  2     *        *        *     Request timed out.'),
    reached
      ? line(`  3    12 ms    11 ms    13 ms  ${address}`)
      : line('  3     *        *        *     Request timed out.'),
  ]

  return succeeded([
    ...header,
    ...hops,
    line(),
    reached
      ? mutedLine('Trace complete.')
      : mutedLine('Trace incomplete: the destination did not answer.'),
  ])
}
/**
 * Creating and deleting accounts is not work the desk is trusted with, and the
 * refusal says the same thing however it is asked for — a `/add` switch or a
 * `/delete` one. It is a mandate rather than a world rule: it reads no record, so
 * it is not in `policy.ts`, but it is written once for the same reason the rules
 * there are.
 */
function directoryMandateDenial(): CommandOutcome {
  return failed([
    errorLine('Access denied. Account creation and deletion require a directory administrator.'),
    mutedLine('This simulation models the service desk, not the identity administration team.'),
  ])
}

function netUser(context: CommandContext): CommandOutcome {
  const subcommand = (context.args[0] ?? '').toLowerCase()
  if (subcommand !== 'user') {
    return usageFailure('net user [samAccountName]')
  }

  const requested = context.args[1]
  const switches = context.args.slice(2)
  if (requested?.startsWith('/') || switches.some((value) => value.startsWith('/'))) {
    return directoryMandateDenial()
  }
  if (context.args.length > 2) {
    return usageFailure('net user [samAccountName]')
  }

  if (!requested) {
    const names = context.world.users.map((user) => user.samAccountName).sort()
    const columns: string[] = []
    for (let index = 0; index < names.length; index += 3) {
      columns.push(names.slice(index, index + 3).map((name) => name.padEnd(25)).join('').trimEnd())
    }
    return succeeded([
      line(`User accounts for \\\\${context.device.hostname}`),
      line(),
      line('-------------------------------------------------------------------------------'),
      ...columns.map((column) => line(column)),
      line('The command completed successfully.'),
    ])
  }

  if (requested.startsWith('/')) {
    return directoryMandateDenial()
  }

  const needle = requested.toLowerCase()
  const user = context.world.users.find(
    (candidate) =>
      candidate.samAccountName.toLowerCase() === needle ||
      candidate.email.toLowerCase() === needle ||
      candidate.displayName.toLowerCase() === needle,
  )
  if (!user) {
    return failed([
      errorLine('The user name could not be found.'),
      mutedLine('Check the account name against the ticket details.'),
    ])
  }

  const groups = context.world.groups
    .filter((group) => group.members.includes(user.id))
    .map((group) => group.name)
  const active = user.status === 'active' ? 'Yes' : user.status === 'locked' ? 'Locked' : 'No'

  const pad = (label: string, value: string) => line(`${label.padEnd(29)}${value}`)
  return succeeded([
    pad('User name', user.samAccountName),
    pad('Full Name', user.displayName),
    pad('Comment', user.department),
    pad('Account active', active),
    pad('Account expires', 'Never'),
    line(),
    pad('Password last set', user.passwordLastChangedAt ? '07/14/2026 09:12 AM' : 'Never'),
    pad('Password expired', user.passwordExpired ? 'Yes' : 'No'),
    pad('Password required', 'Yes'),
    line(),
    pad('Last logon', '07/16/2026 08:41 AM'),
    pad('Global Group Memberships', groups.length > 0 ? groups.map((g) => `*${g}`).join(' ') : '*None'),
    line('The command completed successfully.'),
  ])
}

export const workstationCommands: readonly CommandDefinition[] = [
  {
    name: 'hostname',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'hostname',
    summary: 'Print the name of this workstation',
    run: hostname,
  },
  {
    name: 'whoami',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'whoami',
    summary: 'Print the account signed in to this workstation',
    run: whoami,
  },
  {
    name: 'ver',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'ver',
    summary: 'Print the workstation OS version',
    run: version,
  },
  {
    name: 'echo',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'echo <text>',
    summary: 'Print text back to the console',
    run: echo,
  },
  {
    name: 'dir',
    aliases: ['ls'],
    group: 'workstation',
    access: 'read',
    usage: 'dir',
    summary: 'List the signed-in user’s profile folder',
    run: directory,
  },
  {
    name: 'type',
    aliases: ['cat'],
    group: 'workstation',
    access: 'read',
    usage: 'type <file>',
    summary: 'Read hosts or notes from the simulated profile',
    run: typeFile,
  },
  {
    name: 'tree',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'tree',
    summary: 'Show the profile folder tree',
    run: tree,
  },
  {
    name: 'systeminfo',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'systeminfo',
    summary: 'Show OS, domain, memory, and adapter facts for this machine',
    run: systemInfo,
  },
  {
    name: 'tasklist',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'tasklist',
    summary: 'List the processes running on this workstation',
    run: taskList,
  },
  {
    name: 'netstat',
    aliases: [],
    group: 'workstation',
    access: 'read',
    usage: 'netstat',
    summary: 'Show active connections from this workstation',
    run: netStat,
  },
  {
    name: 'tracert',
    aliases: ['traceroute'],
    group: 'network',
    access: 'read',
    usage: 'tracert <hostname or IP address>',
    summary: 'Trace the route to a host through the simulated network',
    run: traceRoute,
  },
  {
    name: 'net',
    aliases: [],
    group: 'identity',
    access: 'read',
    usage: 'net user [samAccountName]',
    summary: 'List domain accounts, or read one account’s status',
    run: netUser,
  },
]
