import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  createTickets,
  findActiveSessionId,
  loadPracticeRecommendations,
  loadQueue,
  startAttempt,
  type TargetRecommendation,
  type TicketView,
} from '../../app/practiceService'
import { loadHintTargets, type HintTarget } from '../../app/settingsService'
import { familyLabel } from '../components/familyLabels'
import { PageHeader } from '../components/PageHeader'
import { resumeSummary } from '../components/resumePoint'
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

/**
 * What one family's effective price reads as: the cost of a rung, what one
 * attempt may pay for hints, and what it may take when the budget is rationed.
 * A family with no budget prints the same as one with an unlimited budget —
 * there is nothing left to say about a limit that is not there.
 */
function hintPriceText(policy: HintTarget['policy']): string {
  const limit = policy.budget > 0 ? ` · ${policy.budget} a ticket` : ''
  if (policy.perHint === 0) {
    return `Free${limit}`
  }
  return `${policy.perHint} pts a hint · cap ${policy.cap}${limit}`
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
  const focusTitle = familyFilter ? familyLabel(familyFilter) : null
  const [tickets, setTickets] = useState<TicketView[]>([])
  const [hintTargets, setHintTargets] = useState<HintTarget[]>([])
  const [recommendations, setRecommendations] = useState<TargetRecommendation[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    Promise.all([
      loadQueue(),
      findActiveSessionId(),
      loadPracticeRecommendations(),
      loadHintTargets(),
    ]).then(
      ([queue, activeId, targetRecommendations, prices]) => {
        if (active) {
          setTickets(queue)
          setActiveSessionId(activeId)
          setRecommendations(targetRecommendations)
          setHintTargets(prices)
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
  // The attempt the app holds open is the one ticket with somewhere to resume,
  // so the resume bar reads its point rather than merely naming the ticket.
  const pickedUp = tickets.find((ticket) => ticket.resume !== null) ?? null

  // The default is the price every inheriting family plays at, so it belongs in
  // the sentence above the list rather than as a row of its own.
  const defaultPrice = hintTargets.find((target) => target.id === null)?.policy ?? null
  const familyPrices = hintTargets.filter(
    (target): target is HintTarget & { id: string } => target.id !== null,
  )

  return (
    <>
      <PageHeader
        eyebrow="Ticket queue"
        title="Practice"
        description="Every ticket below is backed by a real fault in the simulated Larkspur Logistics environment. Pick one up and work it like a shift."
      />

      {recommendations.length > 0 ? (
        <div className={styles.targetStrip}>
          <span className={styles.targetStripLabel}>From your job targets</span>
          {recommendations.map((recommendation) => (
            <Link
              key={recommendation.scenarioId}
              className={styles.targetChip}
              to={`/practice?family=${encodeURIComponent(recommendation.scenarioId)}`}
            >
              {recommendation.scenarioId} · {recommendation.reason}
            </Link>
          ))}
        </div>
      ) : null}

      {activeSessionId ? (
        <div className={styles.resumeBar}>
          <span>
            You have a ticket open
            {pickedUp?.resume ? ` — left off in ${resumeSummary(pickedUp.resume)}` : ''}.
          </span>
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

      {state === 'ready' && familyPrices.length > 0 ? (
        <section className={styles.hintPrices} aria-labelledby="hint-prices-heading">
          <div className={styles.hintPricesHead}>
            <h2 className={styles.hintPricesTitle} id="hint-prices-heading">
              Hint prices
            </h2>
            <p className={styles.hintPricesNote}>
              {defaultPrice
                ? `Every family plays at the default unless it has a price of its own — ${hintPriceText(defaultPrice)}. A ticket keeps the price it started at.`
                : 'A ticket keeps the price it started at.'}
            </p>
          </div>
          <ul className={styles.hintPriceList} aria-label="Effective hint price by family">
            {familyPrices.map((target) => (
              <li
                key={target.id}
                className={styles.hintPriceChip}
                data-source={target.own ? 'family' : 'default'}
              >
                <span className={styles.hintPriceFamily}>{familyLabel(target.id)}</span>
                <span className={styles.hintPriceValue}>{hintPriceText(target.policy)}</span>
                <span className={styles.hintPriceSource}>
                  {target.own ? 'own price' : 'inherits default'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state === 'loading' ? <p className={styles.muted}>Loading the queue…</p> : null}

      {state === 'ready' ? (
        <ul className={styles.queue}>
          {visible.length === 0 ? (
            <li className={styles.empty}>
              {focusTitle
                ? `No ${focusTitle.toLowerCase()} tickets in the queue. Generate three to practice this family.`
                : 'The queue is empty. Generate a few tickets to begin.'}
            </li>
          ) : null}
          {visible.map((ticket) => (
            <li key={ticket.id} className={styles.queueRow} data-status={ticket.status}>
              <div className={styles.queueMain}>
                <div className={styles.queueMeta}>
                  <span className={styles.family}>{familyLabel(ticket.scenarioId)}</span>
                  {ticket.voicemail ? (
                    <span className={styles.arrival}>
                      Voicemail · {ticket.voicemail.durationSeconds}s
                    </span>
                  ) : null}
                  <span className={styles[`severity_${ticket.severity}`]}>
                    {SEVERITY_LABELS[ticket.severity]}
                  </span>
                  <span className={styles.status} data-status={ticket.status}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </div>
                <h2 className={styles.subject}>{ticket.subject}</h2>
                {ticket.resume ? (
                  <p className={styles.resumeLine}>
                    Left off in {resumeSummary(ticket.resume)}.
                  </p>
                ) : null}
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
                    {busyId === ticket.id
                      ? 'Opening…'
                      : ticket.resume
                        ? 'Resume'
                        : 'Open ticket'}
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
