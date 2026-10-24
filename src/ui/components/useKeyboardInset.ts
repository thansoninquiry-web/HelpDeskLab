import { useCallback, useEffect, useState, type RefCallback } from 'react'

/**
 * How much of the window an on-screen keyboard is covering, in CSS pixels.
 *
 * The docked console is positioned against the layout viewport, but a phone's
 * keyboard shrinks the *visual* viewport and floats over the bottom of the
 * layout one — so a card pinned to `bottom: 0` ends up underneath the keys, with
 * the command line under the thumb rather than above it. The visual viewport is
 * the only thing that knows: its height plus its scroll offset is where the
 * visible area ends, and everything below that is keyboard.
 *
 * Measured rather than assumed: `window.innerHeight` is the layout viewport, and
 * subtracting the visual viewport's own extent leaves the covered strip. A
 * browser that resizes the layout viewport for the keyboard (or a desktop with
 * no keyboard at all) measures zero, and the CSS fallback is the old bottom
 * edge.
 */
export function keyboardInsetFrom(
  innerHeight: number,
  viewport: { height: number; offsetTop: number } | null | undefined,
): number {
  if (!viewport) {
    return 0
  }
  return Math.max(0, Math.round(innerHeight - (viewport.height + viewport.offsetTop)))
}

/**
 * Attach to the element the docked console sits inside; it writes the covered
 * strip there as `--keyboard-inset`, which the card inherits.
 *
 * The property is written straight to the element rather than held in state: the
 * visual viewport fires on every pixel of the keyboard's animation and of a page
 * scrolled under it, and this hook lives on the workspace, which is a page-sized
 * component. A state update per event would re-render the whole ticket, while a
 * custom property only costs a style recalc. React never writes the element's
 * `style` here, so the value it sets is left alone on re-render.
 *
 * Returned as a callback ref rather than a ref object because the workspace only
 * renders its root once the ticket has loaded: a one-shot effect on mount would
 * find nothing to attach to and never run again.
 */
export function useKeyboardInsetRef<T extends HTMLElement>(): RefCallback<T> {
  const [element, setElement] = useState<T | null>(null)
  const setNode = useCallback((node: T | null) => setElement(node), [])

  useEffect(() => {
    if (!element) {
      return
    }
    const apply = () => {
      const inset = keyboardInsetFrom(window.innerHeight, window.visualViewport)
      element.style.setProperty('--keyboard-inset', `${inset}px`)
    }
    const viewport = window.visualViewport
    if (!viewport) {
      // No visual viewport to follow: the plain bottom edge is the answer, and
      // the property still has to say so.
      apply()
      return
    }
    // The keyboard may already be open on the way in, so read once rather than
    // waiting for the next event.
    apply()
    // Both events matter: the keyboard opening is a resize, and a page scrolled
    // under it is a scroll that moves where the visible area ends.
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
    }
  }, [element])

  return setNode
}
