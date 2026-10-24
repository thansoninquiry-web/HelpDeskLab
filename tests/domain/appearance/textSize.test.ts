import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZES,
  TEXT_SIZE_CHOICES,
  describeTextSize,
  isTextSize,
  parseTextSize,
} from '../../../src/domain/appearance/textSize'

describe('the interface text size', () => {
  it('reads the sizes it offers, and nothing else', () => {
    for (const size of TEXT_SIZES) {
      expect(isTextSize(size)).toBe(true)
    }

    for (const value of ['huge', 'DEFAULT', '', 16, null, undefined, {}, []]) {
      expect(isTextSize(value)).toBe(false)
    }
  })

  it('offers one titled choice per size, in the order the form shows them', () => {
    expect(TEXT_SIZE_CHOICES.map((choice) => choice.value)).toEqual([...TEXT_SIZES])
    expect(TEXT_SIZE_CHOICES.map((choice) => choice.label)).toEqual(['Small', 'Default', 'Large'])

    for (const choice of TEXT_SIZE_CHOICES) {
      expect(choice.detail.length).toBeGreaterThan(0)
      expect(choice.detail).not.toBe(choice.label)
    }
  })

  it('names the design size as the default', () => {
    expect(DEFAULT_TEXT_SIZE).toBe('default')
    expect(TEXT_SIZES[0]).toBe('small')
    expect(TEXT_SIZES.indexOf(DEFAULT_TEXT_SIZE)).toBe(1)
  })

  it('treats a missing or unrecognizable value as the design size', () => {
    for (const value of [null, undefined, '', 'HUGE', 'sepia', 0, {}, []]) {
      expect(parseTextSize(value)).toBe(DEFAULT_TEXT_SIZE)
    }

    expect(parseTextSize('small')).toBe('small')
    expect(parseTextSize('large')).toBe('large')
    expect(parseTextSize('default')).toBe('default')
  })

  it('says what the chosen size is doing, one sentence each', () => {
    const sentences = TEXT_SIZES.map(describeTextSize)

    expect(new Set(sentences).size).toBe(TEXT_SIZES.length)
    for (const sentence of sentences) {
      expect(sentence.endsWith('.')).toBe(true)
      expect(sentence.length).toBeGreaterThan(30)
    }
    // Small is the one that takes the interface under the design size, and its
    // sentence has to say so rather than reading like the default's.
    expect(describeTextSize('small')).toContain('scaled down')
    expect(describeTextSize('large')).toContain('scaled up')
    expect(describeTextSize('default')).toBe('The workspace is at the size it was laid out at.')
  })
})
