import type { JsonObject } from '../shared/json'

/**
 * What a hint costs, the most one attempt can pay for them, and how many that
 * attempt may take.
 *
 * A policy is fixed when an attempt starts and travels with it: the workspace
 * prices revealed rungs with it, the evaluator deducts with it, and the debrief
 * re-prices the same rungs with it months later, even if the setting has changed
 * since. Zero for `perHint` means hints are free, and then `cap` is zero too.
 *
 * The budget rations hints without charging for them: it is the number one
 * attempt may reveal, whatever they cost, and zero means no limit.
 */
export interface HintPolicy {
  perHint: number
  cap: number
  budget: number
}

/** Where the price an attempt paid came from. */
export type HintPriceSource = 'default' | 'family' | 'exam'

/**
 * The price an attempt played under, and where that price came from.
 *
 * The policy alone cannot say whether a family's own price applied or the
 * default, nor what the default was at the time. The debrief has to be able to
 * say both months later, so the source is recorded when the attempt starts and
 * travels with it: a later change in Settings cannot rewrite the explanation of
 * an attempt that has already been scored.
 */
export interface HintPricing {
  policy: HintPolicy
  source: HintPriceSource
  /** The family whose own price applied; null for the default and for an exam. */
  familyId: string | null
  /** The default in force when the attempt started, whatever price it paid. */
  defaultPolicy: HintPolicy
}

/**
 * Every price a device plays by: one default, plus a policy for the families the
 * learner has priced differently.
 *
 * Overrides are keyed by family id rather than listed, so a family added in a
 * later build inherits the default with no migration and no list to remember to
 * update: an id that is absent simply plays at the default.
 */
export interface HintCatalogue {
  default: HintPolicy
  families: Record<string, HintPolicy>
}

/** The rules an attempt gets until a learner changes them in Settings. */
export const HINT_PENALTY_PER_HINT = 5
export const MAX_HINT_PENALTY = 15

export const DEFAULT_HINT_POLICY: HintPolicy = {
  perHint: HINT_PENALTY_PER_HINT,
  cap: MAX_HINT_PENALTY,
  budget: 0,
}

/**
 * What an exam attempt pays for hints. An exam is priced by the exam, not by the
 * learner's setting, so two people who sit the same ticket face the same ladder
 * at the same rate whichever price they had chosen for practice. The budget
 * stays unlimited because the exam withdraws hints altogether: nothing is
 * rationed, and what the withheld ladders would have cost is priced from here
 * when the debrief hands them over.
 */
export const EXAM_HINT_POLICY: HintPolicy = {
  perHint: HINT_PENALTY_PER_HINT,
  cap: MAX_HINT_PENALTY,
  budget: 0,
}

/** Bounds for the Settings control, so a typo cannot make the game unplayable. */
export const HINT_COST_LIMIT = 50
export const HINT_CAP_LIMIT = 200
export const HINT_BUDGET_LIMIT = 50

/** Why a typed-in policy cannot be saved, or null when it is usable. */
export function hintPolicyError(input: {
  perHint: number
  cap: number
  budget: number
}): string | null {
  const { perHint, cap, budget } = input

  if (!Number.isInteger(perHint) || !Number.isInteger(cap) || !Number.isInteger(budget)) {
    return 'Use whole numbers for the hint cost, the cap, and the budget.'
  }
  if (perHint < 0 || cap < 0) {
    return 'Points cannot be negative.'
  }
  if (budget < 0) {
    return 'The hint budget cannot be negative. Use 0 for no limit.'
  }
  if (perHint > HINT_COST_LIMIT) {
    return `One hint cannot cost more than ${HINT_COST_LIMIT} points.`
  }
  if (cap > HINT_CAP_LIMIT) {
    return `The cap cannot be more than ${HINT_CAP_LIMIT} points.`
  }
  if (budget > HINT_BUDGET_LIMIT) {
    return `One attempt cannot be given more than ${HINT_BUDGET_LIMIT} hints.`
  }
  if (perHint === 0 && cap !== 0) {
    return 'Free hints have nothing to cap: set the cap to 0 as well.'
  }
  if (perHint > 0 && cap < perHint) {
    return 'The cap cannot be lower than one hint.'
  }

  return null
}

/**
 * Reads a stored value back into a usable policy. Nothing stored is ever
 * rejected: whatever a backup or an older build wrote is clamped into range, and
 * anything unrecognizable becomes the default. A policy written before the
 * budget existed reads back with no limit.
 */
export function normalizeHintPolicy(value: unknown): HintPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_HINT_POLICY
  }

  const record = value as Record<string, unknown>
  const rawPerHint = record.perHint
  const rawCap = record.cap
  if (typeof rawPerHint !== 'number' || typeof rawCap !== 'number') {
    return DEFAULT_HINT_POLICY
  }
  // NaN and Infinity are numbers to JavaScript and unusable as a price.
  if (!Number.isFinite(rawPerHint) || !Number.isFinite(rawCap)) {
    return DEFAULT_HINT_POLICY
  }

  const budget = readBudget(record.budget)
  const perHint = clamp(Math.trunc(rawPerHint), 0, HINT_COST_LIMIT)
  if (perHint === 0) {
    return { perHint: 0, cap: 0, budget }
  }

  const cap = clamp(Math.trunc(rawCap), perHint, HINT_CAP_LIMIT)
  return { perHint, cap, budget }
}

function readBudget(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  return clamp(Math.trunc(value), 0, HINT_BUDGET_LIMIT)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Reads a stored catalogue back into a usable one. As with a single policy,
 * nothing stored is rejected: the default and each family's price are clamped
 * into range, and a family whose entry is unusable is priced at the default.
 */
export function normalizeHintCatalogue(value: unknown): HintCatalogue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { default: DEFAULT_HINT_POLICY, families: {} }
  }

  const record = value as Record<string, unknown>
  const families: Record<string, HintPolicy> = {}
  const stored = record.families
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    for (const [familyId, policy] of Object.entries(stored as Record<string, unknown>)) {
      if (familyId.length === 0) {
        continue
      }
      families[familyId] = normalizeHintPolicy(policy)
    }
  }

  return { default: normalizeHintPolicy(record.default), families }
}

/** The price this family plays by: its own if it has one, otherwise the default. */
export function hintPolicyFor(catalogue: HintCatalogue, familyId: string): HintPolicy {
  return catalogue.families[familyId] ?? catalogue.default
}

/** True when the family has been priced on its own rather than inheriting. */
export function hasOwnHintPolicy(catalogue: HintCatalogue, familyId: string): boolean {
  return Object.prototype.hasOwnProperty.call(catalogue.families, familyId)
}

/**
 * Reads a stored pricing back into a usable one. A row written before the source
 * was recorded holds nothing but the numbers, and reads as the default price —
 * which is what those attempts paid, since per-family prices did not exist.
 */
export function normalizeHintPricing(value: unknown): HintPricing {
  const record = asRecord(value)
  const policy = normalizeHintPolicy(record && 'policy' in record ? record.policy : value)
  const stored = record?.source
  const source: HintPriceSource = stored === 'family' || stored === 'exam' ? stored : 'default'
  const familyId =
    source === 'family' && typeof record?.familyId === 'string' && record.familyId.length > 0
      ? record.familyId
      : null
  const defaultPolicy =
    record && 'defaultPolicy' in record ? normalizeHintPolicy(record.defaultPolicy) : policy

  // A family price that cannot name its family is not a family price.
  return {
    policy,
    source: source === 'family' && familyId === null ? 'default' : source,
    familyId,
    defaultPolicy,
  }
}

/** The pricing as the plain JSON a session and a score store. */
export function hintPricingJson(pricing: HintPricing): JsonObject {
  return {
    policy: policyJson(pricing.policy),
    source: pricing.source,
    familyId: pricing.familyId,
    defaultPolicy: policyJson(pricing.defaultPolicy),
  }
}

function policyJson(policy: HintPolicy): JsonObject {
  return { perHint: policy.perHint, cap: policy.cap, budget: policy.budget }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** What an attempt pays for `used` revealed rungs. */
export function totalHintCost(policy: HintPolicy, used: number): number {
  if (policy.perHint <= 0 || policy.cap <= 0 || used <= 0) {
    return 0
  }
  return Math.min(policy.cap, used * policy.perHint)
}

/** Points the rung that follows `revealed` ones costs, up to the cap. */
export function rungCost(policy: HintPolicy, revealed: number): number {
  return totalHintCost(policy, revealed + 1) - totalHintCost(policy, revealed)
}

/** True when revealing another rung still costs nothing. */
export function hintsAreFree(policy: HintPolicy): boolean {
  return policy.perHint <= 0 || policy.cap <= 0
}

/** Hints an attempt may still take, or null when its budget is unlimited. */
export function hintBudgetLeft(policy: HintPolicy, used: number): number | null {
  if (policy.budget <= 0) {
    return null
  }
  return Math.max(0, policy.budget - used)
}

/** True when the attempt has already revealed every hint its budget allows. */
export function hintBudgetSpent(policy: HintPolicy, used: number): boolean {
  const left = hintBudgetLeft(policy, used)
  return left !== null && left === 0
}
