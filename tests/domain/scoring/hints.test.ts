import { describe, expect, it } from 'vitest'
import {
  hintLedger,
  normalizeHintRepair,
  reconstructHintRungs,
  type HintLedgerAction,
  type HintRepair,
} from '../../../src/domain/scoring/hints'
import { totalHintCost } from '../../../src/domain/scoring/policy'

const ITEMS = [
  { id: 'verify-caller', label: 'Verified the caller', hints: ['Verify first.', 'Send a code.', 'Have them read it back.'] },
  { id: 'use-evidence', label: 'Used evidence', hints: ['Look at the state.', 'Read the log.'] },
]

function hint(itemId: string, hintIndex: number, hint?: string): HintLedgerAction {
  return { kind: 'hint', input: { itemId, hintIndex, ...(hint ? { hint } : {}) } }
}

describe('hintLedger', () => {
  it('prices each rung in the order it was revealed', () => {
    const ledger = hintLedger([hint('verify-caller', 0), hint('verify-caller', 1)], ITEMS)

    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ itemId: 'verify-caller', label: 'Verified the caller', cost: 10 })
    expect(ledger[0]?.rungs).toEqual([
      { rung: 1, text: 'Verify first.', cost: 5 },
      { rung: 2, text: 'Send a code.', cost: 5 },
    ])
    // One rung of that step's ladder was never needed.
    expect(ledger[0]?.remaining).toBe(1)
  })

  it('keeps the attempt-wide cap: the fourth rung on any step is free', () => {
    const ledger = hintLedger(
      [
        hint('verify-caller', 0),
        hint('verify-caller', 1),
        hint('use-evidence', 0),
        hint('use-evidence', 1),
      ],
      ITEMS,
    )

    const byItem = new Map(ledger.map((entry) => [entry.itemId, entry]))
    expect(byItem.get('verify-caller')?.cost).toBe(10)
    expect(byItem.get('use-evidence')?.cost).toBe(5)
    expect(byItem.get('use-evidence')?.rungs.map((rung) => rung.cost)).toEqual([5, 0])
    expect(ledger.reduce((sum, entry) => sum + entry.cost, 0)).toBe(15)
  })

  it('reads the rung text back out of the ladder when the log carries none', () => {
    const ledger = hintLedger([hint('use-evidence', 1)], ITEMS)

    expect(ledger[0]?.rungs).toEqual([{ rung: 2, text: 'Read the log.', cost: 5 }])
    // The gentler rung was jumped over, so one rung of that ladder was never seen.
    expect(ledger[0]?.remaining).toBe(1)
  })

  it('prices rungs from the policy the attempt was started under', () => {
    const actions = [hint('verify-caller', 0), hint('verify-caller', 1), hint('use-evidence', 0)]

    const strict = hintLedger(actions, ITEMS, { perHint: 10, cap: 20, budget: 0 })
    expect(strict.map((entry) => entry.rungs.map((rung) => rung.cost))).toEqual([
      [10, 10],
      [0],
    ])
    expect(strict.reduce((sum, entry) => sum + entry.cost, 0)).toBe(20)

    const free = hintLedger(actions, ITEMS, { perHint: 0, cap: 0, budget: 0 })
    expect(free.every((entry) => entry.cost === 0)).toBe(true)
    expect(free.every((entry) => entry.rungs.every((rung) => rung.cost === 0))).toBe(true)
  })

  it('ignores actions that are not hints, and hints with no step named', () => {
    const ledger = hintLedger(
      [
        { kind: 'command', input: { command: 'ipconfig /all' } },
        { kind: 'hint', input: { hint: 'orphaned hint' } },
        hint('use-evidence', 0),
      ],
      ITEMS,
    )

    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.cost).toBe(5)
  })
})

describe('reconstructHintRungs', () => {
  const policy = { perHint: 5, cap: 15, budget: 0 }

  it('prices the lost rungs where they can only have fallen, after the survivors', () => {
    const repair = reconstructHintRungs(policy, 1, 1, 5)

    expect(repair).toMatchObject({ placed: 1, missing: 1, cost: 5, charged: 5 })
    // The one rung the log kept was the first; the lost one was the second.
    expect(repair.rungs).toEqual([{ sequence: 2, cost: 5 }])
  })

  it('adds up to the part of the charge the steps cannot show, cap included', () => {
    // Two rungs survive, two were lost, and the attempt was charged the 15 cap.
    const repair = reconstructHintRungs(policy, 2, 2, 5)

    expect(repair.rungs.map((rung) => rung.cost)).toEqual([5, 0])
    expect(repair.cost).toBe(5)
    expect(repair.charged).toBe(5)
    // The identity the reconstruction relies on, stated as a check of its own.
    expect(repair.cost).toBe(totalHintCost(policy, 4) - totalHintCost(policy, 2))
  })

  it('prices a wholly lost record from the first rung', () => {
    const repair = reconstructHintRungs(policy, 0, 2, 10)

    expect(repair.rungs).toEqual([
      { sequence: 1, cost: 5 },
      { sequence: 2, cost: 5 },
    ])
    expect(repair.cost).toBe(10)
  })

  it('keeps both numbers when the policy no longer prices the charge', () => {
    // A score charged at a dearer rate than the policy read back beside it.
    const repair = reconstructHintRungs(policy, 0, 1, 25)

    expect(repair.cost).toBe(5)
    expect(repair.charged).toBe(25)
  })

  it('reads free hints as free rungs rather than no rungs', () => {
    const repair = reconstructHintRungs({ perHint: 0, cap: 0, budget: 0 }, 1, 3, 0)

    expect(repair.rungs.map((rung) => rung.cost)).toEqual([0, 0, 0])
    // The count is still repaired: the log lost three rungs whatever they cost.
    expect(repair.missing).toBe(3)
    expect(repair.cost).toBe(0)
  })

  it('refuses to invent a rung when nothing is missing', () => {
    const repair = reconstructHintRungs(policy, 2, 0, 0)

    expect(repair.rungs).toEqual([])
    expect(repair.missing).toBe(0)
  })
})

describe('normalizeHintRepair', () => {
  const stored: HintRepair = {
    placed: 1,
    missing: 2,
    rungs: [
      { sequence: 2, cost: 5 },
      { sequence: 3, cost: 0 },
    ],
    cost: 5,
    charged: 5,
    policy: { perHint: 5, cap: 15, budget: 0 },
    repairedAt: 1_700_000_000_000,
    source: 'policy',
  }

  it('reads a stored repair back unchanged', () => {
    expect(normalizeHintRepair(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
  })

  it('rejects a record that lists fewer rungs than it says were lost', () => {
    expect(normalizeHintRepair({ ...stored, rungs: [stored.rungs[0]] })).toBeNull()
    expect(normalizeHintRepair({ ...stored, missing: 0 })).toBeNull()
  })

  it('rejects anything that is not a policy reconstruction', () => {
    expect(normalizeHintRepair(null)).toBeNull()
    expect(normalizeHintRepair([])).toBeNull()
    expect(normalizeHintRepair({ ...stored, source: 'guess' })).toBeNull()
    expect(normalizeHintRepair({ ...stored, repairedAt: -1 })).toBeNull()
    expect(normalizeHintRepair({ ...stored, cost: 'free' })).toBeNull()
    expect(normalizeHintRepair({ ...stored, rungs: [{ sequence: 0, cost: 5 }, stored.rungs[1]] }))
      .toBeNull()
  })

  it('normalizes a policy a later build wrote', () => {
    const repair = normalizeHintRepair({
      ...stored,
      policy: { perHint: 5, cap: 15, budget: 99 },
    })

    expect(repair?.policy).toEqual({ perHint: 5, cap: 15, budget: 50 })
  })
})
