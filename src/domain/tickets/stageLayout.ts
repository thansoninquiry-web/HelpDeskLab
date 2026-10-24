import type { JsonValue } from '../shared/json'

/**
 * Where the divider between the case file and the tool card sits, and what is
 * allowed of it.
 *
 * The workspace is two columns — the ticket on the left, everything that talks to
 * the machine on the right — and the learner who reads a long case file at a
 * narrow terminal is the same learner who wants the card wider. So the trade is
 * theirs to make, within limits that keep both columns usable: a case file under
 * 300px is a column of one word per line, and a card under 420px cannot hold its
 * own header. Those limits are pixels because they are about the content; the
 * ratio that leaves two of them room depends on how wide the stage is, which is
 * why the clamp takes the width it is clamping for.
 *
 * The bounds are also stated as ratios, because a stored position has to be
 * readable without a window to measure: `readStageRatio` holds a row written
 * outside the app (or by a build with wider limits) inside the widest range the
 * divider can ever be dragged in, and the window tightens that further while the
 * learner is using it.
 */

/** The ratio the grid shipped with: 0.92 of the stage against 1.45, as a fraction. */
export const STAGE_DEFAULT_RATIO = 0.388

/** What a stored position may never leave, whatever the window. */
export const STAGE_MIN_RATIO = 0.2
export const STAGE_MAX_RATIO = 0.65

/** The narrowest each column may be traded down to, in px. */
export const STAGE_MIN_TICKET_WIDTH = 300
export const STAGE_MIN_CARD_WIDTH = 420

/**
 * How fine the ratio is kept, for the same reason the split's is: a thousandth of
 * the stage is far finer than a pixel, and it keeps a stored row a number a person
 * could have written rather than the tail of repeated arithmetic.
 */
const RATIO_PRECISION = 1000

/**
 * A ratio the stage can draw, inside the stored bounds and — when the stage's width
 * is known — inside the room the two columns' own minimums leave. A stage too
 * narrow to hold both minimums is left with the stored bounds: the stylesheet has
 * stacked the columns by then and there is no divider to place.
 */
export function stageRatioWithin(ratio: number, usable?: number): number {
  if (!Number.isFinite(ratio)) {
    return STAGE_DEFAULT_RATIO
  }
  let low = STAGE_MIN_RATIO
  let high = STAGE_MAX_RATIO
  if (usable !== undefined && Number.isFinite(usable) && usable > 0) {
    const ticketFloor = STAGE_MIN_TICKET_WIDTH / usable
    const cardFloor = 1 - STAGE_MIN_CARD_WIDTH / usable
    if (ticketFloor <= cardFloor) {
      low = Math.max(low, ticketFloor)
      high = Math.min(high, cardFloor)
    }
  }
  const within = Math.min(high, Math.max(low, ratio))
  return Math.round(within * RATIO_PRECISION) / RATIO_PRECISION
}

/**
 * The ratio a stored value names, or null when it names none — the same contract as
 * the split's, so a learner who has never moved this divider has no row and opening
 * a ticket writes nothing.
 */
export function readStageRatio(value: JsonValue | null): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const ratio = (value as Record<string, JsonValue>).ratio
  return typeof ratio === 'number' && Number.isFinite(ratio) ? stageRatioWithin(ratio) : null
}
