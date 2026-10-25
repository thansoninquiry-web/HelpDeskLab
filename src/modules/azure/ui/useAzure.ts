import { useCallback, useEffect, useRef, useState } from 'react'
import { getAzureService } from '../../../app/azureService'
import type { AzureService } from '../service'
import type { AzureState, ResourceAction, RoleName } from '../types'

export interface ActOptions {
  port?: number
  principal?: string
  role?: RoleName
}

export interface AzureHandle {
  state: AzureState | null
  error: string | null
  busy: boolean
  /** Runs one action and returns the console's own sentence about it. */
  act: (
    resourceId: string,
    action: ResourceAction,
    options?: ActOptions,
  ) => Promise<{ summary: string; status: 'applied' | 'refused' | 'failed' } | null>
  /**
   * Records the read step and returns the console's sentence about the record.
   * Nothing on the resource changes; the event is what the score reads.
   */
  review: (resourceId: string) => Promise<string | null>
  reset: () => Promise<void>
  reload: () => Promise<void>
  service: AzureService | null
}

/**
 * One estate per page, reloaded after every action.
 *
 * The pages are all views of the same tables, so a page never keeps its own idea
 * of a resource alongside the one an action just wrote.
 */
export function useAzure(): AzureHandle {
  const [state, setState] = useState<AzureState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [service, setService] = useState<AzureService | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getAzureService()
      .then(async (instance) => {
        const loaded = await instance.load()
        if (!cancelled && live.current) {
          setService(instance)
          setState(loaded)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The Azure estate could not be opened.')
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

  const act = useCallback<AzureHandle['act']>(
    async (resourceId, action, options) => {
      if (!service) {
        return null
      }
      setBusy(true)
      try {
        const result = await service.act({ resourceId, action, ...options })
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

  const review = useCallback<AzureHandle['review']>(
    async (resourceId) => {
      if (!service) {
        return null
      }
      setBusy(true)
      try {
        const result = await service.review(resourceId)
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

/** `3 days ago`, which is how a console says when a record last changed. */
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
