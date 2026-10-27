import { useCallback, useEffect, useRef, useState } from 'react'
import { getNetlabService } from '../../../app/netlabService'
import type { ChangeResult, OpenResult, ScoreResult } from '../service'
import type { NetlabService } from '../service'
import type { ConceptReadRecord, QuizAnswerRecord } from '../persistence/store'
import type { CheckId, FixId } from '../types'

export interface IncidentHandle {
  data: OpenResult | null
  error: string | null
  busy: boolean
  /** Records a read and returns the check's label, or null if it could not. */
  recordCheck: (check: CheckId, deviceId: string) => Promise<string | null>
  applyFix: (fix: FixId) => Promise<ChangeResult | null>
  check: () => Promise<ScoreResult | null>
  restart: () => Promise<void>
  service: NetlabService | null
}

/**
 * One incident, resumed if it is still open.
 *
 * Every write returns the attempt and the estate it produced, and the page takes
 * that answer rather than recomputing one of its own — the same rule the admin
 * consoles follow, for the same reason: two copies of one estate drift.
 */
export function useIncident(incidentId: string): IncidentHandle {
  const [data, setData] = useState<OpenResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [service, setService] = useState<NetlabService | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getNetlabService()
      .then(async (instance) => {
        const opened = await instance.open(incidentId)
        if (!cancelled && live.current) {
          setService(instance)
          setData(opened)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'The networking lab could not be opened.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [incidentId])

  const recordCheck = useCallback<IncidentHandle['recordCheck']>(
    async (check, deviceId) => {
      if (!service || !data) {
        return null
      }
      try {
        const attempt = await service.recordCheck(data.attempt.id, check, deviceId)
        if (attempt) {
          setData((current) => (current ? { ...current, attempt } : current))
        }
        setError(null)
        return check
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The read could not be recorded.')
        return null
      }
    },
    [service, data],
  )

  const applyFix = useCallback<IncidentHandle['applyFix']>(
    async (fix) => {
      if (!service || !data) {
        return null
      }
      setBusy(true)
      try {
        const result = await service.applyFix(data.attempt.id, fix)
        setData((current) =>
          current
            ? { ...current, attempt: result.attempt, estate: result.estate }
            : current,
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

  const check = useCallback<IncidentHandle['check']>(async () => {
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
      setData(await service.restart(incidentId))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A new attempt could not be started.')
    } finally {
      setBusy(false)
    }
  }, [service, incidentId])

  return { data, error, busy, recordCheck, applyFix, check, restart, service }
}

export interface IncidentBest {
  incidentId: string
  bestScore: number
  attempts: number
  passed: boolean
}

/** Best score per incident, read once for the queue. */
export function useIncidentList(): {
  best: Readonly<Record<string, IncidentBest>>
  error: string | null
  loading: boolean
} {
  const [best, setBest] = useState<Record<string, IncidentBest>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getNetlabService()
      .then(async (service) => {
        const attempts = await service.attempts()
        const next: Record<string, IncidentBest> = {}
        for (const attempt of attempts) {
          const current = next[attempt.incidentId] ?? {
            incidentId: attempt.incidentId,
            bestScore: 0,
            attempts: 0,
            passed: false,
          }
          next[attempt.incidentId] = {
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

export interface ConceptsHandle {
  answers: readonly QuizAnswerRecord[]
  reads: readonly ConceptReadRecord[]
  error: string | null
  answer: (conceptId: string, questionId: string, choice: string) => Promise<boolean | null>
  markRead: (conceptId: string) => Promise<void>
}

/** The quiz and the read marks, loaded once and updated as they are answered. */
export function useConcepts(): ConceptsHandle {
  const [answers, setAnswers] = useState<QuizAnswerRecord[]>([])
  const [reads, setReads] = useState<ConceptReadRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getNetlabService()
      .then(async (service) => {
        const [loadedAnswers, loadedReads] = await Promise.all([
          service.quizAnswers(),
          service.conceptReads(),
        ])
        if (!cancelled) {
          setAnswers([...loadedAnswers])
          setReads([...loadedReads])
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The concepts could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const answer = useCallback(async (conceptId: string, questionId: string, choice: string) => {
    try {
      const service = await getNetlabService()
      const result = await service.answer(conceptId, questionId, choice)
      setAnswers((current) => {
        const rest = current.filter(
          (entry) => !(entry.conceptId === conceptId && entry.questionId === questionId),
        )
        return [
          ...rest,
          {
            conceptId,
            questionId,
            choice,
            correct: result.correct,
            answeredAt: Date.now(),
          },
        ]
      })
      setError(null)
      return result.correct
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The answer could not be saved.')
      return null
    }
  }, [])

  const markRead = useCallback(async (conceptId: string) => {
    try {
      const service = await getNetlabService()
      await service.markConceptRead(conceptId)
      setReads((current) => [
        ...current.filter((entry) => entry.conceptId !== conceptId),
        { conceptId, readAt: Date.now() },
      ])
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The card could not be marked read.')
    }
  }, [])

  return { answers, reads, error, answer, markRead }
}
