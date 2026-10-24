import { describe, expect, it } from 'vitest'
import {
  describeUnrunStep,
  familyRewinds,
  summarizeRewinds,
} from '../../../src/domain/progress/rewinds'
import type { RewindRecord, UnrunStep } from '../../../src/domain/progress/types'

function step(overrides: Partial<UnrunStep> = {}): UnrunStep {
  return { kind: 'command', command: 'unlock-account alice.cooper', noteKind: null, ...overrides }
}

function rewind(overrides: Partial<RewindRecord> = {}): RewindRecord {
  return {
    sessionId: 'session-1',
    scenarioId: 'PWD-01',
    atMs: 1_760_000_000_000,
    dropped: 1,
    boundary: step(),
    ...overrides,
  }
}

const attempts = (entries: Record<string, number>) => new Map(Object.entries(entries))

describe('naming the step a cut started at', () => {
  it('names a command by its verb, not the account it was aimed at', () => {
    const rows = familyRewinds(
      [
        rewind({ boundary: step({ command: 'reset-password alice.cooper' }) }),
        rewind({ sessionId: 'session-2', boundary: step({ command: 'reset-password bob.ellis' }) }),
        rewind({ sessionId: 'session-3', boundary: step({ command: 'Unlock-Account bob.ellis' }) }),
      ],
      attempts({ 'PWD-01': 3 }),
    )

    expect(rows[0]?.worstStep).toEqual({ label: 'reset-password', times: 2 })
  })

  it('drops a typed .exe suffix, as the command registry does', () => {
    expect(describeUnrunStep(step({ command: 'ipconfig.exe /renew' }))).toBe('ipconfig')
  })

  it('names the panel steps by what the learner was doing', () => {
    expect(describeUnrunStep(step({ kind: 'note', command: null, noteKind: 'resolution' }))).toBe(
      'a handoff note',
    )
    expect(describeUnrunStep(step({ kind: 'note', command: null, noteKind: 'customer' }))).toBe(
      'a customer note',
    )
    expect(describeUnrunStep(step({ kind: 'note', command: null, noteKind: 'troubleshooting' }))).toBe(
      'a troubleshooting note',
    )
    expect(describeUnrunStep(step({ kind: 'hint', command: null }))).toBe('a hint')
    expect(describeUnrunStep(step({ kind: 'code-sent', command: null }))).toBe('a code sent to the caller')
    expect(describeUnrunStep(step({ kind: 'verify-caller', command: null }))).toBe('an identity check')
    expect(describeUnrunStep(step({ kind: 'ask-user', command: null }))).toBe('a question to the caller')
  })

  it('says so when the log kept no boundary step', () => {
    expect(describeUnrunStep(null)).toBe('a step the log no longer holds')
    expect(describeUnrunStep(step({ command: '' }))).toBe('a command')
  })
})

describe('reading the rewinds a learner kept', () => {
  it('counts the cuts, the steps behind them, and the attempts they happened in', () => {
    const rows = familyRewinds(
      [
        rewind({ sessionId: 'a', dropped: 3 }),
        rewind({ sessionId: 'a', dropped: 2 }),
        rewind({ sessionId: 'b', dropped: 1 }),
      ],
      attempts({ 'PWD-01': 4 }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      scenarioId: 'PWD-01',
      rewinds: 3,
      attemptsWithRewind: 2,
      stepsUnrun: 6,
      attempts: 4,
      rewindPercent: 50,
      band: 'heavy',
    })
  })

  it('orders by share of attempts, so one cut in one attempt outranks four in forty', () => {
    const rows = familyRewinds(
      [
        rewind({ sessionId: 's1', scenarioId: 'PWD-01', boundary: step({ command: 'unlock-account x' }) }),
        ...['s2', 's3', 's4', 's5'].map((sessionId) =>
          rewind({ sessionId, scenarioId: 'FS-01', boundary: step({ command: 'get-share-access data' }) }),
        ),
      ],
      attempts({ 'PWD-01': 1, 'FS-01': 40 }),
    )

    expect(rows.map((row) => row.scenarioId)).toEqual(['PWD-01', 'FS-01'])
    expect(rows.map((row) => row.rewindPercent)).toEqual([100, 10])
    expect(rows.map((row) => row.band)).toEqual(['heavy', 'rare'])
  })

  it('bands a family that is often, sometimes, or rarely cut', () => {
    const bandFor = (cutSessions: number, total: number) =>
      familyRewinds(
        Array.from({ length: cutSessions }, (_, index) => rewind({ sessionId: `s${index}` })),
        attempts({ 'PWD-01': total }),
      )[0]?.band

    expect(bandFor(5, 10)).toBe('heavy')
    expect(bandFor(2, 10)).toBe('some')
    expect(bandFor(1, 10)).toBe('rare')
  })

  it('caps the share when a cut happened in an attempt the statistics never counted', () => {
    // Two sessions were cut and abandoned, so neither reached the family's
    // statistics; the share cannot be read as more than every attempt.
    const rows = familyRewinds(
      [rewind({ sessionId: 'a' }), rewind({ sessionId: 'b' })],
      attempts({ 'PWD-01': 1 }),
    )

    expect(rows[0]?.rewindPercent).toBe(100)
    expect(rows[0]?.attempts).toBe(1)
    expect(rows[0]?.attemptsWithRewind).toBe(2)
  })

  it('reads as rare when the family has cuts but no recorded attempt at all', () => {
    const rows = familyRewinds([rewind({ sessionId: 'a' })], attempts({}))
    expect(rows[0]).toMatchObject({ attempts: 0, rewindPercent: 0, band: 'rare' })
  })

  it('breaks a tie between two equally un-run steps by name, so the row is stable', () => {
    const rows = familyRewinds(
      [
        rewind({ sessionId: 'a', boundary: step({ command: 'ipconfig /renew' }) }),
        rewind({ sessionId: 'b', boundary: step({ command: 'get-account bob.ellis' }) }),
      ],
      attempts({ 'PWD-01': 2 }),
    )

    expect(rows[0]?.worstStep).toEqual({ label: 'get-account', times: 1 })
  })

  it('totals the cuts across families for the page summary', () => {
    const rows = familyRewinds(
      [
        rewind({ sessionId: 'a', scenarioId: 'PWD-01', dropped: 2 }),
        rewind({ sessionId: 'a', scenarioId: 'PWD-01', dropped: 1 }),
        rewind({ sessionId: 'b', scenarioId: 'FS-01', dropped: 4 }),
      ],
      attempts({ 'PWD-01': 2, 'FS-01': 2 }),
    )

    expect(summarizeRewinds(rows)).toEqual({
      rewinds: 3,
      attemptsWithRewind: 2,
      stepsUnrun: 7,
      families: 2,
    })
  })

  it('reads as empty before anything has been un-run', () => {
    expect(familyRewinds([], attempts({ 'PWD-01': 3 }))).toEqual([])
    expect(summarizeRewinds([])).toEqual({
      rewinds: 0,
      attemptsWithRewind: 0,
      stepsUnrun: 0,
      families: 0,
    })
  })
})
