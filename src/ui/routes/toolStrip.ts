/**
 * The two sums the open-tool strip does about its own width, kept out of the
 * component so they can be tested without a layout engine. Every element in
 * jsdom is zero-width, and the strip's behaviour is precisely the part that
 * depends on widths, so what can be tested here is tested here.
 */

/** The ends of the strip that still have tabs behind them. */
export type StripEnds = 'none' | 'start' | 'end' | 'both'

/** How close to an edge counts as being at it, in pixels. */
const EDGE_SLACK = 1

/**
 * Where a tab sits in the strip's own coordinates, which is what scrolling
 * speaks in. The strip pads its two ends, so the first tab does not start at
 * zero, and a measurement taken against anything but the strip itself — an
 * offset from whichever ancestor happens to be positioned — is off by the
 * strip's place on the page. Both mistakes leave the tab in front ending under
 * the fade, so the conversion happens here, once, where it can be tested.
 */
export function tabInStrip(
  tab: { left: number; width: number },
  strip: { left: number; scrollLeft: number },
  paddingStart: number,
): { left: number; right: number } {
  const left = tab.left - strip.left - paddingStart + strip.scrollLeft
  return { left, right: left + tab.width }
}

/**
 * How wide the fade at each end of the strip is, in pixels. The stylesheet draws
 * it and owns the figure, so the script only converts what it reads back — and
 * the tab in front can stop clear of the fade instead of ending under it, which
 * is where the start of its name is.
 */
export function fadeClearance(fade: string, rootFontSize: number): number {
  const size = Number.parseFloat(fade)
  if (!Number.isFinite(size) || size <= 0) {
    return 0
  }
  if (fade.trim().endsWith('px')) {
    return size
  }
  if (fade.trim().endsWith('rem')) {
    return size * (rootFontSize > 0 ? rootFontSize : 16)
  }
  return 0
}

/**
 * Where the strip has to scroll for one tab to be in view: not at all while it
 * is already inside, otherwise just far enough to bring the nearer edge in. A tab
 * wider than the strip — a long console name on a narrow card — is shown from its
 * left, because that is where its title starts and what a selected tab has to
 * say for itself. The clearance is the fade at each end: a tab brought in by an
 * edge that is still fading out has not really been brought into view.
 */
export function scrollLeftToShow(
  tab: { left: number; right: number },
  view: { scrollLeft: number; clientWidth: number },
  clearance = 0,
): number {
  if (tab.left < view.scrollLeft + clearance) {
    return Math.max(0, tab.left - clearance)
  }
  if (tab.right > view.scrollLeft + view.clientWidth - clearance) {
    return Math.max(0, Math.min(tab.left - clearance, tab.right - view.clientWidth + clearance))
  }
  return view.scrollLeft
}

/**
 * Where a pointer over the strip asks a tab to go, counted as a place between
 * tabs rather than a tab: 0 is ahead of the first, `tabs.length` past the last.
 * Each tab answers for its own middle, so a pointer in the left half of a tab
 * lands ahead of it and in the right half lands behind it — which is what makes
 * a drop read as "here" rather than as "on this one". A pointer past the end of
 * the row, or over the strip's padding, is the end of the strip.
 */
export function dropIndexAt(tabs: readonly { left: number; right: number }[], x: number): number {
  let index = 0
  for (const tab of tabs) {
    if (x < tab.left + (tab.right - tab.left) / 2) {
      break
    }
    index += 1
  }
  return index
}

/** Which ends of the strip are showing less than everything they hold. */
export function visibleEnds(view: {
  scrollLeft: number
  clientWidth: number
  scrollWidth: number
}): StripEnds {
  const start = view.scrollLeft > EDGE_SLACK
  const end = view.scrollLeft + view.clientWidth < view.scrollWidth - EDGE_SLACK
  if (start && end) {
    return 'both'
  }
  if (start) {
    return 'start'
  }
  return end ? 'end' : 'none'
}
