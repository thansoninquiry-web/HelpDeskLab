import { describe, expect, it } from 'vitest'
import {
  buildDirectoryHistory,
  DIRECTORY_HISTORY_LIMIT,
  type DirectoryHistoryCommand,
  type DirectoryHistorySession,
} from '../../../src/domain/environment/directoryHistory'

const ACCOUNTS = ['mchen', 'dwhitfield', 'asingh']

function session(overrides: Partial<DirectoryHistorySession> & { id: string }): DirectoryHistorySession {
  return {
    endedAt: 1_000,
    outcome: 'resolved',
    requester: 'mchen',
    scenarioTitle: 'Password and account access',
    subject: 'Marcus is locked out',
    ...overrides,
  }
}

function command(
  sessionId: string,
  atMs: number,
  text: string,
): DirectoryHistoryCommand {
  return { sessionId, atMs, command: text }
}

describe('buildDirectoryHistory', () => {
  it('pairs commands and closed tickets with the accounts they named', () => {
    const history = buildDirectoryHistory({
      accounts: ACCOUNTS,
      sessions: [
        session({ id: 's1', endedAt: 1_000, requester: 'mchen', subject: 'Marcus is locked out' }),
        session({
          id: 's2',
          endedAt: 3_000,
          outcome: 'abandoned',
          requester: 'dwhitfield',
          scenarioTitle: 'Printing and the spooler',
          subject: 'Dana cannot print',
        }),
      ],
      commands: [
        command('s1', 900, 'get-account mchen'),
        command('s1', 950, 'unlock-account mchen'),
        // A door ticket that also names Marcus: his record keeps the close too.
        command('s2', 2_500, 'get-account MCHEN'),
        command('s2', 2_600, 'get-printers'),
      ],
    })

    expect(history.mchen).toEqual([
      {
        kind: 'ticket',
        atMs: 3_000,
        text: 'Dana cannot print',
        ticket: 'Printing and the spooler',
        outcome: 'abandoned',
      },
      {
        kind: 'command',
        atMs: 2_500,
        text: 'get-account MCHEN',
        ticket: 'Printing and the spooler',
      },
      {
        kind: 'ticket',
        atMs: 1_000,
        text: 'Marcus is locked out',
        ticket: 'Password and account access',
        outcome: 'resolved',
      },
      {
        kind: 'command',
        atMs: 950,
        text: 'unlock-account mchen',
        ticket: 'Password and account access',
      },
      {
        kind: 'command',
        atMs: 900,
        text: 'get-account mchen',
        ticket: 'Password and account access',
      },
    ])

    // Dana's own ticket closes on her record even though no command named her.
    expect(history.dwhitfield?.map((item) => item.kind)).toEqual(['ticket'])
    expect(history.asingh).toBeUndefined()
  })

  it('matches whole account arguments rather than fragments of a name', () => {
    const history = buildDirectoryHistory({
      accounts: ACCOUNTS,
      sessions: [session({ id: 's1', requester: 'dwhitfield' })],
      commands: [
        command('s1', 100, 'get-account mchen.backup'),
        command('s1', 200, 'get-account mchen2'),
        command('s1', 300, 'reset-password asingh'),
      ],
    })

    expect(history.mchen).toBeUndefined()
    expect(history.asingh?.some((item) => item.kind === 'command')).toBe(true)
  })

  it('keeps only the newest steps for a record', () => {
    const commands = Array.from({ length: DIRECTORY_HISTORY_LIMIT + 4 }, (_, index) =>
      command('s1', 100 + index, `get-account mchen ${index}`),
    )
    const history = buildDirectoryHistory({
      accounts: ACCOUNTS,
      sessions: [session({ id: 's1', endedAt: 50 })],
      commands,
    })

    expect(history.mchen).toHaveLength(DIRECTORY_HISTORY_LIMIT)
    expect(history.mchen?.[0]?.atMs).toBe(100 + DIRECTORY_HISTORY_LIMIT + 3)
    // The ticket close is older than every command, so the cap drops it.
    expect(history.mchen?.every((item) => item.kind === 'command')).toBe(true)
  })
})
