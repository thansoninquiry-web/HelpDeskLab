import { errorLine, line, mutedLine, successLine } from '../output'
import type { DirectoryUser, M365Account } from '../types'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded, usageFailure } from './types'

const SIGN_IN_ERRORS: Record<string, string> = {
  AADSTS50053: 'The account is locked because of repeated or risky sign-in attempts.',
  AADSTS50055: 'The password has expired and must be changed before signing in.',
  AADSTS50057: 'The account is disabled by policy.',
  AADSTS50076:
    'Multi-factor authentication is required, but no usable method is registered for the account.',
  AADSTS50079: 'The tenant requires the user to register a multi-factor method.',
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

function findAccount(context: CommandContext, user: DirectoryUser): M365Account | undefined {
  return context.world.m365.accounts.find((account) => account.userId === user.id)
}

function missingUser(value: string): CommandOutcome {
  return failed([
    errorLine(`The user '${value}' could not be found in the directory.`),
    mutedLine('Use the account name from the ticket details.'),
  ])
}

function formatClock(ms: number | null): string {
  return ms === null ? 'Never' : new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

function getSignInLog(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('get-signin-log <samAccountName>')
  }

  const user = findUser(context, target)
  if (!user) {
    return missingUser(target)
  }

  const account = findAccount(context, user)
  if (!account) {
    return failed([errorLine(`No Microsoft 365 account exists for ${user.samAccountName}.`)])
  }

  const error = account.lastSignInError
  return succeeded([
    line(`User            : ${user.displayName} (${user.samAccountName})`),
    line(`Tenant          : ${context.world.m365.name}`),
    line(`MFA registered  : ${account.mfaRegistered ? 'True' : 'False'} (${account.mfaMethod})`),
    line(`Sign-in blocked : ${account.signInBlocked ? 'True' : 'False'}`),
    line(`Last error      : ${error ? `${error} - ${SIGN_IN_ERRORS[error] ?? 'Unrecognised error.'}` : 'None - the last sign-in succeeded.'}`),
    line(`Last attempt    : ${formatClock(account.lastSignInAt)}`),
    line(`Attempts        : ${account.signInAttempts}`),
  ])
}

function resetMfa(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('reset-mfa <samAccountName>')
  }

  const user = findUser(context, target)
  if (!user) {
    return missingUser(target)
  }
  if (user.status === 'disabled') {
    return failed([
      errorLine(`The account '${user.samAccountName}' is disabled. Clearing MFA will not restore access.`),
      mutedLine('A disabled account needs the owning team, not an MFA change.'),
    ])
  }

  const account = findAccount(context, user)
  if (!account) {
    return failed([errorLine(`No Microsoft 365 account exists for ${user.samAccountName}.`)])
  }
  if (!account.mfaRegistered) {
    return succeeded([
      mutedLine(`No MFA methods are registered for ${user.samAccountName}.`),
      mutedLine('The user is prompted to register a method on their next sign-in.'),
    ])
  }

  const previous = account.mfaMethod
  account.mfaRegistered = false
  account.mfaMethod = 'none'
  account.lastSignInError = 'AADSTS50079'
  account.signInAttempts = 0

  return succeeded(
    [
      successLine(`Cleared the registered MFA methods for '${user.samAccountName}'.`),
      line(`Previous method : ${previous}`),
      mutedLine('The next sign-in asks the user to register a new method.'),
      mutedLine('Reset MFA only after the caller identity is confirmed.'),
    ],
    [
      {
        type: 'mfa_reset',
        target: user.samAccountName,
        details: { previousMethod: previous },
      },
    ],
  )
}

function unblockSignIn(context: CommandContext): CommandOutcome {
  const target = context.args[0]
  if (!target || context.args.length > 1) {
    return usageFailure('unblock-signin <samAccountName>')
  }

  const user = findUser(context, target)
  if (!user) {
    return missingUser(target)
  }

  const account = findAccount(context, user)
  if (!account) {
    return failed([errorLine(`No Microsoft 365 account exists for ${user.samAccountName}.`)])
  }
  if (!account.signInBlocked) {
    return succeeded([mutedLine(`Sign-in is not blocked for ${user.samAccountName}.`)])
  }

  account.signInBlocked = false
  account.lastSignInError = null
  account.signInAttempts = 0

  return succeeded(
    [
      successLine(`Sign-in is unblocked for '${user.samAccountName}'.`),
      mutedLine('Ask the user to sign in again; the block clears after a successful attempt.'),
    ],
    [{ type: 'signin_unblocked', target: user.samAccountName }],
  )
}

export const m365Commands: readonly CommandDefinition[] = [
  {
    name: 'get-signin-log',
    aliases: [],
    group: 'm365',
    usage: 'get-signin-log <samAccountName>',
    summary: 'Show Microsoft 365 sign-in state, MFA methods, and the last error',
    run: getSignInLog,
  },
  {
    name: 'reset-mfa',
    aliases: [],
    group: 'm365',
    usage: 'reset-mfa <samAccountName>',
    summary: 'Clear registered MFA methods so the user can register again',
    run: resetMfa,
  },
  {
    name: 'unblock-signin',
    aliases: [],
    group: 'm365',
    usage: 'unblock-signin <samAccountName>',
    summary: 'Clear a Microsoft 365 sign-in block',
    run: unblockSignIn,
  },
]
