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
