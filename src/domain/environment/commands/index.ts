import { errorLine, line, mutedLine } from '../output'
import type { OutputLine } from '../types'
import { dhcpCommands } from './dhcp'
import { identityCommands } from './identity'
import { m365Commands } from './m365'
import { networkCommands } from './network'
import { printerCommands } from './printer'
import { sessionCommands } from './session'
import { shareCommands } from './shares'
import type { CommandContext, CommandDefinition } from './types'
import { failed, succeeded } from './types'

function helpOverview(): OutputLine[] {
  const groups: Array<{ label: string; group: CommandDefinition['group'] }> = [
    { label: 'Network', group: 'network' },
    { label: 'DHCP', group: 'dhcp' },
    { label: 'Identity', group: 'identity' },
    { label: 'Microsoft 365', group: 'm365' },
    { label: 'File shares', group: 'shares' },
    { label: 'Printing', group: 'printer' },
    { label: 'Session', group: 'session' },
  ]

  const output: OutputLine[] = [
    line('HelpDeskLab simulated tools'),
    line(),
  ]

  for (const { label, group } of groups) {
    output.push(line(label))
    for (const command of COMMANDS.filter((candidate) => candidate.group === group)) {
      output.push(line(`  ${command.usage.padEnd(48)}${command.summary}`))
    }
    output.push(line())
  }

  output.push(
    mutedLine('Type "help <command>" for usage details. Nothing here touches real systems.'),
  )
  return output
}

function help(context: CommandContext) {
  if (context.args.length === 0) {
    return succeeded(helpOverview())
  }

  const topic = context.args[0]
  if (!topic || context.args.length > 1) {
    return failed([errorLine('Usage: help [command]')])
  }

  const definition = findCommand(topic)
  if (!definition) {
    return failed([errorLine(`No help found for '${topic}'.`), mutedLine('Type "help" to list tools.')])
  }

  const output = [
    line(`${definition.name} — ${definition.summary}`),
    line(`Usage: ${definition.usage}`),
  ]
  if (definition.aliases.length > 0) {
    output.push(line(`Aliases: ${definition.aliases.join(', ')}`))
  }
  output.push(line(), mutedLine('Simulation only — no real credentials are accepted or stored.'))

  return succeeded(output)
}

const helpDefinition: CommandDefinition = {
  name: 'help',
  aliases: ['?'],
  group: 'session',
  usage: 'help [command]',
  summary: 'List available simulated tools',
  run: help,
}

export const COMMANDS: readonly CommandDefinition[] = [
  ...networkCommands,
  ...dhcpCommands,
  ...identityCommands,
  ...m365Commands,
  ...shareCommands,
  ...printerCommands,
  ...sessionCommands,
  helpDefinition,
]

const byName = new Map<string, CommandDefinition>()
for (const command of COMMANDS) {
  byName.set(command.name, command)
  for (const alias of command.aliases) {
    byName.set(alias, command)
  }
}

export function findCommand(name: string): CommandDefinition | undefined {
  return byName.get(name.toLowerCase().replace(/\.exe$/, ''))
}
