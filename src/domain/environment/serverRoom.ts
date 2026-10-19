import {
  ADDRESS_ARGUMENT,
  offeredValues,
  type ConsoleAction,
  type ConsoleEntry,
  type ConsoleEvidence,
  type ConsoleGroup,
} from './console'
import { evidencedScopeAddresses } from './dhcp'
import { probeQueryName } from './topology'
import type { Device, Site, World } from './types'

/**
 * The Server Room projection: the infrastructure inventory a desk can see before
 * it touches anything.
 *
 * Like the directory, this is deliberately not a view of the live world. Link
 * state, addresses handed out by DHCP, lease ages, and the DNS servers a scope
 * actually serves are all absent — those are what the checks below are for, so
 * they land in the ticket log as evidence instead of appearing for free.
 */

const NOTE =
  'Link, addressing, and DNS state are not listed here: every check below runs a real command, so the evidence lands in the ticket log.'


function siteEntry(world: World, site: Site, evidence: ConsoleEvidence): ConsoleEntry {
  const devices = world.devices.filter((device) => device.siteId === site.id)
  const probe = probeQueryName(world)

  const groups: ConsoleGroup[] = [
    {
      label: 'Devices on this site',
      items: devices.map((device) => `${device.hostname} · ${device.kind} · ${device.os}`),
      empty: 'No device is inventoried at this site.',
    },
  ]

  const actions: ConsoleAction[] = [
    {
      id: 'site-scope',
      label: 'Inspect the DHCP scope',
      detail: 'DHCP: pool, exclusions, options, and leases for this site.',
      command: () => `get-dhcp-scope ${site.id}`,
    },
    {
      id: 'site-gateway',
      label: 'Ping the gateway',
      detail: `ICMP echo to ${site.gateway} from this machine.`,
      command: () => `ping ${site.gateway}`,
    },
    {
      id: 'site-resolve',
      label: 'Resolve a site name',
      detail: `DNS lookup for ${probe} from this machine.`,
      command: () => `nslookup ${probe}`,
    },
    {
      id: 'site-release-lease',
      label: 'Release one lease',
      detail: 'DHCP: hand a held address back to the pool by naming it.',
      command: (_target, args) => `remove-dhcp-lease ${site.id} ${args?.[0] ?? ''}`.trim(),
      // Only the leases a scope check has already printed for this site are
      // offered — the rows the report's own state column says are held. Which
      // of them is safe to release is still only in that column.
      args: [
        {
          ...ADDRESS_ARGUMENT,
          choices: offeredValues(evidencedScopeAddresses(evidence, site.id), 12),
        },
      ],
    },
  ]

  return {
    id: site.id,
    title: site.name,
    subtitle: `${site.subnet} · gateway ${site.gateway}`,
    facts: [
      { label: 'Subnet', value: `${site.subnet} (/${site.prefixLength})` },
      { label: 'Gateway', value: site.gateway },
      { label: 'DHCP server', value: site.dhcpServer },
      { label: 'Devices', value: `${devices.length}` },
    ],
    groups,
    actions,
    note: NOTE,
  }
}

function serverEntry(world: World, device: Device): ConsoleEntry {
  const site = world.sites.find((candidate) => candidate.id === device.siteId)

  return {
    id: device.id,
    title: device.hostname,
    subtitle: `${site?.name ?? device.siteId} · ${device.kind}`,
    facts: [
      { label: 'Site', value: site?.name ?? device.siteId },
      { label: 'Operating system', value: device.os },
      { label: 'Adapter', value: device.adapterDescription },
      { label: 'MAC address', value: device.macAddress },
      {
        label: 'Addressing',
        value: device.ipMode === 'static' ? 'Static (reserved)' : 'DHCP',
      },
    ],
    groups: [],
    actions: [
      {
        id: 'server-ping',
        label: 'Ping the server',
        detail: `ICMP echo to ${device.hostname} from this machine.`,
        command: () => `ping ${device.hostname}`,
      },
      {
        id: 'server-resolve',
        label: 'Resolve its name',
        detail: 'DNS lookup from this machine.',
        command: () => `nslookup ${device.hostname}`,
      },
      {
        id: 'server-smb',
        label: 'Test the file-share port',
        detail: `TCP 445 on ${device.hostname}, where shares live.`,
        command: () => `test-netconnection ${device.hostname} -Port 445`,
      },
    ],
    note: NOTE,
  }
}

/**
 * The machine the session is connected to. It is its own entry because the
 * adapter, the lease, and the resolver cache can only be read and changed from
 * here; every action is the same command the terminal would run.
 */
function currentMachineEntry(world: World, device: Device): ConsoleEntry {
  const site = world.sites.find((candidate) => candidate.id === device.siteId)
  const probe = probeQueryName(world)
  const dnsServers = site?.dnsServers ?? []

  return {
    id: device.id,
    title: device.hostname,
    subtitle: `This machine · ${site?.name ?? device.siteId}`,
    facts: [
      { label: 'Site', value: site?.name ?? device.siteId },
      { label: 'Operating system', value: device.os },
      { label: 'Adapter', value: device.adapterDescription },
      { label: 'MAC address', value: device.macAddress },
      {
        label: 'Addressing',
        value: device.ipMode === 'static' ? 'Static (manual)' : 'DHCP',
      },
    ],
    groups: [],
    actions: [
      {
        id: 'machine-adapter',
        label: 'Show the adapter and lease',
        detail: 'ipconfig /all: link, address, gateway, DNS, and lease times.',
        command: () => 'ipconfig /all',
      },
      {
        id: 'machine-renew',
        label: 'Renew the DHCP lease',
        detail: 'Ask the site scope for an address again.',
        command: () => 'ipconfig /renew',
      },
      {
        id: 'machine-flush',
        label: 'Flush the DNS cache',
        detail: 'Discard cached answers before retesting a name.',
        command: () => 'ipconfig /flushdns',
      },
      {
        id: 'machine-dns-ping',
        label: 'Ping the site DNS server',
        detail:
          'ICMP echo to the resolver this site is supposed to use, whatever this adapter is set to.',
        command: () => `ping ${dnsServers[0] ?? site?.dhcpServer ?? '127.0.0.1'}`,
      },
      {
        id: 'machine-dns-restore',
        label: 'Restore the site DNS servers',
        detail:
          'Point this adapter back at the servers the site serves — the scope options name them.',
        command: () => `set-dns ${dnsServers.join(' ')}`.trim(),
      },
      {
        id: 'machine-gateway',
        label: 'Ping the gateway',
        detail: site ? `ICMP echo to ${site.gateway}.` : 'ICMP echo to the default gateway.',
        command: () => (site ? `ping ${site.gateway}` : 'ping 127.0.0.1'),
      },
      {
        id: 'machine-resolve',
        label: 'Resolve a site name',
        detail: `DNS lookup for ${probe}.`,
        command: () => `nslookup ${probe}`,
      },
      {
        id: 'machine-smb',
        label: 'Test the file-share port',
        detail: `TCP 445 on ${probe} for share access.`,
        command: () => `test-netconnection ${probe} -Port 445`,
      },
    ],
    note: NOTE,
  }
}

/** Sites, then servers, then the machine the learner is sitting at. */
export function serverRoomConsoleEntries(
  world: World,
  evidence: ConsoleEvidence = [],
): ConsoleEntry[] {
  const current = world.devices.find((device) => device.id === world.currentDeviceId) ?? null
  const sites = [...world.sites].sort((left, right) => left.name.localeCompare(right.name))
  const servers = world.devices
    .filter((device) => device.kind === 'server' && device.id !== current?.id)
    .sort((left, right) => left.hostname.localeCompare(right.hostname))

  const entries = sites.map((site) => siteEntry(world, site, evidence))
  entries.push(...servers.map((device) => serverEntry(world, device)))
  if (current) {
    // The local machine comes first: it is where every check is run from.
    entries.unshift(currentMachineEntry(world, current))
  }

  return entries
}
