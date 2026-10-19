import { SCENARIO_FAMILIES } from '../domain/generator'
import {
  DEFAULT_HINT_POLICY,
  EXAM_HINT_POLICY,
  HINT_BUDGET_LIMIT,
  HINT_CAP_LIMIT,
  HINT_COST_LIMIT,
  hasOwnHintPolicy,
  hintPolicyError,
  hintPolicyFor,
  normalizeHintCatalogue,
  normalizeHintPolicy,
  type HintCatalogue,
  type HintPolicy,
  type HintPricing,
} from '../domain/scoring/policy'
import type { JsonValue } from '../domain/shared/json'
import { getLocalDatabase } from './persistenceService'

/**
 * What a hint costs: one default, and a price for any scenario family the
 * learner has priced differently.
 *
 * The catalogue is stored as a value in the settings table and read back through
 * the same normalizer, so a hand-edited backup cannot hand the app a price it
 * cannot play with. Families are keyed by id, which is what makes a family added
 * in a later build inherit the default without a migration. Attempts copy the
 * resolved policy when they start — see practiceService — so changing this never
 * re-prices a ticket already in flight.
 */

const HINT_CATALOGUE_KEY = 'hintPolicies'
/** What builds before per-family prices wrote: a single price for every family. */
const LEGACY_HINT_POLICY_KEY = 'hintPolicy'
const EXAM_MODE_KEY = 'examMode'
const SPLIT_VIEW_KEY = 'splitView'

export type { HintPolicy }

/**
 * One row of the Settings price list: the default, or one family's price. The
 * row carries no name, because what a family is called belongs to the interface
 * rather than to the price (`familyLabels.ts`).
 */
export interface HintTarget {
  /** Null is the default that every family without a price of its own inherits. */
  id: string | null
  /** The price this target plays at, which is the default when it inherits. */
  policy: HintPolicy
  /** False when the family plays at the default rather than a price of its own. */
  own: boolean
}

export function defaultHintPolicy(): HintPolicy {
  return DEFAULT_HINT_POLICY
}

/** What the Settings form may accept, so the UI never imports the domain. */
export function hintPolicyLimits(): { perHint: number; cap: number; budget: number } {
  return { perHint: HINT_COST_LIMIT, cap: HINT_CAP_LIMIT, budget: HINT_BUDGET_LIMIT }
}

/** The reason these numbers cannot be saved, or null when they can. */
export function validateHintPolicy(input: {
  perHint: number
  cap: number
  budget: number
}): string | null {
  return hintPolicyError(input)
}

/**
 * Every price the Settings page can show: the default first, then each scenario
 * family in the order the generator lists them.
 */
export async function loadHintTargets(): Promise<HintTarget[]> {
  const catalogue = await loadHintCatalogue()
  return [
    { id: null, policy: catalogue.default, own: true },
    ...SCENARIO_FAMILIES.map((family) => ({
      id: family.id,
      policy: hintPolicyFor(catalogue, family.id),
      own: hasOwnHintPolicy(catalogue, family.id),
    })),
  ]
}

/** The default price, which is what an unpriced family plays at. */
export async function loadHintPolicy(): Promise<HintPolicy> {
  return (await loadHintCatalogue()).default
}

/**
 * The price a ticket from this family plays at: the family's own if it has one,
 * otherwise the default. This is what an attempt is pinned to when it starts.
 */
export async function resolveHintPolicy(familyId: string): Promise<HintPolicy> {
  return (await resolveHintPricing(familyId, false)).policy
}

/**
 * The price an attempt starts under, with where that price came from and the
 * default in force at the time. Pinned on the attempt so its debrief can say
 * which price applied without reading today's setting.
 *
 * An exam is priced by the exam, so it names no family — but the default it
 * replaced is still recorded, because the debrief explains what it did not use.
 */
export async function resolveHintPricing(
  familyId: string,
  exam: boolean,
): Promise<HintPricing> {
  const catalogue = await loadHintCatalogue()
  if (exam) {
    return {
      policy: EXAM_HINT_POLICY,
      source: 'exam',
      familyId: null,
      defaultPolicy: catalogue.default,
    }
  }

  const own = hasOwnHintPolicy(catalogue, familyId)
  return {
    policy: hintPolicyFor(catalogue, familyId),
    source: own ? 'family' : 'default',
    familyId: own ? familyId : null,
    defaultPolicy: catalogue.default,
  }
}

/** Prices every family that has no price of its own. */
export async function saveHintPolicy(input: {
  perHint: number
  cap: number
  budget: number
}): Promise<HintPolicy> {
  const policy = parseHintPolicy(input)
  const catalogue = await loadHintCatalogue()
  await writeHintCatalogue({ ...catalogue, default: policy })
  return policy
}

/** Prices one family on its own, leaving the default and every other family alone. */
export async function saveFamilyHintPolicy(
  familyId: string,
  input: { perHint: number; cap: number; budget: number },
): Promise<HintPolicy> {
  assertKnownFamily(familyId)
  const policy = parseHintPolicy(input)
  const catalogue = await loadHintCatalogue()
  await writeHintCatalogue({
    ...catalogue,
    families: { ...catalogue.families, [familyId]: policy },
  })
  return policy
}

/**
 * Drops a family's own price so it plays at the default again. Returns the price
 * it now plays at, which is the default when nothing was overridden.
 */
export async function clearFamilyHintPolicy(familyId: string): Promise<HintPolicy> {
  assertKnownFamily(familyId)
  const catalogue = await loadHintCatalogue()
  if (!hasOwnHintPolicy(catalogue, familyId)) {
    return catalogue.default
  }

  const families = { ...catalogue.families }
  delete families[familyId]
  await writeHintCatalogue({ ...catalogue, families })
  return catalogue.default
}

async function loadHintCatalogue(): Promise<HintCatalogue> {
  const db = await getLocalDatabase()
  const stored = await db.settings.get(HINT_CATALOGUE_KEY)
  if (stored !== null) {
    return normalizeHintCatalogue(stored)
  }

  // A device that has only ever had the single price plays every family at it,
  // so that price becomes the default rather than being lost to the new shape.
  const legacy = await db.settings.get(LEGACY_HINT_POLICY_KEY)
  return { default: normalizeHintPolicy(legacy), families: {} }
}

async function writeHintCatalogue(catalogue: HintCatalogue): Promise<void> {
  const db = await getLocalDatabase()
  // Stored as plain JSON numbers, so the reader and a hand-edited backup agree.
  await db.settings.set(HINT_CATALOGUE_KEY, {
    default: {
      perHint: catalogue.default.perHint,
      cap: catalogue.default.cap,
      budget: catalogue.default.budget,
    },
    families: Object.fromEntries(
      Object.entries(catalogue.families).map(([familyId, policy]) => [
        familyId,
        { perHint: policy.perHint, cap: policy.cap, budget: policy.budget },
      ]),
    ),
  })
}

function parseHintPolicy(input: {
  perHint: number
  cap: number
  budget: number
}): HintPolicy {
  const error = hintPolicyError(input)
  if (error) {
    throw new Error(error)
  }
  return { perHint: input.perHint, cap: input.cap, budget: input.budget }
}

function assertKnownFamily(familyId: string): void {
  if (!SCENARIO_FAMILIES.some((family) => family.id === familyId)) {
    throw new Error('That scenario family does not exist.')
  }
}

/**
 * The price an exam attempt uses, whatever the learner has set. Exposed so the
 * Settings copy can name the rate the exam pins without reading the domain.
 */
export function examHintPolicy(): HintPolicy {
  return EXAM_HINT_POLICY
}

/**
 * True when new attempts should be sat as exams: hints stay closed until the
 * attempt is scored, and the standard price replaces the learner's own.
 */
export async function loadExamMode(): Promise<boolean> {
  const db = await getLocalDatabase()
  return readSwitch(await db.settings.get(EXAM_MODE_KEY))
}

/**
 * Stores the mode as an object, like every other setting, so a hand-edited
 * backup cannot hand the reader a value it mistrusts.
 */
export async function saveExamMode(on: boolean): Promise<boolean> {
  const db = await getLocalDatabase()
  await db.settings.set(EXAM_MODE_KEY, { on })
  return on
}

/**
 * Whether the ticket workspace opens with the terminal and a tool side by side.
 *
 * It is the learner's taste in layout, not attempt data, so it lives in the
 * settings table instead of on the session: it holds across every ticket and
 * every reload, and two attempts open the same way.
 */
export async function loadSplitView(): Promise<boolean> {
  const db = await getLocalDatabase()
  return readSwitch(await db.settings.get(SPLIT_VIEW_KEY))
}

export async function saveSplitView(on: boolean): Promise<boolean> {
  const db = await getLocalDatabase()
  await db.settings.set(SPLIT_VIEW_KEY, { on })
  return on
}

/** Anything unrecognizable reads as off: hints stay available, as they were. */
function readSwitch(value: JsonValue | null): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return (value as Record<string, JsonValue>).on === true
}

/** What the learner will feel from a policy, in one sentence. */
export function describeHintPolicy(policy: HintPolicy): string {
  const price =
    policy.perHint <= 0 || policy.cap <= 0
      ? 'Hints are free on this device: every rung you reveal costs 0 points.'
      : `Each hint costs ${policy.perHint} point${policy.perHint === 1 ? '' : 's'} of diagnostic reasoning, up to ${policy.cap} point${policy.cap === 1 ? '' : 's'} on a ticket; after that they are free.`

  if (policy.budget <= 0) {
    return price
  }
  return `${price} Each attempt may take up to ${policy.budget} hint${policy.budget === 1 ? '' : 's'}.`
}
