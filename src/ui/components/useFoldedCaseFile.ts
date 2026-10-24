import { useEffect, useState } from 'react'

/**
 * Whether the window folds the case file into disclosures.
 *
 * Two windows do, and they fold it for the same reason: the paperwork is read
 * through a letterbox, so a list of sections is the shorter road to the machine.
 *
 * - **A phone**, where the console is docked at the bottom of the screen and the
 *   case file is four screens of sections the learner has to scroll behind it.
 * - **A short landscape window**, where the case file keeps a 361px column beside
 *   the dock: the column is too narrow for the sections to be read at a glance,
 *   and unfolded the page runs past three thousand pixels for one ticket. Folded,
 *   the column is a list of what the paperwork holds, and the section being
 *   worked on is the only one that is open.
 *
 * The fold cannot be done in CSS — a folded section and an unfolded one are
 * different document trees, not different styles — so these breakpoints are read
 * here as well, and `tests/ui/workspaceNarrow.test.ts` reads them back out of the
 * stylesheet so the two cannot drift apart. Both are the stylesheet's own queries:
 * `PHONE_LAYOUT_QUERY` is the bottom dock's, `SHORT_LAYOUT_QUERY` the side dock's.
 */

/** The phone breakpoint, spelled the way `matchMedia` wants it. */
export const PHONE_LAYOUT_QUERY = '(max-width: 600px)'

/**
 * The short-window breakpoint: a window shorter than a phone's bottom dock needs,
 * which the stylesheet answers with the side dock instead.
 */
export const SHORT_LAYOUT_QUERY = '(max-height: 480px) and (min-width: 481px)'

/** Every window whose case file folds. */
export const FOLDED_LAYOUT_QUERIES = [PHONE_LAYOUT_QUERY, SHORT_LAYOUT_QUERY] as const

/** A browser that predates `addEventListener` on a media query list. */
interface LegacyMediaQueryList {
  addListener?: (listener: () => void) => void
  removeListener?: (listener: () => void) => void
}

function foldedNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return FOLDED_LAYOUT_QUERIES.some((query) => window.matchMedia(query).matches)
}

export function useFoldedCaseFile(): boolean {
  const [folded, setFolded] = useState(foldedNow)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const queries = FOLDED_LAYOUT_QUERIES.map((query) => window.matchMedia(query))
    const onChange = () => setFolded(queries.some((query) => query.matches))
    // The window may have changed between the first render and this effect, so the
    // queries are read once on the way in rather than waiting for the next flip.
    onChange()

    const undos = queries.map((query) => {
      const legacy = query as MediaQueryList & LegacyMediaQueryList
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', onChange)
        return () => query.removeEventListener('change', onChange)
      }
      legacy.addListener?.(onChange)
      return () => legacy.removeListener?.(onChange)
    })

    return () => {
      for (const undo of undos) undo()
    }
  }, [])

  return folded
}
