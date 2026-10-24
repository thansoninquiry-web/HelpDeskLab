import type {
  Device,
  DirectoryUser,
  Effect,
  OutputLine,
  Site,
  World,
} from '../types'

export interface CommandContext {
  world: World
  device: Device
  site: Site
  user: DirectoryUser | null
  args: string[]
  now: number
  /**
   * The machine the registry resolved through this command's own `targetDevice`,
   * when it declares one. The reducer resolves it once and hands the same answer
   * to the rules in `policy.ts` and to the command, so a remote command reads the
   * machine it acts on rather than looking the name up a second time.
   */
  target?: Device | undefined
}

export interface CommandOutcome {
  lines: OutputLine[]
  effects: Effect[]
  ok: boolean
}

/**
 * What running a command does to the simulated world. The registry states it
 * rather than leaving it to be guessed from the effects a run happened to
 * report: a read is still a read when it prints facts, and a change is still a
 * change when it had nothing left to do.
 */
export type CommandAccess = 'read' | 'change'

export interface CommandDefinition {
  name: string
  aliases: readonly string[]
  /**
   * The machine this command acts on when that is not the one it was typed at.
   * A remote command names its target in an argument, so a rule that reads the
   * target's own state — a stopped service, a session that is not open — has to
   * be told which machine that is. The reducer asks this once and passes the
   * answer both to those rules and to the command through its context, so the
   * target is resolved in one place and the command cannot act on a different
   * machine from the one the rules were shown. What to say when the name matches
   * nothing stays with the command, which is where the argument was read.
   */
  targetDevice?: (world: World, args: readonly string[]) => Device | undefined
  group:
    | 'network'
    | 'workstation'
    | 'dhcp'
    | 'identity'
    | 'm365'
    | 'mail'
    | 'remote'
    | 'deployment'
    | 'shelf'
    | 'shipping'
    | 'assets'
    | 'printer'
    | 'shares'
    | 'session'
  usage: string
  summary: string
  /**
   * Changes an account, or what it can reach. These are the commands a refusal
   * stops — the same family the scorer treats as needing a verified caller —
   * so a ticket the desk has refused has no account work left in it.
   */
  changesAccount?: boolean
  /**
   * Reads or clears a print queue, so it needs the spooler on the machine it acts
   * on to be running. A stopped service is the fault the ticket is about: queue
   * work is refused until someone starts it, and the refusal names the command
   * that does. `get-printers` is left off this flag on purpose — it is how the
   * stopped service is seen in the first place.
   */
  needsSpooler?: boolean
  /**
   * Acts on a desktop, not merely on a machine: the target the registry resolves
   * must have an active support session, because the command reaches into
   * someone's session — their spooler, their printer default, their sign-in —
   * and a learner who is not connected cannot. The rule that enforces it reads
   * the same resolved target the command acts on, so "what needs a desktop needs
   * a session" is one flag rather than a helper each command remembers to call.
   * `reboot-remote` is left off this flag on purpose: a restart is management of
   * a machine the desk can name, and reads (`get-remote-machine`) are off it for
   * the same reason.
   */
  needsRemoteSession?: boolean
  /**
   * Whether a run only looks at the world or alters it. Every command declares
   * one, so the curriculum can order reads against changes without reading
   * effects as intent. Opening or ending a support session is a change to the
   * session; the curriculum sets that plumbing aside by name.
   */
  access: CommandAccess
  /**
   * Arguments that turn an otherwise read-only command into a change, such as
   * `ipconfig /renew`. Matched case-insensitively against the typed arguments,
   * so a look at the adapter is never mistaken for a lease renewal.
   */
  changingArgs?: readonly string[]
  run(context: CommandContext): CommandOutcome
}

export function succeeded(lines: OutputLine[], effects: Effect[] = []): CommandOutcome {
  return { lines, effects, ok: true }
}

export function failed(lines: OutputLine[]): CommandOutcome {
  return { lines, effects: [], ok: false }
}

export function usageFailure(usage: string, ...messages: string[]): CommandOutcome {
  return failed([
    ...messages.map((text) => ({ text, kind: 'error' as const })),
    { text: `Usage: ${usage}`, kind: 'muted' as const },
  ])
}
