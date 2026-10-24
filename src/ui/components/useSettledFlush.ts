import { useEffect } from 'react'
import { useFlushOnHide } from './useFlushOnHide'

/**
 * Runs `flush` once a value has come to rest, and again at the moments a page
 * stops running: hidden, unloaded, or unmounted.
 *
 * Both dividers in the workspace are written this way — a drag makes a position
 * per pointer move and a held key one per repeat, and only where the divider comes
 * to rest is worth a row. `value` is a dependency rather than something this hook
 * compares, so each page keeps its own "is it worth a write" rule inside `flush`,
 * where the state it needs already is: a divider still where it was stored costs
 * nothing but a timer that does nothing.
 *
 * `resting` false holds the timer off entirely — a divider under the pointer is
 * not at rest, and its journey is not a decision. `value` may be null for a
 * setting that has none: an untouched edge is not a position, and its flush is
 * what decides there is nothing to write.
 */
export function useSettledFlush(
  flush: () => unknown,
  options: { value: number | null; resting: boolean; delayMs: number },
): void {
  const { value, resting, delayMs } = options

  useEffect(() => {
    if (!resting) {
      return
    }
    const timer = setTimeout(() => void flush(), delayMs)
    return () => clearTimeout(timer)
  }, [flush, value, resting, delayMs])

  // A timer is only as safe as the page it runs on: a reload or a tab close gives
  // no warning, and neither does leaving the route.
  useFlushOnHide(flush)
  useEffect(() => () => void flush(), [flush])
}
