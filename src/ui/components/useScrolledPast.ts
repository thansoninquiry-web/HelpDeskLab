import { useEffect, useState } from 'react'

/**
 * Whether the page has scrolled past a point, with a gap between entering and
 * leaving it.
 *
 * The gap is the whole point. Collapsing the phone header makes the page about a
 * section row shorter above the content, and the browser compensates by pulling
 * the scroll position up by the same amount. With a single threshold that new
 * position would read as "back at the top", the header would expand, the page
 * would grow, and the scroll position would be pushed back past the threshold —
 * a jitter loop at the moment of collapse. Two thresholds, further apart than a
 * header row can ever be, make each state stable: the compact header stays
 * compact until the learner is genuinely back near the top.
 *
 * The listener is read-only and passive: it never touches the scroll position
 * itself, so it cannot fight the browser's own anchoring or a drag.
 */
export function useScrolledPast(enter: number, leave: number): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const read = () => {
      const offset = window.scrollY
      setScrolled((wasScrolled) => (wasScrolled ? offset > leave : offset > enter))
    }
    // A reload or a restored position starts where the page already is.
    read()
    window.addEventListener('scroll', read, { passive: true })
    return () => window.removeEventListener('scroll', read)
  }, [enter, leave])

  return scrolled
}
