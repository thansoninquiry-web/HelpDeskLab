import type { JsonValue } from '../shared/json'

/**
 * How much of a phone's screen the docked tool card takes.
 *
 * The card is pinned to the bottom edge, and the trade is the same one the two
 * columns make on a wide window — more console against less page. It is the
 * learner's to make, within limits that keep both ends usable: under a third of
 * the screen the terminal is a strip, and above nine tenths there is no ticket
 * left to read, only the header. A remote desktop is the reason the default is
 * two numbers rather than one: a screen wants most of a phone, a log is readable
 * at half of it.
 *
 * The share is stored as a plain number rather than a length, so a row written
 * on one phone means the same thing on another, and the clamp does not need a
 * window to measure.
 */

/** The share a card takes when it holds a log. */
export const DOCK_SHARE_DEFAULT = 0.55

/** The share a card takes while a machine's desktop is on screen. */
export const DOCK_SHARE_WITH_DESKTOP = 0.82

/** What a stored share may never leave, whatever the phone. */
export const DOCK_SHARE_MIN = 0.3
export const DOCK_SHARE_MAX = 0.92

/** A thousandth of a screen is far finer than a pixel of drag. */
const SHARE_PRECISION = 1000

/** A share the card can be drawn at: inside the bounds, and a number at all. */
export function dockShareWithin(share: number): number {
  if (!Number.isFinite(share)) {
    return DOCK_SHARE_DEFAULT
  }
  const within = Math.min(DOCK_SHARE_MAX, Math.max(DOCK_SHARE_MIN, share))
  return Math.round(within * SHARE_PRECISION) / SHARE_PRECISION
}

/**
 * The share a stored value names, or null when it names none — the same contract
 * as the dividers', so a learner who has never moved this edge has no row and
 * opening a ticket writes nothing.
 */
export function readDockShare(value: JsonValue | null): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const share = (value as Record<string, JsonValue>).share
  return typeof share === 'number' && Number.isFinite(share) ? dockShareWithin(share) : null
}
