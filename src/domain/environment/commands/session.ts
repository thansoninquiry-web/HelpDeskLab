import { errorLine, line } from '../output'
import type { CommandContext, CommandDefinition, CommandOutcome } from './types'
import { failed, succeeded } from './types'

function whoami(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return failed([errorLine('Usage: whoami')])
  }
  if (!context.user) {
    return failed([errorLine('ERROR: Unable to determine the signed-in user for this machine.')])
  }
  return succeeded([line(`larkspur\\${context.user.samAccountName}`)])
}

function hostname(context: CommandContext): CommandOutcome {
  if (context.args.length > 0) {
    return failed([errorLine('Usage: hostname')])
  }
  return succeeded([line(context.device.hostname)])
}

export const sessionCommands: readonly CommandDefinition[] = [
  {
    name: 'whoami',
    aliases: [],
    group: 'session',
    usage: 'whoami',
    summary: 'Show the signed-in user for this machine',
    run: whoami,
  },
  {
    name: 'hostname',
    aliases: [],
    group: 'session',
    usage: 'hostname',
    summary: 'Show this machine name',
    run: hostname,
  },
]
