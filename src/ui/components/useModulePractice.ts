import { useState } from 'react'
import { useNavigate } from 'react-router'
import { startModulePractice } from '../../app/practiceService'

/**
 * Starts the ticket a module's Practice entry point opens and sends the learner
 * to it. The dashboard and the lesson page both use this, so “practice this
 * module” means the same ticket — and the same pinned variant — wherever it is
 * pressed. The module's lesson supplies the choice; this hook only runs it.
 */
export function useModulePractice() {
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async (moduleId: string) => {
    setBusyId(moduleId)
    setError(null)
    try {
      const workspace = await startModulePractice(moduleId)
      navigate(`/ticket/${workspace.sessionId}`)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'A practice ticket could not be started.',
      )
      setBusyId(null)
    }
  }

  return { start, busyId, error }
}
