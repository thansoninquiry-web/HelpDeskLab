import { findCommand } from './commands'
import type { CommandContext } from './commands/types'
import { CLOCK_STEP_MS } from './fixtures'
import { errorLine, mutedLine } from './output'
import { commandPolicy } from './policy'
import { parseCommandLine } from './parser'
import type { CommandResult, DeviceId, World } from './types'

function tick(world: World): World {
  const next = structuredClone(world)
  next.clock = world.clock + CLOCK_STEP_MS
  return next
}

export interface CommandOptions {
  /**
   * The machine the command reads and changes. Defaults to the world's current
   * device — the machine the ticket is about. The Remote Desktop terminal names
   * the machine its session is open on, so its commands act on that desktop.
   */
  deviceId?: DeviceId
  /**
   * The machine the command is filed under when that is not the one it runs
   * against. A Remote Desktop console action acts on the machine its row names
   * while the desk's own machine is still the context; a shell command leaves
   * this unset, because its context is where it ran.
   */
  machineId?: DeviceId
}

/** Applies one submitted command to a copy of the world. */
export function applyCommand(
  world: World,
  input: string,
  options: CommandOptions = {},
): CommandResult {
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

  const deviceId = options.deviceId ?? nextWorld.currentDeviceId
  const device = nextWorld.devices.find((candidate) => candidate.id === deviceId)
  if (!device) {
    throw new Error(`World has no device to run the command on: ${deviceId}`)
  }

  // The machine a remote command names, resolved once from the registry. The
  // rules below read it, and the command reads the same device through its
  // context rather than looking the name up again — so a rule and the change it
  // guards cannot disagree about which machine the desk meant.
  const target = definition.targetDevice?.(nextWorld, parsed.command.args)

  // Every rule that stops a command because of something already on record is
  // asked here, once, for every command and every surface that runs one. The
  // rules themselves are in `policy.ts`; this is the only place they are applied.
  const refusal = commandPolicy({
    world: nextWorld,
    device,
    definition,
    target,
  })
  if (refusal) {
    return { world: nextWorld, lines: refusal.lines, effects: [], ok: false }
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
    target,
  }

  const outcome = definition.run(context)

  return {
    world: nextWorld,
    lines: outcome.lines,
    effects: outcome.effects,
    ok: outcome.ok,
  }
}
