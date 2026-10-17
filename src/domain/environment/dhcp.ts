import type { DhcpScope, SiteId, World } from './types'

/** The fixture scopes are all /24, so the last octet is enough to count addresses. */
export function lastOctet(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4) {
    return null
  }
  const value = Number(parts[3])
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null
}

export function findScope(world: World, siteId: SiteId): DhcpScope | undefined {
  return world.dhcpScopes.find((scope) => scope.siteId === siteId)
}

export function scopeAddresses(scope: DhcpScope): number {
  const start = lastOctet(scope.startAddress)
  const end = lastOctet(scope.endAddress)
  if (start === null || end === null || end < start) {
    return 0
  }
  return end - start + 1
}

export function leasedCount(scope: DhcpScope): number {
  return new Set(scope.leases.map((lease) => lease.address)).size
}

/** Addresses that can still be handed out: range minus exclusions minus issued leases. */
export function availableAddresses(scope: DhcpScope): number {
  const excluded = new Set(scope.exclusions)
  for (const lease of scope.leases) {
    excluded.add(lease.address)
  }
  return Math.max(0, scopeAddresses(scope) - excluded.size)
}

function addressAt(scope: DhcpScope, offset: number): string {
  const octet = (lastOctet(scope.startAddress) ?? 0) + offset
  const base = scope.startAddress.split('.').slice(0, 3).join('.')
  return `${base}.${octet}`
}

/**
 * Picks the first free address in the scope, starting from a preferred address
 * when one is supplied. Returns null when the scope is exhausted.
 */
export function nextFreeAddress(scope: DhcpScope, preferred?: string | null): string | null {
  const used = new Set(scope.exclusions)
  for (const lease of scope.leases) {
    used.add(lease.address)
  }
  if (preferred && !used.has(preferred)) {
    const preferredOctet = lastOctet(preferred)
    const start = lastOctet(scope.startAddress)
    const end = lastOctet(scope.endAddress)
    if (
      preferredOctet !== null &&
      start !== null &&
      end !== null &&
      preferredOctet >= start &&
      preferredOctet <= end
    ) {
      return preferred
    }
  }

  const size = scopeAddresses(scope)
  for (let offset = 0; offset < size; offset += 1) {
    const candidate = addressAt(scope, offset)
    if (!used.has(candidate)) {
      return candidate
    }
  }
  return null
}

export function recordLease(
  scope: DhcpScope,
  hostname: string,
  address: string,
  now: number,
): void {
  const expiresAt = now + scope.leaseMinutes * 60_000
  const existing = scope.leases.find((lease) => lease.address === address)
  if (existing) {
    existing.hostname = hostname
    existing.state = 'active'
    existing.expiresAt = expiresAt
    return
  }
  scope.leases.push({ address, hostname, state: 'active', expiresAt })
}

export function removeLease(scope: DhcpScope, address: string): DhcpScope['leases'][number] | null {
  const index = scope.leases.findIndex((lease) => lease.address === address)
  if (index === -1) {
    return null
  }
  const [removed] = scope.leases.splice(index, 1)
  return removed ?? null
}
