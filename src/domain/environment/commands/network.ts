import { findScope, nextFreeAddress, recordLease } from '../dhcp'
import {
  canReachAddress,
  dnsFailureMessage,
  isIPv4,
  isPortOpen,
  isPrivateAddress,
  nextDhcpAddress,
  resolveName,
  updateHostRecord,
} from '../network'
import { errorLine, line, mutedLine, successLine } from '../output'
import type { Device, World } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

const DNS_INDENT = ' '.repeat(39)
const LEASE_DURATION_MS = 24 * 60 * 60 * 1000

function formatClock(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

function formatAdapter(world: World, device: Device, all: boolean): string[] {
  const result = ['Windows IP Configuration', '', 'Ethernet adapter Ethernet:', '']

  if (!device.linkUp) {
    result.push(
      '   Media State . . . . . . . . . . . : Media disconnected',
      `   Connection-specific DNS Suffix  . : ${world.domain}`,
    )
    return result
  }

  result.push(
    `   Connection-specific DNS Suffix  . : ${world.domain}`,
    `   Description . . . . . . . . . . . : ${device.adapterDescription}`,
    `   Physical Address. . . . . . . . . : ${device.macAddress}`,
  )

  if (all) {
    result.push(`   DHCP Enabled. . . . . . . . . . . : ${device.ipMode === 'dhcp' ? 'Yes' : 'No'}`)
  }

  if (!device.ipAddress) {
    result.push('   Autoconfiguration IPv4 Address. . : (unavailable)')
  } else {
    result.push(
      `   IPv4 Address. . . . . . . . . . . : ${device.ipAddress}(Preferred)`,
      `   Subnet Mask . . . . . . . . . . . : ${device.subnetMask ?? '255.255.255.0'}`,
      `   Default Gateway . . . . . . . . . : ${device.gateway ?? ''}`,
    )
  }

  const dnsServers = device.dnsServers.length > 0 ? device.dnsServers : ['(none)']
  result.push(`   DNS Servers . . . . . . . . . . . : ${dnsServers[0]}`)
  for (const server of dnsServers.slice(1)) {
    result.push(`${DNS_INDENT}${server}`)
  }

  if (all && device.dhcpLease) {
    result.push(
      `   Lease Obtained. . . . . . . . . . : ${formatClock(device.dhcpLease.obtainedAt)}`,
      `   Lease Expires . . . . . . . . . . : ${formatClock(device.dhcpLease.expiresAt)}`,
      `   DHCP Server . . . . . . . . . . . : ${device.dhcpLease.server}`,
    )
  }

  return result
}

function ipconfig(context: CommandContext): CommandOutcome {
  const { args, device, world } = context
  const flag = args[0]?.toLowerCase()

  if (args.length > 1) {
    return usageFailure('ipconfig [/all | /renew | /flushdns]')
  }

  if (!flag || flag === '/all') {
    return succeeded(formatAdapter(world, device, Boolean(flag)).map((text) => line(text)))
  }

  if (flag === '/flushdns') {
    return succeeded(
      [successLine('Successfully flushed the DNS Resolver Cache.')],
      [{ type: 'dns_cache_flushed', target: device.hostname }],
    )
  }

  if (flag === '/renew') {
    if (device.ipMode !== 'dhcp') {
      return failed([
        errorLine(
          'The operation failed as no adapter is in the state permissible for this operation.',
        ),
        mutedLine('This adapter uses a static IPv4 configuration.'),
      ])
    }
    if (!device.linkUp) {
      return failed([errorLine('The network cable is unplugged or the adapter is disconnected.')])
    }

    const scope = findScope(world, context.site.id)
    const subnetBase = context.site.subnet.split('.').slice(0, 3).join('.')
    const currentAddress = device.ipAddress
    const preferred =
      currentAddress && currentAddress.startsWith(`${subnetBase}.`) ? currentAddress : null
    const ownLease = scope?.leases.find(
      (lease) => lease.address === preferred && lease.hostname === device.hostname,
    )
    const address = ownLease
      ? ownLease.address
      : scope
        ? nextFreeAddress(scope, preferred)
        : (preferred ?? nextDhcpAddress(context.site, device.id))

    if (!address) {
      return failed([
        errorLine('DHCP request failed: the scope has no free addresses.'),
        mutedLine(
          `Scope ${scope?.name ?? context.site.id} on ${scope?.server ?? context.site.dhcpServer} is exhausted. Stale leases must be cleared before this device can get an address.`,
        ),
      ])
    }

    device.ipAddress = address
    device.subnetMask = '255.255.255.0'
    device.gateway = scope?.router ?? context.site.gateway
    // Scope option 006 always wins: a bad option is exactly how whole sites lose DNS.
    device.dnsServers =
      scope && scope.dnsServers.length > 0
        ? [...scope.dnsServers]
        : [...context.site.dnsServers]
    device.dhcpLease = {
      server: scope?.server ?? context.site.dhcpServer,
      obtainedAt: context.now,
      expiresAt:
        context.now + (scope ? scope.leaseMinutes * 60_000 : LEASE_DURATION_MS),
    }
    updateHostRecord(world, device, address)
    if (scope) {
      recordLease(scope, device.hostname, address, context.now)
    }

    return succeeded(
      formatAdapter(world, device, false).map((text) => line(text)),
      [
        {
          type: 'lease_renewed',
          target: device.hostname,
          details: { address, dhcpServer: context.site.dhcpServer },
        },
      ],
    )
  }

  return usageFailure('ipconfig [/all | /renew | /flushdns]', `Unknown option: ${args[0]}`)
}

function ping(context: CommandContext): CommandOutcome {
  const { args, device, world } = context
  const host = args[0]

  if (!host || args.length > 1) {
    return usageFailure('ping <host>')
  }

  const answer = resolveName(world, device, host)
  if (!answer.ok) {
    return succeeded([
      errorLine(`Ping request could not find host ${host}. Please check the name and try again.`),
      mutedLine(dnsFailureMessage(answer.reason)),
    ])
  }

  const reachable = canReachAddress(world, device, answer.address)
  if (!reachable) {
    return succeeded([
      line(`Pinging ${host} [${answer.address}] with 32 bytes of data:`),
      line('Request timed out.'),
      line('Request timed out.'),
      line('Request timed out.'),
      line('Request timed out.'),
      line(),
      line(`Ping statistics for ${answer.address}:`),
      line('    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),'),
    ])
  }

  const time = 1 + (answer.address.length % 4)
  const ttl = isPrivateAddress(answer.address) ? 128 : 54

  return succeeded([
    line(`Pinging ${host} [${answer.address}] with 32 bytes of data:`),
    line(`Reply from ${answer.address}: bytes=32 time=${time}ms TTL=${ttl}`),
    line(`Reply from ${answer.address}: bytes=32 time=${time}ms TTL=${ttl}`),
    line(`Reply from ${answer.address}: bytes=32 time=${time}ms TTL=${ttl}`),
    line(`Reply from ${answer.address}: bytes=32 time=${time}ms TTL=${ttl}`),
    line(),
    line(`Ping statistics for ${answer.address}:`),
    line('    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),'),
  ])
}

function nslookup(context: CommandContext): CommandOutcome {
  const { args, device, world } = context
  const name = args[0]
  const serverOverride = args[1]

  if (!name || args.length > 2) {
    return usageFailure('nslookup <name> [dns-server]')
  }
  if (serverOverride && !isIPv4(serverOverride)) {
    return usageFailure('nslookup <name> [dns-server]', `Invalid DNS server address: ${serverOverride}`)
  }

  const answer = resolveName(world, device, name, serverOverride)
  const serverUsed = serverOverride ?? device.dnsServers[0] ?? 'UnKnown'
  const header = [line('Server:  UnKnown'), line(`Address:  ${serverUsed}`), line()]

  if (answer.ok) {
    return succeeded([
      ...header,
      line(`Name:    ${name}`),
      line(`Address:  ${answer.address}`),
    ])
  }

  const failure =
    answer.reason === 'nxdomain'
      ? `*** UnKnown can't find ${name}: Non-existent domain`
      : answer.reason === 'server-unreachable'
        ? 'DNS request timed out.\n    timeout was 2 seconds.\n*** Request to UnKnown timed-out'
        : `*** UnKnown can't find ${name}: ${dnsFailureMessage(answer.reason)}`

  return succeeded([
    ...header,
    ...failure.split('\n').map((text) => errorLine(text)),
  ])
}

function parseTestNetConnection(
  args: readonly string[],
): { ok: true; host: string; port: number } | { ok: false; message: string } {
  let host: string | null = null
  let port = 443
  let portSpecified = false

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (!token) {
      continue
    }

    if (token.startsWith('-') || token.startsWith('/')) {
      const flag = token.slice(1).toLowerCase().replace(/-/g, '')
      if (flag === 'computername' || flag === 'computer' || flag === 'name') {
        host = args[index + 1] ?? null
        index += 1
        continue
      }
      if (flag === 'port') {
        const rawPort = args[index + 1]
        if (!rawPort || !/^\d+$/.test(rawPort)) {
          return { ok: false, message: 'The -Port parameter needs a numeric port.' }
        }
        port = Number(rawPort)
        portSpecified = true
        index += 1
        continue
      }
      return { ok: false, message: `Unknown parameter: ${token}` }
    }

    if (!host) {
      host = token
      continue
    }
    if (!portSpecified && /^\d+$/.test(token)) {
      port = Number(token)
      portSpecified = true
      continue
    }
    return { ok: false, message: `Unexpected argument: ${token}` }
  }

  if (!host) {
    return { ok: false, message: 'A computer name is required.' }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, message: `Invalid port: ${port}` }
  }

  return { ok: true, host, port }
}

function testNetConnection(context: CommandContext): CommandOutcome {
  const parsed = parseTestNetConnection(context.args)
  if (!parsed.ok) {
    return usageFailure(
      'Test-NetConnection <host> [-Port <port>]',
      parsed.message,
    )
  }

  const answer = resolveName(context.world, context.device, parsed.host)
  if (!answer.ok) {
    return succeeded([
      errorLine(`WARNING: Name resolution for '${parsed.host}' failed.`),
      line(`ComputerName     : ${parsed.host}`),
      line('RemoteAddress    :'),
      line(`RemotePort       : ${parsed.port}`),
      line(`InterfaceAlias   : ${context.device.adapterDescription}`),
      line(`SourceAddress    : ${context.device.ipAddress ?? ''}`),
      line('TcpTestSucceeded : False'),
    ])
  }

  const open = isPortOpen(context.world, context.device, answer.address, parsed.port)

  return succeeded([
    line(`ComputerName     : ${parsed.host}`),
    line(`RemoteAddress    : ${answer.address}`),
    line(`RemotePort       : ${parsed.port}`),
    line(`InterfaceAlias   : ${context.device.adapterDescription}`),
    line(`SourceAddress    : ${context.device.ipAddress ?? ''}`),
    line(`TcpTestSucceeded : ${open ? 'True' : 'False'}`),
  ])
}

function setDns(context: CommandContext): CommandOutcome {
  const { args, device } = context

  if (args.length < 1 || args.length > 2) {
    return usageFailure('set-dns <primary> [secondary]')
  }

  const invalid = args.find((server) => !isIPv4(server))
  if (invalid) {
    return usageFailure('set-dns <primary> [secondary]', `Invalid IPv4 address: ${invalid}`)
  }

  device.dnsServers = [...args]

  return succeeded(
    [
      successLine(`DNS servers updated to ${args.join(', ')}.`),
      mutedLine('Use nslookup to confirm name resolution, then ipconfig /flushdns.'),
    ],
    [
      {
        type: 'dns_changed',
        target: device.hostname,
        details: { servers: args.join(',') },
      },
    ],
  )
}

export const networkCommands: readonly CommandDefinition[] = [
  {
    name: 'ipconfig',
    aliases: [],
    group: 'network',
    usage: 'ipconfig [/all | /renew | /flushdns]',
    summary: 'Show adapter configuration, renew the DHCP lease, or flush DNS',
    run: ipconfig,
  },
  {
    name: 'ping',
    aliases: [],
    group: 'network',
    usage: 'ping <host>',
    summary: 'Send four ICMP echo requests to a name or address',
    run: ping,
  },
  {
    name: 'nslookup',
    aliases: [],
    group: 'network',
    usage: 'nslookup <name> [dns-server]',
    summary: 'Resolve a hostname through DNS',
    run: nslookup,
  },
  {
    name: 'test-netconnection',
    aliases: ['tnc'],
    group: 'network',
    usage: 'Test-NetConnection <host> [-Port <port>]',
    summary: 'Resolve a host and test TCP connectivity to a port',
    run: testNetConnection,
  },
  {
    name: 'set-dns',
    aliases: [],
    group: 'network',
    usage: 'set-dns <primary> [secondary]',
    summary: "Change this device's DNS servers",
    run: setDns,
  },
]
