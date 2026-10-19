import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HINT_POLICY,
  EXAM_HINT_POLICY,
  HINT_BUDGET_LIMIT,
  HINT_CAP_LIMIT,
  HINT_COST_LIMIT,
  hasOwnHintPolicy,
  hintBudgetLeft,
  hintBudgetSpent,
  hintPolicyError,
  hintPolicyFor,
  hintPricingJson,
  hintsAreFree,
  normalizeHintCatalogue,
  normalizeHintPolicy,
  normalizeHintPricing,
  rungCost,
  totalHintCost,
} from '../../../src/domain/scoring/policy'

describe('hint pricing', () => {
  it('charges the standard price until the cap, then nothing', () => {
    expect(DEFAULT_HINT_POLICY).toEqual({ perHint: 5, cap: 15, budget: 0 })

    expect([0, 1, 2, 3, 4, 5].map((revealed) => rungCost(DEFAULT_HINT_POLICY, revealed))).toEqual([
      5, 5, 5, 0, 0, 0,
    ])
    expect(totalHintCost(DEFAULT_HINT_POLICY, 0)).toBe(0)
    expect(totalHintCost(DEFAULT_HINT_POLICY, 2)).toBe(10)
    expect(totalHintCost(DEFAULT_HINT_POLICY, 21)).toBe(15)
  })

  it('prices an exam at the standard rate whoever sits it', () => {
    expect(EXAM_HINT_POLICY).toEqual({
      perHint: DEFAULT_HINT_POLICY.perHint,
      cap: DEFAULT_HINT_POLICY.cap,
      // An exam withdraws hints rather than rationing them.
      budget: 0,
    })
    expect(hintsAreFree(EXAM_HINT_POLICY)).toBe(false)
  })

  it('charges a harsher policy exactly as written', () => {
    const strict = { perHint: 10, cap: 20, budget: 0 }

    expect([0, 1, 2, 3].map((revealed) => rungCost(strict, revealed))).toEqual([10, 10, 0, 0])
    expect(totalHintCost(strict, 2)).toBe(20)
  })

  it('prices every rung at nothing when hints are free', () => {
    const free = { perHint: 0, cap: 0, budget: 0 }

    expect(hintsAreFree(free)).toBe(true)
    expect(rungCost(free, 0)).toBe(0)
    expect(totalHintCost(free, 30)).toBe(0)
    expect(hintsAreFree(DEFAULT_HINT_POLICY)).toBe(false)
  })

  it('stops charging once the cap is reached, even when it is not a multiple', () => {
    const odd = { perHint: 4, cap: 10, budget: 0 }

    expect([0, 1, 2, 3].map((revealed) => rungCost(odd, revealed))).toEqual([4, 4, 2, 0])
    expect(totalHintCost(odd, 9)).toBe(10)
  })
})

describe('hintPolicyError', () => {
  it('accepts the standard policy and free hints', () => {
    expect(hintPolicyError({ perHint: 5, cap: 15, budget: 0 })).toBeNull()
    expect(hintPolicyError({ perHint: 0, cap: 0, budget: 0 })).toBeNull()
    expect(hintPolicyError({ perHint: 1, cap: 1, budget: 0 })).toBeNull()
  })

  it('refuses halves, negatives, and a cap below one hint', () => {
    expect(hintPolicyError({ perHint: 2.5, cap: 10, budget: 0 })).toMatch(/whole numbers/)
    expect(hintPolicyError({ perHint: Number.NaN, cap: 10, budget: 0 })).toMatch(/whole numbers/)
    expect(hintPolicyError({ perHint: -1, cap: 10, budget: 0 })).toMatch(/negative/)
    expect(hintPolicyError({ perHint: 10, cap: 5, budget: 0 })).toMatch(/lower than one hint/)
    expect(hintPolicyError({ perHint: 0, cap: 15, budget: 0 })).toMatch(/nothing to cap/)
  })

  it('refuses a policy beyond the limits the form allows', () => {
    expect(hintPolicyError({ perHint: HINT_COST_LIMIT + 1, cap: 100, budget: 0 })).toMatch(/more than/)
    expect(hintPolicyError({ perHint: 5, cap: HINT_CAP_LIMIT + 1, budget: 0 })).toMatch(/more than/)
    expect(hintPolicyError({ perHint: HINT_COST_LIMIT, cap: HINT_CAP_LIMIT, budget: 0 })).toBeNull()
  })
})

describe('normalizeHintPolicy', () => {
  it('keeps a usable policy exactly as stored', () => {
    expect(normalizeHintPolicy({ perHint: 8, cap: 24, budget: 0 })).toEqual({ perHint: 8, cap: 24, budget: 0 })
    expect(normalizeHintPolicy({ perHint: 0, cap: 0, budget: 0 })).toEqual({ perHint: 0, cap: 0, budget: 0 })
  })

  it('falls back to the standard price for anything it cannot read', () => {
    expect(normalizeHintPolicy(null)).toEqual(DEFAULT_HINT_POLICY)
    expect(normalizeHintPolicy(undefined)).toEqual(DEFAULT_HINT_POLICY)
    expect(normalizeHintPolicy('5')).toEqual(DEFAULT_HINT_POLICY)
    expect(normalizeHintPolicy([5, 15])).toEqual(DEFAULT_HINT_POLICY)
    expect(normalizeHintPolicy({ perHint: 5 })).toEqual(DEFAULT_HINT_POLICY)
    expect(normalizeHintPolicy({ perHint: '5', cap: '15', budget: 0 })).toEqual(DEFAULT_HINT_POLICY)
    // NaN and Infinity are numbers to JavaScript and unusable as a price.
    expect(normalizeHintPolicy({ perHint: Number.NaN, cap: 15, budget: 0 })).toEqual(DEFAULT_HINT_POLICY)
    expect(normalizeHintPolicy({ perHint: 5, cap: Number.POSITIVE_INFINITY, budget: 0 })).toEqual(
      DEFAULT_HINT_POLICY,
    )
  })

  it('clamps a hand-edited or truncated value into range rather than rejecting it', () => {
    // A backup edited to absurd numbers still has to be playable.
    expect(normalizeHintPolicy({ perHint: 999, cap: 9_999, budget: 0 })).toEqual({
      perHint: HINT_COST_LIMIT,
      cap: HINT_CAP_LIMIT,
      budget: 0,
    })
    expect(normalizeHintPolicy({ perHint: -3, cap: -9, budget: 0 })).toEqual({ perHint: 0, cap: 0, budget: 0 })
    expect(normalizeHintPolicy({ perHint: 7.8, cap: 30.4, budget: 0 })).toEqual({ perHint: 7, cap: 30, budget: 0 })
    // A cap under one hint would make the price unpayable, so it rides up.
    expect(normalizeHintPolicy({ perHint: 20, cap: 3, budget: 0 })).toEqual({ perHint: 20, cap: 20, budget: 0 })
    expect(normalizeHintPolicy({ perHint: 0, cap: 15, budget: 0 })).toEqual({ perHint: 0, cap: 0, budget: 0 })
  })
})

describe('hint catalogue', () => {
  const catalogue = {
    default: { perHint: 5, cap: 15, budget: 0 },
    families: { 'PWD-01': { perHint: 2, cap: 6, budget: 1 } },
  }

  it('prices a family at its own price and every other family at the default', () => {
    expect(hintPolicyFor(catalogue, 'PWD-01')).toEqual({ perHint: 2, cap: 6, budget: 1 })
    expect(hintPolicyFor(catalogue, 'NET-01')).toEqual(catalogue.default)
    // A family a later build adds inherits for the same reason: nothing names it.
    expect(hintPolicyFor(catalogue, 'NEW-01')).toEqual(catalogue.default)
  })

  it('knows a family with no price of its own from one priced at the default', () => {
    expect(hasOwnHintPolicy(catalogue, 'PWD-01')).toBe(true)
    expect(hasOwnHintPolicy(catalogue, 'NET-01')).toBe(false)
    expect(
      hasOwnHintPolicy({ default: catalogue.default, families: { 'NET-01': catalogue.default } }, 'NET-01'),
    ).toBe(true)
  })

  it('reads a stored catalogue back with every price normalized', () => {
    const stored = normalizeHintCatalogue({
      default: { perHint: 999, cap: 3 },
      families: {
        'PWD-01': { perHint: 0, cap: 40, budget: 2.7 },
        'NET-01': 'twelve',
        '': { perHint: 4, cap: 8 },
      },
    })

    expect(stored.default).toEqual({ perHint: HINT_COST_LIMIT, cap: HINT_COST_LIMIT, budget: 0 })
    expect(stored.families['PWD-01']).toEqual({ perHint: 0, cap: 0, budget: 2 })
    // An entry it cannot read is priced at the default rather than dropped.
    expect(stored.families['NET-01']).toEqual(DEFAULT_HINT_POLICY)
    expect(Object.keys(stored.families)).toEqual(['PWD-01', 'NET-01'])
  })

  it('falls back to the standard rate for anything it cannot read', () => {
    for (const value of [null, undefined, 'five', 5, [], { families: [] }, { families: 3 }]) {
      expect(normalizeHintCatalogue(value)).toEqual({ default: DEFAULT_HINT_POLICY, families: {} })
    }
  })
})

describe('hint pricing source', () => {
  it('reads a row written before families were priced as the default', () => {
    expect(normalizeHintPricing({ perHint: 5, cap: 15, budget: 0 })).toEqual({
      policy: { perHint: 5, cap: 15, budget: 0 },
      source: 'default',
      familyId: null,
      defaultPolicy: { perHint: 5, cap: 15, budget: 0 },
    })
  })

  it('keeps a family price and the default it departed from apart', () => {
    const stored = hintPricingJson({
      policy: { perHint: 3, cap: 9, budget: 2 },
      source: 'family',
      familyId: 'PWD-01',
      defaultPolicy: { perHint: 5, cap: 15, budget: 0 },
    })

    // Through JSON, the way the database holds it.
    expect(normalizeHintPricing(JSON.parse(JSON.stringify(stored)))).toEqual({
      policy: { perHint: 3, cap: 9, budget: 2 },
      source: 'family',
      familyId: 'PWD-01',
      defaultPolicy: { perHint: 5, cap: 15, budget: 0 },
    })
  })

  it('reads an exam as an exam and drops any family it names', () => {
    expect(
      normalizeHintPricing({
        policy: { perHint: 5, cap: 15, budget: 0 },
        source: 'exam',
        familyId: 'PWD-01',
        defaultPolicy: { perHint: 2, cap: 6, budget: 0 },
      }),
    ).toEqual({
      policy: { perHint: 5, cap: 15, budget: 0 },
      source: 'exam',
      familyId: null,
      defaultPolicy: { perHint: 2, cap: 6, budget: 0 },
    })
  })

  it('will not call a price a family price without a family to name', () => {
    expect(normalizeHintPricing({ source: 'family', policy: { perHint: 3, cap: 9 } })).toEqual({
      policy: { perHint: 3, cap: 9, budget: 0 },
      source: 'default',
      familyId: null,
      defaultPolicy: { perHint: 3, cap: 9, budget: 0 },
    })
  })

  it('treats anything unreadable as the default price', () => {
    const expected = {
      policy: DEFAULT_HINT_POLICY,
      source: 'default',
      familyId: null,
      defaultPolicy: DEFAULT_HINT_POLICY,
    }

    for (const value of [null, undefined, 'family', 5, [], true]) {
      expect(normalizeHintPricing(value)).toEqual(expected)
    }
    expect(
      normalizeHintPricing({ policy: 'three', source: 'everyone', familyId: 7 }),
    ).toEqual(expected)
  })
})

describe('hint budget', () => {
  const fiveHints = { perHint: 5, cap: 15, budget: 5 }

  it('is not the same thing as the price: free hints can still be rationed', () => {
    const rationed = { perHint: 0, cap: 0, budget: 2 }

    expect(hintPolicyError(rationed)).toBeNull()
    expect(normalizeHintPolicy(rationed)).toEqual(rationed)
    expect(hintsAreFree(rationed)).toBe(true)
    expect(hintBudgetLeft(rationed, 1)).toBe(1)
    expect(hintBudgetSpent(rationed, 2)).toBe(true)
  })

  it('counts what is left and reports the last hint as spent, not one before', () => {
    expect(hintBudgetLeft(fiveHints, 0)).toBe(5)
    expect(hintBudgetSpent(fiveHints, 0)).toBe(false)
    expect(hintBudgetLeft(fiveHints, 4)).toBe(1)
    expect(hintBudgetSpent(fiveHints, 4)).toBe(false)
    expect(hintBudgetLeft(fiveHints, 5)).toBe(0)
    expect(hintBudgetSpent(fiveHints, 5)).toBe(true)
    // Past the budget reads as none left, exactly like reaching it.
    expect(hintBudgetLeft(fiveHints, 9)).toBe(0)
    expect(hintBudgetSpent(fiveHints, 9)).toBe(true)
  })

  it('leaves an attempt unlimited when the budget is zero', () => {
    expect(hintBudgetLeft(DEFAULT_HINT_POLICY, 0)).toBeNull()
    expect(hintBudgetLeft(DEFAULT_HINT_POLICY, 40)).toBeNull()
    expect(hintBudgetSpent(DEFAULT_HINT_POLICY, 40)).toBe(false)
  })

  it('refuses a budget that is not a whole count inside the limit', () => {
    expect(hintPolicyError({ perHint: 5, cap: 15, budget: -1 })).toMatch(/budget cannot be negative/i)
    expect(hintPolicyError({ perHint: 5, cap: 15, budget: 2.5 })).toMatch(/whole numbers/)
    expect(hintPolicyError({ perHint: 5, cap: 15, budget: HINT_BUDGET_LIMIT + 1 })).toMatch(
      /more than/i,
    )
    expect(hintPolicyError({ perHint: 5, cap: 15, budget: HINT_BUDGET_LIMIT })).toBeNull()
  })

  it('reads a stored policy that predates the budget as unlimited', () => {
    expect(normalizeHintPolicy({ perHint: 5, cap: 15 })).toEqual({ perHint: 5, cap: 15, budget: 0 })
    expect(normalizeHintPolicy({ perHint: 0, cap: 0 })).toEqual({ perHint: 0, cap: 0, budget: 0 })
    expect(normalizeHintPolicy({ perHint: 5, cap: 15, budget: 'three' })).toEqual({
      perHint: 5,
      cap: 15,
      budget: 0,
    })
    expect(normalizeHintPolicy({ perHint: 5, cap: 15, budget: Number.NaN })).toEqual({
      perHint: 5,
      cap: 15,
      budget: 0,
    })
  })

  it('clamps a hand-edited budget into range', () => {
    expect(normalizeHintPolicy({ perHint: 5, cap: 15, budget: 9_999 })).toEqual({
      perHint: 5,
      cap: 15,
      budget: HINT_BUDGET_LIMIT,
    })
    expect(normalizeHintPolicy({ perHint: 5, cap: 15, budget: -4 })).toEqual({
      perHint: 5,
      cap: 15,
      budget: 0,
    })
    expect(normalizeHintPolicy({ perHint: 5, cap: 15, budget: 3.9 })).toEqual({
      perHint: 5,
      cap: 15,
      budget: 3,
    })
  })
})
