import { useCallback, useEffect, useRef, useState } from 'react'
import { getDesktopService } from '../../../app/desktopService'
import type { ChangeResult, OpenResult, ScoreResult } from '../service'
import type { DesktopService } from '../service'
import type { CheckId, ChecklistId, FixId } from '../types'

export interface CaseHandle {
  data: OpenResult | null
  error: string | null
  busy: boolean
  recordCheck: (check: CheckId, on: string) => Promise<boolean>
  applyFix: (fix: FixId) => Promise<ChangeResult | null>
  tick: (item: ChecklistId, note?: string) => Promise<void>
  check: () => Promise<ScoreResult | null>
  restart: () => Promise<void>
  service: DesktopService | null
}

/**
 * One case, resumed if it is still open.
 *
 * Every write returns the attempt and the machine it produced, and the page
 * takes that answer rather than recomputing one of its own — two copies of one
 * machine drift.
 */
export function useCase(caseId: string): CaseHandle {
  const [data, setData] = useState<OpenResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [service, setService] = useState<DesktopService | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getDesktopService()
      .then(async (instance) => {
        const opened = await instance.open(caseId)
        if (!cancelled && live.current) {
          setService(instance)
          setData(opened)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The bench could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [caseId])

  const recordCheck = useCallback<CaseHandle['recordCheck']>(
    async (check, on) => {
      if (!service || !data) {
        return false
      }
      try {
        const attempt = await service.recordCheck(data.attempt.id, check, on)
        if (attempt) {
          setData((current) => (current ? { ...current, attempt } : current))
        }
        setError(null)
        return true
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The read could not be recorded.')
        return false
      }
    },
    [service, data],
  )

  const applyFix = useCallback<CaseHandle['applyFix']>(
    async (fix) => {
      if (!service || !data) {
        return null
      }
      setBusy(true)
      try {
        const result = await service.applyFix(data.attempt.id, fix)
        setData((current) =>
          current ? { ...current, attempt: result.attempt, estate: result.estate } : current,
        )
        setError(null)
        return result
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The change could not be applied.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [service, data],
  )

  const tick = useCallback<CaseHandle['tick']>(
    async (item, note) => {
      if (!service || !data) {
        return
      }
      try {
        const attempt = await service.tickChecklist(data.attempt.id, item, note)
        if (attempt) {
          setData((current) => (current ? { ...current, attempt } : current))
        }
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The checklist could not be saved.')
      }
    },
    [service, data],
  )

  const check = useCallback<CaseHandle['check']>(async () => {
    if (!service || !data) {
      return null
    }
    setBusy(true)
    try {
      const result = await service.score(data.attempt.id)
      setData((current) =>
        current
          ? {
              ...current,
              attempt: result.attempt,
              estate: result.estate,
              score: result.score,
            }
          : current,
      )
      setError(null)
      return result
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The attempt could not be scored.')
      return null
    } finally {
      setBusy(false)
    }
  }, [service, data])

  const restart = useCallback(async () => {
    if (!service) {
      return
    }
    setBusy(true)
    try {
      setData(await service.restart(caseId))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A new attempt could not be started.')
    } finally {
      setBusy(false)
    }
  }, [service, caseId])

  return { data, error, busy, recordCheck, applyFix, tick, check, restart, service }
}

export interface CaseBest {
  caseId: string
  bestScore: number
  attempts: number
  passed: boolean
}

/** Best score per case, read once for the queue. */
export function useCaseList(): {
  best: Readonly<Record<string, CaseBest>>
  error: string | null
  loading: boolean
} {
  const [best, setBest] = useState<Record<string, CaseBest>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getDesktopService()
      .then(async (service) => {
        const attempts = await service.attempts()
        const next: Record<string, CaseBest> = {}
        for (const attempt of attempts) {
          const current = next[attempt.caseId] ?? {
            caseId: attempt.caseId,
            bestScore: 0,
            attempts: 0,
            passed: false,
          }
          next[attempt.caseId] = {
            ...current,
            bestScore: Math.max(current.bestScore, attempt.score ?? 0),
            attempts: current.attempts + 1,
            passed: current.passed || (attempt.score ?? 0) >= 75,
          }
        }
        if (!cancelled) {
          setBest(next)
          setLoading(false)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The attempts could not be read.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { best, error, loading }
}
