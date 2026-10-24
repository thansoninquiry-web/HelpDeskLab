import { describe, expect, it } from 'vitest'
import type { VerificationCheckRecord } from '../../../src/domain/progress/types'
import { summarizeVerificationChecks } from '../../../src/domain/progress/verification'

function check(
  sessionId: string,
  method: VerificationCheckRecord['method'],
  proved: boolean,
): VerificationCheckRecord {
  return { sessionId, method, proved }
}

describe('verification method summary', () => {
  it('counts each method used and how often it proved the caller', () => {
    const summary = summarizeVerificationChecks([
      check('s1', 'verification-code', true),
      check('s1', 'callback', false),
      check('s2', 'verification-code', true),
      check('s2', 'verification-code', false),
    ])

    expect(summary.rows).toEqual([
      {
        method: 'verification-code',
        label: 'Code read-back',
        checks: 3,
        proved: 2,
        failed: 1,
        attempts: 2,
        provedPercent: 67,
      },
      {
        method: 'callback',
        label: 'Callback',
        checks: 1,
        proved: 0,
        failed: 1,
        attempts: 1,
        provedPercent: 0,
      },
    ])
    expect(summary).toMatchObject({ checks: 4, proved: 2, attempts: 2, provedPercent: 50 })
  })

  it('puts the most used proof first, and the desk order breaks a tie', () => {
    const summary = summarizeVerificationChecks([
      check('s1', 'callback', true),
      check('s1', 'verification-code', true),
      check('s2', 'letter-pin', true),
      check('s2', 'letter-pin', false),
    ])

    // The letter PIN was used twice, so it leads the two one-off proofs; the
    // code comes before the callback because that is the order the desk offers.
    expect(summary.rows.map((row) => row.method)).toEqual([
      'letter-pin',
      'verification-code',
      'callback',
    ])
  })

  it('counts an attempt once even when it used the same method twice', () => {
    const summary = summarizeVerificationChecks([
      check('s1', 'verification-code', false),
      check('s1', 'verification-code', true),
    ])

    expect(summary.attempts).toBe(1)
    expect(summary.rows[0]).toMatchObject({ checks: 2, proved: 1, attempts: 1, provedPercent: 50 })
  })

  it('reports nothing before the first check', () => {
    expect(summarizeVerificationChecks([])).toEqual({
      rows: [],
      checks: 0,
      proved: 0,
      attempts: 0,
      provedPercent: 0,
    })
  })
})
