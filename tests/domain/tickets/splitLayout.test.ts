import { describe, expect, it } from 'vitest'
import {
  CONSOLE_LAYOUT_WIDTHS_REM,
  SPLIT_DEFAULT_RATIO,
  SPLIT_MAX_RATIO,
  SPLIT_MIN_RATIO,
  SPLIT_SNAP_REACH_REM,
  SPLIT_STOP_MAGNET_REM,
  SPLIT_STOPS,
  TERMINAL_LAYOUT_WIDTHS_REM,
  readSplitRatio,
  snapSplitRatio,
  splitRatioWithin,
  stepSplitStop,
} from '../../../src/domain/tickets/splitLayout'

/**
 * A card whose two panes share 990px, a console that loses 1.8rem of that to the
 * pane's edges, and sixteen pixels to a rem — the geometry every snap case below
 * is read in.
 */
const GEOMETRY = { usable: 990, gutter: 28.8, rem: 16 }

/** The console's width at a ratio, which is what a container query measures. */
function consoleWidthAt(ratio: number): number {
  return (1 - ratio) * GEOMETRY.usable - GEOMETRY.gutter
}

describe('the bounds', () => {
  it('starts the divider at half, and resets it there', () => {
    expect(SPLIT_DEFAULT_RATIO).toBe(0.5)
    expect(splitRatioWithin(SPLIT_DEFAULT_RATIO)).toBe(SPLIT_DEFAULT_RATIO)
  })

  it('leaves each half a quarter of the card, and no less', () => {
    expect(SPLIT_MIN_RATIO).toBe(0.25)
    expect(SPLIT_MAX_RATIO).toBe(0.75)
    // The bounds are the two ends of one card: a half of the minimum away from
    // either edge is the other edge.
    expect(SPLIT_MAX_RATIO + SPLIT_MIN_RATIO).toBe(1)
  })
})

describe('the stops', () => {
  it('names the console-heavy side first and the log-heavy side last', () => {
    // The order is the direction the divider travels across the card, which is
    // also the direction the ratio grows.
    expect(SPLIT_STOPS).toEqual([SPLIT_MIN_RATIO, SPLIT_DEFAULT_RATIO, SPLIT_MAX_RATIO])
  })

  it('offers only places the divider itself would sit at', () => {
    for (const stop of SPLIT_STOPS) {
      expect(splitRatioWithin(stop)).toBe(stop)
    }
  })
})

describe('stepSplitStop', () => {
  it('takes a position between stops to the next one that way', () => {
    expect(stepSplitStop(0.62, 1)).toBe(SPLIT_MAX_RATIO)
    expect(stepSplitStop(0.62, -1)).toBe(SPLIT_DEFAULT_RATIO)
    expect(stepSplitStop(0.3, 1)).toBe(SPLIT_DEFAULT_RATIO)
    expect(stepSplitStop(0.3, -1)).toBe(SPLIT_MIN_RATIO)
    expect(stepSplitStop(0.74, -1)).toBe(SPLIT_DEFAULT_RATIO)
  })

  it('moves off a stop rather than staying on it', () => {
    expect(stepSplitStop(SPLIT_DEFAULT_RATIO, 1)).toBe(SPLIT_MAX_RATIO)
    expect(stepSplitStop(SPLIT_DEFAULT_RATIO, -1)).toBe(SPLIT_MIN_RATIO)
  })

  it('stays on the last stop rather than travelling past it', () => {
    // A held key must not push the divider out of the bounds it draws within.
    expect(stepSplitStop(SPLIT_MAX_RATIO, 1)).toBe(SPLIT_MAX_RATIO)
    expect(stepSplitStop(SPLIT_MIN_RATIO, -1)).toBe(SPLIT_MIN_RATIO)
    expect(stepSplitStop(1, 1)).toBe(SPLIT_MAX_RATIO)
    expect(stepSplitStop(0, -1)).toBe(SPLIT_MIN_RATIO)
  })

  it('reads a position a hair off a stop as being at it', () => {
    // A thousandth of the card is the finest the divider is kept, and arithmetic
    // on the way here may land either side of an exact value.
    expect(stepSplitStop(SPLIT_MAX_RATIO - 1e-12, 1)).toBe(SPLIT_MAX_RATIO)
    expect(stepSplitStop(SPLIT_MIN_RATIO + 1e-12, -1)).toBe(SPLIT_MIN_RATIO)
  })

  it('falls back to the default from a position that is not a number', () => {
    expect(stepSplitStop(Number.NaN, 1)).toBe(SPLIT_MAX_RATIO)
    expect(stepSplitStop(Number.POSITIVE_INFINITY, -1)).toBe(SPLIT_MIN_RATIO)
  })
})

describe('the console widths', () => {
  it('names the widths at which a console lays itself out again', () => {
    // The list goes above its detail at 32rem; at 20rem — a quarter of a small
    // card — nothing sits beside anything at all.
    expect(CONSOLE_LAYOUT_WIDTHS_REM).toEqual([20, 32])
    // Narrow enough to catch a drag, wide enough to leave the divider free
    // everywhere else.
    expect(SPLIT_SNAP_REACH_REM).toBe(0.75)
  })
})

describe('the terminal widths', () => {
  it('names the width at which the log restacks', () => {
    // One place the log's layout turns: three tiles down the side instead of
    // across, a narrower step gutter, and the prompt above its command.
    expect(TERMINAL_LAYOUT_WIDTHS_REM).toEqual([22])
  })

  it('catches within less than the narrowest width it is catching on', () => {
    for (const width of TERMINAL_LAYOUT_WIDTHS_REM) {
      expect(SPLIT_SNAP_REACH_REM).toBeLessThan(width)
    }
  })
})

describe('snapSplitRatio', () => {
  it('rests just inside the width that fits a list beside its detail', () => {
    // The pointer asked for a console a shade under the width the query names;
    // the divider moves it to the first size that still holds two columns.
    const snapped = snapSplitRatio(0.445, GEOMETRY)
    expect(consoleWidthAt(snapped)).toBeGreaterThan(32 * GEOMETRY.rem)
    expect(consoleWidthAt(snapped)).toBeLessThan(32 * GEOMETRY.rem + 4)
    expect(snapped).toBe(0.452)
  })

  it('leaves a ratio that is nowhere near a console width alone', () => {
    expect(snapSplitRatio(0.31, GEOMETRY)).toBe(0.31)
    expect(snapSplitRatio(0.7, GEOMETRY)).toBe(0.7)
  })

  it('rests just inside the width where the log restacks', () => {
    // The terminal's container is the pane itself, so its width is the ratio's
    // share of the card with no gutter to subtract. Just above 22rem the log
    // still has its wide shape; that is the size a narrowed log wants to keep.
    const target = 22 * GEOMETRY.rem + 2
    const asked = (target - 8) / GEOMETRY.usable
    const snapped = snapSplitRatio(asked, GEOMETRY)
    expect(snapped).toBe(0.358)
    expect(snapped * GEOMETRY.usable).toBeGreaterThanOrEqual(22 * GEOMETRY.rem)
    expect(snapped * GEOMETRY.usable).toBeLessThan(22 * GEOMETRY.rem + 4)
  })

  it('catches the log only within reach of its width', () => {
    const target = 22 * GEOMETRY.rem + 2
    const distance = SPLIT_SNAP_REACH_REM * GEOMETRY.rem
    const ratioAt = (gap: number) => (target + gap) / GEOMETRY.usable

    expect(snapSplitRatio(ratioAt(distance - 0.5), GEOMETRY)).toBe(0.358)
    const outside = ratioAt(distance + 0.5)
    expect(snapSplitRatio(outside, GEOMETRY)).toBe(splitRatioWithin(outside))
  })

  it('still catches the log when the tool half holds no console', () => {
    // An empty pane has no gutter to measure, and no console width to catch on —
    // but the log is still there, and still worth landing on.
    const asked = (22 * GEOMETRY.rem + 2 - 8) / GEOMETRY.usable
    expect(snapSplitRatio(asked, { ...GEOMETRY, gutter: Number.NaN })).toBe(0.358)
  })

  it('catches only within reach of the width', () => {
    const target = 32 * GEOMETRY.rem + 2
    const distance = SPLIT_SNAP_REACH_REM * GEOMETRY.rem
    // The ratio that leaves the console `gap` px clear of the size it wants.
    const ratioAt = (gap: number) =>
      (GEOMETRY.usable - GEOMETRY.gutter - target - gap) / GEOMETRY.usable

    // A hair inside the reach catches; a hair outside it stays where it was put.
    expect(snapSplitRatio(ratioAt(distance - 0.5), GEOMETRY)).toBe(0.452)
    const outside = ratioAt(distance + 0.5)
    expect(snapSplitRatio(outside, GEOMETRY)).toBe(splitRatioWithin(outside))
  })

  it('lands a drag within reach of a named stop exactly on it', () => {
    // The light magnet: a hand that comes within half a rem of Tool, Even or Log
    // gets the stop rather than a position a few pixels beside it.
    for (const stop of SPLIT_STOPS) {
      const near = stop + (SPLIT_STOP_MAGNET_REM * GEOMETRY.rem * 0.6) / GEOMETRY.usable
      expect(snapSplitRatio(near, GEOMETRY)).toBe(stop)
      expect(snapSplitRatio(stop - (SPLIT_STOP_MAGNET_REM * GEOMETRY.rem * 0.6) / GEOMETRY.usable, GEOMETRY)).toBe(stop)
    }
  })

  it('lets go of a stop once the pointer is past the magnet', () => {
    const asked = splitRatioWithin(
      SPLIT_DEFAULT_RATIO + (SPLIT_STOP_MAGNET_REM * GEOMETRY.rem + 2) / GEOMETRY.usable,
    )
    expect(snapSplitRatio(asked, GEOMETRY)).toBe(asked)
  })

  it('keeps the magnet working where a pane width is not in reach', () => {
    // The even half is nowhere near 22rem or 32rem on this card; the stop and the
    // pane widths are candidates on the same move, not exclusive.
    const near = 0.5 + (SPLIT_STOP_MAGNET_REM * GEOMETRY.rem * 0.6) / GEOMETRY.usable
    expect(snapSplitRatio(near, { ...GEOMETRY, gutter: Number.NaN })).toBe(0.5)
  })

  it('answers with a place the divider may draw', () => {
    // Whatever the card, the answer is a position inside the bounds — a snap can
    // no more leave the card than a drag can.
    for (const usable of [400, 560, 700, 990, 1600]) {
      const ratio = snapSplitRatio(0.445, { usable, gutter: 28.8, rem: 16 })
      expect(ratio).toBeGreaterThanOrEqual(SPLIT_MIN_RATIO)
      expect(ratio).toBeLessThanOrEqual(SPLIT_MAX_RATIO)
    }
  })

  it('does nothing without a geometry it can read', () => {
    expect(snapSplitRatio(0.445, { usable: 0, gutter: 28.8, rem: 16 })).toBe(0.445)
    expect(snapSplitRatio(0.445, { usable: 990, gutter: 28.8, rem: 0 })).toBe(0.445)
  })
})

describe('splitRatioWithin', () => {
  it('leaves a ratio that is already inside alone', () => {
    expect(splitRatioWithin(0.25)).toBe(0.25)
    expect(splitRatioWithin(0.62)).toBe(0.62)
    expect(splitRatioWithin(0.75)).toBe(0.75)
  })

  it('pulls a ratio outside the bounds back to them', () => {
    expect(splitRatioWithin(0)).toBe(SPLIT_MIN_RATIO)
    expect(splitRatioWithin(-3)).toBe(SPLIT_MIN_RATIO)
    expect(splitRatioWithin(0.9)).toBe(SPLIT_MAX_RATIO)
    expect(splitRatioWithin(48)).toBe(SPLIT_MAX_RATIO)
  })

  it('keeps the position to a thousandth, which is a number a person could write', () => {
    // Five presses of the fine step and back again leave this tail; a table row
    // and a settings file should not have to carry it.
    expect(splitRatioWithin(0.5999999999999999)).toBe(0.6)
    expect(splitRatioWithin(0.456789)).toBe(0.457)
    expect(splitRatioWithin(1 / 3)).toBe(0.333)
    // Far finer than a pixel, so nothing the pointer does is lost to rounding.
    expect(splitRatioWithin(0.5 + 1e-6)).toBe(0.5)
  })

  it('falls back to the default when the arithmetic gave up', () => {
    // A zero-width card divided into makes a NaN, and a divider drawn at NaN has
    // no width at all. Half is the one answer that is always drawable.
    expect(splitRatioWithin(Number.NaN)).toBe(SPLIT_DEFAULT_RATIO)
    expect(splitRatioWithin(Number.POSITIVE_INFINITY)).toBe(SPLIT_DEFAULT_RATIO)
    expect(splitRatioWithin(Number.NEGATIVE_INFINITY)).toBe(SPLIT_DEFAULT_RATIO)
  })
})

describe('readSplitRatio', () => {
  it('reads a stored position', () => {
    expect(readSplitRatio({ ratio: 0.62 })).toBe(0.62)
  })

  it('reads nothing at all as nothing stored', () => {
    expect(readSplitRatio(null)).toBeNull()
    expect(readSplitRatio(0.62)).toBeNull()
    expect(readSplitRatio('half')).toBeNull()
    expect(readSplitRatio([0.62])).toBeNull()
  })

  it('reads a row with no position in it as nothing stored', () => {
    expect(readSplitRatio({})).toBeNull()
    expect(readSplitRatio({ ratio: '0.62' })).toBeNull()
    expect(readSplitRatio({ ratio: null })).toBeNull()
  })

  it('reads a position written outside the bounds inside them', () => {
    expect(readSplitRatio({ ratio: 0 })).toBe(SPLIT_MIN_RATIO)
    expect(readSplitRatio({ ratio: 4 })).toBe(SPLIT_MAX_RATIO)
    expect(readSplitRatio({ ratio: Number.NaN })).toBeNull()
  })
})
