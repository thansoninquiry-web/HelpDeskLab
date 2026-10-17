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

export interface CommandDefinition {
  name: string
  aliases: readonly string[]
  group: 'network' | 'identity' | 'printer' | 'session'
  usage: string
  summary: string
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
