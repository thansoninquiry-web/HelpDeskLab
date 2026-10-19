// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { commandCheatSheet } from '../../src/app/practiceService'
import {
  COMMANDS,
  commandAccess,
  commandGroups,
  findCommand,
} from '../../src/domain/environment/commands'
import { SCENARIO_FAMILIES } from '../../src/domain/generator'
import { createLarkspurWorld } from '../../src/domain/environment/fixtures'
import { applyCommand } from '../../src/domain/environment/reducer'

/**
 * The terminal's `help` and the workspace cheat sheet teach the same commands.
 * Both are generated from the registry, and these guards fail if either grows a
 * list of its own: a renamed command, a retired one, or a spelling that no
 * longer parses shows up here before it reaches a learner.
 */
describe('command reference', () => {
  it('groups every runnable command exactly once', () => {
    const listed = commandGroups().flatMap((group) => group.commands)
    const runnable = COMMANDS.filter((command) => command.group !== 'session')

    // `help` asks for the reference; it is not one of the tools it lists.
    expect(listed.map((command) => command.name).sort()).toEqual(
      runnable.map((command) => command.name).sort(),
    )
    // A command belongs to one group, so the sheet can never list it twice.
    expect(new Set(listed.map((command) => command.name)).size).toBe(listed.length)
  })

  it('names a command the parser resolves in every usage line', () => {
    for (const group of commandGroups()) {
      for (const command of group.commands) {
        const [word] = command.usage.split(' ')
        expect(findCommand(word ?? '')?.name, command.usage).toBe(command.name)
      }
    }
  })

  it('prints the cheat sheet as the terminal help lists it', () => {
    const help = applyCommand(createLarkspurWorld(), 'help')
    expect(help.ok).toBe(true)
    const lines = help.lines.map((entry) => entry.text)

    for (const group of commandCheatSheet()) {
      expect(lines, `${group.label} is missing from help`).toContain(group.label)
      for (const entry of group.entries) {
        expect(
          lines.some(
            (line) =>
              line.startsWith('  ') &&
              line.includes(entry.usage) &&
              line.includes(entry.summary),
          ),
          `${entry.usage} is missing from help`,
        ).toBe(true)
      }
    }
  })

  it('marks every command as a read or a change', () => {
    for (const command of COMMANDS) {
      expect(['read', 'change'], command.name).toContain(command.access)
    }
  })

  it('answers an argument-sensitive read by what the arguments ask it to do', () => {
    // Looking at the adapter and renewing its lease are different acts.
    expect(commandAccess('ipconfig')).toBe('read')
    expect(commandAccess('ipconfig /all')).toBe('read')
    expect(commandAccess('IPCONFIG /RENEW')).toBe('change')
    expect(commandAccess('ipconfig.exe /flushdns')).toBe('change')
    // An alias resolves to the command that owns the behaviour.
    expect(commandAccess('tnc dc-01')).toBe('read')
    expect(commandAccess('remote-cleanup LT-8813')).toBe('change')
    expect(commandAccess('help')).toBe('read')
  })

  it('treats a line that cannot run as neither a read nor a change', () => {
    expect(commandAccess('not-a-command')).toBeNull()
    expect(commandAccess('ipconfig "unterminated')).toBeNull()
    expect(commandAccess('   ')).toBeNull()
  })

  it('only gives argument overrides to a command that is otherwise a read', () => {
    for (const command of COMMANDS) {
      if (command.changingArgs) {
        expect(command.access, command.name).toBe('read')
        expect(command.changingArgs.length, command.name).toBeGreaterThan(0)
      }
    }
  })

  it('leads with the groups a ticket family is worked with', () => {
    const labels = (scenarioId: string) =>
      commandCheatSheet(scenarioId)
        .filter((group) => group.relevant)
        .map((group) => group.label)

    expect(labels('NET-01')).toEqual(['Network', 'Workstation'])
    expect(labels('MAIL-01')).toEqual(['Mail'])
    expect(labels('DEP-01')).toEqual([
      'Computer deployment',
      'PC shelf',
      'Shipping',
      'Workstation',
    ])
    // A family the map does not know keeps the whole reference open rather than
    // opening on nothing.
    expect(labels('UNKNOWN-01')).toHaveLength(commandGroups().length)
  })

  it('has a leading group and a folded group for every family the generator makes', () => {
    for (const family of SCENARIO_FAMILIES) {
      const sheet = commandCheatSheet(family.id)
      expect(sheet.some((group) => group.relevant), `${family.id} leads with nothing`).toBe(true)
      expect(sheet.some((group) => !group.relevant), `${family.id} folds nothing`).toBe(true)
    }
  })

  it('shows no row the registry does not have', () => {
    const usages = new Set(COMMANDS.map((command) => command.usage))
    for (const entry of commandCheatSheet().flatMap((group) => group.entries)) {
      expect(usages.has(entry.usage), `${entry.usage} is not in the registry`).toBe(true)
    }
  })
})
