import { describe, expect, it } from 'vitest'
import {
  LAYOUT_PRESETS,
  layoutPresetAt,
} from '../../../src/domain/tickets/layoutPresets'
import { SPLIT_DEFAULT_RATIO, SPLIT_MAX_RATIO, SPLIT_MIN_RATIO } from '../../../src/domain/tickets/splitLayout'
import {
  STAGE_DEFAULT_RATIO,
  STAGE_MAX_RATIO,
  STAGE_MIN_RATIO,
} from '../../../src/domain/tickets/stageLayout'

/**
 * A preset is two divider positions named together, so the thing worth holding
 * is that neither position is one its divider would refuse: a preset outside the
 * bounds would be a button that cannot do what it says.
 */
describe('the workspace layout presets', () => {
  it('names positions both dividers are allowed to take', () => {
    for (const preset of LAYOUT_PRESETS) {
      expect(preset.stageRatio).toBeGreaterThanOrEqual(STAGE_MIN_RATIO)
      expect(preset.stageRatio).toBeLessThanOrEqual(STAGE_MAX_RATIO)
      expect(preset.splitRatio).toBeGreaterThanOrEqual(SPLIT_MIN_RATIO)
      expect(preset.splitRatio).toBeLessThanOrEqual(SPLIT_MAX_RATIO)
    }
  })

  it('orders the workspace from the paperwork to the machine', () => {
    // The order is the number keys', so it has to mean something: the case file
    // narrows and the card widens as the list goes on.
    const stages = LAYOUT_PRESETS.map((preset) => preset.stageRatio)
    expect(stages).toEqual([...stages].sort((a, b) => b - a))
    // ...and the console gains the card as the card gains the stage.
    const splits = LAYOUT_PRESETS.map((preset) => preset.splitRatio)
    expect(splits).toEqual([...splits].sort((a, b) => b - a))

    const ids = LAYOUT_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the shipped fractions as one of them, so a preset can be undone', () => {
    const balanced = LAYOUT_PRESETS.find((preset) => preset.id === 'balanced')
    expect(balanced?.stageRatio).toBe(STAGE_DEFAULT_RATIO)
    expect(balanced?.splitRatio).toBe(SPLIT_DEFAULT_RATIO)
  })

  it('gives every pair a shape of its own', () => {
    // A pair that differed on one axis only would be a keypress that changes less
    // than the learner was promised.
    for (const [index, a] of LAYOUT_PRESETS.entries()) {
      for (const b of LAYOUT_PRESETS.slice(index + 1)) {
        expect(a.stageRatio).not.toBe(b.stageRatio)
        expect(a.splitRatio).not.toBe(b.splitRatio)
      }
    }
  })
})

describe('reading which preset the dividers are on', () => {
  const balanced = LAYOUT_PRESETS.find((preset) => preset.id === 'balanced')

  it('finds a preset when both dividers are on it', () => {
    expect(balanced).toBeDefined()
    expect(layoutPresetAt(balanced?.stageRatio ?? 0, balanced?.splitRatio ?? 0)?.id).toBe(
      'balanced',
    )
  })

  it('finds none when either divider has been moved off it', () => {
    const stage = balanced?.stageRatio ?? 0
    const split = balanced?.splitRatio ?? 0
    expect(layoutPresetAt(stage + 0.01, split)).toBeNull()
    expect(layoutPresetAt(stage, split + 0.01)).toBeNull()
  })

  it('counts a stored ratio that rounds onto the preset as being on it', () => {
    // Both ratios are kept to a thousandth; a preset's own numbers are exact,
    // and a value that came back from storage is the same number.
    const stage = balanced?.stageRatio ?? 0
    const split = balanced?.splitRatio ?? 0
    expect(layoutPresetAt(stage + 0.0004, split)?.id).toBe('balanced')
    expect(layoutPresetAt(stage + 0.001, split)).toBeNull()
  })

  it('is on nothing while a divider has no readable position', () => {
    expect(layoutPresetAt(Number.NaN, 0.5)).toBeNull()
    expect(layoutPresetAt(0.388, Number.NaN)).toBeNull()
  })
})
