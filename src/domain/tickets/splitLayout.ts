import type { JsonValue } from '../shared/json'

/**
 * Where the divider between the terminal and the tool beside it sits, and what is
 * allowed of it.
 *
 * The numbers live here rather than in the workspace because three places need the
 * same ones: the settings service clamps what it reads back out of the table, the
 * workspace clamps what the pointer and the keyboard ask for, and the separator's
 * own `aria-valuemin`/`aria-valuemax` are read off them. A divider the learner can
 * drag to a place that a reopen would refuse is a divider that moves on its own.
 */

/** Half the card: there is no reason to guess, and a reset puts it back here. */
export const SPLIT_DEFAULT_RATIO = 0.5

/**
 * Neither half may be squeezed past a quarter of the card. Below that the log and
 * the console are both unreadable, whatever the text size.
 */
export const SPLIT_MIN_RATIO = 0.25

/** The two bounds mirror each other, so one of them is enough to know both. */
export const SPLIT_MAX_RATIO = 1 - SPLIT_MIN_RATIO

/**
 * How fine the position is kept: a thousandth of the card is far finer than a
 * pixel on any screen, and it stops a stored ratio from being the tail of
 * repeated floating-point arithmetic — five presses of the fine step and back
 * leave 0.5999999999999999, which is not a number to write to a table or read out
 * of one.
 */
const RATIO_PRECISION = 1000

/**
 * The places the divider is worth being, from the console's side of the card to
 * the log's: a console that needs the room, an even split, and a log that needs
 * it. A learner aims at these far more often than at any point between them, so
 * the workspace names them, steps between them from the keyboard, and lets a drag
 * land on them (`SPLIT_STOP_MAGNET_REM`).
 *
 * They are ratios like every other position rather than pixel widths, so a stop
 * can never name a place the divider itself would refuse to sit.
 */
export const SPLIT_STOPS = [SPLIT_MIN_RATIO, SPLIT_DEFAULT_RATIO, SPLIT_MAX_RATIO] as const

/**
 * Close enough to a stop to be at it. A position arrives here from a drag rounded
 * to a thousandth and from arithmetic that may land a hair either side, and a
 * divider a billionth of the card away from a stop is at that stop.
 */
const STOP_EPSILON = 1e-9

/**
 * The widths at which a console changes its own layout, in rem, measured on the
 * box its container query looks at.
 *
 * The tool pane hands the console a width, so the console measures itself
 * (`container-type: inline-size` in `ToolConsole.module.css`) rather than the
 * window, and it turns twice: below 32rem there is not room for a list beside
 * its detail, so the list goes above it; below 20rem — the narrowest a quarter of
 * a small card can be — nothing sits beside anything, because a 13rem action
 * column or an 8rem field label would otherwise be wider than the pane itself.
 * Both are sizes a learner would want to land on, so the divider catches at
 * either while it is dragged.
 *
 * A list because the stylesheet may grow another query; `tests/ui/consoleSnapWidths.test.ts`
 * reads the container queries out of that stylesheet and fails if the two ever
 * disagree about the numbers.
 */
export const CONSOLE_LAYOUT_WIDTHS_REM = [20, 32] as const

/**
 * The widths at which the terminal log changes its own layout, in rem, measured
 * on the terminal's pane.
 *
 * The log measures itself the way a console does (`container-type: inline-size`
 * on the pane): below 22rem the three tiles of its summary stack as label/value
 * rows, the step gutter narrows, and the prompt moves above its command, because
 * at that width the same pieces side by side are three ragged columns a few
 * characters wide. That is one place a log's layout turns, and it is a size a
 * learner dragging the divider would want to land on — so it is in the snap list
 * with the console's. It sits below the half-split a 1440px window opens with
 * (about 25rem of log), so the shipped desk is left in its wide shape.
 */
export const TERMINAL_LAYOUT_WIDTHS_REM = [22] as const

/**
 * How near either pane has to come to one of those widths, in rem, before the
 * divider rests on it. Wide enough to catch a deliberate drag, narrow enough that
 * the divider can still be put anywhere else; in rem, so the catch grows with the
 * learner's text size as the width it catches grows.
 */
export const SPLIT_SNAP_REACH_REM = 0.75

/**
 * How near a named stop a drag has to come before it lands on it, in rem — half a
 * rem, eight pixels at the shipped text size.
 *
 * A magnet rather than a region: the pointer is still free everywhere else, and
 * the divider follows it out of the stop the moment it is a hair further away
 * than this. It is smaller than the catch on a pane width because a stop is a
 * round number the learner can see on the handle (`aria-valuenow`) rather than a
 * layout the content is asking for, so it only needs to forgive the hand.
 */
export const SPLIT_STOP_MAGNET_REM = 0.5

/**
 * A pixel or two clear of a width rather than exactly on it. A query of
 * `max-width` still matches at its own width — the console would snap into the
 * stacked layout it gets below that width — and the ratio is kept to a thousandth
 * of the card, so a snap rounded at a very wide card can land a pixel the wrong
 * side of the line. Resting just inside the wide layout is the size the content
 * asks for and is not at the mercy of that rounding.
 */
const SNAP_CLEARANCE_PX = 2

/**
 * What a snap needs to know about the card it is happening on: the width the two
 * panes share, the px the console loses to the pane's edges, and how large a rem
 * is on this screen.
 *
 * `gutter` is `NaN` when the tool half holds no console to measure. The console's
 * widths are skipped then, and the terminal's still apply: the log is always
 * there to restructure.
 */
export interface SplitSnapGeometry {
  usable: number
  gutter: number
  rem: number
}

/**
 * A ratio the workspace can draw: inside the bounds, to the precision the divider
 * is kept at, with anything the arithmetic cannot make sense of — a `NaN` from a
 * zero-width card, an infinity — falling back to the default rather than leaving
 * the panes with no width at all.
 */
export function splitRatioWithin(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return SPLIT_DEFAULT_RATIO
  }
  const within = Math.min(SPLIT_MAX_RATIO, Math.max(SPLIT_MIN_RATIO, ratio))
  return Math.round(within * RATIO_PRECISION) / RATIO_PRECISION
}

/**
 * The next stop in the direction asked for — towards the log as the ratio grows,
 * towards the console as it shrinks — or the ratio itself when there is no stop
 * that way. A divider at a stop stays on the last press of the key rather than
 * travelling past it, which is what makes the key safe to hold.
 */
export function stepSplitStop(ratio: number, direction: -1 | 1): number {
  const current = splitRatioWithin(ratio)
  if (direction > 0) {
    return SPLIT_STOPS.find((stop) => stop > current + STOP_EPSILON) ?? current
  }
  let previous = current
  for (const stop of SPLIT_STOPS) {
    if (stop < current - STOP_EPSILON) {
      previous = stop
    }
  }
  return previous
}

/**
 * The ratio a pointer asked for, moved onto a pane width when it is close enough
 * to one — either pane's. Returns the ratio unchanged when the card is not wide
 * enough to measure, or when no width is within reach.
 *
 * The two panes are measured differently because they contain different things. A
 * console is inside the tool pane and loses its padding to it, so its width is
 * `(1 - ratio)` of the shared width less the measured gutter. The terminal's
 * container is the pane itself, so its width is simply `ratio` of the shared
 * width. Snap either and the divider follows, which is what the grid draws.
 *
 * Named stops are a magnet on the same move: a drag that comes within
 * `SPLIT_STOP_MAGNET_REM` of Tool, Even or Log lands on the ratio exactly, so a
 * pointer user reaches the same places the header buttons and the bracket keys
 * do. The nearest candidate wins across all three kinds; the pane widths are
 * checked first, so an exact tie stays on the content width.
 */
export function snapSplitRatio(ratio: number, geometry: SplitSnapGeometry): number {
  const current = splitRatioWithin(ratio)
  const { usable, gutter, rem } = geometry
  if (!(usable > 0) || !(rem > 0)) {
    return current
  }
  let closest: number | null = null
  let closestDistance = SPLIT_SNAP_REACH_REM * rem

  // The console's side of the divider, when there is a console to measure.
  if (Number.isFinite(gutter)) {
    const consoleWidth = (1 - current) * usable - gutter
    for (const widthRem of CONSOLE_LAYOUT_WIDTHS_REM) {
      const target = widthRem * rem + SNAP_CLEARANCE_PX
      const distance = Math.abs(consoleWidth - target)
      if (distance >= closestDistance) {
        continue
      }
      closestDistance = distance
      closest = 1 - (target + gutter) / usable
    }
  }

  // The log's side. Its rest is just inside the wide layout, the same way the
  // console's is: the tightest width at which the pieces still sit side by side.
  const terminalWidth = current * usable
  for (const widthRem of TERMINAL_LAYOUT_WIDTHS_REM) {
    const target = widthRem * rem + SNAP_CLEARANCE_PX
    const distance = Math.abs(terminalWidth - target)
    if (distance >= closestDistance) {
      continue
    }
    closestDistance = distance
    closest = target / usable
  }

  // The named stops, as the light magnet: its own, smaller reach rather than the
  // pane widths' catch, and it only wins when it is nearer than a width already
  // caught.
  let magnet: number | null = null
  let magnetDistance = SPLIT_STOP_MAGNET_REM * rem
  for (const stop of SPLIT_STOPS) {
    const distance = Math.abs(current - stop) * usable
    if (distance >= magnetDistance) {
      continue
    }
    magnetDistance = distance
    magnet = stop
  }
  if (magnet !== null && magnetDistance < closestDistance) {
    closest = magnet
  }

  return closest === null ? current : splitRatioWithin(closest)
}

/**
 * The ratio a stored value names, or null when it names none.
 *
 * Null is not the default: a learner who has never moved the divider has no
 * position stored, and telling that apart from a stored half is what keeps the
 * first visit from writing a row for a divider nobody touched. A position written
 * outside the app — hand-edited, or left by a build whose bounds were wider — is
 * read inside the bounds the divider itself respects, and anything that is not a
 * number at all reads as nothing stored.
 */
export function readSplitRatio(value: JsonValue | null): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const ratio = (value as Record<string, JsonValue>).ratio
  return typeof ratio === 'number' && Number.isFinite(ratio) ? splitRatioWithin(ratio) : null
}
