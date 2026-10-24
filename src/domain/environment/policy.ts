import type { CommandDefinition } from './commands/types'
import { errorLine, mutedLine } from './output'
import { stockStateLabel } from './stock'
import type { Device, OutputLine, RequestRefusal, StockItem, World } from './types'

/**
 * The decisions a record already holds, and the commands they stop.
 *
 * The simulator has one recurring shape: something the desk decided — refusing
 * the request — or something the world reports about a machine — a service that
 * is not running, a machine held on the shelf — is written down, and a later
 * command would quietly walk over it. Each of those is a rule here. A rule reads
 * the record rather than the interface, and names what it stops through a flag on
 * the command registry, so the question "what does this decision stop?" has one
 * place to be read, one place to be changed, and one answer whether the command
 * came from the terminal, a console button or the Remote Desktop.
 *
 * `commandPolicy` is the check for the rules whose only input is the world and
 * the command about to run, so the reducer asks it once for every command. A rule
 * that needs the command's own arguments — what a machine's tag resolves to, for
 * instance, and whether the command would have answered with something more
 * specific first — is a helper in this module instead, called by the command that
 * owns that order; `stockPolicy` is the one of those today. Either way the rule
 * lives here, returns the same shape, and is tested with the rest.
 */

/** Which rule stopped a command. A test names the decision, not the wording. */
export type PolicyRuleId =
  | 'request-refused'
  | 'no-live-session'
  | 'spooler-stopped'
  | 'stock-not-available'

export interface PolicyRefusal {
  rule: PolicyRuleId
  /** What the learner reads: the fault, and the way out of it. */
  lines: OutputLine[]
}

export interface PolicyInput {
  world: World
  /**
   * The machine the command would act on — the target of a remote command, not
   * the desk's own machine. A service that is stopped stops work there, wherever
   * the command was typed from.
   */
  device: Device
  definition: CommandDefinition
  /**
   * The machine a remote command names, when it names one that resolves. The
   * reducer reads it once from the definition's own `targetDevice` and hands the
   * same device to the command, so a rule about the target's state asks about the
   * machine the command will really touch. `undefined` means either that the
   * command declares no target or that the name it was given matches nothing —
   * the command answers the second case, because the argument is its own.
   */
  target?: Device | undefined
}

/**
 * Whether a decision already on record stops this command. The rules are asked in
 * one order and the first refusal wins, so a command that several rules would
 * stop answers with the decision that was made first.
 */
export function commandPolicy({
  world,
  device,
  definition,
  target,
}: PolicyInput): PolicyRefusal | null {
  return (
    refusedRequest(world, definition) ??
    unopenedSession(world, definition, target) ??
    stoppedSpooler(target ?? device, definition) ??
    null
  )
}

/**
 * A desktop action needs a support session to the desktop it acts on.
 *
 * The commands that reach into a machine rather than at it — its spooler, its
 * printer default, its DHCP lease, the user's sign-in — carry `needsRemoteSession`
 * on the registry, and the machine they name is the one the registry resolved, so
 * the session this rule reads is the session for the machine the command will
 * change. It is asked before the spooler rule because being connected is what
 * makes the machine's services reachable at all: telling a learner the spooler is
 * stopped, and to restart it with a command that is also gated, would name a way
 * out they cannot take.
 *
 * A machine that is not a user desktop is left to the command, which answers with
 * its kind — a server is managed from the server room, and no session to it would
 * ever have been offered.
 */
function unopenedSession(
  world: World,
  definition: CommandDefinition,
  target: Device | undefined,
): PolicyRefusal | null {
  if (definition.needsRemoteSession !== true || !target || target.kind === 'server') {
    return null
  }

  const session = world.remoteSessions.find((candidate) => candidate.machineId === target.id)
  if (session?.state === 'active') {
    return null
  }

  return {
    rule: 'no-live-session',
    lines: [
      errorLine(`No active remote session is open on ${target.hostname}.`),
      mutedLine(`Open one first: connect-remote ${target.hostname}`),
    ],
  }
}

/**
 * A refused request is the desk's decision, not an obstacle: the account work the
 * request asked for is over, so the commands that change an account do not run —
 * whatever the world state is, and whichever surface ran them. The flag that
 * names them is the same one the scorer reads, and the same list the workspace
 * prints before a learner types one.
 */
function refusedRequest(world: World, definition: CommandDefinition): PolicyRefusal | null {
  const refusal: RequestRefusal | undefined = world.refusal
  if (!refusal || definition.changesAccount !== true) {
    return null
  }

  return {
    rule: 'request-refused',
    lines: [
      errorLine(`${definition.name} will not run: this request was refused on this ticket.`),
      mutedLine(`The refusal is recorded — ${refusal.label.toLowerCase()}.`),
      mutedLine(
        'A refusal is not undone by making the change anyway. Close the ticket as denied and report it.',
      ),
    ],
  }
}

/**
 * Queue work needs a running spooler, and that is true of reading a queue and of
 * clearing one: both go through the service that is stopped. `get-printers` is
 * deliberately not marked with the flag — listing what the machine knows about
 * its printers is how the fault is seen at all, and that command reports the
 * stopped service instead of failing.
 */
function stoppedSpooler(device: Device, definition: CommandDefinition): PolicyRefusal | null {
  if (definition.needsSpooler !== true || device.spoolerStatus !== 'stopped') {
    return null
  }

  // The way out names the command for the surface: a remote command is restarted
  // from the desktop it runs on, a local one at the desk's own machine.
  const remote = definition.name.startsWith('remote-')

  return {
    rule: 'spooler-stopped',
    lines: [
      errorLine(
        `The Print Spooler on ${device.hostname} is stopped, so no queue can be read or cleared.`,
      ),
      mutedLine(
        remote
          ? `Start it first: remote-restart-spooler ${device.hostname}`
          : 'Start it first: restart-spooler',
      ),
    ],
  }
}

/** What the desk means to do with a machine on the shelf. */
export type StockIntent = 'issue' | 'image'

/**
 * Whether the record on a shelf machine stops what the desk means to do with it.
 *
 * This is the rule the shelf and the imaging run both consult, so "held" means
 * one thing: a hold blocks the handover *and* the imaging run, a machine waiting
 * on parts can do neither, and only a machine with nothing outstanding can be
 * imaged and then issued. Each intent answers with the command that owns the
 * order of its own preconditions — the shelf read that found no tag and the
 * deployment read that found no sequence answer first, and this rule speaks only
 * once the machine itself is in hand.
 */
export function stockPolicy(item: StockItem, intent: StockIntent): PolicyRefusal | null {
  if (intent === 'issue') {
    if (item.state === 'ready') {
      return null
    }
    return {
      rule: 'stock-not-available',
      lines: [
        errorLine(`${item.id} cannot be issued: ${stockStateLabel(item.state).toLowerCase()}.`),
        mutedLine(
          item.state === 'needs-image'
            ? `Finish an imaging run first: start-deployment ${item.id}.`
            : item.notes,
        ),
      ],
    }
  }

  if (item.state === 'quarantined') {
    return {
      rule: 'stock-not-available',
      lines: [
        errorLine(`${item.id} is held: ${item.notes}`),
        mutedLine('Imaging will not clear a damage case. Resolve the hold first.'),
      ],
    }
  }
  if (item.state === 'awaiting-parts') {
    return {
      rule: 'stock-not-available',
      lines: [
        errorLine(`${item.id} is waiting on parts: ${item.notes}`),
        mutedLine('Do not image a machine that cannot be issued yet.'),
      ],
    }
  }

  return null
}
