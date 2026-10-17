import { addGroupMember, effectiveAccess, findGroup, findShare, groupsFor, removeShareDeny } from '../shares'
import { errorLine, line, mutedLine, successLine } from '../output'
import type { DirectoryUser, ShareAccess } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

const ACCESS_LABELS: Record<ShareAccess | 'none', string> = {
  none: 'Denied',
  read: 'Read',
  change: 'Change',
  full: 'Full control',
}

function findUser(context: CommandContext, value: string): DirectoryUser | undefined {
  const needle = value.trim().toLowerCase()
  return context.world.users.find(
    (user) =>
      user.samAccountName.toLowerCase() === needle ||
      user.email.toLowerCase() === needle ||
      user.displayName.toLowerCase() === needle,
  )
}

function getShareAccess(context: CommandContext): CommandOutcome {
  const [shareArg, userArg] = context.args
  if (!shareArg || context.args.length > 2) {
    return usageFailure('get-share-access <share> [samAccountName]')
  }

  const share = findShare(context.world, shareArg)
  if (!share) {
    return failed([
      errorLine(`Share '${shareArg}' was not found.`),
      mutedLine(`Known shares: ${context.world.shares.map((entry) => entry.name).join(', ')}`),
    ])
  }

  const user = userArg ? findUser(context, userArg) : context.user
  if (!user) {
    return failed([errorLine(`The user '${userArg ?? ''}' could not be found in the directory.`)])
  }

  const effective = effectiveAccess(context.world, share, user)
  const groups = groupsFor(context.world, user).map((group) => group.name)

  return succeeded([
    line(`Share       : ${share.path}`),
    line(`Server      : ${share.server}`),
    line(`User        : LARKSPUR\\${user.samAccountName} (${user.displayName})`),
    line(`Effective   : ${ACCESS_LABELS[effective.access]}`),
    line(`Reason      : ${effective.reason}`),
    line(`Groups      : ${groups.length > 0 ? groups.join(', ') : '(none)'}`),
    line(),
    line('Entries'),
    ...share.grants.map((grant) =>
      line(
        `  ${(grant.principal.kind === 'group' ? `LARKSPUR\\${grant.principal.name}` : `LARKSPUR\\${grant.principal.samAccountName}`).padEnd(36)}${ACCESS_LABELS[grant.access].padEnd(14)}${grant.allow ? 'Allow' : 'Deny'}`,
      ),
    ),
  ])
}

function addMember(context: CommandContext): CommandOutcome {
  const [groupArg, userArg] = context.args
  if (!groupArg || !userArg || context.args.length > 2) {
    return usageFailure('add-group-member <group> <samAccountName>')
  }

  const group = findGroup(context.world, groupArg)
  if (!group) {
    return failed([
      errorLine(`Group '${groupArg}' was not found.`),
      mutedLine(`Known groups: ${context.world.groups.map((entry) => entry.name).join(', ')}`),
    ])
  }

  const user = findUser(context, userArg)
  if (!user) {
    return failed([errorLine(`The user '${userArg}' could not be found in the directory.`)])
  }

  if (!addGroupMember(group, user)) {
    return succeeded([mutedLine(`${user.samAccountName} is already a member of ${group.name}.`)])
  }

  return succeeded(
    [
      successLine(`Added '${user.samAccountName}' to ${group.name}.`),
      mutedLine('Group membership is evaluated when the user opens the share again.'),
    ],
    [
      {
        type: 'group_member_added',
        target: `${group.name}/${user.samAccountName}`,
      },
    ],
  )
}

function removeDeny(context: CommandContext): CommandOutcome {
  const [shareArg, userArg] = context.args
  if (!shareArg || !userArg || context.args.length > 2) {
    return usageFailure('remove-share-deny <share> <samAccountName>')
  }

  const share = findShare(context.world, shareArg)
  if (!share) {
    return failed([errorLine(`Share '${shareArg}' was not found.`)])
  }

  const user = findUser(context, userArg)
  if (!user) {
    return failed([errorLine(`The user '${userArg}' could not be found in the directory.`)])
  }

  if (!removeShareDeny(context.world, share, user)) {
    return succeeded([
      mutedLine(`No explicit deny entry for ${user.samAccountName} on ${share.name}.`),
    ])
  }

  return succeeded(
    [
      successLine(`Removed the explicit deny for '${user.samAccountName}' on ${share.name}.`),
      mutedLine('Explicit deny entries usually come from a data-owner policy; confirm before removing.'),
    ],
    [
      {
        type: 'share_deny_removed',
        target: `${share.name}/${user.samAccountName}`,
      },
    ],
  )
}

export const shareCommands: readonly CommandDefinition[] = [
  {
    name: 'get-share-access',
    aliases: [],
    group: 'shares',
    usage: 'get-share-access <share> [samAccountName]',
    summary: 'Show effective access, group membership, and every share entry',
    run: getShareAccess,
  },
  {
    name: 'add-group-member',
    aliases: [],
    group: 'shares',
    usage: 'add-group-member <group> <samAccountName>',
    summary: 'Add a user to a security group that grants share access',
    run: addMember,
  },
  {
    name: 'remove-share-deny',
    aliases: [],
    group: 'shares',
    usage: 'remove-share-deny <share> <samAccountName>',
    summary: 'Remove an explicit deny entry from a share',
    run: removeDeny,
  },
]
