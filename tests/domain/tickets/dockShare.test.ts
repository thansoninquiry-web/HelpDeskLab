import { describe, expect, it } from 'vitest'
import {
  DOCK_SHARE_DEFAULT,
  DOCK_SHARE_MAX,
  DOCK_SHARE_MIN,
  DOCK_SHARE_WITH_DESKTOP,
  dockShareWithin,
  readDockShare,
} from '../../../src/domain/tickets/dockShare'

describe('the docked card share', () => {
  it('holds a dragged share inside the bounds a phone can draw', () => {
    expect(dockShareWithin(0.6)).toBe(0.6)
    // A card under a third of the screen is a strip, and the page above it is gone
    // well before nine tenths.
    expect(dockShareWithin(0.05)).toBe(DOCK_SHARE_MIN)
    expect(dockShareWithin(4)).toBe(DOCK_SHARE_MAX)
    expect(dockShareWithin(Number.NaN)).toBe(DOCK_SHARE_DEFAULT)
  })

  it('keeps a share to a thousandth of the screen', () => {
    // Finer than a pixel of drag, and a number a person could have written.
    expect(dockShareWithin(0.6123456)).toBe(0.612)
  })

  it('starts a desktop higher up the screen than a log', () => {
    expect(DOCK_SHARE_DEFAULT).toBeLessThan(DOCK_SHARE_WITH_DESKTOP)
  })

  it('reads a stored share, or nothing at all', () => {
    expect(readDockShare({ share: 0.7 })).toBe(0.7)
    // A row written by a build with wider limits reads inside these ones.
    expect(readDockShare({ share: 0.99 })).toBe(DOCK_SHARE_MAX)
    expect(readDockShare(null)).toBeNull()
    expect(readDockShare({ share: '0.7' })).toBeNull()
    expect(readDockShare([0.7])).toBeNull()
  })
})
