import { useCallback, useEffect, useRef, useState } from 'react'
import { getLanguageService } from '../../../app/languageService'
import type { LanguageService } from '../service'
import type {
  LanguageOverview,
  PracticeOutcome,
  TrackId,
  TrackView,
} from '../types'

export interface OverviewHandle {
  overview: LanguageOverview | null
  error: string | null
}

export function useLanguageOverview(): OverviewHandle {
  const [overview, setOverview] = useState<LanguageOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getLanguageService()
      .then((service) => service.overview())
      .then((loaded) => {
        if (!cancelled) setOverview(loaded)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'The language tracks could not be opened.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { overview, error }
}

export interface TrackHandle {
  view: TrackView | null
  notFound: boolean
  error: string | null
  busy: boolean
  markRead: (lessonId: string, read: boolean) => Promise<void>
  submit: (itemId: string, choice: string) => Promise<PracticeOutcome | null>
  reload: () => Promise<void>
}

export function useLanguageTrack(trackId: string | undefined): TrackHandle {
  const [view, setView] = useState<TrackView | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const serviceRef = useRef<LanguageService | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    if (!trackId) return
    let cancelled = false
    getLanguageService()
      .then(async (service) => {
        serviceRef.current = service
        const loaded = await service.track(trackId)
        if (cancelled) return
        if (!loaded) {
          setMissing(trackId)
          return
        }
        setView(loaded)
        setMissing(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'This track could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [trackId])

  const reload = useCallback(async () => {
    if (!trackId) return
    const service = serviceRef.current ?? (await getLanguageService())
    serviceRef.current = service
    const loaded = await service.track(trackId)
    if (loaded) setView(loaded)
  }, [trackId])

  const markRead = useCallback(
    async (lessonId: string, read: boolean) => {
      if (!trackId) return
      const service = serviceRef.current ?? (await getLanguageService())
      serviceRef.current = service
      try {
        await service.setLessonRead(trackId as TrackId, lessonId, read)
        await reload()
      } catch (cause) {
        if (live.current) {
          setError(cause instanceof Error ? cause.message : 'The lesson mark could not be saved.')
        }
      }
    },
    [trackId, reload],
  )

  const submit = useCallback(
    async (itemId: string, choice: string) => {
      if (!trackId) return null
      const service = serviceRef.current ?? (await getLanguageService())
      serviceRef.current = service
      setBusy(true)
      try {
        const outcome = await service.submit({ trackId: trackId as TrackId, itemId, choice })
        await reload()
        setError(null)
        return outcome
      } catch (cause) {
        if (live.current) {
          setError(cause instanceof Error ? cause.message : 'The answer could not be saved.')
        }
        return null
      } finally {
        if (live.current) setBusy(false)
      }
    },
    [trackId, reload],
  )

  // A view from the previous track must not be shown under a new address while
  // the next read lands.
  const current = view && view.track.id === trackId ? view : null

  return {
    view: current,
    notFound: trackId === undefined || missing === trackId,
    error,
    busy,
    markRead,
    submit,
    reload,
  }
}

/** `12 Oct`, the way the rest of the lab dates a mark. */
export function formatDay(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
