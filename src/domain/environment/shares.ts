import type {
  DirectoryUser,
  FileShare,
  SecurityGroup,
  ShareAccess,
  ShareGrant,
  World,
} from './types'

const ACCESS_RANK: Record<ShareAccess, number> = { read: 1, change: 2, full: 3 }

export function findShare(world: World, nameOrPath: string): FileShare | undefined {
  const needle = nameOrPath.trim().toLowerCase().replace(/\\\\/g, '\\').replace(/\\+$/, '')
  return world.shares.find(
    (share) =>
      share.name.toLowerCase() === needle ||
      share.path.toLowerCase() === needle ||
      share.path.toLowerCase().endsWith(`\\${needle}`),
  )
}

export function findGroup(world: World, name: string): SecurityGroup | undefined {
  return world.groups.find((group) => group.name.toLowerCase() === name.toLowerCase())
}

export function groupsFor(world: World, user: DirectoryUser): SecurityGroup[] {
  return world.groups.filter((group) => group.members.includes(user.id))
}

function grantMatches(world: World, grant: ShareGrant, user: DirectoryUser): boolean {
  if (grant.principal.kind === 'user') {
    return grant.principal.samAccountName.toLowerCase() === user.samAccountName.toLowerCase()
  }
  const group = findGroup(world, grant.principal.name)
  return Boolean(group?.members.includes(user.id))
}

function principalLabel(grant: ShareGrant): string {
  return grant.principal.kind === 'group'
    ? `LARKSPUR\\${grant.principal.name}`
    : `LARKSPUR\\${grant.principal.samAccountName}`
}

export interface EffectiveAccess {
  access: ShareAccess | 'none'
  /** How the result was reached, for the tool output and for teaching. */
  reason: string
}

export function effectiveAccess(
  world: World,
  share: FileShare,
  user: DirectoryUser,
): EffectiveAccess {
  const matching = share.grants.filter((grant) => grantMatches(world, grant, user))
  const deny = matching.find((grant) => !grant.allow)

  if (deny) {
    return {
      access: 'none',
      reason: `Explicit Deny for ${principalLabel(deny)} overrides every allow entry.`,
    }
  }

  const allows = matching.filter((grant) => grant.allow)
  if (allows.length === 0) {
    return {
      access: 'none',
      reason: `No allow entry matches ${user.samAccountName}.`,
    }
  }

  const best = allows.reduce((winner, grant) =>
    ACCESS_RANK[grant.access] > ACCESS_RANK[winner.access] ? grant : winner,
  )

  return {
    access: best.access,
    reason: `Allowed through ${principalLabel(best)}.`,
  }
}

/**
 * Each department has one obvious working share and the group that grants it.
 * Scenarios use this instead of "the group the user is in", because the fault
 * itself may be a missing membership.
 */
const TEAM_SHARES: Record<string, { share: string; group: string }> = {
  Finance: { share: 'Finance', group: 'FS-Finance-RW' },
  Operations: { share: 'Operations', group: 'FS-Ops-RW' },
  Sales: { share: 'Dispatch', group: 'FS-Dispatch-RW' },
  Warehouse: { share: 'Dispatch', group: 'FS-Dispatch-RW' },
  IT: { share: 'Finance', group: 'FS-Finance-RW' },
}

export interface TeamShare {
  share: FileShare
  group: SecurityGroup
}

export function teamShare(world: World, user: DirectoryUser): TeamShare | null {
  const mapping = TEAM_SHARES[user.department]
  if (!mapping) {
    return null
  }
  const share = findShare(world, mapping.share)
  const group = findGroup(world, mapping.group)
  return share && group ? { share, group } : null
}

export function addGroupMember(group: SecurityGroup, user: DirectoryUser): boolean {
  if (group.members.includes(user.id)) {
    return false
  }
  group.members.push(user.id)
  return true
}

export function removeShareDeny(
  world: World,
  share: FileShare,
  user: DirectoryUser,
): boolean {
  const index = share.grants.findIndex(
    (grant) =>
      !grant.allow &&
      grantMatches(world, grant, user),
  )
  if (index === -1) {
    return false
  }
  share.grants.splice(index, 1)
  return true
}
