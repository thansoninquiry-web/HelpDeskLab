import { assetsConsoleEntries } from './assets'
import type {
  ConsoleEntry,
  ConsoleEvidence,
  ConsoleHistoryItem,
  ConsoleId,
} from './console'
import { deploymentConsoleEntries } from './deployments'
import { directoryConsoleEntries } from './directory'
import { documentationConsoleEntries } from './documentation'
import { mailAdminConsoleEntries } from './mailAdmin'
import { mailSecurityConsoleEntries } from './mailSecurity'
import { remoteDesktopConsoleEntries } from './remoteDesktop'
import { tokenize } from './parser'
import { pcShelfConsoleEntries } from './stock'
import { printersConsoleEntries } from './printers'
import { serverRoomConsoleEntries } from './serverRoom'
import { sharesConsoleEntries } from './shares'
import { shipManagerConsoleEntries } from './shipments'
import type { World } from './types'

/**
 * The registry of tool consoles.
 *
 * Every projection here answers one question with the same shape: what can the
 * desk see, and which audited commands can it run from here. Keeping the list in
 * the domain means the interface never enumerates consoles itself, and a test can
 * ask the whole set what it offers.
 */

/**
 * Every console the build can open. Order is irrelevant here — the tool picker
 * groups them by the work they belong to, and this list is what parity and
 * action lookups walk.
 */
export const CONSOLE_IDS: readonly ConsoleId[] = [
  'directory',
  'server-room',
  'remote-desktop',
  'computer-deployment',
  'printers',
  'shares',
  'documentation',
  'mail-admin',
  'mail-security',
  'assets',
  'pc-shelf',
  'ship-manager',
]

/**
 * The records and actions one console shows. `evidence` is what the attempt has
 * already logged, for the projections that offer values the learner has
 * collected rather than values the checks exist to reveal.
 */
export function consoleEntries(
  world: World,
  consoleId: ConsoleId,
  evidence: ConsoleEvidence = [],
  directoryHistory: Record<string, readonly ConsoleHistoryItem[]> = {},
): ConsoleEntry[] {
  switch (consoleId) {
    case 'directory':
      return directoryConsoleEntries(world, directoryHistory)
    case 'server-room':
      return serverRoomConsoleEntries(world, evidence)
    case 'remote-desktop':
      return remoteDesktopConsoleEntries(world)
    case 'computer-deployment':
      return deploymentConsoleEntries(world)
    case 'printers':
      return printersConsoleEntries(world)
    case 'shares':
      return sharesConsoleEntries(world)
    case 'documentation':
      return documentationConsoleEntries()
    case 'mail-admin':
      return mailAdminConsoleEntries(world)
    case 'mail-security':
      return mailSecurityConsoleEntries(world)
    case 'assets':
      return assetsConsoleEntries(world)
    case 'pc-shelf':
      return pcShelfConsoleEntries(world)
    case 'ship-manager':
      return shipManagerConsoleEntries(world)
  }
}

export interface ConsoleActionMatch {
  consoleId: ConsoleId
  entryId: string
  actionId: string
  /** Values to pass to the action, in its declared argument order. */
  args: string[]
}

/** A stand-in for one supplied value, so a template can be compared token by token. */
const FREE = '\u0000'

/**
 * Which console action would run exactly this command line, and with what.
 *
 * Used to keep the tools honest: if a command is worth scoring, the desk should
 * be able to reach it from a console instead of having to type it. Matching is
 * strict — same command name, same argument count, and every fixed word has to
 * be identical — so an action only matches the command it really produces.
 */
export function findConsoleActionForCommand(
  world: World,
  input: string,
): ConsoleActionMatch | null {
  const wanted = tokenize(input.trim())
  if (!wanted.ok) {
    return null
  }

  for (const consoleId of CONSOLE_IDS) {
    for (const entry of consoleEntries(world, consoleId)) {
      for (const action of entry.actions) {
        const argumentCount = action.args?.length ?? 0
        const template = tokenize(
          action.command(
            entry.id,
            action.args?.map(() => FREE),
          ).trim(),
        )
        if (!template.ok || template.tokens.length !== wanted.tokens.length) {
          continue
        }

        const args: string[] = []
        const matched = template.tokens.every((token, index) => {
          const value = wanted.tokens[index] ?? ''
          if (token === value) {
            return true
          }
          // A supplied value is always its own token; anything else must match exactly.
          if (argumentCount > 0 && token === FREE && args.length < argumentCount) {
            args.push(value)
            return true
          }
          return false
        })

        if (matched && args.length === argumentCount) {
          return { consoleId, entryId: entry.id, actionId: action.id, args }
        }
      }
    }
  }

  return null
}
