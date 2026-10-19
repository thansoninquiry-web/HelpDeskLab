import { useEffect } from 'react'

/**
 * Runs `flush` at the moments the page stops running: `pagehide` (a reload, a
 * tab close, a navigation away) and a `visibilitychange` that hides the
 * document (a phone backgrounding the app, a switch to another tab).
 *
 * Anything a page holds in a timer is only as safe as that timer. A draft saved
 * on a debounce is not saved at all if the tab is killed, and a blur is no help
 * there — nothing fires when the browser takes the page away. These two events
 * are the last chance to write, so the pending work has to run here.
 *
 * Nothing can be awaited inside them, so `flush` is fire-and-forget: it returns
 * a promise the browser will not wait for, and it has to handle its own errors.
 */
export function useFlushOnHide(flush: () => unknown): void {
  useEffect(() => {
    const onPageHide = () => {
      void flush()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flush()
      }
    }

    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [flush])
}
