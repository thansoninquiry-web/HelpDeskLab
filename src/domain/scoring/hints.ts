import type { JsonObject } from '../shared/json'
import { DEFAULT_HINT_POLICY, rungCost, type HintPolicy } from './policy'

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
