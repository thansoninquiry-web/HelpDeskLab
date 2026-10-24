import { useCallback, useEffect, useRef, useState } from 'react'
import { getIntuneService } from '../../../app/intuneService'
import type { IntuneService } from '../service'
import type { DeviceAction, IntuneState } from '../types'

export interface IntuneHandle {
  state: IntuneState | null
  error: string | null
  busy: boolean
  /** Runs one action and returns the console's own sentence about it. */
  act: (
    deviceId: string,
    action: DeviceAction,
    options?: { userId?: string },
  ) => Promise<{ summary: string; status: 'applied' | 'refused' | 'failed' } | null>
  /**
   * Records the read step and returns the console's sentence about the record.
   * Nothing on the device changes; the event is what the score reads.
   */
  review: (deviceId: string) => Promise<string | null>
  reset: () => Promise<void>
  reload: () => Promise<void>
  service: IntuneService | null
}

/**
 * One estate per page, reloaded after every action.
 *
 * The pages are all views of the same tables, so a page never keeps its own idea
 * of a device alongside the one an action just wrote.
 */
export function useIntune(): IntuneHandle {
  const [state, setState] = useState<IntuneState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [service, setService] = useState<IntuneService | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getIntuneService()
      .then(async (instance) => {
        const loaded = await instance.load()
        if (!cancelled && live.current) {
          setService(instance)
          setState(loaded)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The Intune estate could not be opened.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    if (!service) {
      return
    }
    setState(await service.load())
  }, [service])

  const act = useCallback<IntuneHandle['act']>(
    async (deviceId, action, options) => {
      if (!service) {
        return null
      }
      setBusy(true)
      try {
        const result = await service.act({ deviceId, action, ...options })
        setState(result.state)
        setError(null)
        return { summary: result.outcome.summary, status: result.outcome.status }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The action could not be applied.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [service],
  )

  const review = useCallback<IntuneHandle['review']>(
    async (deviceId) => {
      if (!service) {
        return null
      }
      setBusy(true)
      try {
        const result = await service.review(deviceId)
        setState(result.state)
        setError(null)
        return result.summary
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The record could not be read.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [service],
  )

  const reset = useCallback(async () => {
    if (!service) {
      return
    }
    setBusy(true)
    try {
      setState(await service.reset())
      setError(null)
    } finally {
      setBusy(false)
    }
  }, [service])

  return { state, error, busy, act, review, reset, reload, service }
}

/** `3 days ago`, which is how a console says a device has been quiet. */
export function relativeTime(at: number | null, now = Date.now()): string {
  if (at === null) {
    return 'never'
  }
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours} h ago`
  }
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
