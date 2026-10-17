import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  createTickets,
  findActiveSessionId,
  loadQueue,
  startAttempt,
  type TicketView,
} from '../../app/practiceService'
import { PageHeader } from '../components/PageHeader'
import styles from './practice.module.css'

const SEVERITY_LABELS: Record<TicketView['severity'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const STATUS_LABELS: Record<TicketView['status'], string> = {
  available: 'Queued',
  in_progress: 'In progress',
  completed: 'Closed',
}

const FAMILY_LABELS: Record<string, string> = {
  'PWD-01': 'Accounts',
  'NET-01': 'Network',
  'DHCP-01': 'DHCP',
  'M365-01': 'Microsoft 365',
  'FS-01': 'File shares',
  'PRN-01': 'Printing',
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PracticePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const familyFilter = searchParams.get('family')
  const focusTitle = familyFilter ? (FAMILY_LABELS[familyFilter] ?? familyFilter) : null
  const [tickets, setTickets] = useState<TicketView[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    Promise.all([loadQueue(), findActiveSessionId()]).then(
      ([queue, activeId]) => {
        if (active) {
          setTickets(queue)
          setActiveSessionId(activeId)
          setState('ready')
        }
      },
      (caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : 'The ticket queue could not be loaded.',
          )
          setState('error')
        }
      },
    )

    return () => {
      active = false
    }
  }, [reloadToken])

  const onStart = async (ticket: TicketView) => {
    setBusyId(ticket.id)
    setError(null)
    try {
      const workspace = await startAttempt(ticket.id)
      navigate(`/ticket/${workspace.sessionId}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That ticket could not be opened.')
      setBusyId(null)
    }
  }

  const onGenerate = async () => {
    setBusyId('generate')
    setError(null)
    try {
      await createTickets(3, undefined, familyFilter ?? undefined)
      setState('loading')
      setReloadToken((token) => token + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'New tickets could not be generated.')
    } finally {
      setBusyId(null)
    }
  }

  const visible = familyFilter
    ? tickets.filter((ticket) => ticket.scenarioId === familyFilter)
    : tickets
  const open = visible.filter((ticket) => ticket.status !== 'completed')
  const closed = visible.filter((ticket) => ticket.status === 'completed')

  return (
    <>
      <PageHeader
        eyebrow="Ticket queue"
        title="Practice"
        description="Every ticket below is backed by a real fault in the simulated Larkspur Logistics environment. Pick one up and work it like a shift."
      />

      {activeSessionId ? (
        <div className={styles.resumeBar}>
          <span>You have a ticket open.</span>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => navigate(`/ticket/${activeSessionId}`)}
          >
            Resume the open ticket
          </button>
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <span className={styles.toolbarCount}>
          {focusTitle ? `Focused on ${focusTitle} · ` : ''}
          {open.length} open · {closed.length} closed
        </span>
        <div className={styles.buttonRow}>
          {familyFilter ? (
            <Link className={styles.secondaryButton} to="/practice">
              Show all tickets
            </Link>
          ) : null}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void onGenerate()}
            disabled={busyId !== null}
          >
            {busyId === 'generate'
              ? 'Generating…'
              : familyFilter
                ? 'Generate three of this family'
                : 'Generate three tickets'}
          </button>
        </div>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {state === 'loading' ? <p className={styles.muted}>Loading the queue…</p> : null}

      {state === 'ready' ? (
        <ul className={styles.queue}>
          {visible.length === 0 ? (
            <li className={styles.empty}>
              {focusTitle
                ? `No ${focusTitle.toLowerCase()} tickets in the queue. Generate three to practise this family.`
                : 'The queue is empty. Generate a few tickets to begin.'}
            </li>
          ) : null}
          {visible.map((ticket) => (
            <li key={ticket.id} className={styles.queueRow} data-status={ticket.status}>
              <div className={styles.queueMain}>
                <div className={styles.queueMeta}>
                  <span className={styles.family}>{FAMILY_LABELS[ticket.scenarioId] ?? ticket.scenarioId}</span>
                  <span className={styles[`severity_${ticket.severity}`]}>
                    {SEVERITY_LABELS[ticket.severity]}
                  </span>
                  <span className={styles.status} data-status={ticket.status}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </div>
                <h2 className={styles.subject}>{ticket.subject}</h2>
                <p className={styles.requester}>
                  {ticket.requester.name} · {ticket.requester.department} ·{' '}
                  {ticket.requester.siteName} · {ticket.device.hostname}
                </p>
              </div>
              <div className={styles.queueSide}>
                <span className={styles.when}>{formatWhen(ticket.reportedAt)}</span>
                {ticket.status === 'completed' ? (
                  <span className={styles.closedNote}>Closed</span>
                ) : (
                  <button
                    type="button"
                    className={styles.startButton}
                    onClick={() => void onStart(ticket)}
                    disabled={busyId !== null}
                  >
                    {busyId === ticket.id ? 'Opening…' : 'Open ticket'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.footnote}>
        Tickets are generated from a seed, so retrying the same ticket reproduces the exact same
        fault. Nothing here contacts a real system.
      </p>
    </>
  )
}
