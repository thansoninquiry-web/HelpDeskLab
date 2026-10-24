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
import { JOB_STATUSES, type JobStatus } from '../domain/targets/types'
import { dockShareWithin, readDockShare } from '../domain/tickets/dockShare'
import { readSplitRatio, splitRatioWithin } from '../domain/tickets/splitLayout'
import { readStageRatio, stageRatioWithin } from '../domain/tickets/stageLayout'
import type { JsonValue } from '../domain/shared/json'
import { getLocalDatabase } from './persistenceService'

/**
 * The bounds, the default, the stops and the clamp for the divider are the
 * domain's, so the workspace that drags it and the settings table that stores it
 * cannot disagree about where a divider may sit.
 */
export {
  CONSOLE_LAYOUT_WIDTHS_REM,
  SPLIT_DEFAULT_RATIO,
  SPLIT_MAX_RATIO,
  SPLIT_MIN_RATIO,
  SPLIT_STOPS,
  snapSplitRatio,
  splitRatioWithin,
  stepSplitStop,
} from '../domain/tickets/splitLayout'
export type { SplitSnapGeometry } from '../domain/tickets/splitLayout'

/**
 * The case-file/card trade is the domain's for the same reason the split's is: the
 * workspace that drags it and the table that stores it have to agree on where a
 * divider may sit and on what a stored row means.
 */
export {
  STAGE_DEFAULT_RATIO,
  STAGE_MAX_RATIO,
  STAGE_MIN_CARD_WIDTH,
  STAGE_MIN_RATIO,
  STAGE_MIN_TICKET_WIDTH,
  stageRatioWithin,
} from '../domain/tickets/stageLayout'

/**
 * The docked card's share is the phone's version of the same trade, so it is
 * exported beside the two dividers: the workspace that drags the edge and the
 * table that stores it read their bounds from the one module.
 */
export {
  DOCK_SHARE_DEFAULT,
  DOCK_SHARE_MAX,
  DOCK_SHARE_MIN,
  DOCK_SHARE_WITH_DESKTOP,
  dockShareWithin,
} from '../domain/tickets/dockShare'

/**
 * The presets are the two trades above, named together: the workspace applies
 * both from one list, and the bounds a preset must stay inside are the same
 * ones the dividers respect.
 */
export { LAYOUT_PRESETS, layoutPresetAt } from '../domain/tickets/layoutPresets'
export type { LayoutPreset, LayoutPresetId } from '../domain/tickets/layoutPresets'

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
const STAGE_RATIO_KEY = 'stageRatio'
const DOCK_SHARE_KEY = 'dockShare'
const SPLIT_RATIO_KEY = 'splitRatio'
const TARGETS_FILTER_KEY = 'targetsFilter'
const PROGRESS_SECTION_KEY = 'progressSection'

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

/**
 * Where the learner left the divider between the terminal and the pane beside it,
 * or null when they have never moved it.
 *
 * The shape of the split is a taste in layout rather than attempt data, so it is
 * kept with the split switch instead of on the session: it holds across every
 * ticket and every reload, and a ticket reopened tomorrow comes back with the two
 * halves the size they were left. Null is not half — a learner who has never moved
 * the divider has no position stored, and the workspace keeps its own default. A
 * position written outside the app is read inside the bounds the divider respects,
 * and one the app cannot read at all reads as nothing stored rather than failing.
 */
export async function loadSplitRatio(): Promise<number | null> {
  const db = await getLocalDatabase()
  return readSplitRatio(await db.settings.get(SPLIT_RATIO_KEY))
}

/**
 * Stores the divider where it came to rest, clamped to the bounds it was dragged
 * within, and answers with what was actually written rather than what was asked.
 */
export async function saveSplitRatio(ratio: number): Promise<number> {
  const db = await getLocalDatabase()
  const within = splitRatioWithin(ratio)
  await db.settings.set(SPLIT_RATIO_KEY, { ratio: within })
  return within
}

/**
 * Where the learner left the divider between the case file and the tool card, or
 * null when they have never moved it.
 *
 * It is the same kind of preference as the split's — a taste in layout that holds
 * across tickets rather than a fact about one attempt — so it lives beside it in
 * the settings table, read inside the stored bounds and written clamped to them.
 * Null is not the default ratio: a learner who has never traded width has no row,
 * and opening a ticket writes none.
 */
export async function loadStageRatio(): Promise<number | null> {
  const db = await getLocalDatabase()
  return readStageRatio(await db.settings.get(STAGE_RATIO_KEY))
}

/**
 * Stores the trade where it came to rest, clamped to the widest range the divider
 * is ever dragged in, and answers with what was actually written.
 */
export async function saveStageRatio(ratio: number): Promise<number> {
  const db = await getLocalDatabase()
  const within = stageRatioWithin(ratio)
  await db.settings.set(STAGE_RATIO_KEY, { ratio: within })
  return within
}

/**
 * How much of a phone's screen the docked card takes, or null when the learner
 * has never moved its top edge.
 *
 * It is a layout preference like the two dividers', and it lives beside them: a
 * phone that was given more console keeps that much on the next ticket, and the
 * stylesheet's own default (a log's share, or a desktop's) applies until the edge
 * is moved. A stored row written outside the app reads inside the bounds the
 * edge respects; one that cannot be read at all reads as nothing stored.
 */
export async function loadDockShare(): Promise<number | null> {
  const db = await getLocalDatabase()
  return readDockShare(await db.settings.get(DOCK_SHARE_KEY))
}

/**
 * Stores where the card's top edge came to rest, clamped to the bounds it was
 * dragged within, and answers with what was actually written.
 */
export async function saveDockShare(share: number): Promise<number> {
  const db = await getLocalDatabase()
  const within = dockShareWithin(share)
  await db.settings.set(DOCK_SHARE_KEY, { share: within })
  return within
}

/**
 * Which status the saved listings were filtered to: 'all', or one the list offers.
 *
 * A filter is a way of looking at the list rather than a fact about a listing, so
 * it is kept with the other view preferences in the settings table and not on any
 * row of the list itself. It is the same kind of memory as the splitter's: where
 * the learner was reading, not what they were reading.
 */
export type TargetsFilter = 'all' | JobStatus

export async function loadTargetsFilter(): Promise<TargetsFilter> {
  const db = await getLocalDatabase()
  return readTargetsFilter(await db.settings.get(TARGETS_FILTER_KEY))
}

/**
 * Stores the filter, answering with what was actually written. A value this build
 * does not recognise is stored as 'all' rather than as itself, so a backup cannot
 * hide every listing behind a filter nobody set.
 */
export async function saveTargetsFilter(filter: TargetsFilter): Promise<TargetsFilter> {
  const db = await getLocalDatabase()
  const within = readTargetsFilter({ filter })
  await db.settings.set(TARGETS_FILTER_KEY, { filter: within })
  return within
}

function readTargetsFilter(value: JsonValue | null): TargetsFilter {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'all'
  }
  const stored = (value as Record<string, JsonValue>).filter
  return typeof stored === 'string' && (JOB_STATUSES as readonly string[]).includes(stored)
    ? (stored as JobStatus)
    : 'all'
}

/**
 * The Progress section the learner was reading, or null when they have never
 * read one.
 *
 * A section id rather than a scroll offset: the page is rebuilt from live
 * history, so a row added above would move an offset onto a different block,
 * while `progress-hints` keeps meaning the same one. The page ignores an id it no
 * longer has, so a row outliving its section lands at the top rather than at a
 * place that was never a section. Nothing here knows the page's markup: the ids
 * are passed in and handed back, and an id has to look like one to be stored.
 */
export async function loadProgressSection(): Promise<string | null> {
  const db = await getLocalDatabase()
  return readProgressSection(await db.settings.get(PROGRESS_SECTION_KEY))
}

/** Stores the section being read, or writes nothing at all for an id it cannot read. */
export async function saveProgressSection(section: string): Promise<string | null> {
  const id = readProgressSection({ section })
  if (id === null) {
    return null
  }
  const db = await getLocalDatabase()
  await db.settings.set(PROGRESS_SECTION_KEY, { section: id })
  return id
}

function readProgressSection(value: JsonValue | null): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const section = (value as Record<string, JsonValue>).section
  return typeof section === 'string' && /^[a-z0-9-]{1,64}$/.test(section) ? section : null
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
