import { describe, expect, it } from 'vitest'
import {
  STAGE_DEFAULT_RATIO,
  STAGE_MAX_RATIO,
  STAGE_MIN_CARD_WIDTH,
  STAGE_MIN_RATIO,
  STAGE_MIN_TICKET_WIDTH,
  readStageRatio,
  stageRatioWithin,
} from '../../../src/domain/tickets/stageLayout'

/** A stage 1200px wide with 0.6rem of divider between the columns. */
const USABLE = 1190

describe('the stage bounds', () => {
  it('starts the columns at the fractions the grid shipped with', () => {
    // 0.92 of the stage against 1.45 is where the case file and the card sat
    // before either of them could be dragged.
    expect(STAGE_DEFAULT_RATIO).toBe(0.388)
    expect(Math.abs(STAGE_DEFAULT_RATIO - 0.92 / (0.92 + 1.45))).toBeLessThan(0.001)
  })

  it('keeps a stored position inside a range either column can live in', () => {
    expect(STAGE_MIN_RATIO).toBeLessThan(STAGE_MAX_RATIO)
    expect(STAGE_MIN_RATIO).toBeGreaterThan(0)
    expect(STAGE_MAX_RATIO).toBeLessThan(1)
  })
})

describe('stageRatioWithin', () => {
  it('leaves a ratio that fits alone', () => {
    expect(stageRatioWithin(0.45)).toBe(0.45)
    expect(stageRatioWithin(0.45, USABLE)).toBe(0.45)
  })

  it('pulls a ratio back inside the stored bounds', () => {
    expect(stageRatioWithin(0)).toBe(STAGE_MIN_RATIO)
    expect(stageRatioWithin(-2)).toBe(STAGE_MIN_RATIO)
    expect(stageRatioWithin(0.9)).toBe(STAGE_MAX_RATIO)
    expect(stageRatioWithin(12)).toBe(STAGE_MAX_RATIO)
  })

  it('stops where the case file or the card would get too narrow', () => {
    // 1190px: 300px of case file is a quarter of the stage, and the card may
    // take the rest bar its own 420px.
    expect(stageRatioWithin(0.1, USABLE)).toBeCloseTo(STAGE_MIN_TICKET_WIDTH / USABLE, 3)
    expect(stageRatioWithin(0.99, USABLE)).toBeCloseTo(1 - STAGE_MIN_CARD_WIDTH / USABLE, 3)
  })

  it('trades width as the stage does, not as the window does', () => {
    // The same ratio leaves a 1600px stage a wide card and squeezes a 900px one
    // under the card's own minimum — so the narrow stage stops it there.
    expect(stageRatioWithin(0.6, 1600)).toBe(0.6)
    expect(stageRatioWithin(0.6, 900)).toBeCloseTo(1 - STAGE_MIN_CARD_WIDTH / 900, 3)
    // A ratio both stages can hold is left alone on both.
    expect(stageRatioWithin(0.45, 1600)).toBe(0.45)
    expect(stageRatioWithin(0.45, 900)).toBe(0.45)
  })

  it('keeps the stored bounds when the stage is too narrow for both minimums', () => {
    // Under 720px there is no ratio that leaves both columns their own minimums;
    // the stylesheet has stacked them there, so nothing is left to clamp for.
    expect(stageRatioWithin(0.5, 600)).toBe(0.5)
    expect(stageRatioWithin(0.1, 600)).toBe(STAGE_MIN_RATIO)
  })

  it('keeps the position to a thousandth', () => {
    expect(stageRatioWithin(0.4123456)).toBe(0.412)
    expect(stageRatioWithin(1 / 3)).toBe(0.333)
  })

  it('falls back to the default when the arithmetic gave up', () => {
    expect(stageRatioWithin(Number.NaN)).toBe(STAGE_DEFAULT_RATIO)
    expect(stageRatioWithin(Number.POSITIVE_INFINITY)).toBe(STAGE_DEFAULT_RATIO)
    expect(stageRatioWithin(0.45, 0)).toBe(0.45)
  })
})

describe('readStageRatio', () => {
  it('reads a stored position', () => {
    expect(readStageRatio({ ratio: 0.45 })).toBe(0.45)
  })

  it('reads nothing at all as nothing stored', () => {
    expect(readStageRatio(null)).toBeNull()
    expect(readStageRatio(0.45)).toBeNull()
    expect(readStageRatio('wide')).toBeNull()
    expect(readStageRatio([0.45])).toBeNull()
  })

  it('reads a row with no position in it as nothing stored', () => {
    expect(readStageRatio({})).toBeNull()
    expect(readStageRatio({ ratio: '0.45' })).toBeNull()
    expect(readStageRatio({ ratio: null })).toBeNull()
  })

  it('reads a position written outside the bounds inside them', () => {
    expect(readStageRatio({ ratio: 0 })).toBe(STAGE_MIN_RATIO)
    expect(readStageRatio({ ratio: 3 })).toBe(STAGE_MAX_RATIO)
    expect(readStageRatio({ ratio: Number.NaN })).toBeNull()
  })
})
