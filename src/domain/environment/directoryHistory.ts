import type { ConsoleHistoryItem } from './console'
import { parseCommandLine } from './parser'

/**
 * How many steps one account's record shows. The directory is a record, not a
 * full audit: the newest steps are enough to show the desk has been here before,
 * and the ticket trail remains the place to read a whole attempt.
 */
export const DIRECTORY_HISTORY_LIMIT = 6

/** A closed session, reduced to what the directory history needs. */
export interface DirectoryHistorySession {
  id: string
  endedAt: number
  outcome: 'resolved' | 'abandoned'
  /** The account the ticket was raised for. */
  requester: string
  scenarioTitle: string
  subject: string
}

/** One command from a closed session, exactly as it was typed. */
export interface DirectoryHistoryCommand {
  sessionId: string
  atMs: number
  command: string
}

export interface DirectoryHistoryInput {
  /** The accounts the directory knows, so only account arguments are matched. */
  accounts: readonly string[]
  sessions: readonly DirectoryHistorySession[]
  commands: readonly DirectoryHistoryCommand[]
}

/**
 * Builds each account's recent desk history from closed sessions only.
 *
 * A command touches an account when one of its arguments is that account, so a
 * search on a substring of a name does not invent a relationship. A ticket
 * touches an account when it was raised for that account or one of its steps
 * named it. The two kinds are merged, newest first, and capped per account.
 */
export function buildDirectoryHistory(
  input: DirectoryHistoryInput,
): Record<string, ConsoleHistoryItem[]> {
  const accounts = new Map(
    input.accounts.map((account) => [account.toLowerCase(), account]),
  )
  const sessions = new Map(input.sessions.map((session) => [session.id, session]))
  const history = new Map<string, ConsoleHistoryItem[]>()

  const add = (account: string, item: ConsoleHistoryItem) => {
    const key = accounts.get(account.toLowerCase())
    if (!key) {
      return
    }
    const items = history.get(key) ?? []
    items.push(item)
    history.set(key, items)
  }

  /** Which accounts each closed session named in its commands. */
  const touched = new Map<string, Set<string>>()

  for (const command of input.commands) {
    const session = sessions.get(command.sessionId)
    if (!session) {
      continue
    }
    const parsed = parseCommandLine(command.command)
    if (!parsed.ok) {
      continue
    }

    const named = new Set<string>()
    for (const argument of parsed.command.args) {
      const account = accounts.get(argument.toLowerCase())
      if (account) {
        named.add(account)
      }
    }

    for (const account of named) {
      add(account, {
        kind: 'command',
        atMs: command.atMs,
        text: command.command,
        ticket: session.scenarioTitle,
      })
      const namedInSession = touched.get(session.id) ?? new Set<string>()
      namedInSession.add(account)
      touched.set(session.id, namedInSession)
    }
  }

  for (const session of sessions.values()) {
    const accountsForTicket = new Set<string>()
    const raisedFor = accounts.get(session.requester.toLowerCase())
    if (raisedFor) {
      accountsForTicket.add(raisedFor)
    }
    for (const account of touched.get(session.id) ?? []) {
      accountsForTicket.add(account)
    }

    for (const account of accountsForTicket) {
      add(account, {
        kind: 'ticket',
        atMs: session.endedAt,
        text: session.subject,
        ticket: session.scenarioTitle,
        outcome: session.outcome,
      })
    }
  }

  const result: Record<string, ConsoleHistoryItem[]> = {}
  for (const [account, items] of history) {
    result[account] = items
      .slice()
      .sort((left, right) => right.atMs - left.atMs)
      .slice(0, DIRECTORY_HISTORY_LIMIT)
  }
  return result
}
