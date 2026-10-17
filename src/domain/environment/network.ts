import type { DnsRecord, Device, Site, World } from './types'

export type DnsFailure = 'link-down' | 'no-dns' | 'server-unreachable' | 'nxdomain'

export type DnsAnswer =
  | { ok: true; address: string; server: string }
  | { ok: false; reason: DnsFailure }

export function normalizeHostname(value: string): string {
  return value.trim().replace(/\.$/, '').toLowerCase()
}

export function isIPv4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  )
}

export function isPrivateAddress(value: string): boolean {
  if (!isIPv4(value)) {
    return false
  }
  const [first = 0, second = 0] = value.split('.').map(Number)
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  )
}

export function hashString(value: string): number {
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function canReachAddress(world: World, device: Device, address: string): boolean {
  if (!device.linkUp) {
    return false
  }
  if (address === '127.0.0.1' || address === 'localhost') {
    return true
  }
  if (!isIPv4(address)) {
    return false
  }
  return isPrivateAddress(address) || world.network.wanUp
}

function isInternalDnsServer(world: World, server: string): boolean {
  return world.sites.some((site) => site.dnsServers.includes(server))
}

export function isKnownDnsServer(world: World, server: string): boolean {
  return isInternalDnsServer(world, server) || world.network.publicNameServers.includes(server)
}

export function resolveName(
  world: World,
  device: Device,
  name: string,
  serverOverride?: string,
): DnsAnswer {
  const normalized = normalizeHostname(name)

  if (!normalized) {
    return { ok: false, reason: 'nxdomain' }
  }
  if (normalized === 'localhost') {
    return { ok: true, address: '127.0.0.1', server: 'local' }
  }
  if (isIPv4(normalized)) {
    return { ok: true, address: normalized, server: 'literal' }
  }
  if (!device.linkUp) {
    return { ok: false, reason: 'link-down' }
  }

  const servers = serverOverride ? [serverOverride] : device.dnsServers
  if (servers.length === 0) {
    return { ok: false, reason: 'no-dns' }
  }

  // Windows appends the DNS suffix to single-label names.
  const candidates = normalized.includes('.') ? [normalized] : [normalized, `${normalized}.${world.domain}`]

  let sawUnreachableServer = false

  for (const server of servers) {
    const internal = isInternalDnsServer(world, server)
    const publicResolver = world.network.publicNameServers.includes(server)

    if (!internal && !publicResolver) {
      sawUnreachableServer = true
      continue
    }
    if (!internal && !world.network.wanUp) {
      sawUnreachableServer = true
      continue
    }
    if (!canReachAddress(world, device, server)) {
      sawUnreachableServer = true
      continue
    }

    // Public resolvers cannot answer for the internal zone.
    if (publicResolver && !internal) {
      const internalName = candidates.some(
        (candidate) => candidate === world.domain || candidate.endsWith(`.${world.domain}`),
      )
      if (internalName) {
        return { ok: false, reason: 'nxdomain' }
      }
    }

    for (const candidate of candidates) {
      const record = world.network.dnsRecords.find(
        (entry) => normalizeHostname(entry.name) === candidate,
      )
      if (record) {
        return { ok: true, address: record.address, server }
      }
    }
    return { ok: false, reason: 'nxdomain' }
  }

  return { ok: false, reason: sawUnreachableServer ? 'server-unreachable' : 'nxdomain' }
}

export function dnsFailureMessage(reason: DnsFailure): string {
  switch (reason) {
    case 'link-down':
      return 'Media disconnected: name resolution is unavailable.'
    case 'no-dns':
      return 'No DNS servers are configured for this adapter.'
    case 'server-unreachable':
      return 'DNS request timed out. The configured DNS server did not respond.'
    case 'nxdomain':
      return 'Non-existent domain: the name has no DNS record.'
  }
}

export function nextDhcpAddress(site: Site, deviceId: string): string {
  const base = site.subnet.split('.').slice(0, 3).join('.')
  const host = 60 + (hashString(deviceId) % 100)
  return `${base}.${host}`
}

export function updateHostRecord(world: World, device: Device, address: string): void {
  const name = normalizeHostname(`${device.hostname}.${world.domain}`)
  const record = world.network.dnsRecords.find(
    (candidate: DnsRecord) => normalizeHostname(candidate.name) === name,
  )
  if (record) {
    record.address = address
  } else {
    world.network.dnsRecords.push({ name: `${device.hostname}.${world.domain}`, address })
  }
}

export function isPortOpen(world: World, device: Device, address: string, port: number): boolean {
  if (!canReachAddress(world, device, address)) {
    return false
  }

  if (!isPrivateAddress(address)) {
    return port === 80 || port === 443
  }

  const target = world.devices.find((candidate) => candidate.ipAddress === address)
  if (!target) {
    const isInfrastructure =
      world.sites.some(
        (site) =>
          site.gateway === address ||
          site.dhcpServer === address ||
          site.dnsServers.includes(address),
      )
    return isInfrastructure && port === 53
  }

  if (target.kind === 'server') {
    return port === 53 || port === 80 || port === 443 || port === 445 || port === 3389
  }
  return port === 445 || port === 3389
}
