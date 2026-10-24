// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRng, hashSeed, type Rng } from '../../src/domain/shared/rng'
import { scrollLeftToShow, tabInStrip, visibleEnds } from '../../src/ui/routes/toolStrip'

/**
 * The strip's two promises, as properties rather than examples.
 *
 * **No tab rests under the fade.** The strip fades an end that still has tabs
 * behind it, and the tab in front is scrolled clear of that fade — the start of
 * its name is the part a selected tab has to say for itself. The property is
 * stated the way the stylesheet draws it: the fade is a band of `--strip-fade`
 * pixels at the element's own edge, the follow is given the clearance the token
 * converts to, and after it settles the tab in front must not overlap a band
 * that is actually being drawn.
 *
 * **Following the same tab twice never moves the strip.** A follow is a
 * measurement, a sum and a scroll assignment, and it runs again on every resize,
 * reorder, pin and pane change — so a follow that moved the strip each time it
 * ran would make the strip crawl while nothing but the window changed. In this
 * model the second follow is exactly the component's second follow: the tab's
 * page box has moved with the strip, and `tabInStrip` puts it back into the
 * strip's own coordinates, so the box the sum sees is the same and only the
 * scroll position differs — the mistake the offset-based first version made was
 * measuring a box that did not move with the scroll.
 *
 * The cases are random but seeded, so a failure names the seed, the run and the
 * geometry. The coverage counts at the end fail if the corpus has thinned to
 * cases where the promises are true because nothing was tested.
 *
 * The model is the component's arithmetic, kept in step with it: the browser's
 * own clamp on `scrollLeft` is applied here (`[0, scrollWidth - clientWidth]`)
 * because the page assigns the raw number and the browser clamps it, and the
 * ends that are faded are read from `visibleEnds` — the same call the strip
 * makes for `data-overflow`, which is what the stylesheet's mask reads.
 */

/** The fade `tokens.css` declares, and the clearance the component passes. */
const FADE_PX = 40

/** A little slack for fractional layouts; the numbers below are whole pixels. */
const EPSILON = 1e-6

const SEEDS = [5, 23, 71]
const RUNS_PER_SEED = 300

interface Geometry {
  /** Tabs laid end to end from zero, in the strip's own scroll coordinates. */
  scrollWidth: number
  clientWidth: number
  paddingStart: number
  paddingEnd: number
  clearance: number
  /** Where the strip's own box starts on the page — not where its tabs do. */
  stripLeft: number
  /** The tab's place in the strip's scroll coordinates, and its width. */
  tab: { offset: number; width: number }
  scrollLeft: number
  label: string
}

/** One geometry drawn from a seed: a run of tabs, one of them in front. */
function draw(rng: Rng): Geometry {
  const count = rng.int(2, 9)
  const widths = Array.from({ length: count }, () => rng.int(48, 168))
  const offsets: number[] = []
  let total = 0
  for (const width of widths) {
    offsets.push(total)
    total += width
  }

  const paddingStart = rng.int(0, 20)
  const paddingEnd = rng.int(0, 20)
  const clearance = rng.pick([0, 8, 24, FADE_PX, 64])
  const reachable = total + paddingStart + paddingEnd
  // A strip narrower than its own padding is not a strip; below that, any
  // window is real. The narrow end is where the clear window runs out first.
  const clientWidth = rng.int(Math.max(clearance + paddingStart + paddingEnd + 1, 40), Math.max(reachable, 80))
  const scrollWidth = reachable
  const maxScroll = Math.max(0, scrollWidth - clientWidth)
  const scrollLeft = rng.bool(0.2) && maxScroll > 0 ? rng.pick([0, maxScroll]) : rng.int(0, maxScroll)

  const index = rng.int(0, count - 1)
  const offset = offsets[index] ?? 0
  const width = widths[index] ?? 0
  // A strip can sit anywhere on the page, including at its left edge.
  const stripLeft = rng.int(0, 400)

  return {
    scrollWidth,
    clientWidth,
    paddingStart,
    paddingEnd,
    clearance,
    stripLeft,
    tab: { offset, width },
    scrollLeft,
    label: `tab ${index}/${count} at ${offset}..${offset + width}, view ${clientWidth} of ${scrollWidth}, padding ${paddingStart}/${paddingEnd}, clearance ${clearance}, strip at ${stripLeft}, scrolled to ${scrollLeft}`,
  }
}

/**
 * The tab's box on the page at a given scroll — which is what the component
 * measures, and what moves as the strip scrolls under it.
 */
function pageBox(geometry: Geometry, scrollLeft: number): { left: number; width: number } {
  return {
    left: geometry.stripLeft + geometry.paddingStart + geometry.tab.offset - scrollLeft,
    width: geometry.tab.width,
  }
}

/** The same box as `tabInStrip` reads it, in the coordinates scrolling speaks. */
function stripBox(geometry: Geometry, scrollLeft: number) {
  return tabInStrip(
    pageBox(geometry, scrollLeft),
    { left: geometry.stripLeft, scrollLeft },
    geometry.paddingStart,
  )
}

/** One follow: the measurement and sum the component runs, then the clamp. */
function follow(geometry: Geometry, from: number): number {
  const asked = scrollLeftToShow(
    stripBox(geometry, from),
    {
      scrollLeft: from,
      clientWidth: geometry.clientWidth - geometry.paddingStart - geometry.paddingEnd,
    },
    geometry.clearance,
  )
  const maxScroll = Math.max(0, geometry.scrollWidth - geometry.clientWidth)
  return Math.min(maxScroll, Math.max(0, asked))
}

/**
 * The tab's box in the element's coordinates, which is where the mask draws: the
 * padded start is where the strip's scrolling begins, so the padding goes back
 * on — the fade is a band at the element's edge, not at its content.
 */
function onScreen(geometry: Geometry, scrollLeft: number): { left: number; right: number } {
  const left = geometry.paddingStart + stripBox(geometry, scrollLeft).left - scrollLeft
  return { left, right: left + geometry.tab.width }
}

/** Whether the stylesheet is drawing a fade at each end, at this scroll. */
function fadedEnds(geometry: Geometry, scrollLeft: number) {
  return visibleEnds({
    scrollLeft,
    clientWidth: geometry.clientWidth,
    scrollWidth: geometry.scrollWidth,
  })
}

function cases(): { seed: number; index: number; geometry: Geometry }[] {
  const drawn: { seed: number; index: number; geometry: Geometry }[] = []
  for (const seed of SEEDS) {
    const rng = createRng(hashSeed(`tool-strip:${seed}`))
    for (let index = 0; index < RUNS_PER_SEED; index += 1) {
      drawn.push({ seed, index, geometry: draw(rng) })
    }
  }
  return drawn
}

describe('the tool strip, as a property', () => {
  it('never rests the tab in front inside a fade that is being drawn', () => {
    let startFaded = 0
    let endFaded = 0
    let fitting = 0

    for (const { seed, index, geometry } of cases()) {
      const settled = follow(geometry, geometry.scrollLeft)
      const ends = fadedEnds(geometry, settled)
      const clearWidth = geometry.clientWidth - geometry.paddingStart - geometry.paddingEnd
      const box = onScreen(geometry, settled)
      const context = `seed ${seed} · run ${index} · ${geometry.label} · settled at ${settled} · ${ends}`

      if (ends === 'start' || ends === 'both') {
        startFaded += 1
        // Not under the band at the start: the name begins where it can be read.
        expect(box.left, `left edge under the start fade · ${context}`).toBeGreaterThanOrEqual(
          geometry.clearance - EPSILON,
        )
      }

      if (ends === 'end' || ends === 'both') {
        endFaded += 1
        // A tab wider than the clear window cannot clear both edges at once; the
        // rule for it is that its start is on screen, which the left case holds
        // to. Everything that fits must be entirely clear of the end band.
        if (geometry.tab.width <= clearWidth - 2 * geometry.clearance) {
          fitting += 1
          expect(box.right, `right edge under the end fade · ${context}`).toBeLessThanOrEqual(
            geometry.clientWidth - geometry.clearance + EPSILON,
          )
        } else {
          expect(box.left, `a tab too wide to fit has its start off screen · ${context}`).toBeLessThan(
            geometry.clientWidth,
          )
        }
      }

      // The band only exists where there is something behind it, and the follow
      // never claims an end it cannot see.
      if (settled === 0) {
        expect(['none', 'end']).toContain(fadedEnds(geometry, settled))
      }
    }

    // A pass that never faded an end would prove nothing about either promise.
    expect(startFaded).toBeGreaterThan(20)
    expect(endFaded).toBeGreaterThan(20)
    expect(fitting).toBeGreaterThan(20)
  })

  it('does not move the strip when the same tab is followed twice', () => {
    let visitedEveryEnd = 0
    let moved = 0

    for (const { seed, index, geometry } of cases()) {
      const once = follow(geometry, geometry.scrollLeft)
      const twice = follow(geometry, once)
      const context = `seed ${seed} · run ${index} · ${geometry.label} · first ${geometry.scrollLeft} → ${once}, then ${twice}`

      expect(twice, `the strip moved on the second follow · ${context}`).toBe(once)

      const ends = fadedEnds(geometry, once)
      if (ends === 'start' || ends === 'both') visitedEveryEnd += 1
      if (ends === 'end' || ends === 'both') visitedEveryEnd += 1
      if (once !== geometry.scrollLeft) moved += 1
    }

    // Both halves of the promise need cases: follows that move and ends that are
    // faded at the position they settle on.
    expect(moved).toBeGreaterThan(50)
    expect(visitedEveryEnd).toBeGreaterThan(20)
  })

  it('settles without ever scrolling past its own content', () => {
    for (const { seed, index, geometry } of cases()) {
      const settled = follow(geometry, geometry.scrollLeft)
      const maxScroll = Math.max(0, geometry.scrollWidth - geometry.clientWidth)
      expect(settled, `seed ${seed} · run ${index}`).toBeGreaterThanOrEqual(0)
      expect(settled, `seed ${seed} · run ${index}`).toBeLessThanOrEqual(maxScroll)
    }
  })
})
