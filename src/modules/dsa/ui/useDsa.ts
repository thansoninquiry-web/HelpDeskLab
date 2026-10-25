import { useCallback, useEffect, useRef, useState } from 'react'
import { getDsaService } from '../../../app/dsaService'
import type { DsaService } from '../service'
import type { DsaOutcome, DsaOverview, DsaProblemView } from '../types'

const DRAFT_SAVE_MS = 500

export interface DsaOverviewHandle {
  overview: DsaOverview | null
  error: string | null
}

/** The library: one read, because solved state is folded from the whole table. */
export function useDsaOverview(): DsaOverviewHandle {
  const [overview, setOverview] = useState<DsaOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getDsaService()
      .then((service) => service.overview())
      .then((loaded) => {
        if (!cancelled) setOverview(loaded)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The problem bank could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { overview, error }
}

export interface DsaProblemHandle {
  view: DsaProblemView | null
  notFound: boolean
  error: string | null
  busy: boolean
  /** Set after an autosave succeeds, so the editor can say the draft is safe. */
  savedAt: number | null
  saveDraft: (code: string) => void
  submit: (
    patternChoice: string,
    edgeChoice: string,
    hintsUsed: number,
    code: string,
  ) => Promise<DsaOutcome | null>
  reload: () => Promise<void>
}

/**
 * One problem plus its draft and attempts.
 *
 * The draft is written on a short debounce rather than per keystroke, and the
 * last unsaved keystrokes are flushed on unmount: a page that closes mid-word
 * must not lose the paragraph the learner was in the middle of.
 */
export function useDsaProblem(id: string | undefined): DsaProblemHandle {
  const [view, setView] = useState<DsaProblemView | null>(null)
  const [missingId, setMissingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const serviceRef = useRef<DsaService | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    if (!id) {
      return
    }
    let cancelled = false
    getDsaService()
      .then(async (service) => {
        serviceRef.current = service
        const loaded = await service.problem(id)
        if (cancelled) return
        if (!loaded) {
          setMissingId(id)
          return
        }
        setView(loaded)
        setMissingId(null)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'This problem could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Flush the last keystrokes even when the page is left before the debounce.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      const code = pending.current
      pending.current = null
      if (code !== null && id && serviceRef.current) {
        void serviceRef.current.saveDraft(id, code).catch(() => undefined)
      }
    }
  }, [id])

  const saveDraft = useCallback(
    (code: string) => {
      if (!id) return
      pending.current = code
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        const latest = pending.current
        pending.current = null
        if (latest === null || !serviceRef.current) return
        const active = serviceRef.current
        void active
          .saveDraft(id, latest)
          .then(() => {
            if (live.current) setSavedAt(Date.now())
          })
          .catch((cause: unknown) => {
            if (live.current) {
              setError(cause instanceof Error ? cause.message : 'The draft could not be saved.')
            }
          })
      }, DRAFT_SAVE_MS)
    },
    [id],
  )

  const reload = useCallback(async () => {
    if (!id) return
    const service = serviceRef.current ?? (await getDsaService())
    serviceRef.current = service
    const loaded = await service.problem(id)
    if (loaded) setView(loaded)
  }, [id])

  const submit = useCallback<DsaProblemHandle['submit']>(
    async (patternChoice, edgeChoice, hintsUsed, code) => {
      if (!id) return null
      const service = serviceRef.current ?? (await getDsaService())
      serviceRef.current = service
      setBusy(true)
      try {
        const outcome = await service.submit({
          problemId: id,
          patternChoice,
          edgeChoice,
          hintsUsed,
          code: code.length > 0 ? code : null,
        })
        const loaded = await service.problem(id)
        if (loaded) setView(loaded)
        setError(null)
        return outcome
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The attempt could not be saved.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [id],
  )

  // A view from the previous problem is not this problem's view: the route can
  // change in place, and until the new read lands the page shows its loading
  // state rather than the last problem under a new address.
  const current = view && view.problem.id === id ? view : null

  return {
    view: current,
    notFound: id === undefined || missingId === id,
    error,
    busy,
    savedAt,
    saveDraft,
    submit,
    reload,
  }
}

/** `12 Oct`, the way the rest of the lab dates an attempt. */
export function formatDay(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
