import { errorLine, line, mutedLine } from '../output'
import { parseCommandLine } from '../parser'
import type { OutputLine } from '../types'
import { assetCommands } from './assets'
import { deploymentCommands } from './deployment'
import { dhcpCommands } from './dhcp'
import { identityCommands } from './identity'
import { m365Commands } from './m365'
import { mailCommands } from './mail'
import { networkCommands } from './network'
import { printerCommands } from './printer'
import { remoteCommands } from './remote'
import { shareCommands } from './shares'
import { shelfCommands } from './shelf'
import { shippingCommands } from './shipping'
import { workstationCommands } from './workstation'
import type { CommandAccess, CommandContext, CommandDefinition } from './types'
import { failed, succeeded } from './types'

/**
 * The groups the reference is organised by, in the order it lists them. The
 * terminal's `help` and the workspace cheat sheet both read this list, so a
 * group is never named in one and missing from the other.
 */
export type CommandGroupId = CommandDefinition['group']

export const COMMAND_GROUPS: ReadonlyArray<{
  id: CommandGroupId
  label: string
}> = [
  { id: 'workstation', label: 'Workstation' },
  { id: 'network', label: 'Network' },
  { id: 'dhcp', label: 'DHCP' },
  { id: 'identity', label: 'Identity' },
  { id: 'm365', label: 'Microsoft 365' },
  { id: 'mail', label: 'Mail' },
  { id: 'remote', label: 'Remote desktop' },
  { id: 'deployment', label: 'Computer deployment' },
  { id: 'shelf', label: 'PC shelf' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'assets', label: 'Asset management' },
  { id: 'shares', label: 'File shares' },
  { id: 'printer', label: 'Printing' },
]

/**
 * The commands a learner can run, grouped for display. `session` commands are
 * left out: `help` is how the reference is asked for, not something it lists.
 */
export function commandGroups(): Array<{
  id: CommandGroupId
  label: string
  commands: CommandDefinition[]
}> {
  return COMMAND_GROUPS.map(({ id, label }) => ({
    id,
    label,
    commands: COMMANDS.filter((command) => command.group === id),
  })).filter((entry) => entry.commands.length > 0)
}

function helpOverview(): OutputLine[] {
  const output: OutputLine[] = [
    line('HelpDeskLab simulated tools'),
    line(),
  ]

  for (const { label, commands } of commandGroups()) {
    output.push(line(label))
    for (const command of commands) {
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
  access: 'read',
  run: help,
}

export const COMMANDS: readonly CommandDefinition[] = [
  ...workstationCommands,
  ...networkCommands,
  ...dhcpCommands,
  ...identityCommands,
  ...m365Commands,
  ...mailCommands,
  ...remoteCommands,
  ...deploymentCommands,
  ...shelfCommands,
  ...shippingCommands,
  ...assetCommands,
  ...shareCommands,
  ...printerCommands,
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

/**
 * What a typed command line does: `read` looks, `change` alters. A command the
 * registry does not know, or a line that cannot be parsed, answers null — it
 * never ran, so it is neither. Argument-sensitive reads are answered here too,
 * so `ipconfig /renew` is a change while `ipconfig /all` is a look.
 */
export function commandAccess(line: string): CommandAccess | null {
  const parsed = parseCommandLine(line)
  if (!parsed.ok) {
    return null
  }
  const definition = findCommand(parsed.command.name)
  if (!definition) {
    return null
  }
  if (definition.access === 'change') {
    return 'change'
  }
  const args = parsed.command.args.map((arg) => arg.toLowerCase())
  const changes = definition.changingArgs?.some((flag) => args.includes(flag.toLowerCase()))
  return changes ? 'change' : 'read'
}
