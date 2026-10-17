import { availableAddresses, findScope, leasedCount, removeLease, scopeAddresses } from '../dhcp'
import { errorLine, line, mutedLine, successLine } from '../output'
import type { DhcpScope, OutputLine } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

function formatClock(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function resolveSite(context: CommandContext, value: string) {
  const needle = value.trim().toLowerCase()
  return context.world.sites.find(
    (site) => site.id.toLowerCase() === needle || site.name.toLowerCase() === needle,
  )
}

function leaseRows(scope: DhcpScope): OutputLine[] {
  const ordered = [...scope.leases].sort((left, right) => {
    if (left.state !== right.state) {
      return left.state === 'stale' ? -1 : 1
    }
    return left.address.localeCompare(right.address, undefined, { numeric: true })
  })

  const rows = ordered.slice(0, 12).map((lease) =>
    line(
      `${lease.address.padEnd(16)}${lease.hostname.padEnd(18)}${lease.state.padEnd(8)}${formatClock(lease.expiresAt)}`,
    ),
  )

  if (ordered.length > rows.length) {
    rows.push(mutedLine(`... ${ordered.length - rows.length} more leases`))
  }

  return rows
}

function getDhcpScope(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-dhcp-scope <site>')
  }

  const site = resolveSite(context, target)
  if (!site) {
    return failed([
      errorLine(`Unknown site '${target}'.`),
      mutedLine(`Known sites: ${context.world.sites.map((entry) => entry.id).join(', ')}`),
    ])
  }

  const scope = findScope(context.world, site.id)
  if (!scope) {
    return failed([errorLine(`No DHCP scope is defined for ${site.name}.`)])
  }

  const lines = [
    line(`Scope       : ${scope.name}`),
    line(`Server      : ${scope.server}`),
    line(`Range       : ${scope.startAddress} - ${scope.endAddress}`),
    line(`Exclusions  : ${scope.exclusions.length > 0 ? scope.exclusions.join(', ') : '(none)'}`),
    line(
      `Leases      : ${leasedCount(scope)} issued, ${availableAddresses(scope)} available of ${scopeAddresses(scope)}`,
    ),
    line(`Option 003  : ${scope.router ?? '(not set)'}`),
    line(`Option 006  : ${scope.dnsServers.length > 0 ? scope.dnsServers.join(', ') : '(not set)'}`),
    line(`Lease time  : ${scope.leaseMinutes} minutes`),
    line(),
    line('Address         Hostname          State   Expires'),
    ...leaseRows(scope),
  ]

  if (availableAddresses(scope) === 0) {
    lines.push(
      mutedLine('This scope has no free addresses. New requests will fail until leases are cleared.'),
    )
  }

  return succeeded(lines)
}

function removeDhcpLease(context: CommandContext): CommandOutcome {
  const [siteArg, address] = context.args
  if (!siteArg || !address || context.args.length > 2) {
    return usageFailure('remove-dhcp-lease <site> <address>')
  }

  const site = resolveSite(context, siteArg)
  if (!site) {
    return failed([errorLine(`Unknown site '${siteArg}'.`)])
  }

  const scope = findScope(context.world, site.id)
  if (!scope) {
    return failed([errorLine(`No DHCP scope is defined for ${site.name}.`)])
  }

  const lease = scope.leases.find((entry) => entry.address === address)
  if (!lease) {
    return failed([
      errorLine(`No lease for ${address} exists in ${scope.name}.`),
      mutedLine('Check the address with "get-dhcp-scope <site>" before removing anything.'),
    ])
  }

  if (lease.state === 'active') {
    return failed([
      errorLine(`${address} is an active lease for ${lease.hostname}.`),
      mutedLine(
        'Removing a live lease disconnects a working device. Only stale leases are safe to clear.',
      ),
    ])
  }

  removeLease(scope, address)

  return succeeded(
    [
      successLine(`Removed the stale lease ${address} (${lease.hostname}).`),
      line(`Available addresses : ${availableAddresses(scope)}`),
      mutedLine('The freed address can be issued on the next DHCP request.'),
    ],
    [
      {
        type: 'dhcp_lease_removed',
        target: `${site.id}/${address}`,
        details: { hostname: lease.hostname, scope: scope.name },
      },
    ],
  )
}

export const dhcpCommands: readonly CommandDefinition[] = [
  {
    name: 'get-dhcp-scope',
    aliases: [],
    group: 'dhcp',
    usage: 'get-dhcp-scope <site>',
    summary: 'Show a site DHCP scope, its options, and its leases',
    run: getDhcpScope,
  },
  {
    name: 'remove-dhcp-lease',
    aliases: [],
    group: 'dhcp',
    usage: 'remove-dhcp-lease <site> <address>',
    summary: 'Remove a stale lease to free an address',
    run: removeDhcpLease,
  },
]
