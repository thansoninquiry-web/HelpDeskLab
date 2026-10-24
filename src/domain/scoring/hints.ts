import type { JsonObject } from '../shared/json'
import {
  DEFAULT_HINT_POLICY,
  normalizeHintPolicy,
  rungCost,
  type HintPolicy,
} from './policy'

export {
  DEFAULT_HINT_POLICY,
  HINT_CAP_LIMIT,
  HINT_COST_LIMIT,
  hintPolicyError,
  hintsAreFree,
  normalizeHintPolicy,
  rungCost,
  totalHintCost,
  type HintPolicy,
} from './policy'

/**
 * Which hint rungs an attempt actually revealed, and what each one cost.
 *
 * The action log records a hint as the step it unstuck and the rung it handed
 * over; the price comes from the attempt's own policy, so the debrief charges
 * what the workspace charged at the time instead of spreading one flat total.
 */

/** The shape a logged action has to have to be read here: nothing else is used. */
export interface HintLedgerAction {
  kind: string
  input: JsonObject
}

/** A rubric step's ladder, however it was stored. */
export interface HintLadderItem {
  id: string
  label: string
  hints: readonly string[]
}

export interface HintRung {
  /** 1-based position in the step's ladder, gentlest first. */
  rung: number
  text: string
  /** Points revealing this rung cost. */
  cost: number
}

export interface HintLedgerEntry {
  itemId: string
  label: string
  /** Rungs revealed on this step, in the order they were taken. */
  rungs: HintRung[]
  /** What this step's rungs cost together. */
  cost: number
  /** Rungs of the ladder this attempt never saw, in either direction. */
  remaining: number
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function hintLedger(
  actions: readonly HintLedgerAction[],
  items: readonly HintLadderItem[],
  policy: HintPolicy = DEFAULT_HINT_POLICY,
): HintLedgerEntry[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const entries = new Map<string, HintLedgerEntry>()
  let revealed = 0

  for (const action of actions) {
    if (action.kind !== 'hint') {
      continue
    }

    const itemId = readText(action.input.itemId)
    if (itemId.length === 0) {
      continue
    }

    const index = typeof action.input.hintIndex === 'number' ? action.input.hintIndex : 0
    const item = byId.get(itemId)
    const text = readText(action.input.hint) || item?.hints[index] || ''
    // Priced against the attempt, so a rung past the cap is free.
    const cost = rungCost(policy, revealed)
    revealed += 1

    const entry = entries.get(itemId) ?? {
      itemId,
      label: item?.label ?? itemId,
      rungs: [],
      cost: 0,
      remaining: 0,
    }
    entry.rungs.push({ rung: index + 1, text, cost })
    entry.cost += cost
    entries.set(itemId, entry)
  }

  for (const entry of entries.values()) {
    const ladder = byId.get(entry.itemId)?.hints.length ?? entry.rungs.length
    entry.remaining = Math.max(0, ladder - entry.rungs.length)
  }

  return [...entries.values()]
}

/** One rung the log lost, priced again from the attempt's own policy. */
export interface ReconstructedRung {
  /** Position in the attempt's reveal order, counting the rungs the log places. */
  sequence: number
  /** Points the rung would have cost at that position. */
  cost: number
}

/**
 * A hint record with its lost rungs priced back in, and no step invented for
 * them.
 *
 * The charge is a number the score kept; the rungs behind it are rows the log
 * kept, and a log can lose rows without losing the score. What can still be
 * known about a lost rung is how many were charged, where in the reveal order
 * they can only have fallen, and what the attempt's own policy charged at that
 * position — so that is what is rebuilt here, and nothing else.
 *
 * The rungs are placed after every rung the log still explains, which is the
 * only ordering the remaining evidence permits: a lost row cannot be shown to
 * have come before a row that survived. Under a policy that charges a flat rate
 * up to a cap, the prices at those positions add up to exactly
 * `totalHintCost(policy, placed + missing) - totalHintCost(policy, placed)`,
 * which is the part of the stored charge the steps cannot show. When the policy
 * is not the one the attempt was scored under the two numbers part company, and
 * both are kept so the debrief can say so rather than pick one.
 */
export interface HintReconstruction {
  /** Rungs the log still places on a step; the pricing continues from here. */
  placed: number
  /** Charged rungs the log lost. */
  missing: number
  rungs: ReconstructedRung[]
  /** What the reconstructed rungs cost under the policy, summed. */
  cost: number
  /** What the score charged for those rungs, which is not always the same. */
  charged: number
  /** The price the attempt played under, kept with the reconstruction. */
  policy: HintPolicy
}

function counted(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

export function reconstructHintRungs(
  policy: HintPolicy,
  placed: number,
  missing: number,
  charged: number,
): HintReconstruction {
  const known = counted(placed)
  const lost = counted(missing)
  const rungs: ReconstructedRung[] = []
  for (let index = 0; index < lost; index += 1) {
    const sequence = known + index + 1
    // The rung at this position, priced by how many were revealed before it.
    rungs.push({ sequence, cost: rungCost(policy, sequence - 1) })
  }

  return {
    placed: known,
    missing: lost,
    rungs,
    cost: rungs.reduce((total, rung) => total + rung.cost, 0),
    charged: counted(charged),
    policy,
  }
}

/**
 * The reconstruction as it is kept on the score.
 *
 * The source is stored rather than assumed: a rung with no step beside it is
 * only ever a policy's reading of a lost row, and the record has to say so
 * wherever it is read — including a backup restored into a later build.
 */
export interface HintRepair extends HintReconstruction {
  repairedAt: number
  source: 'policy'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Reads a stored repair back, or null when the row is not one.
 *
 * The rungs have to agree with the count: a record that says two rungs were
 * lost and lists one is not a repair to show, and a half-read one would be
 * worse than the gap it replaced. The policy is normalized like any other
 * stored price, so a value written by a later build still reads here.
 */
export function normalizeHintRepair(value: unknown): HintRepair | null {
  if (!isRecord(value) || value.source !== 'policy') {
    return null
  }

  const repairedAt = whole(value.repairedAt)
  const placed = whole(value.placed)
  const missing = whole(value.missing)
  const cost = whole(value.cost)
  const charged = whole(value.charged)
  if (repairedAt === null || placed === null || missing === null || cost === null) {
    return null
  }
  if (charged === null || missing === 0 || !Array.isArray(value.rungs)) {
    return null
  }
  if (value.rungs.length !== missing) {
    return null
  }

  const rungs: ReconstructedRung[] = []
  for (const entry of value.rungs) {
    if (!isRecord(entry)) {
      return null
    }
    const sequence = whole(entry.sequence)
    const rungPrice = whole(entry.cost)
    if (sequence === null || rungPrice === null || sequence < 1) {
      return null
    }
    rungs.push({ sequence, cost: rungPrice })
  }

  return {
    placed,
    missing,
    rungs,
    cost,
    charged,
    policy: normalizeHintPolicy(value.policy),
    repairedAt,
    source: 'policy',
  }
}
