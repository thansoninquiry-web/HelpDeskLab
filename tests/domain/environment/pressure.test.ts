import { describe, expect, it } from 'vitest'
import {
  duePressureLine,
  type PressureLine,
  type PressureState,
  type PressureStep,
} from '../../../src/domain/environment/pressure'
import type { EffectType } from '../../../src/domain/environment/types'

const SCRIPT: readonly PressureLine[] = [
  {
    id: 'reset',
    trigger: { kind: 'obeyed', command: 'reset-password' },
    message: 'That is what I asked for.',
  },
  {
    id: 'unverified',
    trigger: { kind: 'acted-first', effect: 'account_unlocked', beforeVerified: true },
    message: 'No code, just done.',
  },
  {
    id: 'blind',
    trigger: { kind: 'acted-first', effect: 'account_unlocked', beforeCommand: 'get-account' },
    message: 'You never looked.',
  },
  {
    id: 'reading',
    trigger: { kind: 'read', consoleId: 'directory' },
    message: 'You are looking me up.',
  },
  {
    id: 'queue',
    trigger: { kind: 'read', consoleId: 'printers', entryId: 'PRN-DEPOT-01' },
    message: 'That is the queue.',
  },
  {
    id: 'ignored',
    trigger: { kind: 'stalled', afterSteps: 4, afterMinutes: 3 },
    onceSaid: ['unverified', 'blind'],
    message: 'You were warned.',
  },
  {
    id: 'hands-over',
    trigger: { kind: 'stalled', afterSteps: 6, afterMinutes: 6 },
    onceSaid: ['ignored'],
    message: 'Send it through.',
  },
  {
    id: 'waiting',
    trigger: { kind: 'stalled', afterSteps: 3, afterMinutes: 2 },
    message: 'Hello? Are you still there?',
  },
  {
    id: 'hurry',
    trigger: { kind: 'stalled', afterSteps: 6, afterMinutes: 5 },
    message: 'Skip the checks.',
  },
  {
    id: 'escalates',
    trigger: { kind: 'stalled', afterSteps: 9, afterMinutes: 8 },
    message: 'I am calling my manager.',
  },
]

function command(text: string, effects: readonly EffectType[] = []): PressureStep {
  return { kind: 'command', command: text, effects }
}

function state(overrides: Partial<PressureState> = {}): PressureState {
  return { steps: [], minutesSinceLastAction: 0, said: [], ...overrides }
}

const asks = (count: number): PressureStep[] =>
  Array.from({ length: count }, () => ({ kind: 'ask' }) as PressureStep)

describe('pressured caller', () => {
  it('stays quiet while the desk has just started', () => {
    const steps = [{ kind: 'ask' } as PressureStep, command('get-account dwhitfield')]

    expect(duePressureLine(SCRIPT, state({ steps }))).toBeNull()
  })

  it('speaks up when the call has been worked without identifying anyone', () => {
    const line = duePressureLine(SCRIPT, state({ steps: asks(3) }))

    expect(line?.id).toBe('waiting')
    expect(line?.message).toMatch(/still there/i)
  })

  it('counts minutes of silence even when nothing has been run', () => {
    expect(duePressureLine(SCRIPT, state({ minutesSinceLastAction: 2 }))?.id).toBe('waiting')
  })

  it('stands down once the caller has been verified', () => {
    const verified: PressureStep[] = [...asks(4), { kind: 'verified' }]

    expect(
      duePressureLine(SCRIPT, state({ steps: verified, minutesSinceLastAction: 90 })),
    ).toBeNull()
  })

  it('has something to say about the fix it asked for', () => {
    const steps = [
      command('get-account dwhitfield'),
      command('reset-password dwhitfield', ['password_reset']),
    ]

    expect(duePressureLine(SCRIPT, state({ steps }))?.id).toBe('reset')
  })

  it('has nothing to add when the desk runs a different fix', () => {
    const steps = [
      command('get-account dwhitfield'),
      command('unlock-account dwhitfield', ['account_unlocked']),
    ]

    // The account was looked at, and the reset it asked for was never run: the
    // reaction is about the reset, so the caller stays quiet here.
    expect(duePressureLine(SCRIPT, state({ steps, said: ['unverified'] }))).toBeNull()
  })

  it('notices a change made before anyone was verified', () => {
    const steps = [
      command('get-account dwhitfield'),
      command('unlock-account dwhitfield', ['account_unlocked']),
    ]

    const line = duePressureLine(SCRIPT, state({ steps }))
    expect(line?.id).toBe('unverified')
    // The account was looked at first, so the other line about the lookup is not
    // the one that applies.
    expect(duePressureLine(SCRIPT, state({ steps, said: ['unverified'] }))).toBeNull()
  })

  it('notices a change made before the account was looked at', () => {
    const steps: PressureStep[] = [
      { kind: 'ask' },
      { kind: 'verified' },
      command('unlock-account dwhitfield', ['account_unlocked']),
    ]

    // Verified, so the caller is not complaining about the code; they are
    // pleased that nobody opened the account.
    expect(duePressureLine(SCRIPT, state({ steps }))?.id).toBe('blind')
  })

  it('speaks when the desk opens a tool, and when a record in one is read', () => {
    expect(
      duePressureLine(SCRIPT, state({ steps: [{ kind: 'read', consoleId: 'directory', entryId: null }] }))
        ?.id,
    ).toBe('reading')

    // A trigger can name the record as well as the console, so a caller reacts
    // to their own queue being opened rather than to the tool.
    expect(
      duePressureLine(
        SCRIPT,
        state({ steps: [{ kind: 'read', consoleId: 'printers', entryId: 'PRN-DEPOT-01' }] }),
      )?.id,
    ).toBe('queue')
    expect(
      duePressureLine(
        SCRIPT,
        state({ steps: [{ kind: 'read', consoleId: 'printers', entryId: 'PRN-FIN-01' }] }),
      ),
    ).toBeNull()

    // A look in another tool is not what this line is about.
    expect(
      duePressureLine(SCRIPT, state({ steps: [{ kind: 'read', consoleId: 'mail-admin', entryId: null }] }))
        ?.id,
    ).not.toBe('reading')
  })

  it('does not walk the ladder just because tools were opened', () => {
    const looks: PressureStep[] = Array.from({ length: 9 }, () => ({
      kind: 'read',
      consoleId: 'directory',
      entryId: null,
    }))

    // Nine records read is nine steps in the log but no work on the call: the
    // ladder counts commands and questions, and nothing about the clock moved.
    expect(duePressureLine(SCRIPT, state({ steps: looks }))?.id).toBe('reading')
    expect(duePressureLine(SCRIPT, state({ steps: looks, said: ['reading'] }))).toBeNull()
  })

  it('escalates one line at a time and never repeats itself', () => {
    const steps = asks(6)

    expect(duePressureLine(SCRIPT, state({ steps }))?.id).toBe('waiting')
    expect(duePressureLine(SCRIPT, state({ steps, said: ['waiting'] }))?.id).toBe('hurry')
    expect(duePressureLine(SCRIPT, state({ steps, said: ['waiting', 'hurry'] }))).toBeNull()
    expect(
      duePressureLine(SCRIPT, state({ steps: asks(9), said: ['waiting', 'hurry'] }))?.id,
    ).toBe('escalates')
  })

  it('holds an answer to a warning until the warning has been said', () => {
    const steps = asks(4)

    // The desk has stalled, but nothing has been said about what it did, so the
    // escalation is not a reaction to anything yet.
    expect(duePressureLine(SCRIPT, state({ steps }))?.id).toBe('waiting')
    expect(duePressureLine(SCRIPT, state({ steps, said: ['unverified'] }))?.id).toBe('ignored')
  })

  it('escalates again on the line before it', () => {
    const steps = asks(7)
    const said = ['unverified']

    expect(duePressureLine(SCRIPT, state({ steps, said }))?.id).toBe('ignored')
    expect(duePressureLine(SCRIPT, state({ steps, said: [...said, 'ignored'] }))?.id).toBe(
      'hands-over',
    )
    // Once the ladder has been walked, the slower lines about time are next.
    expect(
      duePressureLine(SCRIPT, state({ steps, said: [...said, 'ignored', 'hands-over'] }))?.id,
    ).toBe('waiting')
  })

  it('has nothing left to ask for once the request has been refused', () => {
    const steps = asks(9)

    expect(duePressureLine(SCRIPT, state({ steps }))?.id).toBe('waiting')
    expect(duePressureLine(SCRIPT, state({ steps, refused: true }))).toBeNull()
  })

  it('takes a reaction before a line about time passing', () => {
    const steps = [
      ...asks(4),
      command('reset-password dwhitfield', ['password_reset']),
    ]

    expect(duePressureLine(SCRIPT, state({ steps }))?.id).toBe('reset')
    // Once that has been said, the stall lines are still waiting their turn.
    expect(duePressureLine(SCRIPT, state({ steps, said: ['reset'] }))?.id).toBe('waiting')
  })
})
