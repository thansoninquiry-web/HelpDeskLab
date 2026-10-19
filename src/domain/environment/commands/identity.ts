import { errorLine, line, mutedLine, successLine } from '../output'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

function findUser(context: CommandContext, username: string) {
  const needle = username.toLowerCase()
  return context.world.users.find(
    (user) =>
      user.samAccountName.toLowerCase() === needle ||
      user.email.toLowerCase() === needle ||
      user.displayName.toLowerCase() === needle,
  )
}

function missingUser(username: string): CommandOutcome {
  return failed([
    errorLine(`The user '${username}' could not be found in the directory.`),
    mutedLine('Use the requester details on the ticket; do not guess account names.'),
  ])
}

function unlockAccount(context: CommandContext): CommandOutcome {
  const username = context.args[0]
  if (!username || context.args.length > 1) {
    return usageFailure('unlock-account <samAccountName>')
  }

  const user = findUser(context, username)
  if (!user) {
    return missingUser(username)
  }

  if (user.status === 'disabled') {
    return failed([
      errorLine(`The account '${user.samAccountName}' is disabled. Unlocking will not help.`),
      mutedLine('A disabled account needs a different remediation path and approval.'),
    ])
  }

  if (user.status === 'active') {
    return succeeded([mutedLine(`Account '${user.samAccountName}' is not locked out.`)])
  }

  user.status = 'active'

  return succeeded(
    [
      successLine(`The command completed successfully for '${user.samAccountName}'.`),
      line(`Account status: active`),
    ],
    [{ type: 'account_unlocked', target: user.samAccountName }],
  )
}

function resetPassword(context: CommandContext): CommandOutcome {
  const username = context.args[0]
  if (!username || context.args.length > 1) {
    return usageFailure('reset-password <samAccountName>')
  }

  const user = findUser(context, username)
  if (!user) {
    return missingUser(username)
  }

  if (user.status === 'disabled') {
    return failed([
      errorLine(`The account '${user.samAccountName}' is disabled. A password reset will not restore access.`),
    ])
  }

  user.status = 'active'
  user.passwordExpired = false
  user.passwordLastChangedAt = context.now

  return succeeded(
    [
      successLine(`The password for '${user.samAccountName}' was reset.`),
      mutedLine('No password is entered or stored in this simulation. Share it only through an approved channel.'),
    ],
    [
      {
        type: 'password_reset',
        target: user.samAccountName,
        details: { verifiedCaller: false },
      },
    ],
  )
}

function getAccount(context: CommandContext): CommandOutcome {
  const username = context.args[0]
  if (!username || context.args.length > 1) {
    return usageFailure('get-account <samAccountName>')
  }

  const user = findUser(context, username)
  if (!user) {
    return missingUser(username)
  }

  return succeeded([
    line(`displayName     : ${user.displayName}`),
    line(`samAccountName  : ${user.samAccountName}`),
    line(`status          : ${user.status}`),
    line(`passwordExpired : ${user.passwordExpired ? 'True' : 'False'}`),
    line(
      `passwordChanged : ${user.passwordLastChangedAt ? new Date(user.passwordLastChangedAt).toISOString() : 'Never'}`,
    ),
    line(`department      : ${user.department}`),
    line(`manager         : ${user.managerName}`),
  ])
}

export const identityCommands: readonly CommandDefinition[] = [
  {
    name: 'get-account',
    aliases: ['get-aduser'],
    group: 'identity',
    access: 'read',
    usage: 'get-account <samAccountName>',
    summary: 'Show directory status, lockout, and password expiry for an account',
    run: getAccount,
  },
  {
    name: 'unlock-account',
    aliases: [],
    group: 'identity',
    access: 'change',
    usage: 'unlock-account <samAccountName>',
    summary: 'Unlock a locked directory account',
    changesAccount: true,
    run: unlockAccount,
  },
  {
    name: 'reset-password',
    aliases: [],
    group: 'identity',
    access: 'change',
    usage: 'reset-password <samAccountName>',
    summary: 'Reset a user password through the directory',
    changesAccount: true,
    run: resetPassword,
  },
]
