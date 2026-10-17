export interface Rng {
  /** Next value in [0, 1). */
  next(): number
  /** Inclusive integer range. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  bool(chance?: number): boolean
  shuffle<T>(items: readonly T[]): T[]
}

export function hashSeed(value: string | number): number {
  const text = String(value)
  let hash = 2_166_136_261
  for (const character of text) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

/** mulberry32: tiny, fast, and stable across platforms. */
export function createRng(seed: number): Rng {
  let state = hashSeed(seed) || 1

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }

  const int = (min: number, max: number): number => {
    if (max < min) {
      throw new RangeError(`Invalid rng range: ${min}..${max}`)
    }
    return min + Math.floor(next() * (max - min + 1))
  }

  const pick = <T,>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from an empty list')
    }
    const item = items[int(0, items.length - 1)]
    if (item === undefined) {
      throw new RangeError('Picked an undefined item')
    }
    return item
  }

  const bool = (chance = 0.5): boolean => next() < chance

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = int(0, index)
      const a = copy[index]
      const b = copy[swap]
      if (a === undefined || b === undefined) {
        continue
      }
      copy[index] = b
      copy[swap] = a
    }
    return copy
  }

  return { next, int, pick, bool, shuffle }
}
