import { findCommand } from './commands'
import type { CommandContext } from './commands/types'
import { CLOCK_STEP_MS } from './fixtures'
import { errorLine, mutedLine } from './output'
import { parseCommandLine } from './parser'
import type { CommandResult, World } from './types'

function tick(world: World): World {
  const next = structuredClone(world)
  next.clock = world.clock + CLOCK_STEP_MS
  return next
}

/** Applies one submitted command to a copy of the world. */
export function applyCommand(world: World, input: string): CommandResult {
  if (input.trim().length === 0) {
    return {
      world,
      lines: [errorLine('Enter a command. Type "help" for available tools.')],
      effects: [],
      ok: false,
    }
  }

  const nextWorld = tick(world)
  const parsed = parseCommandLine(input)

  if (!parsed.ok) {
    return { world: nextWorld, lines: [errorLine(parsed.message)], effects: [], ok: false }
  }

  const definition = findCommand(parsed.command.name)
  if (!definition) {
    return {
      world: nextWorld,
      lines: [
        errorLine(`'${parsed.command.name}' is not recognized as a simulated command.`),
        mutedLine('Type "help" to see the available tools.'),
      ],
      effects: [],
      ok: false,
    }
  }

  const device = nextWorld.devices.find((candidate) => candidate.id === nextWorld.currentDeviceId)
  if (!device) {
    throw new Error(`World has no current device: ${nextWorld.currentDeviceId}`)
  }

  const site = nextWorld.sites.find((candidate) => candidate.id === device.siteId)
  if (!site) {
    throw new Error(`World has no site for device ${device.id}: ${device.siteId}`)
  }

  const user = device.loggedInUserId
    ? (nextWorld.users.find((candidate) => candidate.id === device.loggedInUserId) ?? null)
    : null

  const context: CommandContext = {
    world: nextWorld,
    device,
    site,
    user,
    args: parsed.command.args,
    now: nextWorld.clock,
  }

  const outcome = definition.run(context)

  return {
    world: nextWorld,
    lines: outcome.lines,
    effects: outcome.effects,
    ok: outcome.ok,
  }
}
