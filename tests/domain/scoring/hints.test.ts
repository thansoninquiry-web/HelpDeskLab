import { describe, expect, it } from 'vitest'
import { hintLedger, type HintLedgerAction } from '../../../src/domain/scoring/hints'

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
