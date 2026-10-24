import { describe, expect, it } from 'vitest'
import {
  dropIndexAt,
  fadeClearance,
  scrollLeftToShow,
  tabInStrip,
  visibleEnds,
} from '../../src/ui/routes/toolStrip'

describe('tabInStrip', () => {
  it('measures a tab from the strip, not from the page', () => {
    // The strip starts 23px into the page and has 14px of padding before its
    // first tab, so a tab at 37px is at 0 in the coordinates scrolling uses.
    expect(tabInStrip({ left: 37, width: 90 }, { left: 23, scrollLeft: 0 }, 14)).toEqual({
      left: 0,
      right: 90,
    })
  })

  it('adds the scroll back, so a tab keeps its place in the strip', () => {
    expect(tabInStrip({ left: 337, width: 90 }, { left: 23, scrollLeft: 300 }, 14)).toEqual({
      left: 600,
      right: 690,
    })
  })

  it('agrees with the scroll it feeds: a tab at the end comes fully into view', () => {
    const strip = { left: 23, scrollLeft: 0, clientWidth: 854 }
    const padding = 14
    const box = tabInStrip({ left: 23 + 14 + 1100, width: 72 }, strip, padding)
    const next = scrollLeftToShow(box, {
      scrollLeft: 0,
      clientWidth: 854 - 2 * padding,
    })
    // 72px wide ending at the padded edge, so the strip scrolls 1100 + 72 - 826.
    expect(next).toBe(346)
    expect(box.right - next).toBe(826)
  })
})

describe('dropIndexAt', () => {
  // Three tabs of 100px, end to end from 0, with the strip's gap folded in.
  const tabs = [
    { left: 0, right: 100 },
    { left: 108, right: 208 },
    { left: 216, right: 316 },
  ]

  it('counts a place between tabs, not a tab', () => {
    expect(dropIndexAt(tabs, -20)).toBe(0)
    expect(dropIndexAt(tabs, 20)).toBe(0)
    expect(dropIndexAt(tabs, 120)).toBe(1)
    expect(dropIndexAt(tabs, 260)).toBe(2)
    expect(dropIndexAt(tabs, 900)).toBe(3)
  })

  it('answers each tab for its own middle, so a drop reads as a place', () => {
    // Just inside the left half of a tab is ahead of it; just inside the right
    // half is behind it.
    expect(dropIndexAt(tabs, 49)).toBe(0)
    expect(dropIndexAt(tabs, 51)).toBe(1)
    expect(dropIndexAt(tabs, 157)).toBe(1)
    expect(dropIndexAt(tabs, 159)).toBe(2)
    // A pointer exactly on a middle is the tab's right half, not its left.
    expect(dropIndexAt(tabs, 50)).toBe(1)
  })

  it('has one place to be when nothing is open yet', () => {
    expect(dropIndexAt([], 0)).toBe(0)
    expect(dropIndexAt([], 400)).toBe(0)
  })
})

describe('fadeClearance', () => {
  it('reads the fade the stylesheet declares', () => {
    expect(fadeClearance('2.5rem', 16)).toBe(40)
    expect(fadeClearance(' 40px ', 16)).toBe(40)
  })

  it('uses the browser default when the root size cannot be read', () => {
    expect(fadeClearance('2rem', Number.NaN)).toBe(32)
  })

  it('leaves no clearance when there is no fade to read', () => {
    expect(fadeClearance('', 16)).toBe(0)
    expect(fadeClearance('auto', 16)).toBe(0)
    expect(fadeClearance('0px', 16)).toBe(0)
  })
})

describe('scrollLeftToShow', () => {
  const view = { scrollLeft: 200, clientWidth: 400 }

  it('leaves the strip where it is when the tab is already in view', () => {
    expect(scrollLeftToShow({ left: 220, right: 330 }, view)).toBe(200)
    // A tab that ends exactly at the right edge is in view, not past it.
    expect(scrollLeftToShow({ left: 560, right: 600 }, view)).toBe(200)
  })

  it('brings a tab left of the strip back to its left edge', () => {
    expect(scrollLeftToShow({ left: 120, right: 260 }, view)).toBe(120)
  })

  it('brings a tab past the right edge in by its right edge', () => {
    expect(scrollLeftToShow({ left: 620, right: 700 }, view)).toBe(300)
  })

  it('shows a tab wider than the strip from its left, not from its end', () => {
    // Scrolling to `right - clientWidth` would put the tab's own title off the
    // left edge, which is the one part of a selected tab that has to be read.
    expect(scrollLeftToShow({ left: 40, right: 640 }, view)).toBe(40)
  })

  it('stops the tab clear of the fade at the end it came in by', () => {
    // Endless fading is the affordance; a tab under it is not in view.
    expect(scrollLeftToShow({ left: 620, right: 700 }, view, 40)).toBe(340)
    expect(scrollLeftToShow({ left: 100, right: 220 }, view, 40)).toBe(60)
  })

  it('counts a tab inside the faded edge as one that still has to move', () => {
    expect(scrollLeftToShow({ left: 210, right: 320 }, view, 40)).toBe(170)
    expect(scrollLeftToShow({ left: 240, right: 540 }, view, 40)).toBe(200)
  })
})

describe('visibleEnds', () => {
  it('reports nothing hidden when the tabs fit', () => {
    expect(visibleEnds({ scrollLeft: 0, clientWidth: 500, scrollWidth: 480 })).toBe('none')
  })

  it('reports the end while the strip is at its start and has more to show', () => {
    expect(visibleEnds({ scrollLeft: 0, clientWidth: 500, scrollWidth: 1200 })).toBe('end')
  })

  it('reports the start once the strip has been scrolled along', () => {
    expect(visibleEnds({ scrollLeft: 300, clientWidth: 500, scrollWidth: 800 })).toBe('start')
  })

  it('reports both ends when the strip is somewhere in the middle', () => {
    expect(visibleEnds({ scrollLeft: 300, clientWidth: 500, scrollWidth: 1200 })).toBe('both')
  })

  it('ignores a sub-pixel tail rather than fading an end for nothing', () => {
    expect(visibleEnds({ scrollLeft: 0.5, clientWidth: 500, scrollWidth: 500.5 })).toBe('none')
  })
})
