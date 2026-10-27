import { useCallback, useEffect, useRef, useState } from 'react'
import { getAcademyService } from '../../../app/academyService'
import type { AcademyService, OpenResult, ScoreResult, WriteResult } from '../service'
import type { AcademyMode, ChangeId, ChecklistId, ReadId } from '../types'

export interface VisitHandle {
  data: OpenResult | null
  error: string | null
  busy: boolean
  message: string | null
  read: (id: ReadId) => Promise<void>
  change: (id: ChangeId) => Promise<void>
  answer: (nodeId: string, optionId: string) => Promise<void>
  triage: (optionId: string) => Promise<void>
  tick: (item: ChecklistId, note?: string) => Promise<void>
  setMode: (mode: AcademyMode) => Promise<void>
  check: () => Promise<ScoreResult | null>
  restart: (mode: AcademyMode) => Promise<void>
}

/**
 * One visit, resumed if it is still open.
 *
 * Every write returns the attempt it produced, and the page takes that answer
 * rather than recomputing one of its own — two copies of one visit drift.
 */
export function useVisit(scenarioId: string, mode: AcademyMode = 'standard'): VisitHandle {
  const [data, setData] = useState<OpenResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [service, setService] = useState<AcademyService | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getAcademyService()
      .then(async (instance) => {
        const opened = await instance.open(scenarioId, mode)
        if (!cancelled && live.current) {
          setService(instance)
          setData(opened)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The school desk could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [scenarioId, mode])

  const write = useCallback(
    async (operation: (instance: AcademyService, attemptId: string) => Promise<WriteResult>) => {
      if (!service || !data) {
        return
      }
      setBusy(true)
      try {
        const result = await operation(service, data.attempt.id)
        setData((current) => (current ? { ...current, attempt: result.attempt } : current))
        setMessage(result.summary)
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The desk could not save that.')
      } finally {
        setBusy(false)
      }
    },
    [service, data],
  )

  const read = useCallback(
    (id: ReadId) => write((instance, attemptId) => instance.recordRead(attemptId, id)),
    [write],
  )
  const change = useCallback(
    (id: ChangeId) => write((instance, attemptId) => instance.applyChange(attemptId, id)),
    [write],
  )
  const answer = useCallback(
    (nodeId: string, optionId: string) =>
      write((instance, attemptId) => instance.answer(attemptId, nodeId, optionId)),
    [write],
  )
  const triage = useCallback(
    (optionId: string) => write((instance, attemptId) => instance.triage(attemptId, optionId)),
    [write],
  )
  const setMode = useCallback(
    (next: AcademyMode) => write((instance, attemptId) => instance.setMode(attemptId, next)),
    [write],
  )

  const tick = useCallback(
    async (item: ChecklistId, note?: string) => {
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

  const check = useCallback<VisitHandle['check']>(async () => {
    if (!service || !data) {
      return null
    }
    setBusy(true)
    try {
      const result = await service.score(data.attempt.id)
      setData((current) =>
        current ? { ...current, attempt: result.attempt, score: result.score } : current,
      )
      setError(null)
      return result
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The visit could not be scored.')
      return null
    } finally {
      setBusy(false)
    }
  }, [service, data])

  const restart = useCallback(
    async (next: AcademyMode) => {
      if (!service) {
        return
      }
      setBusy(true)
      try {
        setData(await service.restart(scenarioId, next))
        setMessage(null)
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'A new visit could not be started.')
      } finally {
        setBusy(false)
      }
    },
    [service, scenarioId],
  )

  return {
    data,
    error,
    busy,
    message,
    read,
    change,
    answer,
    triage,
    tick,
    setMode,
    check,
    restart,
  }
}

export interface VisitBest {
  scenarioId: string
  bestScore: number
  attempts: number
  passed: boolean
}

/** Best score per scenario, read once for the queue. */
export function useVisitList(): {
  best: Readonly<Record<string, VisitBest>>
  error: string | null
  loading: boolean
} {
  const [best, setBest] = useState<Record<string, VisitBest>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getAcademyService()
      .then(async (service) => {
        const attempts = await service.attempts()
        const next: Record<string, VisitBest> = {}
        for (const attempt of attempts) {
          const current = next[attempt.scenarioId] ?? {
            scenarioId: attempt.scenarioId,
            bestScore: 0,
            attempts: 0,
            passed: false,
          }
          next[attempt.scenarioId] = {
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
          setError(cause instanceof Error ? cause.message : 'The visits could not be read.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { best, error, loading }
}
